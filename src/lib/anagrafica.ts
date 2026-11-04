const LOCAL = "tritone-anagrafica";

export const CHIAVI_ANAGRAFICA = [
  "nome",
  "cognome",
  "codice_fiscale",
  "data_nascita",
  "luogo_nascita",
  "sesso",
  "indirizzo",
  "cap",
  "citta",
  "provincia",
  "telefono",
  "email",
  "tipo_documento",
  "numero_documento",
  "emergenza_nome",
  "emergenza_telefono",
  "emergenza_rapporto",
  "didattica",
  "didattica_specifica",
  "livello",
  "numero_brevetto",
  "data_rilascio",
  "istruttore_rilascio",
  "immersioni_totali",
  "profondita_massima",
  "specialita",
  "specialita_altra",
] as const;

const CHIAVI_PERSONALI = [
  "nome",
  "cognome",
  "codice_fiscale",
  "data_nascita",
  "luogo_nascita",
  "sesso",
  "indirizzo",
  "cap",
  "citta",
  "provincia",
  "telefono",
  "email",
  "tipo_documento",
  "numero_documento",
  "emergenza_nome",
  "emergenza_telefono",
  "emergenza_rapporto",
] as const;

const ETICHETTE_PERSONALI: Record<(typeof CHIAVI_PERSONALI)[number], string> = {
  nome: "Nome",
  cognome: "Cognome",
  codice_fiscale: "Codice fiscale",
  data_nascita: "Data di nascita",
  luogo_nascita: "Luogo di nascita",
  sesso: "Sesso",
  indirizzo: "Indirizzo",
  cap: "CAP",
  citta: "Città",
  provincia: "Provincia",
  telefono: "Telefono",
  email: "Mail",
  tipo_documento: "Documento",
  numero_documento: "Numero documento",
  emergenza_nome: "Emergenza, nome",
  emergenza_telefono: "Emergenza, telefono",
  emergenza_rapporto: "Emergenza, rapporto",
};

const DOCUMENTI = new Set(["Carta di identità", "Passaporto", "Patente"]);

export type VoceAnagrafica = { chiave: string; etichetta: string; valore: string };

export type NotaAnagrafica = {
  completa: boolean;
  dati: VoceAnagrafica[];
  mancanti: string[];
};

function valorePersonale(key: (typeof CHIAVI_PERSONALI)[number], value: string): string {
  const trimmed = value.trim().slice(0, 160);
  if (!trimmed) return "";
  if (key === "sesso") return trimmed === "F" || trimmed === "M" || trimmed === "X" ? trimmed : "";
  if (key === "tipo_documento") return DOCUMENTI.has(trimmed) ? trimmed : "";
  if (key === "data_nascita") return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
  return trimmed;
}

function soloPersonali(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CHIAVI_PERSONALI) {
    const value = data[key];
    if (typeof value !== "string") continue;
    const kept = valorePersonale(key, value);
    if (kept) out[key] = kept;
  }
  return out;
}

export function istantaneaPersonale(
  ana: Record<string, string>,
  account: { nome?: string; cognome?: string; telefono?: string; email?: string },
): Record<string, string> {
  const fonte: Record<string, unknown> = { ...ana };
  const prefer = (key: "nome" | "cognome" | "telefono" | "email", value: string | undefined) => {
    if (value?.trim()) fonte[key] = value.trim();
  };
  prefer("nome", account.nome);
  prefer("cognome", account.cognome);
  prefer("telefono", account.telefono);
  prefer("email", account.email);
  return soloPersonali(fonte);
}

export function notaAnagrafica(fonte: unknown): NotaAnagrafica {
  const data = fonte && typeof fonte === "object" && !Array.isArray(fonte) ? (fonte as Record<string, unknown>) : {};
  const puliti = soloPersonali(data);
  const mancanti: string[] = [];
  const dati: VoceAnagrafica[] = [];
  for (const key of CHIAVI_PERSONALI) {
    const valore = puliti[key] ?? "";
    if (!valore) {
      mancanti.push(ETICHETTE_PERSONALI[key]);
      continue;
    }
    dati.push({ chiave: key, etichetta: ETICHETTE_PERSONALI[key], valore });
  }
  const completa = mancanti.length === 0;
  return { completa, dati: completa ? dati : [], mancanti: completa ? [] : mancanti };
}

function valoreNota(chiave: string, valore: string): string {
  if (chiave === "data_nascita") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  if (chiave === "sesso" && valore === "X") return "Altro / non indicato";
  return valore;
}

export function testoNotaAnagrafica(nota: NotaAnagrafica): string {
  if (nota.completa) {
    const righe = nota.dati.map((voce) => `${voce.etichetta}: ${valoreNota(voce.chiave, voce.valore)}`).join("; ");
    return `Anagrafica completa. ${righe}`;
  }
  return nota.mancanti.length ? `Anagrafica incompleta. Manca: ${nota.mancanti.join(", ")}.` : "Anagrafica incompleta.";
}

export function leggiNotaAnagrafica(raw: string | null | undefined): NotaAnagrafica | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const valori: Record<string, string> = {};
  if (Array.isArray(row.dati)) {
    for (const item of row.dati) {
      if (!item || typeof item !== "object") continue;
      const voce = item as Record<string, unknown>;
      const chiave = typeof voce.chiave === "string" ? voce.chiave : "";
      if (!(CHIAVI_PERSONALI as readonly string[]).includes(chiave)) continue;
      const valore = typeof voce.valore === "string" ? valorePersonale(chiave as (typeof CHIAVI_PERSONALI)[number], voce.valore) : "";
      if (valore) valori[chiave] = valore;
    }
  }
  if (row.completa === true) return notaAnagrafica(valori);
  const ammesse = new Set<string>(CHIAVI_PERSONALI.map((key) => ETICHETTE_PERSONALI[key]));
  const viste = new Set<string>();
  if (Array.isArray(row.mancanti)) {
    for (const item of row.mancanti) {
      if (typeof item === "string" && ammesse.has(item)) viste.add(item);
    }
  }
  const mancanti = CHIAVI_PERSONALI.map((key) => ETICHETTE_PERSONALI[key]).filter((label) => viste.has(label));
  if (!mancanti.length) return Object.keys(valori).length ? notaAnagrafica(valori) : null;
  return { completa: false, dati: [], mancanti };
}

export function leggiAnagraficaLocale(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL) ?? "") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return soloAnagrafica(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function salvaAnagraficaLocale(data: Record<string, string>): Record<string, string> {
  const next = { ...leggiAnagraficaLocale(), ...soloAnagrafica(data) };
  if (typeof localStorage !== "undefined") localStorage.setItem(LOCAL, JSON.stringify(next));
  return next;
}

export function applicaAnagrafica(base: Record<string, string>, extra: Record<string, string>): Record<string, string> {
  const out = { ...base };
  for (const key of CHIAVI_ANAGRAFICA) {
    if (key === "tipo_documento" && (extra[key] ?? "").trim()) {
      out[key] = extra[key].trim();
      continue;
    }
    if (!(key in out)) continue;
    if ((out[key] ?? "").trim()) continue;
    const value = (extra[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

function soloAnagrafica(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CHIAVI_ANAGRAFICA) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 200);
  }
  return out;
}
