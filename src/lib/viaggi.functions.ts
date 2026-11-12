import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { isStaff, campiMancanti, formByKey, type Role } from "@/lib/forms";
import { pushUsers } from "@/lib/push.server";
import { mesiCompiuti, oggiRoma } from "@/lib/format";
import { scriviPdfBlocchi, scriviPdfModulo, type PezzoModulo } from "@/lib/foglio-pdf";

const MODULI = ["registro-immersione", "brevetto-esperienza", "questionario-medico", "informativa-consenso"] as const;
type ChiaveModulo = (typeof MODULI)[number];

export type ViaggioBreve = {
  id: number;
  titolo: string;
  dal: string;
  al: string;
  stato: string;
  ospite: string;
  club: string;
  mio: "organizzo" | "partecipo" | "ospito";
  pronti: number;
  totale: number;
  suTritone: boolean;
};

export type GuidaViaggio = { userId: string; nome: string; cognome: string; idonea: boolean; motivo: string };
export type PersonaViaggio = {
  id: number;
  userId: string;
  nome: string;
  cognome: string;
  email: string;
  origine: string;
  consenso: boolean;
  moduli: { chiave: string; fatto: boolean; origine: string }[];
};
export type GruppoViaggio = {
  id: number;
  giorno: string;
  guidaUserId: string;
  guidaNome: string;
  aperto: boolean;
  persone: number[];
  chiuso: boolean;
  firmato: boolean;
  oraInizio: string;
  oraFine: string;
  profondita: string;
  profonditaPrevista: string;
  autorespiratore: string;
  miscela: string;
};

export type ViaggioPagina = {
  id: number;
  titolo: string;
  dal: string;
  al: string;
  stato: string;
  ospiteClubId: number | null;
  ospiteNome: string;
  clubNome: string;
  possoGestire: boolean;
  sonoScuola: boolean;
  sonoOspite: boolean;
  sonoGuida: boolean;
  userId: string;
  persone: PersonaViaggio[];
  gruppi: GruppoViaggio[];
  guide: GuidaViaggio[];
  soci: { userId: string; nome: string; cognome: string }[];
  diving: { id: number; nome: string }[];
  miaPersonaId: number | null;
};

