import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireSpeciePro } from "@/lib/fondale.functions";
import { specieNelCatalogo } from "@/lib/scubadex-catalogo";

export type SpecieMia = {
  id: string;
  nome: string;
  foto: string;
  note: string;
  giorno: string;
  luogo: string;
};

export type VistaScubadex = { id: string; giorno: string };

export type PaginaScubadex = {
  viste: VistaScubadex[];
  proprie: SpecieMia[];
  anno: number;
};

function idSpecie(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > 160) throw new Error("Specie non valida.");
  return id;
}

async function specieConsentita(userId: string, id: string): Promise<boolean> {
  if (specieNelCatalogo(id)) return true;
  if (!id.startsWith("mia:")) return false;
  const sql = await getSql();
  const rows = await sql<{ id: string }>`select id from scubadex_proprie where id = ${id} and user_id = ${userId} limit 1`;
  return Boolean(rows[0]);
}

async function segna(userId: string, id: string, giorno: string) {
  const sql = await getSql();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : new Date().toISOString().slice(0, 10);
  await sql`
    insert into scubadex_viste (user_id, specie_id, vista_il)
    values (${userId}, ${id}, ${data})
    on conflict (user_id, specie_id) do update
    set vista_il = coalesce(scubadex_viste.vista_il, excluded.vista_il)
  `;
}

export const listVisteScubadex = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string[]> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const rows = await sql<{ specie_id: string }>`
      select specie_id from scubadex_viste where user_id = ${context.userId}
    `;
    return rows.map((row) => row.specie_id);
  });

export const toggleVistaScubadex = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => ({ id: idSpecie(data?.id) }))
  .handler(async ({ context, data }): Promise<{ vista: boolean }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    if (!(await specieConsentita(context.userId, data.id))) throw new Error("Specie non in catalogo.");
    const tolte = await sql<{ specie_id: string }>`
      delete from scubadex_viste
      where user_id = ${context.userId} and specie_id = ${data.id}
      returning specie_id
    `;
    if (tolte.length) return { vista: false };
    await segna(context.userId, data.id, "");
    return { vista: true };
  });

export const paginaScubadex = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PaginaScubadex> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const viste = await sql<{ specie_id: string; vista_il: string | null }>`
      select specie_id, vista_il::text as vista_il from scubadex_viste where user_id = ${context.userId}
    `;
    const proprie = await sql<{ id: string; nome: string; foto: string; note: string; giorno: string | null; luogo: string }>`
      select id, nome, foto, note, giorno::text as giorno, luogo
      from scubadex_proprie
      where user_id = ${context.userId}
      order by created_at desc
    `;
    return {
      viste: viste.map((row) => ({ id: row.specie_id, giorno: row.vista_il ?? "" })),
      proprie: proprie.map((row) => ({
        id: row.id,
        nome: row.nome,
        foto: row.foto,
        note: row.note,
        giorno: row.giorno ?? "",
        luogo: row.luogo,
      })),
      anno: Number(new Date().toISOString().slice(0, 4)),
    };
  });

export const aggiungiSpecieMia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const nome = String(raw.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const note = String(raw.note ?? "").trim().slice(0, 400);
    const luogo = String(raw.luogo ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const giorno = String(raw.giorno ?? "").slice(0, 10);
    const foto = String(raw.foto ?? "");
    if (nome.length < 2) throw new Error("Indica il nome della specie.");
    if (giorno && !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) throw new Error("Controlla la data.");
    if (foto && (!foto.startsWith("data:image/") || foto.length > 1_600_000)) throw new Error("La foto non è adatta.");
    return { nome, note, luogo, giorno, foto };
  })
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const id = `mia:${crypto.randomUUID()}`;
    await sql`
      insert into scubadex_proprie (id, user_id, nome, foto, note, giorno, luogo)
      values (${id}, ${context.userId}, ${data.nome}, ${data.foto}, ${data.note}, ${data.giorno || null}, ${data.luogo})
    `;
    await segna(context.userId, id, data.giorno);
    return { id };
  });

export const leggiSpecieImmersione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { entryId?: unknown } | null)?.entryId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { entryId: id };
  })
  .handler(async ({ context, data }): Promise<string[]> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const rows = await sql<{ specie_id: string }>`
      select specie_id from logbook_specie
      where entry_id = ${data.entryId} and user_id = ${context.userId}
      order by specie_id
    `;
    return rows.map((row) => row.specie_id);
  });

export const salvaSpecieImmersione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const entryId = Number(raw.entryId);
    const giorno = String(raw.giorno ?? "").slice(0, 10);
    const ids = Array.isArray(raw.ids) ? [...new Set(raw.ids.map((id) => String(id).trim()).filter(Boolean))].slice(0, 40) : [];
    if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Immersione non valida.");
    return { entryId, giorno, ids };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const owned = await sql<{ id: number }>`
      select id from logbook_entries where id = ${data.entryId} and user_id = ${context.userId}
    `;
    if (!owned[0]) throw new Error("Questa immersione non è nel tuo logbook.");
    const valide: string[] = [];
    for (const id of data.ids) {
      if (await specieConsentita(context.userId, id)) valide.push(id);
    }
    await sql`delete from logbook_specie where entry_id = ${data.entryId} and user_id = ${context.userId}`;
    for (const id of valide) {
      await sql`
        insert into logbook_specie (entry_id, user_id, specie_id)
        values (${data.entryId}, ${context.userId}, ${id})
        on conflict do nothing
      `;
      await segna(context.userId, id, data.giorno);
    }
    return { ok: true };
  });
