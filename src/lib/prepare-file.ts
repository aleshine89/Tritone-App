export type PreparedFile = {
  name: string;
  type: string;
  data: string;
  ottimizzata?: boolean;
};

export async function prepareFotoSpecie(file: File): Promise<PreparedFile> {
  if (!file.type.startsWith("image/")) throw new Error("Usa una foto.");
  try {
    const bitmap = await createImageBitmap(file);
    const piccola = Math.max(bitmap.width, bitmap.height) < 640;
    const canvas = tela(bitmap, 768, piccola ? 1.6 : 1);
    bitmap.close();
    const debole = qualitaBassa(canvas);
    if (debole || piccola) rendiLeggibile(canvas);
    const data = jpegEntro(canvas, 0.78, 160_000);
    const base = file.name.replace(/\.[^.]+$/, "") || "foto";
    return { name: `${base.slice(0, 70)}.jpg`, type: "image/jpeg", data, ottimizzata: debole || piccola };
  } catch {
    throw new Error("Questa foto non si legge. Scegline una JPG dalla galleria.");
  }
}
export async function prepareFotoModulo(file: File): Promise<PreparedFile> {
  if (!file.type.startsWith("image/")) throw new Error("Allega una foto, non un PDF.");
  try {
    const data = await compressImage(file, 1280, 0.72, 120_000);
    const base = file.name.replace(/\.[^.]+$/, "") || "certificato";
    return { name: `${base.slice(0, 70)}.jpg`, type: "image/jpeg", data };
  } catch {
    throw new Error("Questa foto non si legge. Usa un JPG o un PNG.");
  }
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type.startsWith("image/")) {
    try {
      const data = await compressImage(file);
      const base = file.name.replace(/\.[^.]+$/, "") || "foto";
      return { name: `${base.slice(0, 70)}.jpg`, type: "image/jpeg", data };
    } catch {
      throw new Error("Questa foto non si legge. Scegline una JPG dalla galleria.");
    }
  }
  const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!pdf) throw new Error("Usa una foto o un PDF.");
  if (file.size > 1_500_000) throw new Error("Il PDF supera 1,5 MB.");
  const data = await readDataUrl(file);
  if (!data.startsWith("data:application/pdf")) throw new Error("Il PDF non è valido.");
  return { name: file.name.slice(0, 80) || "documento.pdf", type: "application/pdf", data };
}

/** Copia più nitida, solo per leggere il brevetto. Non sostituisce il file salvato. */
export async function immaginePerOcr(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return "";
  const bitmap = await createImageBitmap(file);
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = long < 1800 ? Math.min(2, 2200 / Math.max(long, 1)) : Math.min(1, 2400 / long);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}

export async function fonteLetturaBrevetto(file: File, fallback: string): Promise<string> {
  try {
    const nitida = await immaginePerOcr(file);
    if (nitida.startsWith("data:image/")) return nitida;
  } catch {
    /* resta il file compresso */
  }
  return fallback;
}

export async function prepareFotoProfilo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Usa una foto.");
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - side) / 2);
    const sy = Math.round((bitmap.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("foto");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, 640, 640);
    bitmap.close();
    const data = jpegEntro(canvas, 0.86, 140_000);
    if (!data.startsWith("data:image/jpeg;base64,")) throw new Error("La foto è troppo grande.");
    return data;
  } catch (reason) {
    if (reason instanceof Error && reason.message.startsWith("La foto")) throw reason;
    throw new Error("Questa foto non si legge. Usa un JPG o un PNG.");
  }
}

export async function prepareLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Il logo deve essere un'immagine.");
  try {
    const data = await compressImage(file, 512, 0.86, 140_000, "#ffffff");
    if (!data.startsWith("data:image/jpeg;base64,") || data.length > 160_000) {
      throw new Error("Il logo è troppo grande. Riprova con un'immagine più semplice.");
    }
    return data;
  } catch (reason) {
    if (reason instanceof Error && reason.message.startsWith("Il logo")) throw reason;
    throw new Error("Questa immagine non si legge. Usa un JPG o un PNG.");
  }
}

