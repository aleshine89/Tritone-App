import type { PuntoProfilo } from "@/lib/uddf";

export type LetturaComputer = {
  data: string;
  ora: string;
  oraFine: string;
  minuti: string;
  profondita: string;
  media: string;
  temperatura: string;
  ossigeno: string;
  testo: string;
  profilo: PuntoProfilo[];
  letto: boolean;
};

export function interpretaSchermo(testo: string): Omit<LetturaComputer, "profilo" | "letto" | "testo"> {
  const piatto = normalizza(testo);
  let data = dataDi(piatto);
  let ora = oraVicino(piatto, /[i1l]n[i1l]z[i1l]?[o0a]|start|entry|entrata|discesa/i);
  let oraFine = oraVicino(piatto, /f[i1l]ne|end|exit|uscita|emersione/i);
  let profondita = numeroVicino(piatto, /[mh][a4]x(?:\s*depth)?|massima|profond/i);
  let media = numeroVicino(piatto, /m[e3][do0](?:ia)?|avg(?:\s*depth)?|average|media/i);
  const attaccata = oraAttaccataAllaQuota(piatto);
  const tempi = [...(attaccata ? [attaccata] : []), ...scegliOrari(piatto), ...orariSchiacciati(piatto, piatto)];
  const tempiUnici = tempi.filter((ora, indice) => tempi.indexOf(ora) === indice);
  if (!ora && tempiUnici[0]) ora = tempiUnici[0];
  if (!oraFine && tempiUnici[1] && tempiUnici[1] !== ora) oraFine = tempiUnici[1];
  const temperatura = temperaturaDi(piatto);
  const ossigeno = ossigenoDi(piatto);
  const quote = [...profonditaLibere(piatto), ...profonditaSenzaPunto(piatto)].filter((n) => n !== temperatura);
  const quoteUniche = [...new Set(quote.map((n) => Number(n)))].sort((a, b) => b - a).map((n) => String(n));
  if (!profondita && quoteUniche[0]) profondita = quoteUniche[0];
  if (!media && quoteUniche[1]) media = quoteUniche[1];
  if (profondita && media && Number(media) > Number(profondita)) {
    const scambio = profondita;
    profondita = media;
    media = scambio;
  }
  if (!data) data = dataDi(piatto.replace(/(\d{1,2})[ .](\d{1,2})[ .](\d{2,4})/, "$1.$2.$3"));
  const daiTempi = ora && oraFine ? minutiTra(ora, oraFine) : "";
  if (ora && oraFine && !daiTempi) oraFine = "";
  const scritto = durataScritta(piatto) || minutiEtichetta(piatto);
  const minuti = daiTempi || scritto;
  return { data, ora, oraFine, minuti, profondita, media, temperatura, ossigeno };
}

export async function leggiComputer(dataUrl: string): Promise<LetturaComputer> {
  const letture = await ocr(dataUrl);
  let migliore = unisciLetture(letture);
  let testoMigliore = letture[0] || "";
  const cifre = await leggiCifre(dataUrl);
  const tempi = orariDelleLetture(letture);
  const fineGiaBuona = migliore.ora ? fineCompatibile(migliore.ora, [migliore.oraFine, ...tempi].filter(Boolean)) : "";
  if (cifre.ora && !fineGiaBuona) migliore = { ...migliore, ora: cifre.ora };
  if (cifre.profondita) migliore = { ...migliore, profondita: cifre.profondita };
  if (cifre.media && (!migliore.media || Number(cifre.media) < Number(migliore.profondita || cifre.media))) migliore = { ...migliore, media: cifre.media };
  if (migliore.ora) {
    const fine = fineCompatibile(migliore.ora, [cifre.oraFine, migliore.oraFine, ...tempi].filter(Boolean));
    if (fine) migliore = { ...migliore, oraFine: fine };
  } else if (cifre.oraFine) {
    migliore = { ...migliore, oraFine: cifre.oraFine };
  }
  if (cifre.minuti && !migliore.minuti) migliore = { ...migliore, minuti: cifre.minuti };
  if (!migliore.data && cifre.data) migliore = { ...migliore, data: cifre.data };
  const minutiCalcolati = migliore.ora && migliore.oraFine ? minutiTra(migliore.ora, migliore.oraFine) : "";
  if (minutiCalcolati) migliore = { ...migliore, minuti: minutiCalcolati };
  if (migliore.profondita && migliore.media && Number(migliore.media) >= Number(migliore.profondita)) migliore = { ...migliore, media: "" };
  const profilo = migliore.minuti && migliore.profondita ? await tracciaProfilo(dataUrl, Number(migliore.minuti), Number(migliore.profondita)) : [];
  const letto = punteggioLettura(migliore) > 0 || profilo.length > 1;
  return { ...migliore, testo: testoMigliore, profilo, letto };
}