function testo(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function giorno(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function giornoTesto(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function giorniTra(dal: string, al: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${dal}T12:00:00Z`);
  const fine = new Date(`${al}T12:00:00Z`);
  while (cursor <= fine && out.length < 31) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function maggiorenne(nascita: string, oggi: string): boolean {
  if (!giorno(nascita)) return false;
  const limite = new Date(`${oggi}T12:00:00Z`);
  limite.setUTCFullYear(limite.getUTCFullYear() - 18);
  return new Date(`${nascita}T12:00:00Z`) <= limite;
}

function dataIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = testo(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) {
    const candidato = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return giorno(candidato) ? candidato : "";
  }
  const italiano = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(raw);
  if (!italiano) return "";
  const candidato = `${italiano[3]}-${italiano[2].padStart(2, "0")}-${italiano[1].padStart(2, "0")}`;
  return giorno(candidato) ? candidato : "";
}

function nascitaDaCodice(value: unknown): string {
  const code = testo(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}/.test(code)) return "";
  const mesi = "ABCDEHLMPRST";
  const mese = mesi.indexOf(code[8]) + 1;
  let giornoN = Number(code.slice(9, 11));
  if (giornoN > 40) giornoN -= 40;
  if (mese < 1 || giornoN < 1 || giornoN > 31) return "";
  const yy = Number(code.slice(6, 8));
  const anno = 2000 + yy > Number(oggiRoma().slice(0, 4)) ? 1900 + yy : 2000 + yy;
  return dataIso(`${anno}-${String(mese).padStart(2, "0")}-${String(giornoN).padStart(2, "0")}`);
}

function oggetto(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return oggetto(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function nascitaNota(anagrafica: unknown, scheda: unknown, oggi: string): string {
  const ana = oggetto(anagrafica);
  const moduli = oggetto(scheda);
  const data = dataIso(ana.data_nascita) || dataIso(moduli.data_nascita) || nascitaDaCodice(ana.codice_fiscale) || nascitaDaCodice(moduli.codice_fiscale);
  if (data) return maggiorenne(data, oggi) ? "" : "Non è maggiorenne";
  if (testo(moduli.maggiore_eta) === "si" || testo(ana.maggiore_eta) === "si") return "";
  return "Manca la data di nascita";
}

function payloadDi(raw: string): Record<string, string> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== "string") continue;
      if (item.startsWith("data:image/")) {
        if (item.length <= 700_000) out[key] = item;
        continue;
      }
      out[key] = item.slice(0, 8000);
    }
    return out;
  } catch {
    return {};
  }
}

async function profiloClub(sql: Sql, userId: string): Promise<{ userId: string; role: Role; clubId: number; nome: string; cognome: string; gestisce: boolean } | null> {
  const rows = await sql<{ user_id: string; role: string; club_id: number | null; nome: string | null; cognome: string | null }>`
    select user_id, role, club_id, nome, cognome from profiles where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  let clubId = row.club_id ? Number(row.club_id) : 0;
  if (!clubId) {
    const owned = await sql<{ id: number }>`
      select id from club
      where owner_user_id = ${userId} or co_owner_user_id = ${userId}
      order by id
      limit 1
    `;
    clubId = owned[0] ? Number(owned[0].id) : 0;
  }
  if (!clubId) return null;
  return {
    userId: row.user_id,
    role: row.role as Role,
    clubId,
    nome: row.nome ?? "",
    cognome: row.cognome ?? "",
    gestisce: await gestisceClub(sql, userId, row.role, clubId),
  };
}

async function gestisceClub(sql: Sql, userId: string, role: string, clubId: number): Promise<boolean> {
  const club = await sql<{ owner_user_id: string | null; co_owner_user_id: string | null; stato: string }>`
    select owner_user_id, co_owner_user_id, stato from club where id = ${clubId} limit 1
  `;
  const row = club[0];
  if (!row || row.stato === "sospesa") return false;
  if (row.owner_user_id === userId || row.co_owner_user_id === userId) return true;
  const nelBanco = await sql<{ user_id: string }>`
    select user_id from staff_membri where club_id = ${clubId} and user_id = ${userId} limit 1
  `;
  if (nelBanco[0]) return true;
  if (!isStaff(role as Role)) return false;
  const profilo = await sql<{ club_id: number | null }>`select club_id from profiles where user_id = ${userId} limit 1`;
  return Number(profilo[0]?.club_id) === clubId;
}

async function guidaIdonee(sql: Sql, clubId: number): Promise<GuidaViaggio[]> {
  const oggi = oggiRoma();
  const people = await sql<{
    user_id: string;
    nome: string | null;
    cognome: string | null;
    role: string;
    anagrafica: string | null;
  }>`
    select p.user_id, p.nome, p.cognome, p.role, p.anagrafica
    from profiles p
    where p.user_id in (
      select owner_user_id from club where id = ${clubId} and owner_user_id is not null
      union
      select co_owner_user_id from club where id = ${clubId} and co_owner_user_id is not null
      union
      select user_id from staff_membri where club_id = ${clubId}
    )
    order by p.cognome, p.nome
  `;
  const ids = people.map((person) => person.user_id);
  const docs = ids.length
    ? await sql.query<{ user_id: string; kind: string; scadenza: string | null }>(
        `select user_id, kind, scadenza::text as scadenza from documenti_personali where user_id = any($1::text[]) and kind in ('medico', 'assicurazione')`,
        [ids],
      )
    : [];
  const carte = ids.length
    ? await sql.query<{ user_id: string; titolo: string; livello: string; ente: string }>(
        `select user_id, titolo, livello, ente from brevetti where user_id = any($1::text[])`,
        [ids],
      )
    : [];
  const schede = ids.length
    ? await sql.query<{ user_id: string; payload: unknown }>(
        `select distinct on (user_id) user_id, payload
         from submissions
         where user_id = any($1::text[])
           and status = 'inviato'
           and form_key in ('scheda-istruttore', 'scheda-socio')
         order by user_id, updated_at desc`,
        [ids],
      )
    : [];
  const schedaDi = new Map(schede.map((scheda) => [scheda.user_id, scheda.payload]));
  return people.map((person) => {
    const miei = carte.filter((carta) => carta.user_id === person.user_id);
    const testi = miei.map((carta) => `${carta.titolo} ${carta.livello} ${carta.ente}`.toLowerCase()).join(" ");
    const guida = /istruttor|instructor|divemaster|dive[\s-]*master|\bowsi\b|\bmsd\b|moniteur|dive[\s-]*guide|guida/.test(testi);
    const motivi: string[] = [];
    const eta = nascitaNota(person.anagrafica, schedaDi.get(person.user_id), oggi);
    if (eta) motivi.push(eta);
    if (!miei.length) motivi.push("Manca il brevetto");
    else if (!guida && person.role !== "istruttore") motivi.push("Il brevetto non è da guida o istruttore");
    const medico = statoDoc(docs, person.user_id, "medico", oggi);
    const polizza = statoDoc(docs, person.user_id, "assicurazione", oggi);
    if (medico === "assente") motivi.push("Manca il certificato medico");
    if (medico === "scaduto") motivi.push("Certificato medico scaduto");
    if (polizza === "assente") motivi.push("Manca l'assicurazione");
    if (polizza === "scaduto") motivi.push("Assicurazione scaduta");
    return {
      userId: person.user_id,
      nome: person.nome ?? "",
      cognome: person.cognome ?? "",
      idonea: motivi.length === 0,
      motivo: motivi.join(". "),
    };
  });
}

function statoDoc(
  rows: { user_id: string; kind: string; scadenza: string | null }[],
  userId: string,
  kind: string,
  oggi: string,
): "ok" | "assente" | "scaduto" {
  const mine = rows.filter((row) => row.user_id === userId && row.kind === kind);
  if (!mine.length) return "assente";
  const dates = mine.map((row) => (row.scadenza ?? "").slice(0, 10)).filter((day) => giorno(day));
  if (!dates.length) return "ok";
  return (dates.sort().at(-1) ?? "") < oggi ? "scaduto" : "ok";
}

async function possoVedere(sql: Sql, userId: string, viaggioId: number): Promise<{
  clubId: number;
  stato: string;
  gestisco: boolean;
  ospite: boolean;
  personaId: number | null;
}> {
  const righe = await sql<{ club_id: number; stato: string; ospite_club_id: number | null }>`
    select club_id, stato, ospite_club_id from viaggi where id = ${viaggioId} limit 1
  `;
  const viaggio = righe[0];
  if (!viaggio) throw new Error("Viaggio non trovato.");
  const io = await profiloClub(sql, userId);
  const gestisco = Boolean(io?.gestisce && io.clubId === Number(viaggio.club_id));
  const ospite = Boolean(io?.gestisce && viaggio.ospite_club_id && io.clubId === Number(viaggio.ospite_club_id));
  const persone = await sql<{ id: number }>`
    select id from viaggio_persone where viaggio_id = ${viaggioId} and user_id = ${userId} limit 1
  `;
  if (!gestisco && !ospite && !persone[0]) throw new Error("Questo viaggio non è tuo.");
  return {
    clubId: Number(viaggio.club_id),
    stato: viaggio.stato,
    gestisco,
    ospite,
    personaId: persone[0] ? Number(persone[0].id) : null,
  };
}

async function pagina(sql: Sql, userId: string, viaggioId: number): Promise<ViaggioPagina> {
  const accesso = await possoVedere(sql, userId, viaggioId);
  const righe = await sql<{
    titolo: string;
    dal: string;
    al: string;
    stato: string;
    ospite_club_id: number | null;
    ospite_nome: string;
    club: string;
  }>`
    select v.titolo, v.dal::text as dal, v.al::text as al, v.stato, v.ospite_club_id, v.ospite_nome, c.nome as club
    from viaggi v join club c on c.id = v.club_id
    where v.id = ${viaggioId}
  `;
  const viaggio = righe[0];
  const persone = await sql<{
    id: number;
    user_id: string | null;
    nome: string;
    cognome: string;
    email: string;
    origine: string;
    consenso: boolean | string;
  }>`
    select id, user_id, nome, cognome, email, origine, consenso
    from viaggio_persone where viaggio_id = ${viaggioId}
    order by cognome, nome, id
  `;
  const moduli = await sql<{ persona_id: number; form_key: string; origine: string; confermato: boolean | string }>`
    select m.persona_id, m.form_key, m.origine, m.confermato
    from viaggio_moduli m
    join viaggio_persone p on p.id = m.persona_id
    where p.viaggio_id = ${viaggioId}
  `;
  const gruppi = await sql<{
    id: number;
    giorno: string;
    guida_user_id: string;
    guida_nome: string;
    aperto: boolean | string;
    chiuso: boolean | string;
    firma: string;
    ora_inizio: string;
    ora_fine: string;
    profondita: string;
    profondita_prevista: string;
    autorespiratore: string;
    miscela: string;
  }>`
    select id, giorno::text as giorno, guida_user_id, guida_nome, aperto, chiuso, firma, ora_inizio, ora_fine, profondita, profondita_prevista, autorespiratore, miscela
    from viaggio_gruppi where viaggio_id = ${viaggioId}
    order by giorno, id
  `;
  const membri = await sql<{ gruppo_id: number; persona_id: number }>`
    select gp.gruppo_id, gp.persona_id
    from viaggio_gruppo_persone gp
    join viaggio_gruppi g on g.id = gp.gruppo_id
    where g.viaggio_id = ${viaggioId}
  `;
  const anno = Number(oggiRoma().slice(0, 4));
  const soci = accesso.gestisco
    ? await sql<{ user_id: string; nome: string | null; cognome: string | null }>`
        select s.user_id, p.nome, p.cognome
        from soci s join profiles p on p.user_id = s.user_id
        where s.club_id = ${accesso.clubId} and s.anno >= ${anno} and s.stato = 'accettato' and s.rimosso_il is null
        order by p.cognome, p.nome
      `
    : [];
  const diving = accesso.gestisco
    ? await sql<{ id: number; nome: string }>`select id, nome from club where id <> ${accesso.clubId} and stato <> 'sospesa' order by nome limit 200`
    : [];
  const perPersona = new Map<number, { chiave: string; fatto: boolean; origine: string }[]>();
  for (const modulo of moduli) {
    const lista = perPersona.get(Number(modulo.persona_id)) ?? [];
    lista.push({
      chiave: modulo.form_key,
      fatto: modulo.confermato === true || modulo.confermato === "t" || modulo.confermato === "true",
      origine: modulo.origine,
    });
    perPersona.set(Number(modulo.persona_id), lista);
  }
  const perGruppo = new Map<number, number[]>();
  for (const membro of membri) {
    const lista = perGruppo.get(Number(membro.gruppo_id)) ?? [];
    lista.push(Number(membro.persona_id));
    perGruppo.set(Number(membro.gruppo_id), lista);
  }
  const personePiene = persone.map((persona) => ({
    id: Number(persona.id),
    userId: persona.user_id ?? "",
    nome: persona.nome,
    cognome: persona.cognome,
    email: persona.email,
    origine: persona.origine,
    consenso: persona.consenso === true || persona.consenso === "t" || persona.consenso === "true",
    moduli: MODULI.map((chiave) => perPersona.get(Number(persona.id))?.find((item) => item.chiave === chiave) ?? { chiave, fatto: false, origine: "" }),
  }));
  const nelGruppoGuida = new Set<number>();
  for (const gruppo of gruppi) {
    if (gruppo.guida_user_id !== userId) continue;
    for (const personaId of perGruppo.get(Number(gruppo.id)) ?? []) nelGruppoGuida.add(personaId);
  }
  const personeVista = accesso.gestisco || accesso.ospite
    ? personePiene
    : personePiene.filter((persona) => persona.userId === userId || nelGruppoGuida.has(persona.id));
  return {
    id: viaggioId,
    titolo: viaggio.titolo,
    dal: viaggio.dal.slice(0, 10),
    al: viaggio.al.slice(0, 10),
    stato: viaggio.stato,
    ospiteClubId: viaggio.ospite_club_id == null ? null : Number(viaggio.ospite_club_id),
    ospiteNome: viaggio.ospite_nome,
    clubNome: viaggio.club,
    possoGestire: accesso.gestisco && viaggio.stato === "bozza",
    sonoScuola: accesso.gestisco,
    sonoOspite: accesso.ospite,
    sonoGuida: gruppi.some((gruppo) => gruppo.guida_user_id === userId),
    userId,
    persone: personeVista,
    gruppi: gruppi.map((gruppo) => ({
      id: Number(gruppo.id),
      giorno: gruppo.giorno.slice(0, 10),
      guidaUserId: gruppo.guida_user_id,
      guidaNome: gruppo.guida_nome,
      aperto: gruppo.aperto === true || gruppo.aperto === "t" || gruppo.aperto === "true",
      persone: perGruppo.get(Number(gruppo.id)) ?? [],
      chiuso: gruppo.chiuso === true || gruppo.chiuso === "t" || gruppo.chiuso === "true",
      firmato: Boolean(gruppo.firma),
      oraInizio: gruppo.ora_inizio,
      oraFine: gruppo.ora_fine,
      profondita: gruppo.profondita,
      profonditaPrevista: gruppo.profondita_prevista,
      autorespiratore: gruppo.autorespiratore,
      miscela: gruppo.miscela,
    })),
    guide: accesso.gestisco || accesso.ospite ? await guidaIdonee(sql, accesso.ospite && !accesso.gestisco ? (await profiloClub(sql, userId))?.clubId ?? 0 : accesso.clubId) : [],
    soci: soci.map((socio) => ({ userId: socio.user_id, nome: socio.nome ?? "", cognome: socio.cognome ?? "" })),
    diving: diving.map((item) => ({ id: Number(item.id), nome: item.nome })),
    miaPersonaId: persone.find((persona) => persona.user_id === userId) ? Number(persone.find((persona) => persona.user_id === userId)?.id) : null,
  };
}

export const listaViaggi = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ViaggioBreve[]> => {
    const sql = await getSql();
    const io = await profiloClub(sql, context.userId);
    const rows = await sql<{
      id: number;
      titolo: string;
      dal: string;
      al: string;
      stato: string;
      ospite_nome: string;
      club_id: number;
      ospite_club_id: number | null;
      club_nome: string;
      user_id: string | null;
      creato_da: string;
      pronti: number;
      totale: number;
    }>`
      select distinct v.id, v.titolo, v.dal::text as dal, v.al::text as al, v.stato, v.ospite_nome, v.club_id, v.ospite_club_id, c.nome as club_nome, p.user_id, v.creato_da,
        (select count(*)::int from viaggio_persone vp where vp.viaggio_id = v.id) as totale,
        (select count(*)::int from viaggio_persone vp where vp.viaggio_id = v.id and (select count(*) from viaggio_moduli m where m.persona_id = vp.id and m.confermato) >= 4) as pronti
      from viaggi v
      join club c on c.id = v.club_id
      left join viaggio_persone p on p.viaggio_id = v.id and p.user_id = ${context.userId}
      where p.user_id = ${context.userId}
         or v.club_id = ${io?.clubId ?? 0}
         or (v.ospite_club_id = ${io?.clubId ?? 0} and v.stato <> 'bozza')
      order by dal, v.id
    `;
    const visti = new Set<number>();
    const out: ViaggioBreve[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      if (visti.has(id)) continue;
      visti.add(id);
      const organizzo = Boolean((io?.gestisce && io.clubId === Number(row.club_id)) || row.creato_da === context.userId);
      const ospito = Boolean(io?.gestisce && row.ospite_club_id && io.clubId === Number(row.ospite_club_id) && !organizzo);
      out.push({
        id,
        titolo: row.titolo,
        dal: giornoTesto(row.dal),
        al: giornoTesto(row.al),
        stato: row.stato,
        ospite: row.ospite_nome,
        club: row.club_nome,
        mio: organizzo ? "organizzo" : ospito ? "ospito" : "partecipo",
        pronti: Number(row.pronti) || 0,
        totale: Number(row.totale) || 0,
        suTritone: Boolean(row.ospite_club_id),
      });
    }
    return out;
  });

export const creaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const titolo = testo(raw.titolo).trim().replace(/\s+/g, " ").slice(0, 120);
    const dal = testo(raw.dal).slice(0, 10);
    const al = testo(raw.al).slice(0, 10);
    const ospiteClubId = Number(raw.ospiteClubId);
    const ospiteNome = testo(raw.ospiteNome).trim().replace(/\s+/g, " ").slice(0, 120);
    if (!titolo || !giorno(dal) || !giorno(al) || al < dal) throw new Error("Scrivi titolo e date.");
    if (giorniTra(dal, al).length > 31) throw new Error("Un viaggio può durare al massimo 31 giorni.");
    return { titolo, dal, al, ospiteClubId: Number.isInteger(ospiteClubId) && ospiteClubId > 0 ? ospiteClubId : null, ospiteNome };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const io = await profiloClub(sql, context.userId);
    if (!io?.gestisce) throw new Error("Solo il diving, la scuola o il loro staff possono aprire un viaggio.");
    let nome = data.ospiteNome;
    if (data.ospiteClubId) {
      const club = await sql<{ nome: string }>`select nome from club where id = ${data.ospiteClubId} limit 1`;
      if (!club[0]) throw new Error("Diving non trovato.");
      if (data.ospiteClubId === io.clubId) throw new Error("Il diving di destinazione deve essere un altro.");
      nome = club[0].nome;
    }
    if (!nome) throw new Error("Scrivi il nome del diving che ospita.");
    const creati = await sql<{ id: number }>`
      insert into viaggi (club_id, titolo, dal, al, ospite_club_id, ospite_nome, creato_da)
      values (${io.clubId}, ${data.titolo}, ${data.dal}, ${data.al}, ${data.ospiteClubId}, ${nome}, ${context.userId})
      returning id
    `;
    const id = Number(creati[0]?.id);
    if (!id) throw new Error("Non riesco a salvare il viaggio.");
    return { id };
  });

