const CHIAVE = "diving-hub-chiave-privata";
const MIA = "diving-hub-chiave-mia";
const IN_ATTESA = "diving-hub-chiave-da-copiare";
const FILE_ATTESA = "diving-hub-chiave-file-da-copiare";
const FILE_VISTO = "tritone-codice-file-visto";

export function chiaveSulTelefono(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(CHIAVE) ?? "";
}

export function salvaChiaveSulTelefono(privata: string) {
  localStorage.setItem(CHIAVE, privata);
}

export function togliChiaveDalTelefono() {
  localStorage.removeItem(CHIAVE);
}

export function chiaveDaCopiare(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(IN_ATTESA) ?? "";
}

export function tieniChiaveDaCopiare(privata: string) {
  sessionStorage.setItem(IN_ATTESA, privata);
}

export function confermaChiaveCopiata() {
  sessionStorage.removeItem(IN_ATTESA);
}

export function chiaveFileDaCopiare(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(FILE_ATTESA) ?? "";
}

export function tieniChiaveFileDaCopiare(codice: string) {
  sessionStorage.setItem(FILE_ATTESA, codice);
}

export function confermaChiaveFileCopiata() {
  sessionStorage.removeItem(FILE_ATTESA);
}

export function codiceFileGiaSpiegato(): boolean {
  if (typeof localStorage === "undefined") return true;
  if (localStorage.getItem(FILE_VISTO) === "1") return true;
  if (chiaveMia()) {
    localStorage.setItem(FILE_VISTO, "1");
    return true;
  }
  return false;
}

export function segnaCodiceFileSpiegato() {
  localStorage.setItem(FILE_VISTO, "1");
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(FILE_ATTESA);
}

export function codiceFilePerCopia(): string {
  const pair = chiaveMia();
  if (!pair) return "";
  return JSON.stringify({ pubblica: pair.pubblica, privata: pair.privata });
}

function b64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let text = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    text += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromB64(value: string): ArrayBuffer {
  const text = atob(value);
  const data = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) data[i] = text.charCodeAt(i);
  return data.buffer;
}

async function importaPubblica(spki: string) {
  return crypto.subtle.importKey("spki", fromB64(spki), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function importaPrivata(pkcs8: string) {
  return crypto.subtle.importKey("pkcs8", fromB64(pkcs8), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

export async function creaCoppia(): Promise<{ pubblica: string; privata: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pubblica = await crypto.subtle.exportKey("spki", pair.publicKey);
  const privata = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return { pubblica: b64(pubblica), privata: b64(privata) };
}

async function chiaveAes(privata: CryptoKey, pubblica: CryptoKey) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pubblica }, privata, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifra(pubblica: string, testo: string): Promise<string> {
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const school = await importaPubblica(pubblica);
  const aes = await chiaveAes(eph.privateKey, school);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const closed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(testo));
  const ephPub = await crypto.subtle.exportKey("spki", eph.publicKey);
  return JSON.stringify({ e: b64(ephPub), i: b64(iv.buffer), c: b64(closed) });
}

export function normalizzaPrivata(codice: string): string {
  let text = codice.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { privata?: string };
      if (parsed.privata) text = parsed.privata;
    } catch {
      const match = text.match(/"privata"\s*:\s*"([^"]+)"/);
      if (match) text = match[1];
    }
  }
  return text.replace(/\s+/g, "");
}

export async function decifra(privata: string, busta: string): Promise<string> {
  const parsed = JSON.parse(busta) as { e?: string; i?: string; c?: string };
  if (!parsed.e || !parsed.i || !parsed.c) throw new Error("Scheda illeggibile.");
  const mine = await importaPrivata(normalizzaPrivata(privata));
  const eph = await importaPubblica(parsed.e);
  const aes = await chiaveAes(mine, eph);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parsed.i) }, aes, fromB64(parsed.c));
  return new TextDecoder().decode(plain);
}

export function chiaveMia(): { pubblica: string; privata: string } | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(MIA);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { pubblica?: string; privata?: string };
    if (!parsed.pubblica || !parsed.privata) return null;
    return { pubblica: parsed.pubblica, privata: parsed.privata };
  } catch {
    return null;
  }
}

export function salvaChiaveMia(privata: string, pubblica: string) {
  localStorage.setItem(MIA, JSON.stringify({ pubblica, privata }));
}

export async function assicuratiChiaveMia(): Promise<{ pubblica: string; privata: string; nuova: boolean }> {
  const presente = chiaveMia();
  if (presente) return { ...presente, nuova: false };
  const pair = await creaCoppia();
  salvaChiaveMia(pair.privata, pair.pubblica);
  return { ...pair, nuova: true };
}

export async function cifraFile(dataUrl: string): Promise<{ busta: string; nuova: boolean; codice: string }> {
  const pair = await assicuratiChiaveMia();
  return {
    busta: await cifra(pair.pubblica, dataUrl),
    nuova: pair.nuova,
    codice: JSON.stringify({ pubblica: pair.pubblica, privata: pair.privata }),
  };
}

export function importaChiaveMia(codice: string) {
  const parsed = JSON.parse(codice) as { pubblica?: string; privata?: string };
  if (!parsed.pubblica || !parsed.privata) throw new Error("Codice non valido.");
  salvaChiaveMia(parsed.privata, parsed.pubblica);
}

export async function decifraFile(busta: string): Promise<string> {
  if (!busta.startsWith("{")) return busta;
  const pair = chiaveMia();
  if (!pair) throw new Error("Su questo telefono non c'è la chiave dei file.");
  return decifra(pair.privata, busta);
}
