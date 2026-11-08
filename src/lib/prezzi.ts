export const PREZZO_SUB_CENT = 1490;
export const PREZZO_SCUOLA_CENT = 8000;
export const PREZZO_DIVING_CENT = 19000;
export const PREZZO_POSTO_CENT = 800;

export const POSTI_SCUOLA = 5;
export const POSTI_DIVING = 10;

export const IBAN = "IT87H0366901600428871577626";
export const INTESTATARIO = "Mogliani Alessandro";

export function euro(cent: number): string {
  const intero = Math.floor(cent / 100);
  const dec = String(cent % 100).padStart(2, "0");
  return `${intero},${dec} €`;
}

export function piuUnAnno(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const data = new Date(Date.UTC(Number(match[1]) + 1, Number(match[2]) - 1, Number(match[3])));
  return data.toISOString().slice(0, 10);
}

export function estendiAnno(oggi: string, attuale: string): string {
  const base = attuale && attuale > oggi ? attuale : oggi;
  return piuUnAnno(base);
}

export function entroUnMese(oggi: string, fino: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oggi) || !/^\d{4}-\d{2}-\d{2}$/.test(fino) || fino < oggi) return false;
  const a = Date.parse(`${oggi}T12:00:00Z`);
  const b = Date.parse(`${fino}T12:00:00Z`);
  return b - a <= 30 * 24 * 60 * 60 * 1000;
}

export function tettoStaff(mezzoNautico: boolean, limite: number | null, extra: number): number {
  const base = limite != null && limite > 0 ? limite : mezzoNautico ? POSTI_DIVING : POSTI_SCUOLA;
  return base + Math.max(0, extra);
}
