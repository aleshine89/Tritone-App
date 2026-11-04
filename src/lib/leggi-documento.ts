export type TipoLettura = "brevetto" | "medico" | "assicurazione";

export type LetturaDocumento = {
  scadenza: string;
  rilascio: string;
  didattica: string;
  livello: string;
  numero: string;
  profondita: string;
  nome: string;
  cognome: string;
  soggetto: string;
  letto: boolean;
};

const ENTI = ["SNSI", "PADI", "SSI", "CMAS", "RAID", "NAUI", "SDI", "TDI", "GUE", "IANTD", "ANDI", "PSAI", "BSAC"];

const LIVELLI: RegExp[] = [
  /explorer\s+diver\s+\d+\s+extended/i,
  /explorer\s+diver\s+\d+/i,
  /advanced\s+open\s+water(?:\s+diver)?/i,
  /junior\s+open\s+water(?:\s+diver)?/i,
  /open\s+water(?:\s+diver)?/i,
  /advanced\s+adventurer/i,
  /master\s+scuba\s+diver/i,
  /rescue\s+diver/i,
  /stress\s*(?:&|and|e)\s*rescue/i,
  /scuba\s+diver/i,
  /divemaster/i,
  /dive\s+guide/i,
  /enriched\s+air(?:\s+nitrox)?/i,
  /nitrox/i,
  /deep\s+diver/i,
  /wreck\s+diver/i,
  /dry\s+suit/i,
  /peak\s+performance\s+buoyancy/i,
  /science\s+of\s+diving/i,
  /night\s+diver/i,
  /sidemount/i,
  /rebreather/i,
  /cave(?:\s+diver)?/i,
  /trimix/i,
  /tec(?:h)?\s*(?:40|45|50)/i,
];

const MESI: Record<string, string> = {
  gennaio: "01", gen: "01", january: "01", jan: "01",
  febbraio: "02", feb: "02", february: "02",
  marzo: "03", mar: "03", march: "03",
  aprile: "04", apr: "04", april: "04",
  maggio: "05", mag: "05", may: "05",
  giugno: "06", giu: "06", june: "06", jun: "06",
  luglio: "07", lug: "07", july: "07", jul: "07",
  agosto: "08", ago: "08", august: "08", aug: "08",
  settembre: "09", set: "09", september: "09", sep: "09", sept: "09",
  ottobre: "10", ott: "10", october: "10", oct: "10",
  novembre: "11", nov: "11", november: "11",
  dicembre: "12", dic: "12", december: "12", dec: "12",
};

const COMPAGNIE = ["DAN Europe", "DAN", "Allianz", "Generali", "Unipol", "AXA", "Europ Assistance", "Groupama", "Reale Mutua", "Vittoria"];

const VUOTO: LetturaDocumento = {
  scadenza: "",
  rilascio: "",
  didattica: "",
  livello: "",
  numero: "",
  profondita: "",
  nome: "",
  cognome: "",
  soggetto: "",
  letto: false,
};

export async function leggiDocumento(dataUrl: string, name: string, kind: TipoLettura = "brevetto"): Promise<LetturaDocumento> {
  let testo = "";
  try {
    testo = await testoDalFile(dataUrl, kind);
  } catch {
    testo = "";
  }
  return interpreta(`${name}\n${testo}`, kind);
}

export function interpreta(testo: string, kind: TipoLettura): LetturaDocumento {
  const pulito = sistemaSigle(testo);
  const linee = lineeDi(pulito);
  const tutto = linee.join("\n");
  const didattica = kind === "brevetto" ? trovaEnte(tutto) : "";
  const livello = kind === "brevetto" ? trovaLivello(tutto, didattica) : "";
  const numero = trovaNumero(linee, kind);
  const profondita = kind === "brevetto" ? trovaProfondita(tutto) : "";
  const date = trovaDate(linee, kind);
  const persona = trovaPersona(linee);
  const soggetto = kind === "medico" ? trovaMedico(linee) : kind === "assicurazione" ? trovaCompagnia(tutto, linee) : "";
  const risultato: LetturaDocumento = {
    scadenza: date.scadenza,
    rilascio: date.rilascio,
    didattica,
    livello,
    numero,
    profondita,
    nome: persona.nome,
    cognome: persona.cognome,
    soggetto,
    letto: false,
  };
  risultato.letto = Boolean(
    risultato.scadenza || risultato.rilascio || risultato.didattica || risultato.livello || risultato.numero || risultato.profondita || risultato.nome || risultato.soggetto,
  );
  return risultato.letto ? risultato : { ...VUOTO };
}