export const leggiViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Viaggio non trovato.");
    return { id };
  })
  .handler(async ({ context, data }) => pagina(await getSql(), context.userId, data.id));

export const aggiungiPersonaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const viaggioId = Number(raw.viaggioId);
    const userId = testo(raw.userId).trim();
    const nome = testo(raw.nome).trim().slice(0, 80);
    const cognome = testo(raw.cognome).trim().slice(0, 80);
    const email = testo(raw.email).trim().toLowerCase().slice(0, 160);
    if (!Number.isInteger(viaggioId) || viaggioId <= 0) throw new Error("Viaggio non trovato.");
    return { viaggioId, userId, nome, cognome, email };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.viaggioId);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può aggiungere una persona.");
    let userId = data.userId;
    let nome = data.nome;
    let cognome = data.cognome;
    let origine = userId ? "socio" : "mano";
    if (data.email) {
      const utenti = await sql<{ id: string; nome: string | null; cognome: string | null }>`
        select u.id, p.nome, p.cognome
        from "user" u
        left join profiles p on p.user_id = u.id
        where lower(u.email) = ${data.email}
        limit 1
      `;
      if (utenti[0]) {
        userId = utenti[0].id;
        nome = nome || utenti[0].nome || "";
        cognome = cognome || utenti[0].cognome || "";
        origine = "invito";
      } else {
        origine = "invito";
      }
    }
    if (userId) {
      const profilo = await sql<{ nome: string | null; cognome: string | null }>`select nome, cognome from profiles where user_id = ${userId} limit 1`;
      nome = nome || profilo[0]?.nome || "";
      cognome = cognome || profilo[0]?.cognome || "";
      const gia = await sql<{ id: number }>`select id from viaggio_persone where viaggio_id = ${data.viaggioId} and user_id = ${userId} limit 1`;
      if (gia[0]) return { id: Number(gia[0].id) };
    }
    if (!nome && !cognome && !data.email) throw new Error("Scrivi nome e cognome.");
    const creati = await sql<{ id: number }>`
      insert into viaggio_persone (viaggio_id, user_id, nome, cognome, email, origine)
      values (${data.viaggioId}, ${userId || null}, ${nome}, ${cognome}, ${data.email}, ${origine})
      returning id
    `;
    const idPersona = Number(creati[0]?.id);
    if (userId && idPersona) {
      const viaggio = await sql<{ titolo: string; club_id: number }>`select titolo, club_id from viaggi where id = ${data.viaggioId} limit 1`;
      const titolo = viaggio[0]?.titolo || "Viaggio";
      try {
        await sql`
          insert into notifications (submission_id, title, body, audience, club_id, user_id)
          values (null, ${"Invia moduli viaggio"}, ${`${data.viaggioId}\n${titolo}`}, ${"sub"}, ${viaggio[0] ? Number(viaggio[0].club_id) : null}, ${userId})
        `;
        await pushUsers(sql, [userId], "Invia moduli viaggio", titolo, `/attivita-soci?viaggio=${data.viaggioId}&invio=1`);
      } catch {
        /* la persona resta nel viaggio anche se l'avviso non parte */
      }
    }
    return { id: idPersona };
  });

export const togliPersonaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Persona non trovata.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const righe = await sql<{ viaggio_id: number }>`select viaggio_id from viaggio_persone where id = ${data.id} limit 1`;
    if (!righe[0]) throw new Error("Persona non trovata.");
    const accesso = await possoVedere(sql, context.userId, Number(righe[0].viaggio_id));
    if (!accesso.gestisco) throw new Error("Solo chi organizza può togliere una persona.");
    const chi = await sql<{ user_id: string | null; nome: string; cognome: string }>`
      select user_id, nome, cognome from viaggio_persone where id = ${data.id} limit 1
    `;
    if (chi[0]) await togliDalRegistro(sql, Number(righe[0].viaggio_id), chi[0].user_id ?? "", chi[0].nome, chi[0].cognome);
    await sql`delete from viaggio_persone where id = ${data.id}`;
    return { ok: true };
  });

export const eliminaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Viaggio non trovato.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.id);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può eliminare il viaggio.");
    if (accesso.stato === "accettato") throw new Error("Il diving ha già accettato. Il viaggio non si elimina.");
    const uscite = await sql<{ id: number }>`select id from uscite where viaggio_id = ${data.id} limit 1`;
    if (uscite[0]) throw new Error("Il diving ha già accettato. Il viaggio non si elimina.");
    await sql`delete from viaggi where id = ${data.id}`;
    return { ok: true };
  });

function firmaDisegnata(value: string | undefined): boolean {
  return Boolean(value?.startsWith("data:image/"));
}

function moduloCompleto(chiave: ChiaveModulo, campi: Record<string, string>, origine: "utente" | "club" | "scansione"): boolean {
  if (origine === "utente") {
    const form = formByKey(chiave);
    if (!form || !firmaDisegnata(campi.firma)) return false;
    if (chiave === "informativa-consenso" && campi.minorenne === "si" && !firmaDisegnata(campi.firma_genitore)) return false;
    return campiMancanti(form, campi).length === 0;
  }
  if (!campi.firma?.trim()) return false;
  if (chiave === "registro-immersione") return Boolean(campi.didattica && campi.livello && campi.numero_brevetto);
  if (chiave === "brevetto-esperienza") return Boolean(campi.didattica && campi.livello && campi.numero_brevetto && campi.ultima_immersione);
  if (chiave === "questionario-medico") return campi.dichiarazione_veritiera === "si" && Boolean(campi.data_compilazione) && ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"].every((key) => campi[key] === "si" || campi[key] === "no");
  return campi.ho_letto_rischi === "si" && campi.consenso_invio === "si" && Boolean(campi.data_compilazione);
}

export type ViaggioDaCompilare = { id: number; titolo: string; clubNome: string; personaId: number };

export const viaggiDaCompilare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ViaggioDaCompilare[]> => {
    const sql = await getSql();
    const rows = await sql<{ id: number; titolo: string; club: string; persona_id: number; fatti: number }>`
      select v.id, v.titolo, c.nome as club, p.id as persona_id,
        (select count(*)::int from viaggio_moduli m where m.persona_id = p.id and m.confermato) as fatti
      from viaggi v
      join viaggio_persone p on p.viaggio_id = v.id and p.user_id = ${context.userId}
      join club c on c.id = v.club_id
      where v.stato in ('bozza', 'inviato', 'accettato')
      order by v.dal, v.id
    `;
    return rows
      .filter((row) => Number(row.fatti) < MODULI.length)
      .map((row) => ({
        id: Number(row.id),
        titolo: row.titolo,
        clubNome: row.club,
        personaId: Number(row.persona_id),
      }));
  });

export const salvaModuloViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const personaId = Number(raw.personaId);
    const chiave = testo(raw.chiave);
    const origine = testo(raw.origine) === "club" || testo(raw.origine) === "scansione" ? testo(raw.origine) : "utente";
    const campi = payloadDi(JSON.stringify(raw.campi ?? {}));
    const foto = testo(raw.foto);
    const fotoOk = /^data:image\/(jpeg|png);base64,/.test(foto) && foto.length < 500_000 ? foto : "";
    if (!Number.isInteger(personaId) || personaId <= 0) throw new Error("Persona non trovata.");
    if (!MODULI.includes(chiave as ChiaveModulo)) throw new Error("Modulo non valido.");
    return { personaId, chiave: chiave as ChiaveModulo, origine: origine as "utente" | "club" | "scansione", campi, foto: fotoOk, bozza: raw.bozza === true };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const persone = await sql<{ viaggio_id: number; user_id: string | null; origine: string }>`
      select viaggio_id, user_id, origine from viaggio_persone where id = ${data.personaId} limit 1
    `;
    const persona = persone[0];
    if (!persona) throw new Error("Persona non trovata.");
    const accesso = await possoVedere(sql, context.userId, Number(persona.viaggio_id));
    if (accesso.stato !== "bozza" && (await moduloGiaConfermato(sql, data.personaId, data.chiave))) throw new Error("Questo modulo è già nel fascicolo.");
    const mia = persona.user_id === context.userId;
    if (!mia && !accesso.gestisco) throw new Error("Non puoi compilare questo modulo.");
    if (mia && data.origine !== "utente") throw new Error("Compila il modulo dal tuo account.");
    if (!mia && persona.user_id && data.origine === "club") throw new Error("Questo subacqueo compila i moduli da solo.");
    if (!mia && data.origine === "scansione" && !data.foto) throw new Error("Allega la foto del modulo firmato.");
    const fatto = moduloCompleto(data.chiave, data.campi, data.origine);
    if (data.origine === "utente" && !data.bozza && !fatto) throw new Error("Il modulo non è completo.");
    const confermato = data.origine === "utente" ? !data.bozza && fatto : fatto;
    const json = JSON.stringify(data.campi);
    await sql`
      insert into viaggio_moduli (persona_id, form_key, payload, origine, confermato, foto)
      values (${data.personaId}, ${data.chiave}, ${json}, ${data.origine}, ${confermato}, ${data.foto})
      on conflict (persona_id, form_key) do update
      set payload = ${json}, origine = ${data.origine}, confermato = ${confermato},
          foto = case when ${data.foto} <> '' then ${data.foto} else viaggio_moduli.foto end
    `;
    if (data.chiave === "informativa-consenso") {
      await sql`update viaggio_persone set consenso = ${confermato} where id = ${data.personaId}`;
    }
    if (confermato) await scriviSulRegistro(sql, data.personaId);
    return { fatto: confermato };
  });

