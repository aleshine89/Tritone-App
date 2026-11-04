import { leggiUddf, type EsitoUddf, type PuntoProfilo, type UddfRiga } from "./uddf.ts";

const MAX_IMMERSIONI = 2000;
const MAX_PUNTI = 800;
const FIT_EPOCH = Date.UTC(1989, 11, 31);
const SPORT_DIVING = 53;
const SUB_IMMERSIONE = new Set([53, 54, 55, 56, 57, 63]);

type Campo = { num: number; size: number; base: number; dev: boolean; devIndex: number };
type Def = { little: boolean; global: number; campi: Campo[]; bytes: number };
type DevDesc = { name: string; units: string; scale: number; offset: number; base: number; nativeMesg: number | null; nativeField: number | null };
type Valore = number | string;
type Messaggio = { global: number; campi: Map<number, Valore>; dev: DevValore[] };
type DevValore = { name: string; units: string; nativeMesg: number | null; nativeField: number | null; value: Valore };

type Campione = { ts: number; profondita: number; lat: number | null; lng: number | null; temp: number | null };
type Gas = { o2: number | null; he: number | null; status: number | null };
type Blocco = {
  messageIndex: number | null;
  start: number | null;
  end: number | null;
  sport: number | null;
  sub: number | null;
  timer: number | null;
  elapsed: number | null;
  lat: number | null;
  lng: number | null;
  temp: number | null;
  sito: string;
  forza: boolean;
  summary: Riepilogo | null;
};
type Riepilogo = { refMesg: number | null; refIndex: number | null; max: number | null; bottom: number | null };

const vuoto = (): EsitoUddf => ({ uddf: false, immersioni: [], senzaData: 0, oltre: 0 });

export function leggiLogbook(bytes: Uint8Array): EsitoUddf {
  if (sembraFit(bytes)) return leggiFit(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  return leggiUddf(text);
}

export function sembraFit(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes.length > 8_000_000) return false;
  const header = bytes[0];
  if (header !== 12 && header !== 14) return false;
  return bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
}