async function testoDalFile(dataUrl: string, kind: TipoLettura): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const header = dataUrl.slice(0, comma).toLowerCase();
  if (header.includes("pdf") || header.includes("text")) {
    try {
      return stringhe(atob(dataUrl.slice(comma + 1)));
    } catch {
      return "";
    }
  }
  if (!header.includes("image") || typeof document === "undefined") return "";
  if (kind === "brevetto") {
    const immagini = await preparaBrevetto(dataUrl);
    const testo = await ocrBrevetto(immagini.length > 0 ? immagini : [dataUrl]);
    if (testo.trim()) return testo;
  }
  const pronta = await preparaImmagine(dataUrl);
  return ocr(pronta || dataUrl);
}

async function ocr(image: string): Promise<string> {
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("ita+eng");
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const result = await worker.recognize(image);
      return result.data.text ?? "";
    } finally {
      await worker.terminate();
    }
  } catch {
    return "";
  }
}

async function preparaImmagine(dataUrl: string): Promise<string> {
  const img = await carica(dataUrl);
  if (!img) return "";
  const lunga = Math.max(img.width, img.height);
  const scale = lunga < 1400 ? Math.min(2, 1800 / Math.max(lunga, 1)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const luci: number[] = [];
  const step = Math.max(4, Math.floor(data.length / 4 / 3000) * 4);
  for (let i = 0; i < data.length; i += step) luci.push(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  luci.sort((a, b) => a - b);
  const lo = luci[Math.floor(luci.length * 0.06)] ?? 0;
  const hi = luci[Math.floor(luci.length * 0.94)] ?? 255;
  const span = Math.max(16, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    const v = Math.max(0, Math.min(255, ((l - lo) / span) * 255));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function ocrBrevetto(immagini: string[]): Promise<string> {
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("ita+eng");
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "300" });
      const prima = (await worker.recognize(immagini[0] ?? "")).data.text ?? "";
      const gia = codiceIntero(lineeDi(sistemaSigle(prima)));
      if (gia.length >= 12 && /[A-Z]{2}$/.test(gia)) return prima;
      const secondaImmagine = immagini[1];
      if (!secondaImmagine) return prima;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "300" });
      const seconda = (await worker.recognize(secondaImmagine)).data.text ?? "";
      return `${prima}\n${seconda}`;
    } finally {
      await worker.terminate();
    }
  } catch {
    return "";
  }
}

async function preparaBrevetto(dataUrl: string): Promise<string[]> {
  const img = await carica(dataUrl);
  if (!img) return [];
  const lunga = Math.max(img.width, img.height);
  const scale = lunga < 2000 ? Math.min(2, 2200 / Math.max(lunga, 1)) : 1;
  const angolo = stimaInclinazione(img, Math.round(img.width * scale), Math.round(img.height * scale));
  const dritta = canvasDa(img, scale, angolo);
  stiraContrasto(dritta);
  const binaria = document.createElement("canvas");
  binaria.width = dritta.width;
  binaria.height = dritta.height;
  const ctx = binaria.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [dritta.toDataURL("image/png")];
  ctx.drawImage(dritta, 0, 0);
  sogliaOtsu(binaria);
  return [dritta.toDataURL("image/png"), binaria.toDataURL("image/png")];
}

