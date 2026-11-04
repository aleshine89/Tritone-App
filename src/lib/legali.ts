export const LEGALI_PACCHETTO = "2026-10-20";

export const TESTO_SUB =
  "Dichiaro di aver letto e di accettare integralmente i Termini e Condizioni d'Uso, l'Informativa Privacy e le Condizioni Economiche.";

export const TESTO_DIVING =
  "Dichiaro di aver letto e di accettare integralmente i Termini e Condizioni d'Uso, l'Informativa Privacy, le Condizioni Economiche e l'Accordo sul Trattamento dei Dati.";

export const VERSIONE_SUB = "Termini 3.8, Privacy 1.4, Condizioni economiche 1.2";
export const VERSIONE_DIVING = "Termini 3.8, Privacy 1.4, Condizioni economiche 1.2, Accordo 1.4";

export type TipoLegale = "subacqueo" | "diving" | "gestore";

export const DOCUMENTI_SUB = [
  { titolo: "Termini e Condizioni d'Uso", versione: "3.8", href: "/legali/termini-condizioni.pdf" },
  { titolo: "Informativa Privacy", versione: "1.4", href: "/legali/informativa-privacy.pdf" },
  { titolo: "Condizioni Economiche", versione: "1.2", href: "/legali/condizioni-economiche.pdf" },
] as const;

export const DOCUMENTO_ACCORDO = {
  titolo: "Accordo sul Trattamento dei Dati",
  versione: "1.4",
  href: "/legali/accordo-trattamento.pdf",
} as const;

export function documentiDi(tipo: TipoLegale) {
  return tipo === "diving" ? [...DOCUMENTI_SUB, DOCUMENTO_ACCORDO] : [...DOCUMENTI_SUB];
}

export function testoDi(tipo: TipoLegale): string {
  return tipo === "diving" ? TESTO_DIVING : TESTO_SUB;
}

export function versioneDi(tipo: TipoLegale): string {
  return tipo === "diving" ? VERSIONE_DIVING : VERSIONE_SUB;
}

export function copreLegali(accettati: string[], richiesto: TipoLegale): boolean {
  if (richiesto === "diving") return accettati.includes("diving");
  return accettati.some((tipo) => tipo === "subacqueo" || tipo === "gestore" || tipo === "diving");
}
