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
  profilo: PuntoProfilo[];
  letto: boolean;
};

export function interpretaSchermo(testo: string): Omit<LetturaComputer, "profilo" | "letto"> {
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
  let migliore = interpretaSchermo("");
  let puntiMigliori = -1;
  for (const testo of letture) {
    const campi = interpretaSchermo(testo);
    const punti = [campi.data, campi.ora, campi.oraFine, campi.minuti, campi.profondita, campi.media, campi.temperatura, campi.ossigeno].filter(Boolean).length;
    if (punti > puntiMigliori) {
      puntiMigliori = punti;
      migliore = campi;
    }
  }
  const profilo = migliore.minuti && migliore.profondita ? await tracciaProfilo(dataUrl, Number(migliore.minuti), Number(migliore.profondita)) : [];
  const letto = puntiMigliori > 0 || profilo.length > 1;
  return { ...migliore, profilo, letto };
}

function normalizza(testo: string): string {
  return testo
    .replace(/(\d)\s*:\s*(\d)/g, "$1:$2")
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

function scegliOrari(testo: string): string[] {
  const validi: { ora: string; at: number }[] = [];
  for (const match of testo.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const ore = Number(match[1]);
    const minuti = Number(match[2]);
    if (ore > 23 || minuti > 59 || match.index == null) continue;
    const ora = `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
    if (!validi.some((voce) => voce.ora === ora && Math.abs(voce.at - match.index) < 4)) validi.push({ ora, at: match.index });
  }
  const quota = testo.search(/\b\d{2,4}(?:\.\d{1,2})?\s*m\b/i);
  if (quota >= 0) {
    const vicini = validi.filter((voce) => Math.abs(voce.at - quota) < 160).sort((a, b) => a.at - b.at);
    if (vicini.length) return vicini.map((voce) => voce.ora);
  }
  return validi.slice(0, 2).map((voce) => voce.ora);
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
  if (!match) return "";
  const giorno = match[1].padStart(2, "0");
  const mese = match[2].padStart(2, "0");
  let anno = match[3];
  if (anno.length === 2) anno = Number(anno) > 50 ? `19${anno}` : `20${anno}`;
  if (Number(mese) < 1 || Number(mese) > 12 || Number(giorno) < 1 || Number(giorno) > 31) return "";
  return `${anno}-${mese}-${giorno}`;
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
    const worker = await createWorker("eng");
    try {
      const pezzi: string[] = [];
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "300" });
      for (const immagine of immagini) {
        const result = await worker.recognize(immagine);
        if (result.data.text?.trim()) pezzi.push(result.data.text);
      }
      const migliore = Math.max(0, ...pezzi.map((testo) => {
        const campi = interpretaSchermo(testo);
        return [campi.ora, campi.profondita, campi.media, campi.minuti].filter(Boolean).length;
      }));
      if (migliore >= 2) return pezzi;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "300" });
      for (const immagine of immagini) {
        const result = await worker.recognize(immagine);
        if (result.data.text?.trim()) pezzi.push(result.data.text);
      }
      return pezzi;
    } finally {
      await worker.terminate();
    }
  } catch {
    return [];
  }
}

async function preparaSchermo(dataUrl: string): Promise<string[]> {
  const img = await carica(dataUrl);
  if (!img) return [dataUrl];
  const lunga = Math.max(img.width, img.height);
  const scale = lunga > 1400 ? 1400 / lunga : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [dataUrl];
  ctx.drawImage(img, 0, 0, width, height);
  const pieno = canvas.toDataURL("image/png");
  const zona = zonaSchermo(ctx.getImageData(0, 0, width, height));
  if (zona.w >= width * 0.98 && zona.h >= height * 0.98) return [pieno];
  const crop = document.createElement("canvas");
  crop.width = zona.w;
  crop.height = zona.h;
  const cx = crop.getContext("2d");
  if (!cx) return [pieno];
  cx.drawImage(canvas, zona.x, zona.y, zona.w, zona.h, 0, 0, zona.w, zona.h);
  const ingrandito = document.createElement("canvas");
  const fattore = Math.min(3, Math.max(1, 1100 / Math.max(zona.w, zona.h)));
  ingrandito.width = Math.round(zona.w * fattore);
  ingrandito.height = Math.round(zona.h * fattore);
  const ix = ingrandito.getContext("2d");
  if (!ix) return [pieno, crop.toDataURL("image/png")];
  ix.imageSmoothingEnabled = true;
  ix.drawImage(crop, 0, 0, ingrandito.width, ingrandito.height);
  return [ingrandito.toDataURL("image/png"), pieno];
}

function zonaSchermo(image: ImageData): { x: number; y: number; w: number; h: number } {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const massimo = Math.max(r, g, b);
      const minimo = Math.min(r, g, b);
      const accesa = massimo > 150 && massimo - minimo > 40;
      const gialla = r > 165 && g > 145 && b < 150;
      if (!accesa && !gialla) continue;
      n += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 30 || maxX <= minX || maxY <= minY) return { x: 0, y: 0, w: width, h: height };
  const padX = Math.round((maxX - minX) * 0.15);
  const padY = Math.round((maxY - minY) * 0.22);
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(width - x, maxX - minX + padX * 2);
  const h = Math.min(height - y, maxY - minY + padY * 2);
  if (w > width * 0.8 && h > height * 0.8) return { x: 0, y: 0, w: width, h: height };
  if (w < width * 0.12 || h < height * 0.08) return { x: 0, y: 0, w: width, h: height };
  return { x, y, w, h };
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

function carica(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
