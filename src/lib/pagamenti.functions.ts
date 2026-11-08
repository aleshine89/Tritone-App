import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  IBAN,
  INTESTATARIO,
  PREZZO_DIVING_CENT,
  PREZZO_POSTO_CENT,
  PREZZO_SCUOLA_CENT,
  PREZZO_SUB_CENT,
  estendiAnno,
} from "@/lib/prezzi";

export type FatturaDati = {
  ragione: string;
  cf: string;
  piva: string;
  indirizzo: string;
  sdi: string;
  pec: string;
};

export type PagamentoRiga = {
  id: number;
  quando: string;
  userId: string;
  nome: string;
  tipo: string;
  metodo: string;
  importoCent: number;
  fattura: boolean;
  dati: FatturaDati;
  mese: string;
  stato: string;
  applicato: boolean;
};

const TIPI = ["sub", "scuola", "diving", "posto"] as const;
type Tipo = (typeof TIPI)[number];

function si(value: boolean | string | null): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return value;
  return value === "t" || value === "true" || value === "1";
}

function oggiRoma(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function testo(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function datiFattura(value: unknown): FatturaDati {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    ragione: testo(raw.ragione, 120),
    cf: testo(raw.cf, 16).toUpperCase(),
    piva: testo(raw.piva, 16),
    indirizzo: testo(raw.indirizzo, 160),
    sdi: testo(raw.sdi, 7).toUpperCase(),
    pec: testo(raw.pec, 80),
  };
}

function importoDi(tipo: Tipo): number {
  if (tipo === "sub") return PREZZO_SUB_CENT;
  if (tipo === "scuola") return PREZZO_SCUOLA_CENT;
  if (tipo === "diving") return PREZZO_DIVING_CENT;
  return PREZZO_POSTO_CENT;
}

async function clubDelTitolare(sql: Sql, userId: string): Promise<{ id: number; mezzo: boolean }> {
  const rows = await sql<{ id: number; mezzo_nautico: boolean | string | null }>`
    select id, mezzo_nautico from club
    where owner_user_id = ${userId} or co_owner_user_id = ${userId}
    order by id
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Solo il titolare paga il piano della struttura.");
  return { id: Number(row.id), mezzo: si(row.mezzo_nautico) };
}

async function attiva(sql: Sql, row: { user_id: string; club_id: number | null; tipo: string }): Promise<void> {
  const oggi = oggiRoma();
  if (row.tipo === "sub") {
    const attuali = await sql<{ fino: string | null }>`select pro_fino::text as fino from profiles where user_id = ${row.user_id}`;
    const fino = estendiAnno(oggi, attuali[0]?.fino ?? "");
    await sql`update profiles set piano = 'pro', pro_fino = ${fino}, ruolo = coalesce(ruolo, 'sub') where user_id = ${row.user_id}`;
    return;
  }
  if (!row.club_id) throw new Error("Manca la struttura.");
  if (row.tipo === "posto") {
    await sql`update club set posti_extra = posti_extra + 1 where id = ${row.club_id}`;
    return;
  }
  const attuali = await sql<{ fino: string | null }>`select attivo_fino::text as fino from club where id = ${row.club_id}`;
  const fino = estendiAnno(oggi, attuali[0]?.fino ?? "");
  await sql`update club set piano = 'active', stato = 'attiva', attivo_fino = ${fino} where id = ${row.club_id}`;
}

export const leggiFattura = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FatturaDati> => {
    const sql = await getSql();
    const rows = await sql<{ dati: unknown }>`select dati from fatture_anagrafica where user_id = ${context.userId}`;
    return datiFattura(rows[0]?.dati);
  });

export const avviaPagamento = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const tipo = testo(raw.tipo, 20);
    const metodo = testo(raw.metodo, 20);
    if (!TIPI.includes(tipo as Tipo)) throw new Error("Piano non valido.");
    if (metodo !== "stripe" && metodo !== "bonifico") throw new Error("Scegli Stripe o il bonifico.");
    if (tipo === "sub" && metodo !== "stripe") throw new Error("Il Pro del subacqueo si paga solo con carta, una volta l'anno.");
    const origine = testo(raw.origine, 200);
    if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origine)) throw new Error("Indirizzo non valido.");
    return { tipo: tipo as Tipo, metodo: metodo as "stripe" | "bonifico", fattura: raw.fattura === true, dati: datiFattura(raw.dati), origine };
  })
  .handler(async ({ context, data }): Promise<{ url?: string; iban?: string; intestatario?: string; ok?: boolean }> => {
    const sql = await getSql();
    if (data.fattura && (!data.dati.ragione || !data.dati.cf)) throw new Error("Per la fattura servono ragione sociale e codice fiscale.");
    if (data.metodo === "stripe" && !process.env.STRIPE_SECRET_KEY) throw new Error("Stripe non è ancora collegato.");
    await sql`
      insert into fatture_anagrafica (user_id, dati) values (${context.userId}, ${JSON.stringify(data.dati)}::jsonb)
      on conflict (user_id) do update set dati = ${JSON.stringify(data.dati)}::jsonb
    `;
    let clubId: number | null = null;
    if (data.tipo !== "sub") {
      const club = await clubDelTitolare(sql, context.userId);
      if (data.tipo === "diving" && !club.mezzo) throw new Error("Questa attività non ha il mezzo nautico.");
      if (data.tipo === "scuola" && club.mezzo) throw new Error("Questo centro ha il mezzo nautico.");
      clubId = club.id;
    }
    const importo = importoDi(data.tipo);
    const mese = oggiRoma().slice(0, 7);
    const datiJson = data.fattura ? JSON.stringify(data.dati) : "{}";
    if (data.metodo === "bonifico") {
      const inserted = await sql<{ id: number; user_id: string; club_id: number | null; tipo: string }>`
        insert into pagamenti (user_id, club_id, tipo, metodo, importo_cent, stato, fattura, fattura_dati, mese)
        values (${context.userId}, ${clubId}, ${data.tipo}, 'bonifico', ${importo}, 'attesa', ${data.fattura}, ${datiJson}::jsonb, ${mese})
        returning id, user_id, club_id, tipo
      `;
      const row = inserted[0];
      if (!row) throw new Error("Pagamento non registrato.");
      return { ok: true, iban: IBAN, intestatario: INTESTATARIO };
    }
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    const pending = await sql<{ id: number }>`
      insert into pagamenti (user_id, club_id, tipo, metodo, importo_cent, stato, fattura, fattura_dati, mese)
      values (${context.userId}, ${clubId}, ${data.tipo}, 'stripe', ${importo}, 'attesa', ${data.fattura}, ${datiJson}::jsonb, ${mese})
      returning id
    `;
    const id = Number(pending[0]?.id);
    const nomi: Record<Tipo, string> = {
      sub: "Tritone Pro annuale",
      scuola: "Tritone Scuola annuale",
      diving: "Tritone Diving annuale",
      posto: "Tritone posto Pro staff",
    };
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${data.origine}/piano?esito=ok&session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${data.origine}/piano?esito=annullato`);
    params.set("client_reference_id", String(id));
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "eur");
    params.set("line_items[0][price_data][unit_amount]", String(importo));
    params.set("line_items[0][price_data][product_data][name]", nomi[data.tipo]);
    params.set("metadata[pagamento]", String(id));
    params.set("metadata[user]", context.userId);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const payload = (await response.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!response.ok || !payload.url || !payload.id) throw new Error(payload.error?.message || "Stripe non ha aperto il pagamento.");
    await sql`update pagamenti set stripe_id = ${payload.id} where id = ${id}`;
    return { url: payload.url };
  });