export function leggiFit(bytes: Uint8Array): EsitoUddf {
  if (!sembraFit(bytes)) return vuoto();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = bytes[0];
  const dataSize = view.getUint32(4, true);
  const start = header;
  const end = start + dataSize;
  if (dataSize < 2 || end > bytes.length) return vuoto();

  const defs: (Def | undefined)[] = [];
  const devDesc = new Map<string, DevDesc>();
  const sessioni: Blocco[] = [];
  const giri: Blocco[] = [];
  const riepiloghi: Riepilogo[] = [];
  const campioni: Campione[] = [];
  const gas: Gas[] = [];
  let nomeSport = "";
  let scarto = 0;
  let ultimoTs = 0;
  let pos = start;
  let letti = 0;

  const num = (off: number, little: boolean, base: number, size: number): number | null => {
    const tipo = base & 0x1f;
    const width = larghezza(tipo);
    if (!width || size < width || off + width > bytes.length) return null;
    return leggiNumero(view, off, tipo, little);
  };

  const testo = (off: number, size: number): string => {
    let fine = off + size;
    for (let i = off; i < off + size && i < bytes.length; i += 1) {
      if (bytes[i] === 0) {
        fine = i;
        break;
      }
    }
    return new TextDecoder("utf-8").decode(bytes.subarray(off, fine)).replace(/\u0000/g, "").trim();
  };

  while (pos < end) {
    const headerByte = bytes[pos];
    if (headerByte & 0x80) {
      const local = (headerByte >> 5) & 0x03;
      const def = defs[local];
      if (!def) return letti ? esito(sessioni, giri, riepiloghi, campioni, gas, scarto) : vuoto();
      let ts = (ultimoTs & ~0x1f) + (headerByte & 0x1f);
      if (ts < ultimoTs) ts += 0x20;
      ultimoTs = ts;
      pos += 1;
      const size = byteMessaggio(def, true);
      if (pos + size > end) break;
      const msg = leggiMessaggio(view, pos, def, devDesc, num, testo, ts);
      pos += size;
      if (typeof msg.campi.get(253) === "number") ultimoTs = msg.campi.get(253) as number;
      accumula(msg, sessioni, giri, riepiloghi, campioni, gas, () => nomeSport, (nome) => { nomeSport = nome; }, (n) => { scarto = n; });
      letti += 1;
      continue;
    }
    if (headerByte & 0x40) {
      const local = headerByte & 0x0f;
      const conDev = (headerByte & 0x20) !== 0;
      if (pos + 6 > end) break;
      const little = bytes[pos + 2] === 0;
      const global = little ? view.getUint16(pos + 3, true) : view.getUint16(pos + 3, false);
      const nCampi = bytes[pos + 5];
      pos += 6;
      const campi: Campo[] = [];
      if (pos + nCampi * 3 > end) break;
      for (let i = 0; i < nCampi; i += 1) {
        campi.push({ num: bytes[pos], size: bytes[pos + 1], base: bytes[pos + 2], dev: false, devIndex: 0 });
        pos += 3;
      }
      if (conDev) {
        if (pos >= end) break;
        const nDev = bytes[pos];
        pos += 1;
        if (pos + nDev * 3 > end) break;
        for (let i = 0; i < nDev; i += 1) {
          campi.push({ num: bytes[pos], size: bytes[pos + 1], base: 0, dev: true, devIndex: bytes[pos + 2] });
          pos += 3;
        }
      }
      defs[local] = { little, global, campi, bytes: campi.reduce((sum, campo) => sum + campo.size, 0) };
      continue;
    }
    const def = defs[headerByte & 0x0f];
    if (!def) return letti ? esito(sessioni, giri, riepiloghi, campioni, gas, scarto) : vuoto();
    pos += 1;
    if (pos + def.bytes > end) break;
    const msg = leggiMessaggio(view, pos, def, devDesc, num, testo, null);
    pos += def.bytes;
    if (typeof msg.campi.get(253) === "number") ultimoTs = msg.campi.get(253) as number;
    accumula(msg, sessioni, giri, riepiloghi, campioni, gas, () => nomeSport, (nome) => { nomeSport = nome; }, (n) => { scarto = n; });
    letti += 1;
  }
  if (!letti) return vuoto();
  return esito(sessioni, giri, riepiloghi, campioni, gas, scarto);
}

function leggiMessaggio(
  view: DataView,
  pos: number,
  def: Def,
  devDesc: Map<string, DevDesc>,
  num: (off: number, little: boolean, base: number, size: number) => number | null,
  testo: (off: number, size: number) => string,
  oraCompressa: number | null,
): Messaggio {
  const campi = new Map<number, Valore>();
  const dev: DevValore[] = [];
  let cursor = pos;
  for (const campo of def.campi) {
    if (oraCompressa != null && !campo.dev && campo.num === 253) {
      campi.set(253, oraCompressa);
      continue;
    }
    if (campo.dev) {
      const desc = devDesc.get(`${campo.devIndex}:${campo.num}`);
      if (desc) {
        const tipo = desc.base & 0x1f;
        const valore = tipo === 7 ? testo(cursor, campo.size) : num(cursor, def.little, desc.base, campo.size);
        if (valore != null && valore !== "") {
          dev.push({
            name: desc.name,
            units: desc.units,
            nativeMesg: desc.nativeMesg,
            nativeField: desc.nativeField,
            value: typeof valore === "number" ? valore / (desc.scale > 0 ? desc.scale : 1) - desc.offset : valore,
          });
        }
      }
    } else {
      const tipo = campo.base & 0x1f;
      const valore = tipo === 7 ? testo(cursor, campo.size) : num(cursor, def.little, campo.base, campo.size);
      if (valore != null && valore !== "") campi.set(campo.num, valore);
    }
    cursor += campo.size;
  }
  if (oraCompressa != null && !campi.has(253)) campi.set(253, oraCompressa);
  if (def.global === 206) ricordaDev(campi, devDesc);
  return { global: def.global, campi, dev };
}