export const leggiModuloViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const personaId = Number(raw.personaId);
    const chiave = testo(raw.chiave);
    if (!Number.isInteger(personaId) || personaId <= 0 || !MODULI.includes(chiave as ChiaveModulo)) throw new Error("Modulo non trovato.");
    return { personaId, chiave };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const persone = await sql<{ viaggio_id: number; user_id: string | null }>`
      select viaggio_id, user_id from viaggio_persone where id = ${data.personaId} limit 1
    `;
    const persona = persone[0];
    if (!persona) throw new Error("Modulo non trovato.");
    const accesso = await possoVedere(sql, context.userId, Number(persona.viaggio_id));
    const mia = persona.user_id === context.userId;
    if (!mia && !accesso.gestisco && !(accesso.ospite && accesso.stato !== "bozza")) throw new Error("Questo modulo non è tuo.");
    const righe = await sql<{ payload: string; origine: string; confermato: boolean | string; foto: string }>`
      select payload, origine, confermato, foto from viaggio_moduli where persona_id = ${data.personaId} and form_key = ${data.chiave} limit 1
    `;
    const row = righe[0];
    let campi = payloadDi(row?.payload ?? "{}");
    if (persona.user_id && !Object.keys(campi).length && (data.chiave === "registro-immersione" || data.chiave === "brevetto-esperienza")) {
      const brev = await sql<{ ente: string; livello: string; numero: string }>`
        select ente, livello, numero from brevetti where user_id = ${persona.user_id} order by id desc limit 1
      `;
      if (brev[0]) {
        campi = {
          didattica: brev[0].ente,
          livello: brev[0].livello,
          numero_brevetto: brev[0].numero,
        };
      }
    }
    return {
      campi,
      origine: row?.origine ?? "",
      fatto: row ? row.confermato === true || row.confermato === "t" || row.confermato === "true" : false,
      foto: row?.foto ?? "",
    };
  });

export const creaGruppoViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const viaggioId = Number(raw.viaggioId);
    const giorno = testo(raw.giorno).slice(0, 10);
    const guidaUserId = testo(raw.guidaUserId).trim();
    if (!Number.isInteger(viaggioId) || viaggioId <= 0 || !giorno || !guidaUserId) throw new Error("Scegli giorno e guida.");
    return { viaggioId, giorno, guidaUserId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.viaggioId);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può creare un gruppo.");
    const date = await sql<{ dal: string; al: string }>`select dal::text as dal, al::text as al from viaggi where id = ${data.viaggioId}`;
    const dal = date[0].dal.slice(0, 10);
    const al = date[0].al.slice(0, 10);
    if (data.giorno < dal || data.giorno > al) throw new Error("Il giorno è fuori dal viaggio.");
    const guide = await guidaIdonee(sql, accesso.clubId);
    const guida = guide.find((item) => item.userId === data.guidaUserId);
    if (!guida?.idonea) throw new Error(guida?.motivo || "Questa guida non può essere assegnata.");
    const gia = await sql<{ id: number }>`
      select id from viaggio_gruppi where viaggio_id = ${data.viaggioId} and giorno = ${data.giorno} and guida_user_id = ${data.guidaUserId} limit 1
    `;
    if (gia[0]) return { id: Number(gia[0].id) };
    const nome = `${guida.cognome} ${guida.nome}`.trim();
    const creati = await sql<{ id: number }>`
      insert into viaggio_gruppi (viaggio_id, giorno, guida_user_id, guida_nome)
      values (${data.viaggioId}, ${data.giorno}, ${data.guidaUserId}, ${nome})
      returning id
    `;
    const id = Number(creati[0]?.id);
    await assicuratiUscita(sql, data.viaggioId, data.giorno, data.guidaUserId, nome);
    return { id };
  });

export const creaListaAperta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const viaggioId = Number(raw.viaggioId);
    const giorno = testo(raw.giorno).slice(0, 10);
    if (!Number.isInteger(viaggioId) || viaggioId <= 0 || !giorno) throw new Error("Scegli il giorno.");
    return { viaggioId, giorno };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.viaggioId);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può chiedere una guida.");
    const date = await sql<{ dal: string; al: string }>`select dal::text as dal, al::text as al from viaggi where id = ${data.viaggioId}`;
    const dal = date[0].dal.slice(0, 10);
    const al = date[0].al.slice(0, 10);
    if (data.giorno < dal || data.giorno > al) throw new Error("Il giorno è fuori dal viaggio.");
    const gia = await sql<{ id: number }>`
      select id from viaggio_gruppi where viaggio_id = ${data.viaggioId} and giorno = ${data.giorno} and aperto limit 1
    `;
    if (gia[0]) return { id: Number(gia[0].id) };
    const creati = await sql<{ id: number }>`
      insert into viaggio_gruppi (viaggio_id, giorno, guida_user_id, guida_nome, aperto)
      values (${data.viaggioId}, ${data.giorno}, ${"__ospite__"}, ${"Guide del diving ospite"}, true)
      returning id
    `;
    return { id: Number(creati[0]?.id) };
  });

export const mettiNelGruppo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const gruppoId = Number(raw.gruppoId);
    const personaId = Number(raw.personaId);
    const togli = raw.togli === true;
    if (!Number.isInteger(gruppoId) || !Number.isInteger(personaId)) throw new Error("Gruppo non trovato.");
    return { gruppoId, personaId, togli };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const gruppi = await sql<{ viaggio_id: number; giorno: string; guida_user_id: string; aperto: boolean | string; chiuso: boolean | string; firma: string }>`
      select viaggio_id, giorno::text as giorno, guida_user_id, aperto, chiuso, firma from viaggio_gruppi where id = ${data.gruppoId} limit 1
    `;
    if (!gruppi[0]) throw new Error("Gruppo non trovato.");
    const accesso = await possoVedere(sql, context.userId, Number(gruppi[0].viaggio_id));
    const firmato = gruppi[0].chiuso === true || gruppi[0].chiuso === "t" || gruppi[0].chiuso === "true" || Boolean(gruppi[0].firma);
    const aperto = gruppi[0].aperto === true || gruppi[0].aperto === "t" || gruppi[0].aperto === "true";
    if (!accesso.gestisco) throw new Error("Solo chi organizza può aggiornare il gruppo.");
    if (firmato) throw new Error("Questo gruppo è già firmato dalla guida.");
    const persone = await sql<{ viaggio_id: number }>`select viaggio_id from viaggio_persone where id = ${data.personaId} limit 1`;
    if (!persone[0] || Number(persone[0].viaggio_id) !== Number(gruppi[0].viaggio_id)) throw new Error("Questa persona non è nel viaggio.");
    if (data.togli) {
      await sql`delete from viaggio_gruppo_persone where gruppo_id = ${data.gruppoId} and persona_id = ${data.personaId}`;
      await togliRigaDelGruppo(sql, data.gruppoId, data.personaId);
      return { ok: true };
    }
    const conta = await sql<{ n: number }>`select count(*)::int as n from viaggio_gruppo_persone where gruppo_id = ${data.gruppoId}`;
    if (!aperto && Number(conta[0]?.n) >= 6) throw new Error("In un gruppo ci stanno al massimo 6 subacquei.");
    const doppio = await sql<{ id: number }>`
      select g.id
      from viaggio_gruppo_persone gp
      join viaggio_gruppi g on g.id = gp.gruppo_id
      join viaggio_gruppi qui on qui.id = ${data.gruppoId}
      where gp.persona_id = ${data.personaId} and g.giorno = qui.giorno and g.id <> ${data.gruppoId}
      limit 1
    `;
    if (doppio[0]) throw new Error("Questa persona è già in un gruppo quel giorno.");
    await sql`
      insert into viaggio_gruppo_persone (gruppo_id, persona_id)
      values (${data.gruppoId}, ${data.personaId})
      on conflict do nothing
    `;
    await scriviSulRegistro(sql, data.personaId);
    return { ok: true };
  });

export const assegnaGuidaOspite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const listaId = Number(raw.listaId);
    const personaId = Number(raw.personaId);
    const guidaUserId = testo(raw.guidaUserId).trim();
    if (!Number.isInteger(listaId) || listaId <= 0 || !Number.isInteger(personaId) || personaId <= 0 || !guidaUserId) throw new Error("Scegli la guida.");
    return { listaId, personaId, guidaUserId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const liste = await sql<{ viaggio_id: number; giorno: string; aperto: boolean | string }>`
      select viaggio_id, giorno::text as giorno, aperto from viaggio_gruppi where id = ${data.listaId} limit 1
    `;
    const lista = liste[0];
    if (!lista || !(lista.aperto === true || lista.aperto === "t" || lista.aperto === "true")) throw new Error("Questa non è la lista aperta.");
    const accesso = await possoVedere(sql, context.userId, Number(lista.viaggio_id));
    if (!accesso.ospite || accesso.stato === "bozza") throw new Error("Solo il diving che ospita assegna le sue guide.");
    const dentro = await sql<{ persona_id: number }>`
      select persona_id from viaggio_gruppo_persone where gruppo_id = ${data.listaId} and persona_id = ${data.personaId} limit 1
    `;
    if (!dentro[0]) throw new Error("Questa persona non è nella lista aperta.");
    const io = await profiloClub(sql, context.userId);
    if (!io) throw new Error("Completa prima il profilo.");
    const guide = await guidaIdonee(sql, io.clubId);
    const guida = guide.find((item) => item.userId === data.guidaUserId);
    if (!guida?.idonea) throw new Error(guida?.motivo || "Questa guida non può essere assegnata.");
    const giorno = lista.giorno.slice(0, 10);
    const doppio = await sql<{ id: number }>`
      select g.id
      from viaggio_gruppo_persone gp
      join viaggio_gruppi g on g.id = gp.gruppo_id
      where gp.persona_id = ${data.personaId} and g.giorno = ${giorno} and g.aperto = false and g.id <> ${data.listaId}
      limit 1
    `;
    if (doppio[0]) throw new Error("Questa persona è già in un gruppo quel giorno.");
    const esistenti = await sql<{ id: number }>`
      select id from viaggio_gruppi
      where viaggio_id = ${lista.viaggio_id} and giorno = ${giorno} and guida_user_id = ${data.guidaUserId} and aperto = false
      limit 1
    `;
    let gruppoId = esistenti[0] ? Number(esistenti[0].id) : 0;
    if (!gruppoId) {
      const nome = `${guida.cognome} ${guida.nome}`.trim();
      const creati = await sql<{ id: number }>`
        insert into viaggio_gruppi (viaggio_id, giorno, guida_user_id, guida_nome, aperto)
        values (${lista.viaggio_id}, ${giorno}, ${data.guidaUserId}, ${nome}, false)
        returning id
      `;
      gruppoId = Number(creati[0]?.id);
      await assicuratiUscita(sql, Number(lista.viaggio_id), giorno, data.guidaUserId, nome);
    }
    const conta = await sql<{ n: number }>`select count(*)::int as n from viaggio_gruppo_persone where gruppo_id = ${gruppoId}`;
    if (Number(conta[0]?.n) >= 6) throw new Error("In un gruppo ci stanno al massimo 6 subacquei.");
    await sql`delete from viaggio_gruppo_persone where gruppo_id = ${data.listaId} and persona_id = ${data.personaId}`;
    await sql`
      insert into viaggio_gruppo_persone (gruppo_id, persona_id)
      values (${gruppoId}, ${data.personaId})
      on conflict do nothing
    `;
    await scriviSulRegistro(sql, data.personaId);
    return { ok: true };
  });