export const confermaStripe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const session = testo((input as { session?: unknown } | null)?.session, 120);
    if (!session.startsWith("cs_")) throw new Error("Pagamento non riconosciuto.");
    return { session };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe non è ancora collegato.");
    const sql = await getSql();
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${data.session}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payload = (await response.json()) as { payment_status?: string; metadata?: { pagamento?: string; user?: string } };
    if (!response.ok || payload.payment_status !== "paid") throw new Error("Il pagamento non risulta ancora riuscito.");
    if (payload.metadata?.user !== context.userId) throw new Error("Questo pagamento non è il tuo.");
    const id = Number(payload.metadata?.pagamento);
    const rows = await sql<{ id: number; user_id: string; club_id: number | null; tipo: string; stato: string }>`
      select id, user_id, club_id, tipo, stato from pagamenti where id = ${id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Pagamento non trovato.");
    if (row.stato === "pagato" && (row.tipo === "sub" || row.tipo === "posto")) return { ok: true };
    await sql`update pagamenti set stato = 'pagato', stripe_id = ${data.session}, mese = ${oggiRoma().slice(0, 7)} where id = ${row.id}`;
    if (row.tipo === "sub" || row.tipo === "posto") {
      await attiva(sql, row);
      await sql`update pagamenti set applicato = true where id = ${row.id}`;
    }
    return { ok: true };
  });

export const registroPagamenti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const mese = testo(raw.mese, 7);
    if (!/^\d{4}-\d{2}$/.test(mese)) throw new Error("Scegli il mese.");
    const filtro = testo(raw.filtro, 20);
    if (filtro !== "fattura" && filtro !== "carta" && filtro !== "bonifico") throw new Error("Filtro non valido.");
    return { mese, filtro: filtro as "fattura" | "carta" | "bonifico" };
  })
  .handler(async ({ context, data }): Promise<PagamentoRiga[]> => {
    const sql = await getSql();
    const ruolo = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (ruolo[0]?.role !== "piattaforma") throw new Error("Solo il gestore legge il registro.");
    const rows = await sql<{
      id: number;
      quando: string;
      user_id: string;
      nome: string;
      tipo: string;
      metodo: string;
      importo_cent: number;
      fattura: boolean;
      fattura_dati: unknown;
      mese: string;
      stato: string;
      applicato: boolean;
    }>`
      select g.id, to_char(g.creato_il at time zone 'Europe/Rome', 'YYYY-MM-DD') as quando,
             g.user_id, trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')) as nome,
             g.tipo, g.metodo, g.importo_cent, g.fattura, g.fattura_dati, g.mese, g.stato, g.applicato
      from pagamenti g
      left join profiles p on p.user_id = g.user_id
      where g.mese = ${data.mese}
        and (
          (${data.filtro} = 'bonifico' and g.metodo = 'bonifico')
          or (${data.filtro} = 'fattura' and g.metodo = 'stripe' and g.fattura and g.stato = 'pagato')
          or (${data.filtro} = 'carta' and g.metodo = 'stripe' and not g.fattura and g.stato = 'pagato')
        )
      order by g.creato_il desc
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      quando: row.quando,
      userId: row.user_id,
      nome: row.nome || row.user_id,
      tipo: row.tipo,
      metodo: row.metodo,
      importoCent: Number(row.importo_cent),
      fattura: Boolean(row.fattura),
      dati: datiFattura(row.fattura_dati),
      mese: row.mese,
      stato: row.stato,
      applicato: Boolean(row.applicato),
    }));
  });

