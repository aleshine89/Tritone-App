import type { PuntoProfilo } from "@/lib/uddf";

export type LetturaComputer = {
  data: string;
  ora: string;
  oraFine: string;
  minuti: string;
  profondita: string;
  media: string;
  profilo: PuntoProfilo[];
  letto: boolean;
};

export function interpretaSchermo(testo: string): Omit<LetturaComputer, "profilo" | "letto"> {
  const piatto = testo.replace(/\s+/g, " ");
  const data = dataDi(piatto);
  const ora = oraVicino(piatto, /inizi[oa]|start/i);
  const oraFine = oraVicino(piatto, /fine|end/i);
  let profondita = numeroVicino(piatto, /max(?:\s*depth)?/i);
  let media = numeroVicino(piatto, /med(?:ia)?|avg|average/i);
  if (profondita && media && Number(media) > Number(profondita)) {
    const scambio = profondita;
    profondita = media;
    media = scambio;
  }
  const daiTempi = ora && oraFine ? minutiTra(ora, oraFine) : "";
  const scritto = durataScritta(piatto);
  const minuti = daiTempi || scritto;
  return { data, ora, oraFine, minuti, profondita, media };
}

export async function leggiComputer(dataUrl: string): Promise<LetturaComputer> {
  const testo = await ocr(dataUrl);
  const campi = interpretaSchermo(testo);
  const profilo = campi.minuti && campi.profondita ? await tracciaProfilo(dataUrl, Number(campi.minuti), Number(campi.profondita)) : [];
  const letto = Boolean(campi.data || campi.ora || campi.oraFine || campi.minuti || campi.profondita || campi.media || profilo.length > 1);
  return { ...campi, profilo, letto };
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

function durataScritta(testo: string): string {
  const match = testo.match(/\b(\d{2,3})\s*:(?!\d)/);
  if (!match) return "";
  const n = Number(match[1]);
  if (n < 5 || n > 600) return "";
  return String(n);
}

async function ocr(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return "";
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const result = await worker.recognize(dataUrl);
      return result.data.text ?? "";
    } finally {
      await worker.terminate();
    }
  } catch {
    return "";
  }
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
  const giallo = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r > 150 && g > 120 && b < 150 && r + g > b * 2.4;
  };
  const colonne: number[][] = Array.from({ length: width }, () => []);
  const righeConteggio = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!giallo(x, y)) continue;
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