function unisciLetture(testi: string[]): Omit<LetturaComputer, "profilo" | "letto" | "testo"> {
  let unito = interpretaSchermo("");
  for (const testo of testi) {
    const campi = interpretaSchermo(testo);
    unito = {
      data: unito.data || campi.data,
      ora: unito.ora || campi.ora,
      oraFine: unito.oraFine || campi.oraFine,
      minuti: unito.minuti || campi.minuti,
      profondita: unito.profondita || campi.profondita,
      media: unito.media || campi.media,
      temperatura: unito.temperatura || campi.temperatura,
      ossigeno: unito.ossigeno || campi.ossigeno,
    };
  }
  return unito;
}

function orariDelleLetture(testi: string[]): string[] {
  const trovati: string[] = [];
  for (const testo of testi) {
    for (const ora of orari(normalizza(testo))) {
      if (!trovati.includes(ora)) trovati.push(ora);
    }
  }
  return trovati;
}

function fineCompatibile(inizio: string, candidati: string[]): string {
  let meglio = "";
  let durataMigliore = 0;
  for (const fine of candidati) {
    if (!fine || fine === inizio) continue;
    const durata = Number(minutiTra(inizio, fine));
    if (durata < 5 || durata > 120) continue;
    if (!meglio || durata < durataMigliore) {
      meglio = fine;
      durataMigliore = durata;
    }
  }
  return meglio;
}

function punteggioLettura(campi: { data: string; ora: string; oraFine: string; minuti: string; profondita: string; media: string }): number {
  const minuti = Number(campi.minuti);
  let punti = 0;
  if (campi.profondita) punti += 4;
  if (campi.media) punti += 2;
  if (campi.data) punti += 2;
  if (campi.ora) punti += 2;
  if (campi.oraFine) punti += 2;
  if (minuti >= 5 && minuti <= 120) punti += 4;
  return punti;
}

function normalizza(testo: string): string {
  return testo
    .replace(/(\d)\s*:\s*(\d)/g, "$1:$2")
    .replace(/(\d{1,2})\s*[/]\s*(\d{2})\b/g, (_tutto, ore, minuti) => (Number(ore) <= 23 && Number(minuti) <= 59 ? `${ore}:${minuti}` : `${ore}/${minuti}`))
    .replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
}

function oraAttaccataAllaQuota(testo: string): string {
  const match = testo.match(/\b(\d{4})\s+\d{3,4}\s*m\b/i);
  if (!match) return "";
  const n = Number(match[1]);
  if (n >= 1900 && n <= 2099) return "";
  const ore = Number(match[1].slice(0, 2));
  const minuti = Number(match[1].slice(2));
  if (ore > 23 || minuti > 59) return "";
  return `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
}

function orariSchiacciati(testo: string, originale: string): string[] {
  if (scegliOrari(originale).length >= 2) return [];
  const trovati: string[] = [];
  for (const match of testo.matchAll(/\b(\d{4})\b/g)) {
    const n = Number(match[1]);
    if (n >= 1900 && n <= 2099) continue;
    const ore = Number(match[1].slice(0, 2));
    const minuti = Number(match[1].slice(2));
    if (ore > 23 || minuti > 59) continue;
    const ora = `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
    if (!trovati.includes(ora)) trovati.push(ora);
  }
  return trovati;
}

function profonditaSenzaPunto(testo: string): string[] {
  const numeri: number[] = [];
  for (const match of testo.matchAll(/\b(\d{3,4})\s*m\b/gi)) {
    const raw = match[1];
    const n = Number(`${raw.slice(0, -1)}.${raw.slice(-1)}`);
    if (n >= 2 && n <= 200) numeri.push(n);
  }
  return numeri.map((n) => String(n));
}

function centroQuota(testo: string, ripiego: number): number {
  let centro = ripiego;
  let massima = 0;
  for (const match of testo.matchAll(/\b(\d{2,4}(?:\.\d{1,2})?)\s*m\b/gi)) {
    const raw = match[1];
    const n = raw.includes(".") ? Number(raw) : Number(`${raw.slice(0, -1)}.${raw.slice(-1)}`);
    if (!Number.isFinite(n) || n < 3 || n > 120 || n <= massima || match.index == null) continue;
    massima = n;
    centro = match.index;
  }
  return centro;
}