function canvasDa(img: HTMLImageElement, scale: number, gradi: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const rad = (gradi * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * cos + h * sin));
  canvas.height = Math.max(1, Math.round(w * sin + h * cos));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}

function stimaInclinazione(img: HTMLImageElement, width: number, height: number): number {
  const smallW = 220;
  const smallH = Math.max(1, Math.round(height * (smallW / Math.max(width, 1))));
  let best = 0;
  let bestScore = -1;
  for (let deg = -8; deg <= 8; deg += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = smallW;
    canvas.height = smallH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, smallW, smallH);
    ctx.translate(smallW / 2, smallH / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(img, -smallW / 2, -smallH / 2, smallW, smallH);
    const { data } = ctx.getImageData(0, 0, smallW, smallH);
    const score = varianzaBordi(data, smallW, smallH);
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return Math.abs(best) >= 1 ? best : 0;
}

function varianzaBordi(data: Uint8ClampedArray, w: number, h: number): number {
  const righe = new Float64Array(h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = (y * w + x) * 4;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const r = data[i + 4] * 0.2126 + data[i + 5] * 0.7152 + data[i + 6] * 0.0722;
      if (Math.abs(l - r) > 36) righe[y] += 1;
    }
  }
  let media = 0;
  for (const valore of righe) media += valore;
  media /= righe.length;
  let varianza = 0;
  for (const valore of righe) varianza += (valore - media) ** 2;
  return varianza;
}