function byteMessaggio(def: Def, compressa: boolean): number {
  if (!compressa) return def.bytes;
  const timestamp = def.campi.find((campo) => !campo.dev && campo.num === 253);
  return def.bytes - (timestamp?.size ?? 0);
}

function ricordaDev(campi: Map<number, Valore>, devDesc: Map<string, DevDesc>) {
  const index = campi.get(0);
  const num = campi.get(1);
  if (typeof index !== "number" || typeof num !== "number") return;
  const base = campi.get(2);
  const scale = campi.get(6);
  const offset = campi.get(7);
  const nativeMesg = campi.get(14);
  const nativeField = campi.get(15);
  devDesc.set(`${index}:${num}`, {
    name: typeof campi.get(3) === "string" ? String(campi.get(3)) : "",
    units: typeof campi.get(8) === "string" ? String(campi.get(8)) : "",
    scale: typeof scale === "number" ? scale : 1,
    offset: typeof offset === "number" ? offset : 0,
    base: typeof base === "number" ? base : 0,
    nativeMesg: typeof nativeMesg === "number" ? nativeMesg : null,
    nativeField: typeof nativeField === "number" ? nativeField : null,
  });
}

function accumula(
  msg: Messaggio,
  sessioni: Blocco[],
  giri: Blocco[],
  riepiloghi: Riepilogo[],
  campioni: Campione[],
  gas: Gas[],
  nome: () => string,
  setNome: (nome: string) => void,
  setScarto: (n: number) => void,
) {
  if (msg.global === 34) {
    const utc = msg.campi.get(253);
    const local = msg.campi.get(5);
    if (typeof utc === "number" && typeof local === "number") setScarto(local - utc);
    return;
  }
  if (msg.global === 12) {
    if (typeof msg.campi.get(3) === "string") setNome(String(msg.campi.get(3)));
    return;
  }
  if (msg.global === 18 || msg.global === 19) {
    const blocco = bloccoDi(msg, nome());
    if (msg.global === 18) sessioni.push(blocco);
    else giri.push(blocco);
    return;
  }
  if (msg.global === 268) {
    riepiloghi.push({
      refMesg: numero(msg.campi.get(0)),
      refIndex: numero(msg.campi.get(1)),
      max: scalaMille(msg.campi.get(3)),
      bottom: scalaMille(msg.campi.get(11)),
    });
    return;
  }
  if (msg.global === 259) {
    gas.push({ o2: numero(msg.campi.get(1)), he: numero(msg.campi.get(0)), status: numero(msg.campi.get(2)) });
    return;
  }
  if (msg.global === 20 && campioni.length < 20_000) {
    const profondita = profonditaRecord(msg);
    if (profondita == null) return;
    const ts = numero(msg.campi.get(253));
    if (ts == null) return;
    campioni.push({
      ts,
      profondita,
      lat: gradi(msg.campi.get(0), 90),
      lng: gradi(msg.campi.get(1), 180),
      temp: temperatura(msg.campi.get(13)),
    });
  }
}

function bloccoDi(msg: Messaggio, sito: string): Blocco {
  const sitoDev = msg.dev.find((item) => typeof item.value === "string" && /^(site|location|dive_site|spot)$/i.test(item.name.trim()));
  return {
    messageIndex: numero(msg.campi.get(254)),
    start: numero(msg.campi.get(2)),
    end: numero(msg.campi.get(253)),
    sport: numero(msg.campi.get(msg.global === 19 ? 25 : 5)),
    sub: numero(msg.campi.get(msg.global === 19 ? 39 : 6)),
    timer: scalaMille(msg.campi.get(8)),
    elapsed: scalaMille(msg.campi.get(7)),
    lat: gradi(msg.campi.get(3), 90),
    lng: gradi(msg.campi.get(4), 180),
    temp: temperatura(msg.campi.get(msg.global === 19 ? 50 : 57)),
    sito: sitoDev && typeof sitoDev.value === "string" ? sitoDev.value : sito,
    forza: false,
    summary: null,
  };
}

