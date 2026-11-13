function rad(gradi: number): number {
  return (gradi * Math.PI) / 180;
}

function deg(radianti: number): number {
  return (radianti * 180) / Math.PI;
}

function fuso(lon: number): string {
  if (lon >= 6 && lon <= 19) return "Europe/Rome";
  if (lon > 19 && lon <= 30) return "Europe/Athens";
  const ore = Math.max(-12, Math.min(14, Math.round(lon / 15)));
  if (ore === 0) return "UTC";
  return `Etc/GMT${ore > 0 ? "-" : "+"}${Math.abs(ore)}`;
}

function orologio(ut: number, giorno: string, lon: number): string {
  const ms = Date.parse(`${giorno}T00:00:00Z`) + ut * 3600000;
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: fuso(lon) }).format(new Date(ms));
}

function istanteSole(giornoAnno: number, lat: number, lon: number, sorge: boolean): number | null {
  const t = giornoAnno + ((sorge ? 6 : 18) - lon / 15) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(M) * 2) + 282.634;
  L = (L + 360) % 360;
  let RA = deg(Math.atan(0.91764 * Math.tan(rad(L))));
  RA = (RA + 360) % 360;
  const Lq = Math.floor(L / 90) * 90;
  RA = (RA + (Lq - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1 || !Number.isFinite(cosH)) return null;
  const H = (sorge ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
  let UT = (H + RA - 0.06571 * t - 6.622 - lon / 15) % 24;
  if (UT < 0) UT += 24;
  return UT;
}

export function sole(lat: number, lon: number, giorno: string): { sorge: string; tramonta: string } | null {
  const parti = /^(\d{4})-(\d{2})-(\d{2})$/.exec(giorno);
  if (!parti) return null;
  const anno = Number(parti[1]);
  const mese = Number(parti[2]);
  const data = Number(parti[3]);
  const giornoAnno = Math.round((Date.UTC(anno, mese - 1, data) - Date.UTC(anno, 0, 0)) / 86400000);
  const sorge = istanteSole(giornoAnno, lat, lon, true);
  const tramonta = istanteSole(giornoAnno, lat, lon, false);
  if (sorge == null || tramonta == null) return null;
  return { sorge: orologio(sorge, giorno, lon), tramonta: orologio(tramonta, giorno, lon) };
}

export function fraseMuta(acqua: number): string {
  if (acqua >= 24) return "In acqua {g} °C: basta una muta leggera.";
  if (acqua >= 18) return "In acqua {g} °C: muta da 5 mm.";
  if (acqua >= 14) return "In acqua {g} °C: muta spessa.";
  return "In acqua {g} °C: muta stagna o molto spessa.";
}

export function faseLuna(giorno: string): number {
  const ms = Date.parse(`${giorno}T12:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  const nota = Date.parse("2000-01-06T18:14:00Z");
  const fase = (((ms - nota) / 86400000) / 29.530588853) % 1;
  return fase < 0 ? fase + 1 : fase;
}

export function luna(giorno: string): string {
  const giro = faseLuna(giorno);
  if (giro < 0.03 || giro >= 0.97) return "Luna nuova: di notte è buio.";
  if (giro < 0.22) return "Luna crescente.";
  if (giro < 0.28) return "Primo quarto.";
  if (giro < 0.47) return "Luna gibbosa crescente.";
  if (giro < 0.53) return "Luna piena.";
  if (giro < 0.72) return "Luna gibbosa calante.";
  if (giro < 0.78) return "Ultimo quarto.";
  return "Luna calante.";
}