function personaPronta(persona: PersonaViaggio): boolean {
  return persona.moduli.every((modulo) => modulo.fatto);
}

function confermatoSi(value: boolean | string | null | undefined): boolean {
  return value === true || value === "t" || value === "true";
}

async function moduloGiaConfermato(sql: Sql, personaId: number, chiave: string): Promise<boolean> {
  const righe = await sql<{ confermato: boolean | string }>`
    select confermato from viaggio_moduli where persona_id = ${personaId} and form_key = ${chiave} limit 1
  `;
  return confermatoSi(righe[0]?.confermato);
}

async function togliDalRegistro(sql: Sql, viaggioId: number, userId: string, nome: string, cognome: string) {
  if (userId) {
    await sql`
      delete from uscita_righe r
      using uscite u
      where r.uscita_id = u.id and u.viaggio_id = ${viaggioId} and r.user_id = ${userId}
    `;
    return;
  }
  await sql`
    delete from uscita_righe r
    using uscite u
    where r.uscita_id = u.id and u.viaggio_id = ${viaggioId}
      and r.user_id is null and r.cognome = ${cognome} and r.nome = ${nome}
  `;
}

async function togliRigaDelGruppo(sql: Sql, gruppoId: number, personaId: number) {
  const persone = await sql<{ viaggio_id: number; user_id: string | null; nome: string; cognome: string }>`
    select viaggio_id, user_id, nome, cognome from viaggio_persone where id = ${personaId} limit 1
  `;
  const gruppi = await sql<{ giorno: string; guida_user_id: string }>`
    select giorno::text as giorno, guida_user_id from viaggio_gruppi where id = ${gruppoId} limit 1
  `;
  const persona = persone[0];
  const gruppo = gruppi[0];
  if (!persona || !gruppo) return;
  const viaggioId = Number(persona.viaggio_id);
  const giorno = gruppo.giorno.slice(0, 10);
  const userId = persona.user_id ?? "";
  if (userId) {
    await sql`
      delete from uscita_righe r
      using uscite u
      where r.uscita_id = u.id and u.viaggio_id = ${viaggioId}
        and u.data = ${giorno} and u.guida_user_id = ${gruppo.guida_user_id}
        and r.user_id = ${userId}
    `;
    return;
  }
  await sql`
    delete from uscita_righe r
    using uscite u
    where r.uscita_id = u.id and u.viaggio_id = ${viaggioId}
      and u.data = ${giorno} and u.guida_user_id = ${gruppo.guida_user_id}
      and r.user_id is null and r.cognome = ${persona.cognome} and r.nome = ${persona.nome}
  `;
}

async function assicuratiUscita(sql: Sql, viaggioId: number, giorno: string, guidaUserId: string, guidaNome: string) {
  const esistenti = await sql<{ club_id: number; created_by: string }>`
    select club_id, created_by from uscite where viaggio_id = ${viaggioId} limit 1
  `;
  if (!esistenti[0]) return;
  const gia = await sql<{ id: number }>`
    select id from uscite where viaggio_id = ${viaggioId} and data = ${giorno} and guida_user_id = ${guidaUserId} limit 1
  `;
  if (gia[0]) return;
  const titolo = await sql<{ titolo: string }>`select titolo from viaggi where id = ${viaggioId} limit 1`;
  await sql`
    insert into uscite (club_id, data, localita, guida_user_id, guida_nome, orario_inizio, created_by, viaggio_id)
    values (${esistenti[0].club_id}, ${giorno}, ${titolo[0]?.titolo ?? ""}, ${guidaUserId}, ${guidaNome}, ${"09:00"}, ${esistenti[0].created_by}, ${viaggioId})
  `;
}

async function scriviSulRegistro(sql: Sql, personaId: number) {
  const persone = await sql<{
    viaggio_id: number;
    user_id: string | null;
    nome: string;
    cognome: string;
    consenso: boolean | string;
    fatti: number;
  }>`
    select p.viaggio_id, p.user_id, p.nome, p.cognome, p.consenso,
      (select count(*)::int from viaggio_moduli m where m.persona_id = p.id and m.confermato) as fatti
    from viaggio_persone p where p.id = ${personaId} limit 1
  `;
  const persona = persone[0];
  if (!persona || Number(persona.fatti) < MODULI.length) return;
  const viaggioId = Number(persona.viaggio_id);
  const presenti = await sql<{ id: number }>`select id from uscite where viaggio_id = ${viaggioId} limit 1`;
  if (!presenti[0]) return;
  const scheda = await sql<{ payload: string }>`
    select payload from viaggio_moduli where persona_id = ${personaId} and form_key = 'registro-immersione' limit 1
  `;
  const campi = payloadDi(scheda[0]?.payload ?? "{}");
  const gruppi = await sql<{ giorno: string; guida_user_id: string; guida_nome: string }>`
    select g.giorno::text as giorno, g.guida_user_id, g.guida_nome
    from viaggio_gruppo_persone gp
    join viaggio_gruppi g on g.id = gp.gruppo_id
    where gp.persona_id = ${personaId}
  `;
  const userId = persona.user_id ?? "";
  for (const gruppo of gruppi) {
    const giorno = gruppo.giorno.slice(0, 10);
    await assicuratiUscita(sql, viaggioId, giorno, gruppo.guida_user_id, gruppo.guida_nome);
    const uscita = await sql<{ id: number }>`
      select id from uscite where viaggio_id = ${viaggioId} and data = ${giorno} and guida_user_id = ${gruppo.guida_user_id} limit 1
    `;
    const uscitaId = Number(uscita[0]?.id);
    if (!uscitaId) continue;
    const gia = userId
      ? await sql<{ id: number }>`select id from uscita_righe where uscita_id = ${uscitaId} and user_id = ${userId} limit 1`
      : await sql<{ id: number }>`select id from uscita_righe where uscita_id = ${uscitaId} and user_id is null and cognome = ${persona.cognome} and nome = ${persona.nome} limit 1`;
    if (gia[0]) continue;
    await sql`
      insert into uscita_righe (uscita_id, user_id, cognome, nome, didattica, livello, numero_brevetto)
      values (${uscitaId}, ${userId || null}, ${persona.cognome}, ${persona.nome}, ${campi.didattica ?? ""}, ${campi.livello ?? ""}, ${campi.numero_brevetto ?? ""})
    `;
  }
}

export const inviaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Viaggio non trovato.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ stato: string; pdf: string }> => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.id);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può inviare.");
    const vista = await pagina(sql, context.userId, data.id);
    if (!vista.persone.length) throw new Error("Aggiungi almeno una persona.");
    const incomplete = vista.persone.filter((persona) => !personaPronta(persona));
    if (incomplete.length) throw new Error("Manca un modulo o il consenso di una persona.");
    if (!vista.gruppi.length) throw new Error("Prepara almeno un gruppo.");
    const pdf = await pdfFascicolo(sql, vista);
    if (vista.stato === "bozza") {
      await sql`update viaggi set stato = 'inviato', inviato_il = now() where id = ${data.id}`;
    }
    return { stato: vista.ospiteClubId ? "inviato" : "fascicolo", pdf };
  });

async function pdfFascicolo(sql: Sql, vista: ViaggioPagina): Promise<string> {
  const moduli = await sql<{ persona_id: number; form_key: string; payload: string; origine: string; foto: string }>`
    select m.persona_id, m.form_key, m.payload, m.origine, case when m.foto <> '' then 'si' else '' end as foto
    from viaggio_moduli m
    join viaggio_persone p on p.id = m.persona_id
    where p.viaggio_id = ${vista.id}
  `;
  const blocchi = vista.persone.map((persona) => {
    const nome = `${persona.cognome} ${persona.nome}`.trim() || persona.email || "Senza nome";
    const scheda = payloadDi(moduli.find((item) => Number(item.persona_id) === persona.id && item.form_key === "brevetto-esperienza")?.payload ?? "{}");
    const righe = moduli.filter((item) => Number(item.persona_id) === persona.id);
    const foto = righe.some((item) => item.foto === "si");
    const gruppi = vista.gruppi
      .filter((gruppo) => gruppo.persone.includes(persona.id))
      .map((gruppo) => `${gruppo.giorno} con ${gruppo.guidaNome}`)
      .join("; ");
    return [
      nome,
      persona.origine === "mano" || persona.origine === "scansione" ? "Compilato dal club" : "Compilato dalla persona",
      `Brevetto ${scheda.didattica ?? ""} ${scheda.livello ?? ""} ${scheda.numero_brevetto ?? ""}`.trim(),
      foto ? "Foto del brevetto allegata e controllata dal club" : "Senza foto del brevetto",
      gruppi || "Senza gruppo",
    ];
  });
  const bytes = scriviPdfBlocchi({
    titolo: vista.titolo,
    nota: `${vista.dal} - ${vista.al}. Destinazione: ${vista.ospiteNome}. Fascicolo di ${vista.clubNome}. Non e ancora un'uscita del diving che ospita.`,
    blocchi,
    vuoto: "Nessuna persona.",
  });
  return Buffer.from(bytes).toString("base64");
}

export const accettaViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Viaggio non trovato.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accesso = await possoVedere(sql, context.userId, data.id);
    if (!accesso.ospite) throw new Error("Solo il diving che ospita può accettare.");
    const vista = await pagina(sql, context.userId, data.id);
    if (vista.stato === "bozza") throw new Error("Il fascicolo non è ancora arrivato.");
    const io = await profiloClub(sql, context.userId);
    if (!io) throw new Error("Completa prima il profilo.");
    const gia = await sql<{ id: number }>`select id from uscite where viaggio_id = ${data.id} limit 1`;
    if (!gia[0]) {
      for (const gruppo of vista.gruppi) {
        if (gruppo.aperto) continue;
        const creata = await sql<{ id: number }>`
          insert into uscite (club_id, data, localita, guida_user_id, guida_nome, orario_inizio, created_by, viaggio_id)
          values (${io.clubId}, ${gruppo.giorno}, ${vista.titolo}, ${gruppo.guidaUserId}, ${gruppo.guidaNome}, ${gruppo.oraInizio || "09:00"}, ${context.userId}, ${data.id})
          returning id
        `;
        const uscitaId = Number(creata[0]?.id);
        for (const personaId of gruppo.persone) {
          const persona = vista.persone.find((item) => item.id === personaId);
          if (!persona) continue;
          const scheda = await sql<{ payload: string }>`
            select payload from viaggio_moduli where persona_id = ${persona.id} and form_key = 'registro-immersione' limit 1
          `;
          const campi = payloadDi(scheda[0]?.payload ?? "{}");
          if (!personaPronta(persona)) continue;
          await sql`
            insert into uscita_righe (uscita_id, user_id, cognome, nome, didattica, livello, numero_brevetto)
            values (${uscitaId}, ${persona.userId || null}, ${persona.cognome}, ${persona.nome}, ${campi.didattica ?? ""}, ${campi.livello ?? ""}, ${campi.numero_brevetto ?? ""})
          `;
        }
      }
    }
    await sql`update viaggi set stato = 'accettato' where id = ${data.id}`;
    return { ok: true };
  });