function jpegEntro(canvas: HTMLCanvasElement, qualityStart: number, limit: number): string {
  let quality = qualityStart;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > limit && quality > 0.5) {
    quality -= 0.08;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 1_500_000) throw new Error("grande");
  return data;
}

function tela(bitmap: ImageBitmap, max: number, fino: number): HTMLCanvasElement {
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(fino, max / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("foto");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function pixel(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("foto");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function scrivi(canvas: HTMLCanvasElement, image: ImageData) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("foto");
  ctx.putImageData(image, 0, 0);
}

function luce(data: Uint8ClampedArray, i: number): number {
  return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
}

function misura(image: ImageData): { media: number; spread: number; bordi: number } {
  const { width, height, data } = image;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 6000)));
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  let edge = 0;
  let edgeN = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const l = luce(data, i);
      sum += l;
      sum2 += l * l;
      n += 1;
      if (x + step < width) {
        edge += Math.abs(l - luce(data, (y * width + x + step) * 4));
        edgeN += 1;
      }
    }
  }
  const media = n ? sum / n : 128;
  return { media, spread: Math.sqrt(Math.max(0, sum2 / Math.max(1, n) - media * media)), bordi: edgeN ? edge / edgeN : 0 };
}

function qualitaBassa(canvas: HTMLCanvasElement): boolean {
  const { media, spread, bordi } = misura(pixel(canvas));
  return media < 72 || media > 205 || spread < 28 || bordi < 7;
}

function rendiLeggibile(canvas: HTMLCanvasElement) {
  const image = pixel(canvas);
  const { media, spread } = misura(image);
  if (media < 78 || media > 198 || spread < 32) contrast(image);
  nitidezza(image, spread < 28 ? 0.65 : 0.4);
  scrivi(canvas, image);
}

function contrast(image: ImageData) {
  const { data } = image;
  const samples: number[] = [];
  const step = Math.max(4, Math.floor(data.length / 4 / 4000) * 4);
  for (let i = 0; i < data.length; i += step) samples.push(luce(data, i));
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(samples.length * 0.05)] ?? 0;
  const hi = samples[Math.floor(samples.length * 0.95)] ?? 255;
  if (hi - lo < 12) return;
  for (let i = 0; i < data.length; i += 4) {
    const l = luce(data, i);
    const target = 14 + (Math.min(hi, Math.max(lo, l)) - lo) * (228 / (hi - lo));
    const gain = l > 2 ? target / l : 1;
    data[i] = clamp(data[i] * gain);
    data[i + 1] = clamp(data[i + 1] * gain);
    data[i + 2] = clamp(data[i + 2] * gain);
  }
}

function nitidezza(image: ImageData, amount: number) {
  const { width, height, data } = image;
  const src = new Uint8ClampedArray(data);
  const at = (x: number, y: number, c: number) => src[(y * width + x) * 4 + c];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const blur =
          (at(x - 1, y - 1, c) + at(x, y - 1, c) + at(x + 1, y - 1, c) + at(x - 1, y, c) + at(x, y, c) + at(x + 1, y, c) + at(x - 1, y + 1, c) + at(x, y + 1, c) + at(x + 1, y + 1, c)) / 9;
        data[i + c] = clamp(src[i + c] + amount * (src[i + c] - blur));
      }
    }
  }
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

async function compressImage(file: File, max = 1280, qualityStart = 0.72, limit = 900_000, fill?: string): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("foto");
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return jpegEntro(canvas, qualityStart, limit);
}

export function fotoUrlSafe(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  const body = dataUrl.slice(comma + 1).replace(/\s/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `data:image/jpeg;base64url,${body}`;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("file"));
    reader.readAsDataURL(file);
  });
}