function stiraContrasto(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const luci: number[] = [];
  const step = Math.max(4, Math.floor(data.length / 4 / 3000) * 4);
  for (let i = 0; i < data.length; i += step) luci.push(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  luci.sort((a, b) => a - b);
  const mediana = luci[Math.floor(luci.length * 0.5)] ?? 128;
  const lo = luci[Math.floor(luci.length * 0.06)] ?? 0;
  const hi = luci[Math.floor(luci.length * 0.94)] ?? 255;
  const span = Math.max(16, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    let l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    if (mediana > 150 && l > 246) l = 255;
    const v = Math.max(0, Math.min(255, ((l - lo) / span) * 255));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

function sogliaOtsu(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const hist = new Array<number>(256).fill(0);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[data[i]] += 1;
  let somma = 0;
  for (let i = 0; i < 256; i += 1) somma += i * hist[i];
  let sommaSotto = 0;
  let pesoSotto = 0;
  let migliore = 0;
  let soglia = 160;
  for (let i = 0; i < 256; i += 1) {
    pesoSotto += hist[i];
    if (pesoSotto === 0) continue;
    const pesoSopra = n - pesoSotto;
    if (pesoSopra === 0) break;
    sommaSotto += i * hist[i];
    const mediaSotto = sommaSotto / pesoSotto;
    const mediaSopra = (somma - sommaSotto) / pesoSopra;
    const tra = pesoSotto * pesoSopra * (mediaSotto - mediaSopra) ** 2;
    if (tra > migliore) {
      migliore = tra;
      soglia = i;
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] < soglia ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

function carica(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function sistemaSigle(testo: string): string {
  return testo
    .replace(/S\s*\.\s*N\s*\.\s*S\s*\.\s*I/gi, "SNSI")
    .replace(/P\s*\.\s*A\s*\.\s*D\s*\.\s*I/gi, "PADI")
    .replace(/C\s*\.\s*M\s*\.\s*A\s*\.\s*S/gi, "CMAS")
    .replace(/N\s*\.\s*A\s*\.\s*U\s*\.\s*I/gi, "NAUI");
}

function lineeDi(testo: string): string[] {
  return testo
    .replace(/\r/g, "\n")
    .split("\n")
    .map((riga) => riga.replace(/\s+/g, " ").trim())
    .filter((riga) => riga.length > 1 && !sembraRumore(riga));
}

function sembraRumore(riga: string): boolean {
  if (/^P\s*[1-3]$/i.test(riga) || /★|\*/.test(riga)) return false;
  const lettere = riga.replace(/[^A-Za-zÀ-ÿ]/g, "").length;
  return lettere < 2 && !/\d{2,}/.test(riga);
}

function trovaEnte(testo: string): string {
  const alto = testo.toUpperCase();
  if (/\bSNSI\b/.test(alto)) return "SNSI";
  if (/\bPADI\b/.test(alto)) return "PADI";
  if (/\bCMAS\b/.test(alto)) return "CMAS";
  if (/\bNAUI\b/.test(alto)) return "NAUI";
  if (/\bRAID\b/.test(alto)) return "RAID";
  if (/\bSDI\b/.test(alto)) return "SDI";
  if (/\bTDI\b/.test(alto)) return "TDI";
  if (/\bIANTD\b/.test(alto)) return "IANTD";
  if (/\bGUE\b/.test(alto)) return "GUE";
  if (/\bANDI\b/.test(alto)) return "ANDI";
  if (/\bPSAI\b/.test(alto)) return "PSAI";
  if (/\bBSAC\b/.test(alto)) return "BSAC";
  if (/\bSSI\b/.test(alto) || /scuba\s+schools\s+international/i.test(testo)) return "SSI";
  const ente = ENTI.find((voce) => alto.includes(voce));
  return ente ?? "";
}

function trovaLivello(testo: string, ente: string): string {
  if (ente === "CMAS" || /\bCMAS\b/i.test(testo)) {
    if (/(\*\*\*|★\s*★\s*★|tre\s+stelle|3\s+stelle|\bP\s*3\b)/i.test(testo)) return "Tre stelle";
    if (/(\*\*|★\s*★|due\s+stelle|2\s+stelle|\bP\s*2\b)/i.test(testo)) return "Due stelle";
    if (/(\*|★|una\s+stella|1\s+stella|\bP\s*1\b)/i.test(testo)) return "Una stella";
  }
  for (const re of LIVELLI) {
    const match = testo.match(re);
    if (!match) continue;
    return titolo(match[0]);
  }
  return "";
}

function titolo(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[\p{L}]/gu, (lettera) => lettera.toUpperCase());
}

function trovaNumero(linee: string[], kind: TipoLettura): string {
  if (kind === "brevetto") {
    const intero = codiceIntero(linee);
    if (intero) return intero;
  }
  const etichetta = kind === "assicurazione"
    ? /\b(?:polizza|policy|numero|number|n[°º.]|no\.)/i
    : /\b(?:cert(?:ificato|ificate|ificazione)?|card|brevetto|numero|number|n[°º.]|no\.)/i;
  for (const riga of linee) {
    if (!etichetta.test(riga)) continue;
    const trovato = numeroIn(riga.replace(etichetta, " "));
    if (trovato) return trovato;
  }
  const tutto = linee.join("\n");
  const sigla = tutto.match(/\b([A-Z]{2,4}[-/]\d{4,12})\b/);
  if (sigla) return sigla[1];
  for (const match of tutto.matchAll(/\b(\d{5,12})\b/g)) {
    if (!sembraData(match[1])) return match[1];
  }
  return "";
}

const PREFISSI_RUMORE = ["CERTIFICATO", "CERTIFICATION", "CERTIFICATE", "BREVETTO", "LIVELLO", "NUMERO", "NUMBER", "NITROX", "CODICE", "WATER", "LEVEL", "DIVER", "CARD", "OPEN", "CODE", "CERT", "SNSI", "PADI", "NAUI", "CMAS", "SSI"];
const PREFISSI_INTERI = new Set(["WATER", "OPEN", "DIVER", "LEVEL", "CARD", "CERT", "CODE", "NUMERO", "NUMBER", "NITROX"]);

function codiceIntero(linee: string[]): string {
  const pieni: string[] = [];
  const mozzi: string[] = [];
  const gruppi: string[][] = linee.map((riga) => riga.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
  for (let i = 0; i < linee.length - 1; i += 1) gruppi.push([...(gruppi[i] ?? []), ...(gruppi[i + 1] ?? [])]);
  for (const tokens of gruppi) {
    for (let i = 0; i < tokens.length; i += 1) {
      consideraCodice(tokens[i] ?? "", pieni, mozzi);
      let acc = tokens[i] ?? "";
      for (let k = 1; k <= 3 && i + k < tokens.length; k += 1) {
        if (!frammentoCodice(tokens[i + k] ?? "")) break;
        acc += tokens[i + k];
        consideraCodice(acc, pieni, mozzi);
      }
    }
  }
  return miglioreCodice(pieni) || miglioreCodice(mozzi);
}

function frammentoCodice(token: string): boolean {
  const pulito = sistemaZero(token);
  if (/^[A-Z]{2,8}\d{6,14}[A-Z]{2}$/.test(pulito)) return false;
  return /^[A-Z]{1,4}$/.test(pulito) || /^\d{4,14}$/.test(pulito) || /^[A-Z]{1,3}\d{4,14}$/.test(pulito) || /^\d{4,14}[A-Z]{2}$/.test(pulito);
}

function sistemaZero(token: string): string {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(^|[^0-9])0(?=[A-Z])/g, "$1O");
}

function consideraCodice(raw: string, pieni: string[], mozzi: string[]) {
  const token = sistemaZero(raw);
  const pieno = normalizzaCodice(token);
  if (pieno && /[A-Z]{2}$/.test(pieno)) {
    pieni.push(pieno);
    return;
  }
  const mozzo = token.match(/^([A-Z]{3,8})(\d{8,12})$/);
  if (!mozzo || cifreData(mozzo[2])) return;
  const lettere = ripulisciPrefisso(mozzo[1]);
  if (lettere.length < 3 || PREFISSI_INTERI.has(lettere)) return;
  mozzi.push(`${lettere}${mozzo[2]}`);
}

function ripulisciPrefisso(lettere: string): string {
  let resto = lettere;
  for (let giro = 0; giro < 6; giro += 1) {
    const parola = PREFISSI_RUMORE.find((voce) => resto.startsWith(voce) && resto.length - voce.length >= 2);
    if (!parola) break;
    resto = resto.slice(parola.length);
  }
  if (resto.length > 8) resto = resto.slice(-6);
  return resto;
}

function normalizzaCodice(token: string): string {
  let lettere = "";
  let cifre = "";
  let coda = "";
  const intero = token.match(/^([A-Z]+)(\d{6,14})([A-Z]{2})$/);
  const quasi = token.match(/^([A-Z]+)(\d{6,14})1([A-Z])$/);
  if (intero) {
    lettere = intero[1];
    cifre = intero[2];
    coda = intero[3];
  } else if (quasi) {
    lettere = quasi[1];
    cifre = quasi[2];
    coda = `I${quasi[3]}`;
  } else return "";
  lettere = ripulisciPrefisso(lettere);
  if (lettere.length < 2 || lettere.length > 8 || PREFISSI_INTERI.has(lettere)) return "";
  if (cifreData(cifre)) return "";
  return `${lettere}${cifre}${coda}`;
}

function cifreData(cifre: string): boolean {
  if (cifre.length !== 8) return false;
  return Boolean(dataIso(cifre.slice(0, 4), cifre.slice(4, 6), cifre.slice(6, 8)) || dataIso(cifre.slice(4), cifre.slice(2, 4), cifre.slice(0, 2)));
}

function miglioreCodice(codici: string[]): string {
  let scelto = "";
  let punteggio = -1;
  for (const codice of codici) {
    const parti = codice.match(/^([A-Z]{2,8})(\d{6,14})([A-Z]{2})?$/);
    if (!parti) continue;
    let voto = parti[3] ? 20 : 8;
    if (parti[2].length >= 8 && parti[2].length <= 12) voto += 5;
    if (parti[1].length >= 3 && parti[1].length <= 6) voto += 3;
    voto += codice.length / 100;
    if (voto > punteggio) {
      punteggio = voto;
      scelto = codice;
    }
  }
  return scelto;
}

function numeroIn(value: string): string {
  if (!value) return "";
  for (const match of value.matchAll(/\b([A-Z0-9][A-Z0-9/-]{3,22})\b/gi)) {
    const trovato = match[1].replace(/[./]+$/, "");
    if (sembraData(trovato) || ENTI.includes(trovato.toUpperCase())) continue;
    if (!/\d/.test(trovato)) continue;
    return trovato;
  }
  return "";
}

function sembraData(value: string): boolean {
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value) || /^\d{8}$/.test(value);
}

function trovaProfondita(testo: string): string {
  const etichetta = testo.match(/(?:profondit[àa]\s*(?:massima|max)?|max(?:imum)?\s*depth|depth)\s*[:\-]?\s*(\d{1,3}(?:[.,]\d)?)/i);
  const libero = testo.match(/\b(\d{1,3}(?:[.,]\d)?)\s?(?:m\b|metri\b|meters\b)/i);
  const raw = (etichetta?.[1] ?? libero?.[1] ?? "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 5 || n > 130) return "";
  return Number.isInteger(n) ? String(n) : String(n);
}

function trovaDate(linee: string[], kind: TipoLettura): { rilascio: string; scadenza: string } {
  const scadenza = dataVicino(linee, /scad|expir|valid(?:it[àa]| until| thru)?|fino al|valido/i);
  const rilascio = dataVicino(linee, /rilasc|date of issue|issued|certified on|conseguit|emesso|data di cert/i);
  if (scadenza || rilascio) {
    return {
      rilascio: rilascio === scadenza ? "" : rilascio,
      scadenza: scadenza || (kind === "brevetto" ? "" : rilascio),
    };
  }
  const tutte = linee.flatMap((riga) => dateNellaRiga(riga)).filter((iso, index, lista) => lista.indexOf(iso) === index).sort();
  if (!tutte.length) return { rilascio: "", scadenza: "" };
  if (kind === "brevetto") {
    return { rilascio: tutte[0], scadenza: tutte.length > 1 ? tutte[tutte.length - 1] : "" };
  }
  return { rilascio: tutte.length > 1 ? tutte[0] : "", scadenza: tutte[tutte.length - 1] };
}

function dataVicino(linee: string[], etichetta: RegExp): string {
  for (let i = 0; i < linee.length; i += 1) {
    if (!etichetta.test(linee[i])) continue;
    const sulla = dateNellaRiga(linee[i])[0];
    if (sulla) return sulla;
    const dopo = dateNellaRiga(linee[i + 1] ?? "")[0];
    if (dopo) return dopo;
  }
  return "";
}

function dateNellaRiga(riga: string): string[] {
  const trovate: string[] = [];
  for (const match of riga.matchAll(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/g)) {
    const iso = dataIso(match[1], match[2], match[3]);
    if (iso) trovate.push(iso);
  }
  for (const match of riga.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) {
    const iso = dataIso(annoEsteso(match[3]), match[2], match[1]);
    if (iso) trovate.push(iso);
  }
  const mesi = Object.keys(MESI).sort((a, b) => b.length - a.length).join("|");
  const reMese = new RegExp(`\\b(\\d{1,2})\\s+(${mesi})\\s+(\\d{4})\\b`, "gi");
  for (const match of riga.matchAll(reMese)) {
    const iso = dataIso(match[3], MESI[match[2].toLowerCase()] ?? "", match[1]);
    if (iso) trovate.push(iso);
  }
  const reMesePrima = new RegExp(`\\b(${mesi})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
  for (const match of riga.matchAll(reMesePrima)) {
    const iso = dataIso(match[3], MESI[match[1].toLowerCase()] ?? "", match[2]);
    if (iso) trovate.push(iso);
  }
  return trovate;
}

function annoEsteso(value: string): string {
  if (value.length === 4) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(n >= 70 ? 1900 + n : 2000 + n);
}

function dataIso(anno: string, mese: string, giorno: string): string {
  const y = Number(anno);
  const m = Number(mese);
  const d = Number(giorno);
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function trovaPersona(linee: string[]): { nome: string; cognome: string } {
  const cognome = paroleNome(dopoEtichetta(linee, /^(cognome|surname|last name)\b/i));
  const nome = paroleNome(pulisciNome(dopoEtichetta(linee, /^(nome(?:\s+e\s+cognome)?|name|diver|holder|intestatario|nominativo)\b/i)));
  if (cognome && nome && !nome.includes(" ")) return { nome, cognome };
  const intero = nome || cognome;
  const pezzi = intero.split(" ").filter(Boolean);
  if (pezzi.length >= 2) return { nome: pezzi[0], cognome: pezzi.slice(1).join(" ") };
  for (const riga of linee) {
    const candidate = paroleNome(riga);
    const parti = candidate.split(" ").filter(Boolean);
    if (parti.length < 2 || parti.length > 3) continue;
    if (/\d|depth|profond|scad|level|livello|cert|card|date|data|max\b/i.test(riga)) continue;
    if (LIVELLI.some((re) => re.test(riga)) || ENTI.some((ente) => new RegExp(`\\b${ente}\\b`).test(riga.toUpperCase()))) continue;
    if (COMPAGNIE.some((voce) => riga.toUpperCase().includes(voce.toUpperCase()))) continue;
    if (/^(dott|dr|medico|clinica|certificato|polizza|scadenza)\b/i.test(riga)) continue;
    return { nome: parti[0], cognome: parti.slice(1).join(" ") };
  }
  return { nome: pezzi[0] ?? "", cognome: "" };
}

function pulisciNome(value: string): string {
  return value.replace(/^(?:e\s+)?(?:cognome|surname)\s*[:\-]?\s*/i, "").trim();
}

function paroleNome(value: string): string {
  const pulito = value.replace(/[^ \p{L}'’-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!pulito || pulito.length < 2 || pulito.length > 48) return "";
  const parole = pulito.split(" ");
  if (parole.some((parola) => parola.length < 2)) return "";
  if (parole.some((parola) => /^(date|data|cert|card|level|livello|open|water|diver|advanced)$/i.test(parola))) return "";
  return parole.map((parola) => parola[0].toUpperCase() + parola.slice(1).toLowerCase()).join(" ");
}

function trovaMedico(linee: string[]): string {
  const diretto = dopoEtichetta(linee, /^(?:dott(?:or(?:e)?)?\.?|dr\.?|medico|clinica|ospedale|studio|struttura)\b/i);
  return diretto.replace(/^[\s.:\-]+/, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function trovaCompagnia(testo: string, linee: string[]): string {
  const nota = COMPAGNIE.find((voce) => testo.toUpperCase().includes(voce.toUpperCase()));
  if (nota) return nota;
  return dopoEtichetta(linee, /(?:compagnia|assicurazione|insurer|policy)\b/i).slice(0, 80);
}

function dopoEtichetta(linee: string[], etichetta: RegExp): string {
  for (let i = 0; i < linee.length; i += 1) {
    if (!etichetta.test(linee[i])) continue;
    const stessa = linee[i].replace(etichetta, "").replace(/^[:\-–\s]+/, "").trim();
    if (stessa && !etichetta.test(stessa)) return stessa;
    const dopo = linee[i + 1] ?? "";
    if (dopo && !etichetta.test(dopo)) return dopo;
  }
  return "";
}

function stringhe(binary: string): string {
  const pezzi: string[] = [];
  let corrente = "";
  for (let i = 0; i < binary.length; i += 1) {
    const code = binary.charCodeAt(i);
    const ok = (code >= 32 && code <= 126) || (code >= 192 && code <= 255);
    if (ok) corrente += binary[i];
    else if (corrente.length >= 3) {
      pezzi.push(corrente);
      corrente = "";
    } else corrente = "";
  }
  if (corrente.length >= 3) pezzi.push(corrente);
  return pezzi.join("\n");
}