function esito(sessioni: Blocco[], giri: Blocco[], riepiloghi: Riepilogo[], campioni: Campione[], gas: Gas[], scarto: number): EsitoUddf {
  const candidati = scegliImmersioni(sessioni, giri, riepiloghi);
  const mix = mixDi(gas);
  const immersioni: UddfRiga[] = [];
  let senzaData = 0;
  let oltre = 0;
  for (const blocco of candidati) {
    const quando = blocco.start == null ? null : dataOra(blocco.start, scarto);
    if (!quando) {
      senzaData += 1;
      continue;
    }
    if (immersioni.length >= MAX_IMMERSIONI) {
      oltre += 1;
      continue;
    }
    const finestra = finestraDi(blocco);
    const punti = finestra ? profiloDi(campioni, finestra.start, finestra.end) : [];
    const dalProfilo = punti.reduce((max, punto) => Math.max(max, punto.d), 0);
    const profondita = metri(blocco.summary?.max && blocco.summary.max > 0 ? blocco.summary.max : dalProfilo);
    const secondi = blocco.timer ?? blocco.elapsed ?? blocco.summary?.bottom ?? (punti.length ? punti[punti.length - 1].t - punti[0].t : 0);
    const gps = primoGps(blocco, campioni, finestra);
    const tempPunti = punti.length ? tempMin(campioni, finestra) : null;
    immersioni.push({
      data: quando.data,
      ora: quando.ora,
      localita: localitaDi(blocco.sito),
      punto: "",
      profondita,
      minuti: minutiDaSecondi(secondi),
      lat: gps.lat,
      lng: gps.lng,
      buddy: "",
      miscela: mix.miscela,
      ossigeno: mix.ossigeno,
      temperatura: celsius(tempPunti ?? blocco.temp),
      note: "",
      profilo: punti,
    });
  }
  return { uddf: true, immersioni, senzaData, oltre };
}

function scegliImmersioni(sessioni: Blocco[], giri: Blocco[], riepiloghi: Riepilogo[]): Blocco[] {
  const sessioniDive = sessioni.filter((blocco) => immersione(blocco));
  const base = sessioniDive.length ? sessioniDive : giri.filter((blocco) => immersione(blocco));
  aggancia(base.length ? base : sessioni.filter((blocco) => !sportAltro(blocco)), riepiloghi);
  const forzate = sessioni.filter((blocco) => blocco.forza || immersione(blocco));
  if (forzate.length) return forzate;
  const giriDive = giri.filter((blocco) => blocco.forza || immersione(blocco));
  return giriDive;
}

function aggancia(blocchi: Blocco[], riepiloghi: Riepilogo[]) {
  const usati = new Set<Riepilogo>();
  for (const riepilogo of riepiloghi) {
    if (riepilogo.refIndex == null) continue;
    const indice = riepilogo.refIndex & 0x0fff;
    const target = blocchi.find((blocco) => blocco.messageIndex != null && (blocco.messageIndex & 0x0fff) === indice && !sportAltro(blocco));
    if (!target || (riepilogo.refMesg != null && riepilogo.refMesg !== 18 && riepilogo.refMesg !== 19)) continue;
    target.summary = riepilogo;
    target.forza = true;
    usati.add(riepilogo);
  }
  const aperti = riepiloghi.filter((riepilogo) => !usati.has(riepilogo));
  const senza = blocchi.filter((blocco) => !blocco.summary && !sportAltro(blocco));
  if (aperti.length === 1 && senza.length === 1) {
    senza[0].summary = aperti[0];
    senza[0].forza = true;
    return;
  }
  const dive = senza.filter((blocco) => immersione(blocco) || blocco.forza);
  const dest = dive.length ? dive : senza.length === aperti.length ? senza : [];
  dest.forEach((blocco, index) => {
    if (!aperti[index]) return;
    blocco.summary = aperti[index];
    if (!sportAltro(blocco)) blocco.forza = true;
  });
}