function scegliOrari(testo: string): string[] {
  const validi: { ora: string; at: number }[] = [];
  for (const match of testo.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const ore = Number(match[1]);
    const minuti = Number(match[2]);
    if (ore > 23 || minuti > 59 || match.index == null) continue;
    const ora = `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
    if (!validi.some((voce) => voce.ora === ora && Math.abs(voce.at - match.index) < 4)) validi.push({ ora, at: match.index });
  }
  if (validi.length < 2) return validi.map((voce) => voce.ora);
  const centro = centroQuota(testo, validi[0].at);
  const vicini = validi.filter((voce) => Math.abs(voce.at - centro) <= 90);
  const candidati = vicini.length >= 2 ? vicini : validi;
  let meglio: { inizio: string; fine: string; costo: number } | null = null;
  for (let i = 0; i < candidati.length; i += 1) {
    for (let j = i + 1; j < candidati.length; j += 1) {
      const prima = candidati[i].at <= candidati[j].at ? candidati[i] : candidati[j];
      const seconda = prima === candidati[i] ? candidati[j] : candidati[i];
      const durata = Number(minutiTra(prima.ora, seconda.ora));
      if (!durata || durata < 5 || durata > 120) continue;
      const costo = Math.abs(prima.at - centro) + Math.abs(seconda.at - centro);
      if (!meglio || costo < meglio.costo) meglio = { inizio: prima.ora, fine: seconda.ora, costo };
    }
  }
  if (meglio) return [meglio.inizio, meglio.fine];
  return [];
}

function orari(testo: string): string[] {
  const trovati: string[] = [];
  for (const match of testo.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const ore = Number(match[1]);
    const minuti = Number(match[2]);
    if (ore > 23 || minuti > 59) continue;
    const ora = `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
    if (!trovati.includes(ora)) trovati.push(ora);
  }
  return trovati;
}

function profonditaLibere(testo: string): string[] {
  const senzaDate = testo
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ");
  const numeri: number[] = [];
  for (const match of senzaDate.matchAll(/(\d{1,3}\.\d{1,2})(?=\s*m\b|\b)/gi)) {
    const token = match[1];
    const n = Number(token);
    if (n < 2 || n > 200) continue;
    const pezzi = token.split(".");
    if (pezzi[1].length === 2 && Number(pezzi[0]) <= 23 && Number(pezzi[1]) <= 59) continue;
    numeri.push(n);
  }
  const unici = [...new Set(numeri)].sort((a, b) => b - a);
  return unici.slice(0, 2).map((n) => String(n));
}

function dataDi(testo: string): string {
  const match = testo.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) return dataValida(match[1], match[2], match[3]);
  const compatta = testo.match(/(\d{2})(\d{2})(20\d{2})/);
  if (!compatta) return "";
  return dataValida(compatta[1], compatta[2], compatta[3]);
}

function dataValida(giorno: string, mese: string, annoLetto: string): string {
  const giornoOk = giorno.padStart(2, "0");
  const meseOk = mese.padStart(2, "0");
  let anno = annoLetto;
  if (anno.length === 2) anno = Number(anno) > 50 ? `19${anno}` : `20${anno}`;
  if (Number(meseOk) < 1 || Number(meseOk) > 12 || Number(giornoOk) < 1 || Number(giornoOk) > 31) return "";
  return `${anno}-${meseOk}-${giornoOk}`;
}