export const incassaPagamento = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Pagamento non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const ruolo = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (ruolo[0]?.role !== "piattaforma") throw new Error("Solo il gestore attiva il piano.");
    const rows = await sql<{ id: number; user_id: string; club_id: number | null; tipo: string; applicato: boolean }>`
      select id, user_id, club_id, tipo, applicato from pagamenti where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("Pagamento non trovato.");
    if (row.tipo === "sub") throw new Error("Il Pro del subacqueo si attiva da solo col pagamento.");
    await sql`update pagamenti set stato = 'pagato' where id = ${row.id}`;
    if (!row.applicato && row.club_id && (row.tipo === "scuola" || row.tipo === "diving" || row.tipo === "posto")) {
      await attiva(sql, row);
      await sql`update pagamenti set applicato = true where id = ${row.id}`;
    }
    return { ok: true };
  });

export const impostaPostiStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const clubId = Number(raw.clubId);
    const limite = Number(raw.limite);
    if (!Number.isInteger(clubId) || clubId <= 0) throw new Error("Struttura non valida.");
    if (!Number.isInteger(limite) || limite < 0 || limite > 500) throw new Error("Limite non valido.");
    return { clubId, limite };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const ruolo = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (ruolo[0]?.role !== "piattaforma") throw new Error("Solo il gestore modifica i posti.");
    await sql`update club set posti_limite = ${data.limite} where id = ${data.clubId}`;
    return { ok: true };
  });