function immersione(blocco: Blocco): boolean {
  if (blocco.sport === SPORT_DIVING) return true;
  return blocco.sub != null && SUB_IMMERSIONE.has(blocco.sub);
}

function sportAltro(blocco: Blocco): boolean {
  if (blocco.sport == null || blocco.sport === 0 || blocco.sport === SPORT_DIVING || blocco.sport === 254) return false;
  return !(blocco.sub != null && SUB_IMMERSIONE.has(blocco.sub));
}

function finestraDi(blocco: Blocco): { start: number; end: number } | null {
  if (blocco.start == null) return null;
  const dur = blocco.timer ?? blocco.elapsed ?? blocco.summary?.bottom ?? 0;
  const end = blocco.end != null && blocco.end >= blocco.start ? blocco.end : blocco.start + Math.max(0, dur);
  return { start: blocco.start, end: Math.max(end, blocco.start) };
}

function profiloDi(campioni: Campione[], start: number, end: number): PuntoProfilo[] {
  const punti = campioni
    .filter((campione) => campione.ts >= start - 1 && campione.ts <= end + 1)
    .map((campione) => ({ t: Math.max(0, Math.round(campione.ts - start)), d: Math.round(campione.profondita * 100) / 100 }))
    .sort((a, b) => a.t - b.t);
  if (punti.length <= MAX_PUNTI) return punti;
  const out: PuntoProfilo[] = [];
  const step = (punti.length - 1) / (MAX_PUNTI - 1);
  for (let i = 0; i < MAX_PUNTI; i += 1) out.push(punti[Math.round(i * step)]);
  return out;
}

function tempMin(campioni: Campione[], finestra: { start: number; end: number } | null): number | null {
  if (!finestra) return null;
  let min: number | null = null;
  for (const campione of campioni) {
    if (campione.temp == null || campione.ts < finestra.start - 1 || campione.ts > finestra.end + 1) continue;
    min = min == null ? campione.temp : Math.min(min, campione.temp);
  }
  return min;
}

function primoGps(blocco: Blocco, campioni: Campione[], finestra: { start: number; end: number } | null): { lat: string; lng: string } {
  let lat = blocco.lat;
  let lng = blocco.lng;
  if ((lat == null || lng == null) && finestra) {
    const campione = campioni.find((item) => item.lat != null && item.lng != null && item.ts >= finestra.start - 1 && item.ts <= finestra.end + 1);
    lat = campione?.lat ?? null;
    lng = campione?.lng ?? null;
  }
  if (lat == null || lng == null) return { lat: "", lng: "" };
  return { lat: coord(lat, -90, 90), lng: coord(lng, -180, 180) };
}

function profonditaRecord(msg: Messaggio): number | null {
  const standard = msg.campi.get(92);
  if (typeof standard === "number") {
    const metriStandard = standard / 1000;
    if (metriStandard >= 0 && metriStandard <= 400) return metriStandard;
  }
  for (const item of msg.dev) {
    if (typeof item.value !== "number") continue;
    const nativo = item.nativeMesg === 20 && item.nativeField === 92;
    const nome = /^(enhanced_)?depth$/i.test(item.name.trim());
    if (!nativo && !nome) continue;
    const metriDev = metriUnita(item.value, item.units);
    if (metriDev != null) return metriDev;
  }
  return null;
}

function metriUnita(value: number, units: string): number | null {
  const u = units.toLowerCase();
  let metri = u.includes("mm") ? value / 1000 : value;
  if (metri > 400 && metri <= 400_000) metri /= 1000;
  if (metri < 0 || metri > 400) return null;
  return metri;
}