function oraVicino(testo: string, etichetta: RegExp): string {
  const match = testo.match(new RegExp(`(?:${etichetta.source})[^\\d]{0,12}(\\d{1,2})[:.](\\d{2})`, "i"));
  if (!match) return "";
  const ore = Number(match[1]);
  const minuti = Number(match[2]);
  if (ore > 23 || minuti > 59) return "";
  return `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
}

function numeroVicino(testo: string, etichetta: RegExp): string {
  const match = testo.match(new RegExp(`(?:${etichetta.source})[^\\d]{0,8}(\\d{1,3}(?:[.,]\\d{1,2})?)`, "i"));
  if (!match) return "";
  const valore = match[1].replace(",", ".");
  const numero = Number(valore);
  if (!Number.isFinite(numero) || numero <= 0 || numero > 400) return "";
  return valore;
}

function minutiTra(inizio: string, fine: string): string {
  const [ah, am] = inizio.split(":").map(Number);
  const [bh, bm] = fine.split(":").map(Number);
  let delta = bh * 60 + bm - (ah * 60 + am);
  if (delta < 0) delta += 24 * 60;
  if (delta < 1 || delta > 600) return "";
  return String(delta);
}

function temperaturaDi(testo: string): string {
  const scritta = testo.match(/(-?\d{1,2}(?:\.\d)?)\s*°/);
  const vicina = numeroVicino(testo, /temp|gradi/i);
  const valore = scritta?.[1] || vicina;
  if (!valore) return "";
  const n = Number(valore);
  if (!Number.isFinite(n) || n < -2 || n > 40) return "";
  return String(n);
}

function ossigenoDi(testo: string): string {
  const vicina = numeroVicino(testo, /o2|oxygen|ossigeno|nitrox/i);
  if (!vicina) return "";
  const n = Number(vicina);
  if (n < 15 || n > 100) return "";
  return String(Math.round(n));
}

function minutiEtichetta(testo: string): string {
  const dopo = numeroVicino(testo, /dive\s*time|bottom\s*time|divetime|tempo|durata/i);
  if (dopo) {
    const n = Math.round(Number(dopo));
    if (n >= 5 && n <= 600) return String(n);
  }
  const prima = testo.match(/\b(\d{1,3})\s*(?:min|mins)\b/i);
  if (!prima) return "";
  const n = Number(prima[1]);
  return n >= 5 && n <= 600 ? String(n) : "";
}

function durataScritta(testo: string): string {
  const match = testo.match(/\b(\d{2,3})\s*:(?!\d)/);
  if (!match) return "";
  const n = Number(match[1]);
  if (n < 5 || n > 600) return "";
  return String(n);
}

async function ocr(dataUrl: string): Promise<string[]> {
  if (typeof document === "undefined") return [];
  const immagini = await preparaSchermo(dataUrl);
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", undefined, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract",
    });
    try {
      const pezzi: string[] = [];
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "300" });
      for (const immagine of immagini) {
        try {
          const result = await worker.recognize(immagine);
          if (!result.data.text?.trim()) continue;
          pezzi.push(result.data.text);
          if (punteggioLettura(interpretaSchermo(result.data.text)) >= 8) return pezzi;
        } catch {
          /* l'altra versione della foto */
        }
      }
      if (pezzi.length) return pezzi;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "300" });
      for (const immagine of immagini) {
        try {
          const result = await worker.recognize(immagine);
          if (result.data.text?.trim()) pezzi.push(result.data.text);
        } catch {
          /* continua */
        }
      }
      return pezzi;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    const dettaglio = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 140) : "";
    throw new Error(dettaglio ? `Il lettore non parte: ${dettaglio}` : "Il lettore non parte.");
  }
}

async function preparaSchermo(dataUrl: string): Promise<string[]> {
  const img = await carica(dataUrl);
  if (!img) return [dataUrl];
  const contrasto = biancoENero(img);
  const crop = ritaglioSchermo(img);
  const immagini = [contrasto, crop, dataUrl].filter((immagine): immagine is string => Boolean(immagine));
  return [...new Set(immagini)];
}

function biancoENero(img: HTMLImageElement): string | null {
  const box = boxSchermo(img);
  const x = box?.x ?? 0;
  const y = box?.y ?? 0;
  const w = box?.w ?? img.width;
  const h = box?.h ?? img.height;
  if (w < 40 || h < 40) return null;
  const fattore = Math.min(2, Math.max(1, 1000 / Math.max(w, h)));
  const width = Math.round(w * fattore);
  const height = Math.round(h * fattore);
  const grigio = document.createElement("canvas");
  grigio.width = width;
  grigio.height = height;
  const gx = grigio.getContext("2d", { willReadFrequently: true });
  if (!gx) return null;
  gx.drawImage(img, x, y, w, h, 0, 0, width, height);
  const originale = gx.getImageData(0, 0, width, height);
  const luminanza = new Uint8Array(width * height);
  let minimo = 255;
  let massimo = 0;
  for (let i = 0; i < luminanza.length; i += 1) {
    const p = i * 4;
    const valore = Math.round((originale.data[p] + originale.data[p + 1] + originale.data[p + 2]) / 3);
    luminanza[i] = valore;
    if (valore < minimo) minimo = valore;
    if (valore > massimo) massimo = valore;
  }
  const scala = massimo > minimo ? 255 / (massimo - minimo) : 1;
  const stirato = gx.createImageData(width, height);
  for (let i = 0; i < luminanza.length; i += 1) {
    const valore = Math.max(0, Math.min(255, Math.round((luminanza[i] - minimo) * scala)));
    const p = i * 4;
    stirato.data[p] = valore;
    stirato.data[p + 1] = valore;
    stirato.data[p + 2] = valore;
    stirato.data[p + 3] = 255;
  }
  gx.putImageData(stirato, 0, 0);
  const sfocato = document.createElement("canvas");
  sfocato.width = width;
  sfocato.height = height;
  const sx = sfocato.getContext("2d", { willReadFrequently: true });
  if (!sx) return null;
  sx.filter = "blur(8px)";
  sx.drawImage(grigio, 0, 0);
  sx.filter = "none";
  const morbido = sx.getImageData(0, 0, width, height);
  const uscita = gx.createImageData(width, height);
  for (let i = 0; i < luminanza.length; i += 1) {
    const acceso = stirato.data[i * 4] > morbido.data[i * 4] + 16;
    const colore = acceso ? 0 : 255;
    const p = i * 4;
    uscita.data[p] = colore;
    uscita.data[p + 1] = colore;
    uscita.data[p + 2] = colore;
    uscita.data[p + 3] = 255;
  }
  gx.putImageData(uscita, 0, 0);
  return grigio.toDataURL("image/png");
}

function boxSchermo(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const lunga = Math.max(img.width, img.height);
  const scale = lunga > 900 ? 900 / lunga : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const zona = zonaSchermo(ctx.getImageData(0, 0, width, height));
  if (zona.w < 40 || zona.h < 40) return null;
  return {
    x: Math.max(0, Math.round(zona.x / scale)),
    y: Math.max(0, Math.round(zona.y / scale)),
    w: Math.min(img.width - Math.max(0, Math.round(zona.x / scale)), Math.round(zona.w / scale)),
    h: Math.min(img.height - Math.max(0, Math.round(zona.y / scale)), Math.round(zona.h / scale)),
  };
}

function ritaglioSchermo(img: HTMLImageElement): string | null {
  const box = boxSchermo(img);
  if (!box) return null;
  if (box.w > img.width * 0.85 && box.h > img.height * 0.85) return null;
  const fattore = Math.min(2, Math.max(1, 1200 / Math.max(box.w, box.h)));
  const crop = document.createElement("canvas");
  crop.width = Math.round(box.w * fattore);
  crop.height = Math.round(box.h * fattore);
  const cx = crop.getContext("2d");
  if (!cx) return null;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, crop.width, crop.height);
  return crop.toDataURL("image/png");
}

function zonaSchermo(image: ImageData): { x: number; y: number; w: number; h: number } {
  const { data, width, height } = image;
  const step = 4;
  const colonne = new Array(Math.ceil(width / step)).fill(0);
  const righe = new Array(Math.ceil(height / step)).fill(0);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (b <= r + 8 || b <= 45 || g <= 25) continue;
      colonne[Math.floor(x / step)] += 1;
      righe[Math.floor(y / step)] += 1;
    }
  }
  const sx = fasciaBlu(colonne);
  const sy = fasciaBlu(righe);
  if (!sx || !sy) return { x: 0, y: 0, w: width, h: height };
  const grezzoX = sx[0] * step;
  const grezzoY = sy[0] * step;
  const grezzoW = Math.min(width, (sx[1] + 1) * step) - grezzoX;
  const grezzoH = Math.min(height, (sy[1] + 1) * step) - grezzoY;
  const x = Math.max(0, grezzoX - Math.round(grezzoW * 0.04));
  const y = Math.max(0, grezzoY - Math.round(grezzoH * 0.06));
  const x2 = Math.min(width, grezzoX + grezzoW + Math.round(grezzoW * 0.06));
  const y2 = Math.min(height, grezzoY + grezzoH + Math.round(grezzoH * 0.24));
  const w = x2 - x;
  const h = y2 - y;
  if (w < width * 0.12 || h < height * 0.08) return { x: 0, y: 0, w: width, h: height };
  return { x, y, w, h };
}

function fasciaBlu(conteggi: number[]): [number, number] | null {
  const tetto = Math.max(...conteggi, 0);
  if (tetto < 4) return null;
  const soglia = Math.max(4, Math.round(tetto * 0.18));
  let inizio = 0;
  let fine = conteggi.length - 1;
  while (inizio < fine && conteggi[inizio] < soglia) inizio += 1;
  while (fine > inizio && conteggi[fine] < soglia) fine -= 1;
  if (fine - inizio < 4) return null;
  return [inizio, fine];
}

async function tracciaProfilo(dataUrl: string, minuti: number, massima: number): Promise<PuntoProfilo[]> {
  if (typeof document === "undefined" || minuti < 1 || massima <= 0) return [];
  const img = await carica(dataUrl);
  if (!img) return [];
  const lunga = Math.max(img.width, img.height);
  const scale = lunga > 900 ? 900 / lunga : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lumi = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) lumi[p] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  const bordo = (x: number, y: number) => {
    if (y <= 0 || y >= height - 1) return 0;
    return Math.abs(lumi[y * width + x] - lumi[(y - 1) * width + x]);
  };
  const colonne: number[][] = Array.from({ length: width }, () => []);
  const righeConteggio = new Array<number>(height).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bordo(x, y) < 28) continue;
      colonne[x].push(y);
      righeConteggio[y] += 1;
    }
  }
  const sogliaGriglia = width * 0.35;
  const griglia = righeConteggio.map((n) => n > sogliaGriglia);
  const ys: number[] = [];
  const xs: number[] = [];
  for (let x = 0; x < width; x += 1) {
    const utili = colonne[x].filter((y) => !griglia[y]);
    if (utili.length < 1 || utili.length > height * 0.3) continue;
    utili.sort((a, b) => a - b);
    xs.push(x);
    ys.push(utili[Math.floor(utili.length / 2)]);
  }
  if (xs.length < 20) return [];
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX < 30 || maxY - minY < 8) return [];
  const passo = Math.max(1, Math.floor(xs.length / 36));
  const punti: PuntoProfilo[] = [];
  for (let i = 0; i < xs.length; i += passo) {
    const t = Math.round(((xs[i] - minX) / (maxX - minX)) * minuti);
    const d = Math.round((((ys[i] - minY) / (maxY - minY)) * massima) * 10) / 10;
    const ultimo = punti[punti.length - 1];
    if (ultimo && ultimo.t === t) ultimo.d = Math.max(ultimo.d, d);
    else punti.push({ t, d });
  }
  return punti.length > 1 ? punti : [];
}

const MODELLI_CIFRE: { segno: string; griglia: number[] }[] = [
  { segno: "1", griglia: [0x38, 0x3c, 0x3f, 0x39, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30] },
  { segno: "3", griglia: [0x1e, 0x3b, 0x31, 0x30, 0x1c, 0x3c, 0x30, 0x30, 0x27, 0x0e] },
  { segno: "5", griglia: [0x3e, 0x3f, 0x03, 0x03, 0x1f, 0x37, 0x30, 0x20, 0x30, 0x1e] },
  { segno: "5", griglia: [0x3e, 0x3f, 0x03, 0x03, 0x1f, 0x3f, 0x30, 0x30, 0x3f, 0x1e] },
  { segno: "3", griglia: [0x1e, 0x3f, 0x31, 0x30, 0x14, 0x14, 0x30, 0x30, 0x37, 0x0e] },
  { segno: "7", griglia: [0x3f, 0x3f, 0x30, 0x18, 0x18, 0x18, 0x0c, 0x0c, 0x04, 0x06] },
  { segno: "3", griglia: [0x1e, 0x3f, 0x33, 0x30, 0x1c, 0x1c, 0x30, 0x30, 0x37, 0x1e] },
  { segno: "m", griglia: [0x15, 0x3f, 0x3f, 0x2f, 0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0x2d] },
];

async function leggiCifre(dataUrl: string): Promise<Pick<LetturaComputer, "data" | "ora" | "oraFine" | "minuti" | "profondita" | "media">> {
  const vuoto = { data: "", ora: "", oraFine: "", minuti: "", profondita: "", media: "" };
  const img = await carica(dataUrl);
  if (!img || typeof document === "undefined") return vuoto;
  const anteprima = Math.max(img.width, img.height) > 900 ? 900 / Math.max(img.width, img.height) : 1;
  const aw = Math.max(1, Math.round(img.width * anteprima));
  const ah = Math.max(1, Math.round(img.height * anteprima));
  const sonda = document.createElement("canvas");
  sonda.width = aw;
  sonda.height = ah;
  const sx = sonda.getContext("2d", { willReadFrequently: true });
  if (!sx) return vuoto;
  sx.drawImage(img, 0, 0, aw, ah);
  const zona = zonaSchermo(sx.getImageData(0, 0, aw, ah));
  const x = Math.max(0, Math.round(zona.x / anteprima));
  const y = Math.max(0, Math.round(zona.y / anteprima));
  const w = Math.min(img.width - x, Math.round(zona.w / anteprima));
  const h = Math.min(img.height - y, Math.round(zona.h / anteprima));
  if (w < 80 || h < 80) return vuoto;
  const scala = Math.min(3, Math.max(2, 1400 / Math.max(w, h)));
  const quadro = document.createElement("canvas");
  quadro.width = Math.round(w * scala);
  quadro.height = Math.round(h * scala);
  const qx = quadro.getContext("2d", { willReadFrequently: true });
  if (!qx) return vuoto;
  qx.imageSmoothingEnabled = false;
  qx.drawImage(img, x, y, w, h, 0, 0, quadro.width, quadro.height);
  const dati = qx.getImageData(0, 0, quadro.width, quadro.height);
  const bande = trovaBande(dati);
  const righe = bande.map((banda) => leggiBanda(dati, banda, 0.93)).filter((riga) => riga.tempo || riga.quota);
  const prima = righe[0];
  let seconda = righe[1];
  if (prima && !seconda && bande[0]) {
    const altezza = Math.max(20, bande[0].bottom - bande[0].top);
    const sotto = { top: Math.min(dati.height - 8, bande[bande.length - 1].bottom + 2), bottom: Math.min(dati.height, bande[bande.length - 1].bottom + Math.round(altezza * 1.15)) };
    if (sotto.bottom - sotto.top > 12) seconda = leggiBanda(dati, sotto, 0.86);
  }
  return {
    data: "",
    ora: prima?.tempo || "",
    oraFine: seconda?.tempo || "",
    minuti: "",
    profondita: prima?.quota || "",
    media: seconda?.quota || "",
  };
}

function trovaBande(image: ImageData): { top: number; bottom: number }[] {
  const { data, width, height } = image;
  const luminosita: number[] = [];
  for (let i = 0; i < width * height; i += 8) {
    const p = i * 4;
    luminosita.push((data[p] + data[p + 1] + data[p + 2]) / 3);
  }
  luminosita.sort((a, b) => a - b);
  const soglia = luminosita[Math.floor(luminosita.length * 0.94)] || 180;
  const inizio = Math.floor(height * 0.42);
  const profilo = new Array(height).fill(0);
  for (let y = inizio; y < height; y += 1) {
    let n = 0;
    for (let x = 0; x < width; x += 2) {
      const p = (y * width + x) * 4;
      if ((data[p] + data[p + 1] + data[p + 2]) / 3 >= soglia) n += 1;
    }
    profilo[y] = n;
  }
  const bande: { top: number; bottom: number }[] = [];
  let aperto = -1;
  const minimo = Math.max(4, width / 80);
  for (let y = inizio; y <= height; y += 1) {
    const acceso = y < height && profilo[y] >= minimo;
    if (acceso && aperto < 0) aperto = y;
    if (!acceso && aperto >= 0) {
      if (y - aperto > height * 0.035) bande.push({ top: aperto, bottom: y });
      aperto = -1;
    }
  }
  return bande.slice(0, 2);
}

function leggiBanda(image: ImageData, banda: { top: number; bottom: number }, percentile = 0.93): { tempo: string; quota: string } {
  const glifi = segmenta(image, banda.top, banda.bottom, percentile);
  if (glifi.length < 3) return { tempo: "", quota: "" };
  const altezza = mediana(glifi.map((glifo) => glifo.h));
  const segni = glifi.map((glifo) => ({ x: glifo.x, segno: riconosci(glifo, altezza) })).filter((voce) => voce.segno);
  if (!segni.some((voce) => voce.segno === ":" || voce.segno === ".")) return { tempo: "", quota: "" };
  const gruppi: { x: number; segni: string[] }[] = [];
  for (const voce of segni) {
    const ultimo = gruppi[gruppi.length - 1];
    if (!ultimo || voce.x - ultimo.x > altezza * 1.6) gruppi.push({ x: voce.x, segni: [voce.segno] });
    else {
      ultimo.segni.push(voce.segno);
      ultimo.x = voce.x;
    }
  }
  const utili = gruppi.filter((gruppo) => gruppo.segni.some((segno) => /\d/.test(segno)));
  return { tempo: tempoDa(utili[0]?.segni || []), quota: quotaDa(utili[1]?.segni || utili[0]?.segni || []) };
}

function segmenta(image: ImageData, top: number, bottom: number, percentile = 0.93): { x: number; y: number; w: number; h: number; griglia: number[] }[] {
  const { data, width } = image;
  const valori: number[] = [];
  for (let y = top; y < bottom; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const p = (y * width + x) * 4;
      valori.push((data[p] + data[p + 1] + data[p + 2]) / 3);
    }
  }
  valori.sort((a, b) => a - b);
  const soglia = valori[Math.floor(valori.length * percentile)] || 180;
  const colonne = new Array(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    for (let y = top; y < bottom; y += 1) {
      const p = (y * width + x) * 4;
      if ((data[p] + data[p + 1] + data[p + 2]) / 3 >= soglia) colonne[x] += 1;
    }
  }
  const tratti: { x: number; w: number }[] = [];
  let aperto = -1;
  for (let x = 0; x <= width; x += 1) {
    const acceso = x < width && colonne[x] > 2;
    if (acceso && aperto < 0) aperto = x;
    if (!acceso && aperto >= 0) {
      if (x - aperto > 6) tratti.push({ x: aperto, w: x - aperto });
      aperto = -1;
    }
  }
  const glifi = [];
  for (const tratto of tratti) {
    let y0 = bottom;
    let y1 = top;
    for (let y = top; y < bottom; y += 1) {
      for (let x = tratto.x; x < tratto.x + tratto.w; x += 1) {
        const p = (y * width + x) * 4;
        if ((data[p] + data[p + 1] + data[p + 2]) / 3 >= soglia) {
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const h = y1 - y0 + 1;
    if (h < 12 || h > (bottom - top) * 0.98 || tratto.w > 110) continue;
    glifi.push({ x: tratto.x, y: y0, w: tratto.w, h, griglia: grigliaDi(image, tratto.x, y0, tratto.w, h, soglia) });
  }
  return glifi;
}

function grigliaDi(image: ImageData, x: number, y: number, w: number, h: number, soglia: number): number[] {
  const { data, width } = image;
  const righe: number[] = [];
  for (let ry = 0; ry < 10; ry += 1) {
    let riga = 0;
    for (let cx = 0; cx < 6; cx += 1) {
      let totale = 0;
      let accesi = 0;
      const yA = y + Math.floor(ry * h / 10);
      const yB = y + Math.floor((ry + 1) * h / 10);
      const xA = x + Math.floor(cx * w / 6);
      const xB = x + Math.floor((cx + 1) * w / 6);
      for (let yy = yA; yy < Math.max(yA + 1, yB); yy += 1) {
        for (let xx = xA; xx < Math.max(xA + 1, xB); xx += 1) {
          totale += 1;
          const p = (yy * width + xx) * 4;
          if ((data[p] + data[p + 1] + data[p + 2]) / 3 >= soglia) accesi += 1;
        }
      }
      if (totale && accesi / totale > 0.28) riga |= 1 << cx;
    }
    righe.push(riga);
  }
  return righe;
}

function riconosci(glifo: { w: number; h: number; griglia: number[] }, altezza: number): string {
  if (glifo.h < altezza * 0.45 && glifo.w < altezza * 0.7) {
    const accese = glifo.griglia.map((riga, indice) => riga ? indice : -1).filter((indice) => indice >= 0);
    if (accese.length >= 2 && accese[accese.length - 1] - accese[0] >= 4 && glifo.griglia.slice(3, 7).every((riga) => riga === 0)) return ":";
    return ".";
  }
  let meglio = "";
  let distanza = 24;
  for (const modello of MODELLI_CIFRE) {
    let n = 0;
    for (let i = 0; i < 10; i += 1) n += bitDiversi(glifo.griglia[i] || 0, modello.griglia[i] || 0);
    if (n < distanza) {
      distanza = n;
      meglio = modello.segno;
    }
  }
  if (meglio) return meglio;
  if (glifo.w < glifo.h * 0.42) return "1";
  return "";
}

function bitDiversi(a: number, b: number): number {
  let n = a ^ b;
  let totale = 0;
  while (n) {
    totale += n & 1;
    n >>= 1;
  }
  return totale;
}

function tempoDa(segni: string[]): string {
  const testo = segni.filter((segno) => segno !== "m" && segno !== ".").join("");
  const conDuePunti = testo.match(/(\d):(\d{2})/);
  if (conDuePunti && Number(conDuePunti[1]) <= 23 && Number(conDuePunti[2]) <= 59) return `${conDuePunti[1].padStart(2, "0")}:${conDuePunti[2]}`;
  const cifre = testo.replace(/\D/g, "");
  if (cifre.length === 4) {
    const ora = `${cifre.slice(0, 2)}:${cifre.slice(2)}`;
    return Number(cifre.slice(0, 2)) <= 23 && Number(cifre.slice(2)) <= 59 ? ora : "";
  }
  if (cifre.length === 3) return `0${cifre[0]}:${cifre.slice(1)}`;
  return "";
}

function quotaDa(segni: string[]): string {
  const testo = segni.filter((segno) => segno !== ":" && segno !== "m").join("");
  const conPunto = testo.match(/(\d{1,2})\.(\d)/);
  if (conPunto) {
    const n = Number(`${conPunto[1]}.${conPunto[2]}`);
    return n >= 1 && n <= 120 ? n.toFixed(1) : "";
  }
  const cifre = testo.replace(/\D/g, "");
  if (cifre.length >= 2) {
    const n = Number(`${cifre.slice(0, -1)}.${cifre.slice(-1)}`);
    return n >= 1 && n <= 120 ? n.toFixed(1) : "";
  }
  return "";
}

function mediana(valori: number[]): number {
  if (!valori.length) return 1;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.floor(ordinati.length / 2)] || 1;
}

function carica(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