export const chiudiGruppoViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const gruppoId = Number(raw.gruppoId);
    const firma = testo(raw.firma);
    const oraInizio = testo(raw.oraInizio).slice(0, 5);
    const oraFine = testo(raw.oraFine).slice(0, 5);
    const profondita = testo(raw.profondita).slice(0, 8);
    const profonditaPrevista = testo(raw.profonditaPrevista).slice(0, 8);
    const autorespiratore = testo(raw.autorespiratore).slice(0, 40);
    const miscela = testo(raw.miscela).slice(0, 40);
    if (!Number.isInteger(gruppoId) || gruppoId <= 0) throw new Error("Gruppo non trovato.");
    if (!firma.startsWith("data:image/png;base64,") || firma.length > 300000) throw new Error("Firma il libretto col dito.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(oraInizio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(oraFine)) throw new Error("Scrivi ora di inizio e ora di fine.");
    return { gruppoId, firma, oraInizio, oraFine, profondita, profonditaPrevista, autorespiratore, miscela };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const gruppi = await sql<{ viaggio_id: number; guida_user_id: string; giorno: string; guida_nome: string }>`
      select viaggio_id, guida_user_id, giorno::text as giorno, guida_nome from viaggio_gruppi where id = ${data.gruppoId} limit 1
    `;
    const gruppo = gruppi[0];
    if (!gruppo) throw new Error("Gruppo non trovato.");
    if (gruppo.guida_user_id !== context.userId) throw new Error("Firma la guida di questo gruppo.");
    await possoVedere(sql, context.userId, Number(gruppo.viaggio_id));
    const viaggio = await sql<{ ospite_nome: string; titolo: string }>`select ospite_nome, titolo from viaggi where id = ${gruppo.viaggio_id}`;
    await sql`
      update viaggio_gruppi
      set firma = ${data.firma}, firmato_il = now(), chiuso = true,
          ora_inizio = ${data.oraInizio}, ora_fine = ${data.oraFine},
          profondita = ${data.profondita}, profondita_prevista = ${data.profonditaPrevista},
          autorespiratore = ${data.autorespiratore}, miscela = ${data.miscela}
      where id = ${data.gruppoId}
    `;
    const persone = await sql<{ user_id: string | null; nome: string; cognome: string }>`
      select p.user_id, p.nome, p.cognome
      from viaggio_gruppo_persone gp
      join viaggio_persone p on p.id = gp.persona_id
      where gp.gruppo_id = ${data.gruppoId} and p.user_id is not null
    `;
    const centro = viaggio[0]?.ospite_nome ?? "";
    const giorno = gruppo.giorno.slice(0, 10);
    const minuti = minutiTra(data.oraInizio, data.oraFine);
    const nota = data.autorespiratore ? `Autorespiratore: ${data.autorespiratore}` : "";
    for (const persona of persone) {
      if (!persona.user_id) continue;
      const esistenti = await sql<{ id: number }>`
        select id from logbook_entries where user_id = ${persona.user_id} and viaggio_gruppo_id = ${data.gruppoId} limit 1
      `;
      if (esistenti[0]) {
        await sql`
          update logbook_entries
          set dive_time = ${data.oraInizio}, ora_fine = ${data.oraFine}, depth_m = ${data.profondita},
              minutes = ${minuti}, profondita_prevista = ${data.profonditaPrevista}, mix = ${data.miscela || "Aria"},
              centro = ${centro}, guida_nome = ${gruppo.guida_nome}, guida_firma = ${data.firma}, updated_at = now()
          where id = ${esistenti[0].id}
        `;
      } else {
        await sql`
          insert into logbook_entries (
            user_id, dive_date, site, dive_time, ora_fine, depth_m, minutes, profondita_prevista, mix, notes, centro, guida_nome, guida_firma, viaggio_gruppo_id, decompressione
          ) values (
            ${persona.user_id}, ${giorno}, ${centro || viaggio[0]?.titolo || "Viaggio"}, ${data.oraInizio}, ${data.oraFine},
            ${data.profondita}, ${minuti}, ${data.profonditaPrevista}, ${data.miscela || "Aria"}, ${nota}, ${centro}, ${gruppo.guida_nome}, ${data.firma}, ${data.gruppoId}, ${""}
          )
        `;
      }
    }
    return { ok: true, pdf: "" };
  });

export const pdfLibrettiMano = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const gruppoId = Number((input as { gruppoId?: unknown } | null)?.gruppoId);
    if (!Number.isInteger(gruppoId) || gruppoId <= 0) throw new Error("Gruppo non trovato.");
    return { gruppoId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const gruppi = await sql<{ viaggio_id: number; giorno: string; guida_nome: string; ora_inizio: string; ora_fine: string; profondita: string; profondita_prevista: string; miscela: string; autorespiratore: string; chiuso: boolean | string }>`
      select viaggio_id, giorno::text as giorno, guida_nome, ora_inizio, ora_fine, profondita, profondita_prevista, miscela, autorespiratore, chiuso
      from viaggio_gruppi where id = ${data.gruppoId} limit 1
    `;
    const gruppo = gruppi[0];
    if (!gruppo || !(gruppo.chiuso === true || gruppo.chiuso === "t" || gruppo.chiuso === "true")) throw new Error("La guida non ha ancora firmato.");
    const accesso = await possoVedere(sql, context.userId, Number(gruppo.viaggio_id));
    if (!accesso.gestisco && gruppo.guida_nome && context.userId) {
      /* la guida e la scuola possono scaricare */
    }
    const viaggio = await sql<{ ospite_nome: string }>`select ospite_nome from viaggi where id = ${gruppo.viaggio_id}`;
    const persone = await sql<{ nome: string; cognome: string; user_id: string | null }>`
      select p.nome, p.cognome, p.user_id
      from viaggio_gruppo_persone gp join viaggio_persone p on p.id = gp.persona_id
      where gp.gruppo_id = ${data.gruppoId} and p.user_id is null
    `;
    const bytes = scriviPdfBlocchi({
      titolo: "Libretto immersione",
      nota: `Firmato da ${gruppo.guida_nome}. Centro: ${viaggio[0]?.ospite_nome ?? ""}.`,
      blocchi: persone.map((persona) => [
        `${persona.cognome} ${persona.nome}`.trim(),
        gruppo.giorno.slice(0, 10),
        `Inizio ${gruppo.ora_inizio} fine ${gruppo.ora_fine}`,
        `Profondità prevista ${gruppo.profondita_prevista} raggiunta ${gruppo.profondita}`,
        `Autorespiratore ${gruppo.autorespiratore} miscela ${gruppo.miscela}`,
        `Guida ${gruppo.guida_nome}`,
      ]),
      vuoto: "Nessuna persona senza app in questo gruppo.",
    });
    return { pdf: Buffer.from(bytes).toString("base64") };
  });