function mixDi(gas: Gas[]): { miscela: string; ossigeno: string } {
  const utile = gas.filter((item) => item.status !== 0);
  const scelto = utile.find((item) => item.status === 1) ?? utile[0];
  if (!scelto) return { miscela: "Aria", ossigeno: "" };
  const he = scelto.he ?? 0;
  const o2 = scelto.o2 ?? 21;
  if (he > 0) return { miscela: "Trimix", ossigeno: o2 > 0 && o2 <= 100 ? String(Math.round(o2)) : "" };
  if (o2 > 21 && o2 <= 100) return { miscela: "Nitrox", ossigeno: String(Math.round(o2)) };
  return { miscela: "Aria", ossigeno: "" };
}

function localitaDi(nome: string): string {
  const pulito = nome.replace(/\s+/g, " ").trim();
  if (!pulito || /^(diving|dive|immersione|apnea|scuba|gauge|ccr|rebreather|single[ _-]?gas(?: diving)?|multi[ _-]?gas(?: diving)?)$/i.test(pulito)) {
    return "Sito non indicato";
  }
  return pulito.slice(0, 120);
}

function dataOra(fitSeconds: number, scarto: number): { data: string; ora: string } | null {
  const ms = FIT_EPOCH + (fitSeconds + scarto) * 1000;
  const data = new Date(ms);
  const year = data.getUTCFullYear();
  const month = data.getUTCMonth() + 1;
  const day = data.getUTCDate();
  if (year < 1990 || year > 2100) return null;
  const hh = data.getUTCHours();
  const mm = data.getUTCMinutes();
  return {
    data: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    ora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
  };
}

function larghezza(tipo: number): number {
  if (tipo === 0 || tipo === 1 || tipo === 2 || tipo === 10 || tipo === 13) return 1;
  if (tipo === 3 || tipo === 4 || tipo === 11) return 2;
  if (tipo === 5 || tipo === 6 || tipo === 8 || tipo === 12) return 4;
  if (tipo === 9 || tipo === 14 || tipo === 15 || tipo === 16) return 8;
  return 0;
}

function leggiNumero(view: DataView, offset: number, tipo: number, little: boolean): number | null {
  switch (tipo) {
    case 0:
    case 2:
    case 10:
    case 13: {
      const value = view.getUint8(offset);
      return value === 0xff ? null : value;
    }
    case 1: {
      const value = view.getInt8(offset);
      return value === 0x7f ? null : value;
    }
    case 3: {
      const value = view.getInt16(offset, little);
      return value === 0x7fff ? null : value;
    }
    case 4:
    case 11: {
      const value = view.getUint16(offset, little);
      return value === 0xffff ? null : value;
    }
    case 5: {
      const value = view.getInt32(offset, little);
      return value === 0x7fffffff ? null : value;
    }
    case 6:
    case 12: {
      const value = view.getUint32(offset, little);
      return value === 0xffffffff ? null : value;
    }
    case 8: {
      const value = view.getFloat32(offset, little);
      return Number.isFinite(value) ? value : null;
    }
    default:
      return null;
  }
}

function numero(value: Valore | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function scalaMille(value: Valore | undefined): number | null {
  if (typeof value !== "number") return null;
  const scaled = value / 1000;
  return scaled > 0 ? scaled : null;
}

function gradi(value: Valore | undefined, limite: number): number | null {
  if (typeof value !== "number" || value === 0x7fffffff) return null;
  const deg = value * (180 / 2147483648);
  if (Math.abs(deg) > limite) return null;
  return deg;
}

function temperatura(value: Valore | undefined): number | null {
  if (typeof value !== "number" || value < -2 || value > 45) return null;
  return value;
}

function metri(value: number): string {
  if (!(value > 0) || value > 400) return "";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function minutiDaSecondi(seconds: number): string {
  if (!(seconds > 0)) return "";
  const min = Math.round(seconds / 60);
  if (min <= 0) return "1";
  if (min > 1440) return "1440";
  return String(min);
}

function celsius(value: number | null): string {
  if (value == null || value < -2 || value > 45) return "";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function coord(value: number, min: number, max: number): string {
  if (value < min || value > max) return "";
  return value.toFixed(6).replace(/\.?0+$/, "");
}
