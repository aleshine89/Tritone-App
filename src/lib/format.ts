let localeData: "it-IT" | "en-GB" = "it-IT";

export function impostaLocaleFormato(lingua: "it" | "en") {
  localeData = lingua === "en" ? "en-GB" : "it-IT";
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(localeData, { dateStyle: "medium" }).format(date);
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.length <= 10) return formatDay(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDay(iso);
  return new Intl.DateTimeFormat(localeData, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function scadenzaStato(
  iso: string | null | undefined,
  oggi: string,
): "scaduta" | "in-scadenza" | "ok" | "mancante" {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "mancante";
  if (iso < oggi) return "scaduta";
  const start = new Date(`${oggi}T12:00:00`).getTime();
  const end = new Date(`${iso}T12:00:00`).getTime();
  const days = Math.round((end - start) / 86400000);
  if (days <= 30) return "in-scadenza";
  return "ok";
}

export function mesiCompiuti(data: string, oggi: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{4}-\d{2}-\d{2}$/.test(oggi)) return false;
  const start = new Date(`${data}T12:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + 6);
  return new Date(`${oggi}T12:00:00Z`) >= start;
}

export function sortLabel(sort: string): string {
  if (sort === "alpha") return "ordine alfabetico";
  if (sort === "dive") return "data di immersione o di riferimento";
  return "data di registrazione";
}

export function oggiRoma(adesso = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(adesso);
}

export function problemiDocumenti(
  documenti: {
    medico: (string | null)[];
    assicurazione: (string | null)[];
    brevetto: (string | null)[];
  },
  oggi: string,
): string[] {
  const problemi: string[] = [];
  const medico = statoElenco(documenti.medico, oggi);
  const polizza = statoElenco(documenti.assicurazione, oggi);
  if (medico === "assente") problemi.push("Certificato medico mancante");
  if (medico === "scaduto") problemi.push("Certificato medico scaduto");
  if (polizza === "assente") problemi.push("Assicurazione mancante");
  if (polizza === "scaduto") problemi.push("Assicurazione scaduta");
  const brevetto = statoElenco(documenti.brevetto, oggi);
  if (brevetto === "assente") problemi.push("Brevetto mancante");
  if (brevetto === "scaduto") problemi.push("Brevetto scaduto");
  return problemi;
}

function statoElenco(rows: (string | null)[], oggi: string): "ok" | "assente" | "scaduto" {
  if (!rows.length) return "assente";
  const scaduto = rows.some((row) => {
    const day = (row ?? "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < oggi;
  });
  return scaduto ? "scaduto" : "ok";
}