export const elencoDivingViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: number; nome: string }[]> => {
    const sql = await getSql();
    const io = await profiloClub(sql, context.userId);
    if (!io?.gestisce) return [];
    const rows = await sql<{ id: number; nome: string }>`
      select id, nome from club where id <> ${io.clubId} and coalesce(stato, 'attiva') <> 'sospesa' order by nome limit 200
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome }));
  });

const DOMANDE_MEDICHE: [string, string][] = [
  ["1", "Ho avuto problemi a livello polmonare, respiratorio, cardiaco e/o ematologico che hanno influenzato le mie normali prestazioni fisiche o mentali."],
  ["2", "Ho più di 45 anni."],
  ["3", "Fatico a svolgere esercizio fisico moderato (per esempio camminare 1,6 km in 14 minuti o nuotare 200 metri senza riposare), oppure non sono stato in grado di fare una normale attività fisica negli ultimi 12 mesi."],
  ["4", "Ho avuto problemi agli occhi, alle orecchie o ai seni paranasali."],
  ["5", "Ho subito un'operazione negli ultimi 12 mesi, oppure ho tuttora problemi dovuti a un passato intervento chirurgico."],
  ["6", "Ho perso conoscenza, avuto emicranie, crisi epilettiche, ictus, traumi cranici importanti, o ho una malattia neurologica cronica."],
  ["7", "Sono in terapia, o lo sono stato negli ultimi 5 anni, per problemi psicologici, disturbi della personalità, attacchi di panico o una dipendenza da droghe o alcol; oppure mi è stato diagnosticato un disturbo dell'apprendimento o dello sviluppo."],
  ["8", "Ho avuto problemi di schiena, ernie, ulcere o diabete."],
  ["9", "Ho avuto problemi gastrici o intestinali, compresa una diarrea recente."],
  ["10", "Sto assumendo medicinali soggetti a prescrizione medica, esclusi i contraccettivi e gli antimalarici diversi dalla meflochina (Lariam)."],
];

const BOX_MEDICI: [string, string, string[]][] = [
  ["Box A", "Compila solo se hai risposto SÌ alla domanda 1.", [
    "Intervento chirurgico al torace, al cuore, alle valvole cardiache, un dispositivo impiantabile (stent, pacemaker, neurostimolatore) o uno pneumotorace.",
    "Asma, dispnea, allergie gravi, febbre da fieno o vie aeree congestionate negli ultimi 12 mesi, tali da limitare l'attività fisica.",
    "Problema al cuore: angina, dolore al petto sotto sforzo, insufficienza cardiaca, edema polmonare da immersione, infarto o ictus, oppure farmaci per una condizione cardiaca.",
    "Bronchite ricorrente e tosse negli ultimi 12 mesi, oppure una diagnosi di enfisema.",
    "Negli ultimi 30 giorni, sintomi a polmoni, respirazione, cuore o sangue che hanno limitato le prestazioni fisiche o mentali.",
  ]],
  ["Box B", "Compila solo se hai più di 45 anni (domanda 2).", [
    "Fumo o inalo nicotina in altri modi.",
    "Ho un livello alto di colesterolo.",
    "Ho la pressione arteriosa alta.",
    "Un consanguineo stretto è morto improvvisamente per malattia cardiaca o ictus prima dei 50 anni, oppure ho familiarità per malattie cardiache prima dei 50 anni.",
  ]],
  ["Box C", "Compila solo se hai risposto SÌ alla domanda 4.", [
    "Intervento chirurgico ai seni paranasali negli ultimi 6 mesi.",
    "Patologia o intervento all'orecchio, perdita di udito o problemi di equilibrio.",
    "Sinusite ricorrente negli ultimi 12 mesi.",
    "Chirurgia oculare negli ultimi 3 mesi.",
  ]],
  ["Box D", "Compila solo se hai risposto SÌ alla domanda 6.", [
    "Trauma cranico con perdita di coscienza negli ultimi 5 anni.",
    "Patologia neurologica cronica.",
    "Emicrania ricorrente negli ultimi 12 mesi, o farmaci per prevenirla.",
    "Svenimenti o perdita di coscienza, anche parziale, negli ultimi 5 anni.",
    "Epilessia, crisi convulsive, o farmaci per prevenirle.",
  ]],
  ["Box E", "Compila solo se hai risposto SÌ alla domanda 7.", [
    "Problemi comportamentali, mentali o psicologici che richiedono terapia medica o psichiatrica.",
    "Depressione forte, idee suicidarie, attacchi di panico o disturbo bipolare non controllato, con terapia farmacologica o psichiatrica.",
    "Diagnosi di malattia mentale o di disturbo dell'apprendimento o dello sviluppo che richiede cura continua o adattamenti.",
    "Dipendenza da droghe o alcol che ha richiesto terapia negli ultimi 5 anni.",
  ]],
  ["Box F", "Compila solo se hai risposto SÌ alla domanda 8.", [
    "Problemi di schiena ricorrenti negli ultimi 6 mesi che limitano la vita quotidiana.",
    "Intervento alla schiena o alla colonna negli ultimi 12 mesi.",
    "Diabete controllato con farmaci o dieta, oppure diabete gestazionale negli ultimi 12 mesi.",
    "Ernia non corretta che limita le abilità fisiche.",
    "Ulcere attive o non trattate, problemi di cicatrizzazione, o un'operazione per ulcera negli ultimi 6 mesi.",
  ]],
  ["Box G", "Compila solo se hai risposto SÌ alla domanda 9.", [
    "Intervento di stomia, senza autorizzazione medica a nuotare o a fare attività fisica.",
    "Disidratazione che ha richiesto un intervento medico negli ultimi 7 giorni.",
    "Ulcere gastriche o intestinali attive non curate, o un'operazione per ulcera negli ultimi 6 mesi.",
    "Bruciore di stomaco frequente, rigurgito o reflusso (MRGE).",
    "Rettocolite ulcerosa o morbo di Crohn, attivi o non controllati.",
    "Chirurgia bariatrica negli ultimi 12 mesi.",
  ]],
];

function pdfDi(nome: string, kicker: string, titolo: string, piede: string, pezzi: PezzoModulo[]): { nome: string; pdf: string } {
  return { nome, pdf: Buffer.from(scriviPdfModulo({ kicker, titolo, piede, pezzi })).toString("base64") };
}

function documentiVuoti(viaggio?: { titolo: string; dal: string; al: string; club: string }): { nome: string; pdf: string }[] {
  const piede = "Modulo vuoto per chi non ha l'app. Vale solo per questo viaggio. Si compila a mano, si firma e si rimanda la foto al club. Il club controlla prima di confermare.";
  const testa: PezzoModulo[] = viaggio
    ? [{ k: "nota", t: `Viaggio: ${viaggio.titolo}. Dal ${viaggio.dal} al ${viaggio.al}. Club che organizza: ${viaggio.club}.` }]
    : [];
  const scheda: PezzoModulo[] = [
    { k: "nota", t: "Scheda del partecipante. Serve a chi organizza il viaggio per sapere chi si immerge, con quale brevetto e con quale gas. Non è il registro dell'uscita: quello lo tiene il centro che ospita (art. 12, legge 7 maggio 2026, n. 70)." },
    { k: "sezione", t: "Partecipante" },
    { k: "coppia", a: "Cognome", b: "Nome" },
    { k: "coppia", a: "Codice fiscale", b: "Data di nascita" },
    { k: "coppia", a: "Luogo di nascita", b: "Sesso (F / M / altro)" },
    { k: "campo", t: "Indirizzo" },
    { k: "coppia", a: "CAP", b: "Città" },
    { k: "coppia", a: "Provincia", b: "Telefono" },
    { k: "campo", t: "Email" },
    { k: "scelta", t: "Documento", opzioni: ["Carta di identità", "Passaporto", "Patente"] },
    { k: "campo", t: "Numero del documento" },
    { k: "sezione", t: "Brevetto" },
    { k: "scelta", t: "Didattica", opzioni: ["PADI", "SSI", "CMAS", "SNSI", "FIPSAS", "RAID", "NAUI", "SDI/TDI", "CEDIP", "GUE", "Altra"] },
    { k: "campo", t: "Se Altra, specifica la didattica" },
    { k: "coppia", a: "Livello (Open Water, 1 grado...)", b: "Numero brevetto" },
    { k: "sezione", t: "Uscita" },
    { k: "coppia", a: "Dal (giorno)", b: "Al (giorno)" },
    { k: "scelta", t: "Tipo", opzioni: ["Ricreativa", "Tecnica"] },
    { k: "sino", t: "Se tecnica: l'immersione è decompressiva?" },
    { k: "sezione", t: "Gas di fondo" },
    { k: "scelta", t: "Miscela respiratoria", opzioni: ["Aria", "EAN 32", "EAN 36", "Altra"] },
    { k: "campo", t: "Se Altra, specifica la miscela" },
    { k: "scelta", t: "Tipo di autorespiratore", opzioni: ["Circuito aperto", "Rebreather"] },
    { k: "campo", t: "Compagno, se gia lo sai" },
    { k: "campo", t: "Nota" },
    { k: "sezione", t: "Contatto in caso di emergenza" },
    { k: "coppia", a: "Nome e cognome", b: "Telefono" },
    { k: "spunta", t: "Acconsento al trattamento dei dati per organizzare l'attivita e adempiere agli obblighi di registrazione." },
    { k: "firma", t: "Firma del partecipante" },
  ];
  const brevetto: PezzoModulo[] = [
    { k: "nota", t: "Verifica di competenza prima dell'immersione organizzata (ISO 24803) e annotazione degli estremi del brevetto (art. 12, legge 7 maggio 2026, n. 70). Allega anche la foto del brevetto, sul retro o su un foglio a parte." },
    { k: "sezione", t: "Partecipante" },
    { k: "coppia", a: "Cognome", b: "Nome" },
    { k: "sezione", t: "Brevetto" },
    { k: "scelta", t: "Didattica", opzioni: ["PADI", "SSI", "CMAS", "FIPSAS", "RAID", "NAUI", "SDI/TDI", "CEDIP", "GUE", "Altra"] },
    { k: "coppia", a: "Livello", b: "Numero brevetto" },
    { k: "coppia", a: "Data di rilascio", b: "Profondita massima consentita (m)" },
    { k: "campo", t: "Istruttore o centro che ha brevettato" },
    { k: "sezione", t: "Esperienza recente" },
    { k: "coppia", a: "Data dell'ultima immersione", b: "Immersioni totali" },
    { k: "campo", t: "Immersioni negli ultimi 12 mesi" },
    { k: "sezione", t: "Specialita" },
    { k: "nota", t: "Spunta quelle che hai. Non è un elenco da completare per forza." },
    { k: "scelta", t: "Gas e profondita", opzioni: ["Nitrox", "Nitrox avanzato", "Profonda", "Multilivello", "Computer", "Decompressione", "Trimix", "Rebreather"] },
    { k: "scelta", t: "Ambiente", opzioni: ["Notturna", "Visibilita ridotta", "Corrente", "Alta quota", "Ghiaccio", "Da barca", "Da riva", "Relitto", "Penetrazione relitto", "Caverna", "Grotta"] },
    { k: "scelta", t: "Attrezzatura", opzioni: ["Assetto", "Muta stagna", "Sidemount", "Bibombola", "Scooter", "Configurazione attrezzatura"] },
    { k: "scelta", t: "Osservazione e sicurezza", opzioni: ["Fotografia", "Video", "Biologia marina", "Identificazione pesci", "Conservazione", "Navigazione", "Ricerca e recupero", "Soccorso", "Primo soccorso e ossigeno", "Immersione autonoma"] },
    { k: "campo", t: "Altra specialità, se non è nell'elenco" },
    { k: "spunta", t: "Ho il libretto immersioni (cartaceo o digitale) disponibile per il controllo." },
    { k: "firma", t: "Firma (nome e cognome)" },
    { k: "sezione", t: "Foto del brevetto" },
    { k: "nota", t: "Incolla o allega una foto leggibile del brevetto: nome, didattica, livello e numero devono vedersi. Senza la foto il club non conferma questo modulo." },
    { k: "campo", t: "Spazio per la foto, oppure scrivi 'allegata a parte'" },
  ];
  const medico: PezzoModulo[] = [
    { k: "nota", t: "Questionario medico per l'immersione ricreativa, con autorespiratore o in apnea. Testo del Diver Medical Participant Questionnaire, Diver Medical Screen Committee, versione 2022-02-01 (10346 ITA). Non è il certificato del medico." },
    { k: "nota", t: "Rispondi a tutte le domande in modo veritiero. Se non ti senti bene, non immergerti. Se sei incinta o stai provando a restare incinta, non immergerti." },
    { k: "sezione", t: "Partecipante" },
    { k: "coppia", a: "Cognome", b: "Nome" },
    { k: "coppia", a: "Data di nascita", b: "Nome dell'istruttore" },
    { k: "campo", t: "Nome della struttura o del club" },
    { k: "sezione", t: "Domande" },
    ...DOMANDE_MEDICHE.map(([n, testo]): PezzoModulo => ({ k: "sino", t: `${n}. ${testo}` })),
    ...BOX_MEDICI.flatMap(([titolo, nota, voci]): PezzoModulo[] => [
      { k: "sezione", t: titolo },
      { k: "nota", t: nota },
      ...voci.map((voce): PezzoModulo => ({ k: "sino", t: voce })),
    ]),
    { k: "sezione", t: "Firma del partecipante" },
    { k: "nota", t: "Se hai risposto no a tutte le 10 domande, la visita medica non è richiesta. Se hai risposto sì alle domande 3, 5 o 10, oppure a una domanda dei box, firma comunque e porta questo questionario al medico: senza la sua approvazione non si partecipa al corso o all'immersione." },
    { k: "spunta", t: "Ho risposto a tutte le domande in modo veritiero e accetto la responsabilità delle conseguenze se ho risposto in modo errato o se non ho rivelato condizioni mediche attuali o passate." },
    { k: "firma", t: "Firma del partecipante, o del genitore o tutore se è minorenne" },
    { k: "sezione", t: "Valutazione del medico" },
    { k: "nota", t: "Da compilare solo dopo la visita, se il questionario la richiede. Il medico scrive se non trova condizioni incompatibili con l'immersione ricreativa." },
    { k: "scelta", t: "Esito", opzioni: ["Approvato", "Non approvato"] },
    { k: "coppia", a: "Nome del medico", b: "Attestati o credenziali" },
    { k: "campo", t: "Clinica o ospedale" },
    { k: "campo", t: "Indirizzo" },
    { k: "coppia", a: "Telefono", b: "Email" },
    { k: "firma", t: "Firma e timbro del medico" },
  ];
  const consenso: PezzoModulo[] = [
    { k: "nota", t: "Informazione sui rischi dell'immersione e sulla tutela degli ecosistemi (legge 7 maggio 2026, n. 70). Il consenso vale solo per questi moduli e per questo viaggio, non per altri diving e non per l'archivio generale." },
    { k: "sezione", t: "Partecipante" },
    { k: "coppia", a: "Cognome", b: "Nome" },
    { k: "sezione", t: "Informativa" },
    { k: "nota", t: "L'immersione con autorespiratore comporta rischi propri: barotrauma, malattia da decompressione, affaticamento, separazione dal gruppo, mare e meteo che cambiano. Ci si immerge almeno in coppia, nei limiti del brevetto e delle indicazioni della guida. Si puo rinunciare all'immersione in qualsiasi momento, anche dopo il briefing, senza dover dare una giustificazione." },
    { k: "nota", t: "Sui fondali non si tocca e non si preleva nulla. L'assetto va tenuto corretto, per non danneggiare il fondo. I rifiuti non si lasciano in acqua." },
    { k: "spunta", t: "Ho letto l'informativa sui rischi e posso rinunciare all'immersione in qualsiasi momento." },
    { k: "spunta", t: "Mi immergerò nei limiti del mio brevetto, mai da solo/a, e seguirò briefing e guida." },
    { k: "spunta", t: "Rispetterò l'ambiente sommerso: niente contatto, niente prelievi, assetto corretto." },
    { k: "spunta", t: "Acconsento a consegnare questi moduli al club che organizza il viaggio, solo per questo viaggio, e a conservarli insieme al registro per gli obblighi di legge." },
    { k: "firma", t: "Firma del partecipante" },
    { k: "sezione", t: "Se il partecipante è minorenne" },
    { k: "sino", t: "Il partecipante è minorenne?" },
    { k: "nota", t: "Se sì, firma chi esercita la responsabilità genitoriale. Senza quella firma il minore non entra nel viaggio." },
    { k: "coppia", a: "Cognome di chi firma", b: "Nome di chi firma" },
    { k: "campo", t: "Telefono" },
    { k: "firma", t: "Firma di chi esercita la responsabilità genitoriale" },
  ];
  return [
    pdfDi("scheda-subacqueo.pdf", "Viaggio", "Scheda subacqueo", piede, [...testa, ...scheda]),
    pdfDi("brevetto-ed-esperienza.pdf", "ISO 24803", "Brevetto ed esperienza", piede, [...testa, ...brevetto]),
    pdfDi("questionario-medico.pdf", "Diver Medical 2022-02-01", "Questionario medico", piede, [...testa, ...medico]),
    pdfDi("informativa-e-consenso.pdf", "Condotta", "Informativa e consenso", piede, [...testa, ...consenso]),
  ];
}

export const pdfModuliVuoti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { viaggioId?: unknown } | null)?.viaggioId);
    return { viaggioId: Number.isInteger(id) && id > 0 ? id : 0 };
  })
  .handler(async ({ context, data }): Promise<{ documenti: { nome: string; pdf: string }[] }> => {
    const sql = await getSql();
    const io = await profiloClub(sql, context.userId);
    if (!io?.gestisce) throw new Error("Solo il diving, la scuola o il loro staff possono preparare i moduli.");
    if (!data.viaggioId) return { documenti: documentiVuoti() };
    const accesso = await possoVedere(sql, context.userId, data.viaggioId);
    if (!accesso.gestisco) throw new Error("Solo chi organizza può preparare i moduli.");
    const righe = await sql<{ titolo: string; dal: string; al: string; club: string }>`
      select v.titolo, v.dal::text as dal, v.al::text as al, c.nome as club
      from viaggi v join club c on c.id = v.club_id
      where v.id = ${data.viaggioId}
      limit 1
    `;
    const viaggio = righe[0];
    if (!viaggio) throw new Error("Viaggio non trovato.");
    const dal = viaggio.dal.slice(0, 10).split("-").reverse().join("/");
    const al = viaggio.al.slice(0, 10).split("-").reverse().join("/");
    return { documenti: documentiVuoti({ titolo: viaggio.titolo, dal, al, club: viaggio.club }) };
  });

export const proponiScansioneViaggio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const personaId = Number(raw.personaId);
    const chiave = testo(raw.chiave);
    const foto = testo(raw.foto);
    if (!Number.isInteger(personaId) || personaId <= 0 || !MODULI.includes(chiave as ChiaveModulo)) throw new Error("Modulo non trovato.");
    if (!/^data:image\/jpeg;base64,/.test(foto) || foto.length > 500_000) throw new Error("Allega una foto JPG del modulo.");
    return { personaId, chiave: chiave as ChiaveModulo, foto };
  })
  .handler(async ({ context, data }): Promise<{ campi: Record<string, string> }> => {
    const sql = await getSql();
    const persone = await sql<{ viaggio_id: number; user_id: string | null }>`
      select viaggio_id, user_id from viaggio_persone where id = ${data.personaId} limit 1
    `;
    const persona = persone[0];
    if (!persona) throw new Error("Persona non trovata.");
    const accesso = await possoVedere(sql, context.userId, Number(persona.viaggio_id));
    if (!accesso.gestisco) throw new Error("Solo chi organizza può leggere la foto.");
    if (accesso.stato !== "bozza" && (await moduloGiaConfermato(sql, data.personaId, data.chiave))) throw new Error("Questo modulo è già nel fascicolo.");
    if (persona.user_id) throw new Error("Questa persona compila i moduli dall'app.");
    const apiKey = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "").replace(/\s+/g, "").replace(/^["']|["']$/g, "");
    if (apiKey.length < 20) throw new Error("Manca la chiave di Gemini. Aggiungila nei segreti dell'app, con il nome GEMINI_API_KEY.");
    const chiavi = chiaviModulo(data.chiave);
    const testoRichiesta = `Leggi questa foto di un modulo subacqueo firmato. Rispondi solo con un oggetto JSON. Chiavi ammesse: ${chiavi.join(", ")}. Per le domande q1-q10 usa solo si o no. Se non leggi un campo, metti stringa vuota. Non inventare.`;
    const corpo = data.foto.slice(data.foto.indexOf(",") + 1);
    const models = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];
    let ultimo = "Non ho letto la foto. Tocca Riprova.";
    for (const model of models) {
      const esito = await leggiModuloFoto(apiKey, model, testoRichiesta, corpo);
      if (esito.campi) {
        const puliti: Record<string, string> = {};
        for (const chiave of chiavi) puliti[chiave] = normalizzaCampo(chiave, esito.campi[chiave] ?? "");
        return { campi: puliti };
      }
      if (esito.errore) ultimo = esito.errore;
      if (esito.stop) break;
    }
    throw new Error(ultimo);
  });

function chiaviModulo(chiave: ChiaveModulo): string[] {
  if (chiave === "registro-immersione") {
    return ["cognome", "nome", "codice_fiscale", "data_nascita", "telefono", "email", "didattica", "livello", "numero_brevetto", "data_inizio", "data_fine", "tipo_attivita", "miscela", "autorespiratore", "emergenza_nome", "emergenza_telefono", "consenso_privacy", "firma"];
  }
  if (chiave === "brevetto-esperienza") {
    return ["cognome", "nome", "didattica", "livello", "numero_brevetto", "data_rilascio", "ultima_immersione", "immersioni_totali", "profondita_massima", "logbook_disponibile", "firma"];
  }
  if (chiave === "questionario-medico") {
    return ["cognome", "nome", "data_nascita", "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "qa1", "qa2", "qa3", "qa4", "qa5", "qb1", "qb2", "qb3", "qb4", "qc1", "qc2", "qc3", "qc4", "qd1", "qd2", "qd3", "qd4", "qd5", "qe1", "qe2", "qe3", "qe4", "qf1", "qf2", "qf3", "qf4", "qf5", "qg1", "qg2", "qg3", "qg4", "qg5", "qg6", "dichiarazione_veritiera", "data_compilazione", "firma", "med_esito", "med_nome"];
  }
  return ["cognome", "nome", "data_compilazione", "ho_letto_rischi", "rispetto_limiti", "rispetto_ambiente", "consenso_dati", "consenso_invio", "minorenne", "genitore_cognome", "genitore_nome", "genitore_telefono", "firma", "firma_genitore"];
}

function normalizzaCampo(chiave: string, value: string): string {
  const testoPulito = value.trim().slice(0, 200);
  const siNo = /^q[a-g]?\d+$/.test(chiave) || ["dichiarazione_veritiera", "ho_letto_rischi", "consenso_invio", "rispetto_limiti", "rispetto_ambiente", "consenso_dati", "consenso_privacy", "logbook_disponibile", "minorenne"].includes(chiave);
  if (siNo) {
    if (/^(si|sì|yes|true|y)$/i.test(testoPulito)) return "si";
    if (/^(no|false|n)$/i.test(testoPulito)) return "no";
    return "";
  }
  if (chiave.startsWith("data") || chiave === "ultima_immersione" || chiave === "med_data") {
    const iso = testoPulito.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
  }
  return testoPulito;
}

async function leggiModuloFoto(
  apiKey: string,
  model: string,
  richiesta: string,
  jpeg: string,
): Promise<{ campi?: Record<string, string>; errore?: string; stop?: boolean }> {
  try {
    const chat = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: richiesta }, { inline_data: { mime_type: "image/jpeg", data: jpeg } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });
    if (!chat.ok) return { errore: chat.status === 429 ? "Gemini ha finito le richieste per oggi." : "Non ho letto la foto. Tocca Riprova.", stop: chat.status === 429 };
    const payload = (await chat.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const raw = payload.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "";
    const inizio = raw.indexOf("{");
    const fine = raw.lastIndexOf("}");
    if (inizio < 0 || fine <= inizio) return { errore: "Non ho letto i campi. Controlla la foto e riprova." };
    return { campi: payloadDi(raw.slice(inizio, fine + 1)) };
  } catch {
    return { errore: "Non ho letto la foto. Tocca Riprova." };
  }
}

function minutiTra(inizio: string, fine: string): string {
  const [oreInizio, minutiInizio] = inizio.split(":").map(Number);
  const [oreFine, minutiFine] = fine.split(":").map(Number);
  let delta = oreFine * 60 + minutiFine - (oreInizio * 60 + minutiInizio);
  if (delta < 0) delta += 24 * 60;
  return String(delta);
}

export function viaggioProtetto(data: string, oggi: string, viaggioId: number | null): boolean {
  if (!viaggioId) return false;
  return !mesiCompiuti(data, oggi);
}
