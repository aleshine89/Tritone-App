export type PuntoProfilo = { t: number; d: number };

export type UddfRiga = {
  data: string;
  ora: string;
  localita: string;
  punto: string;
  profondita: string;
  minuti: string;
  lat: string;
  lng: string;
  buddy: string;
  miscela: string;
  ossigeno: string;
  temperatura: string;
  note: string;
  profilo: PuntoProfilo[];
};

export type EsitoUddf = {
  uddf: boolean;
  immersioni: UddfRiga[];
  senzaData: number;
  oltre: number;
};

const MAX_IMMERSIONI = 2000;
const MAX_PUNTI = 800;

export function chiaveQuando(data: string, ora: string): string {
  return `${data}|${ora}`;
}

export function leggiUddf(xml: string): EsitoUddf {
  const vuoto: EsitoUddf = { uddf: false, immersioni: [], senzaData: 0, oltre: 0 };
  if (!xml || xml.length > 8_000_000) return vuoto;
  const pulito = pulisci(xml);
  const uddf = /<uddf\b/i.test(pulito) || /<dive\b/i.test(pulito);
  if (!uddf) return vuoto;
  const gas = gasDi(pulito);
  const siti = new Map<string, Sito>();
  for (const site of elementi(pulito, "site")) {
    const id = attr(site.attrs, "id");
    const name = testo(primo(site.inner, "name"));
    const geo = primoBlocco(site.inner, "geography");
    const punto = testo(primo(geo, "location"));
    const lat = coord(numero(primo(geo, "latitude")), -90, 90);
    const lng = coord(numero(primo(geo, "longitude")), -180, 180);
    if (id) siti.set(id, { name, punto: punto && punto !== name ? punto : "", lat, lng });
  }
  const immersioni: UddfRiga[] = [];
  let senzaData = 0;
  let oltre = 0;
  for (const dive of elementi(pulito, "dive")) {
    const before = primoBlocco(dive.inner, "informationbeforedive") || dive.inner;
    const after = primoBlocco(dive.inner, "informationafterdive");
    const samples = primoBlocco(dive.inner, "samples");
    const quando = dataOra(testo(primo(before, "datetime")) || testo(primo(dive.inner, "datetime")));
    if (!quando) {
      senzaData += 1;
      continue;
    }
    if (immersioni.length >= MAX_IMMERSIONI) {
      oltre += 1;
      continue;
    }
    const link = linkSito(before, siti);
    const beforeNudo = before.replace(/<buddy\b[\s\S]*?<\/buddy>/gi, "");
    const sito = (link && siti.get(link)) || {
      name: testo(primo(beforeNudo, "name")),
      punto: "",
      lat: "",
      lng: "",
    };
    const profilo = puntiDi(samples);
    const greatestdepth = numero(primo(after, "greatestdepth"));
    const dalProfilo = profilo.reduce((max, punto) => Math.max(max, punto.d), 0);
    const profondita = metri(greatestdepth != null && greatestdepth > 0 ? greatestdepth : dalProfilo);
    const sampleSec = profilo.length ? profilo[profilo.length - 1].t - profilo[0].t : 0;
    const durataTag = numero(primo(after, "diveduration"));
    const secondi = secondiDi(durataTag, sampleSec);
    const mix = mixDi(dive.inner, gas);
    const tempTag = numero(primo(after, "lowesttemperature")) ?? numero(primo(samples, "temperature"));
    const noteBlock = primoBlocco(after, "notes");
    const paras = elementi(noteBlock, "para").map((item) => testoNota(item.inner));
    const note = (paras.filter(Boolean).join("\n") || testoNota(noteBlock)).slice(0, 2000);
    const coppia = sito.lat && sito.lng ? { lat: sito.lat, lng: sito.lng } : { lat: "", lng: "" };
    immersioni.push({
      data: quando.data,
      ora: quando.ora,
      localita: (sito.name || "Sito non indicato").slice(0, 120),
      punto: sito.punto.slice(0, 120),
      profondita,
      minuti: minutiDaSecondi(secondi),
      lat: coppia.lat,
      lng: coppia.lng,
      buddy: buddyDi(dive.inner).slice(0, 80),
      miscela: mix.miscela,
      ossigeno: mix.ossigeno,
      temperatura: celsius(tempTag),
      note,
      profilo,
    });
  }
  return { uddf: true, immersioni, senzaData, oltre };
}

export function scriviUddf(righe: UddfRiga[]): string {
  const siti = new Map<string, { id: string; riga: UddfRiga }>();
  for (const riga of righe) {
    const chiave = `${riga.localita}|${riga.punto}|${riga.lat}|${riga.lng}`;
    if (!siti.has(chiave)) siti.set(chiave, { id: `s${siti.size + 1}`, riga });
  }
  const gas = new Map<string, { id: string; riga: UddfRiga }>();
  for (const riga of righe) {
    if (riga.miscela !== "Nitrox" && riga.miscela !== "Trimix" && !riga.ossigeno) continue;
    const chiave = `${riga.miscela}|${riga.ossigeno}`;
    if (!gas.has(chiave)) gas.set(chiave, { id: `g${gas.size + 1}`, riga });
  }
  const siteXml = [...siti.values()].map(({ id, riga }) => {
    const geo = [
      riga.punto ? `<location>${xml(riga.punto)}</location>` : "",
      riga.lat && riga.lng ? `<latitude>${xml(riga.lat)}</latitude><longitude>${xml(riga.lng)}</longitude>` : "",
    ].filter(Boolean).join("");
    return `<site id="${id}"><name>${xml(riga.localita)}</name>${geo ? `<geography>${geo}</geography>` : ""}</site>`;
  }).join("");
  const gasXml = [...gas.values()].map(({ id, riga }) => {
    const o2 = riga.ossigeno ? (Number(riga.ossigeno) / 100).toFixed(2) : "0.21";
    const he = riga.miscela === "Trimix" ? "<he>0</he>" : "";
    return `<mix id="${id}"><name>${xml(riga.miscela || "Nitrox")}</name><o2>${o2}</o2>${he}</mix>`;
  }).join("");
  const dives = righe.map((riga, index) => {
    const sito = siti.get(`${riga.localita}|${riga.punto}|${riga.lat}|${riga.lng}`);
    const mix = gas.get(`${riga.miscela}|${riga.ossigeno}`);
    const quando = riga.ora ? `${riga.data}T${riga.ora}:00` : riga.data;
    const prima = [
      sito ? `<link ref="${sito.id}"/>` : "",
      mix ? `<link ref="${mix.id}"/>` : "",
      `<datetime>${xml(quando)}</datetime>`,
      riga.buddy ? `<buddy><name>${xml(riga.buddy)}</name></buddy>` : "",
    ].join("");
    const samples = riga.profilo.length
      ? `<samples>${riga.profilo.map((punto) => `<waypoint><depth>${punto.d}</depth><divetime>${punto.t}</divetime></waypoint>`).join("")}</samples>`
      : "";
    const dopo = [
      riga.profondita ? `<greatestdepth>${xml(riga.profondita)}</greatestdepth>` : "",
      riga.minuti ? `<diveduration>${Math.round(Number(riga.minuti) * 60)}</diveduration>` : "",
      riga.temperatura ? `<lowesttemperature>${(Number(riga.temperatura) + 273.15).toFixed(2)}</lowesttemperature>` : "",
      riga.note ? `<notes><para>${xml(riga.note)}</para></notes>` : "",
    ].filter(Boolean).join("");
    return `<dive id="d${index + 1}"><informationbeforedive>${prima}</informationbeforedive>${samples}${dopo ? `<informationafterdive>${dopo}</informationafterdive>` : ""}</dive>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<uddf version="3.2.0" xmlns="http://www.streit.cc/uddf/3.2/"><generator><name>Tritone</name><type>logbook</type><version>1</version></generator>${siteXml ? `<divesite>${siteXml}</divesite>` : ""}${gasXml ? `<gasdefinitions>${gasXml}</gasdefinitions>` : ""}<profiledata><repetitiongroup id="rg1">${dives}</repetitiongroup></profiledata></uddf>\n`;
}

type Sito = { name: string; punto: string; lat: string; lng: string };
type Mix = { o2: number; he: number; name: string };

function pulisci(xml: string): string {
  return xml
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\sxmlns(?::[\w.-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/<(\/?)[\w.-]+:/g, "<$1");
}

function decode(text: string): string {
  const named: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, body: string) => {
    const key = body.toLowerCase();
    if (key in named) return named[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return all;
  });
}

function testo(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function testoNota(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function elementi(xml: string, tag: string): { attrs: string; inner: string }[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(re)].map((match) => ({ attrs: match[1] ?? "", inner: match[2] ?? "" }));
}

function primo(xml: string, tag: string): string {
  return elementi(xml, tag)[0]?.inner ?? "";
}

function primoBlocco(xml: string, tag: string): string {
  return elementi(xml, tag)[0]?.inner ?? "";
}

function linkSito(before: string, siti: Map<string, Sito>): string {
  for (const match of before.matchAll(/<link\b([^>]*)>/gi)) {
    const ref = attr(match[1] ?? "", "ref");
    if (ref && siti.has(ref)) return ref;
  }
  return "";
}

function attr(attrs: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return testo(match?.[1] ?? match?.[2] ?? "");
}

function numero(value: string): number | null {
  const cleaned = testo(value).replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function dataOra(value: string): { data: string; ora: string } | null {
  const match = /(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(value);
  if (!match || !dataValida(match[1])) return null;
  const hh = Number(match[2]);
  const mm = Number(match[3]);
  const ora = match[2] && match[3] && hh <= 23 && mm <= 59 ? `${match[2]}:${match[3]}` : "";
  return { data: match[1], ora };
}

function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(`${iso}T12:00:00Z`);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function coord(value: number | null, min: number, max: number): string {
  if (value == null || value < min || value > max) return "";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function metri(value: number): string {
  if (!(value > 0) || value > 400) return "";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function secondiDi(tag: number | null, sampleSec: number): number {
  if (tag == null) return sampleSec > 0 ? sampleSec : 0;
  if (sampleSec > 600 && tag < sampleSec / 10) return tag * 60;
  return tag;
}

function minutiDaSecondi(seconds: number): string {
  if (!(seconds > 0)) return "";
  const min = Math.round(seconds / 60);
  if (min <= 0) return "1";
  if (min > 1440) return "1440";
  return String(min);
}

function celsius(value: number | null): string {
  if (value == null) return "";
  const c = value > 150 ? value - 273.15 : value;
  if (c < -2 || c > 45) return "";
  const rounded = Math.round(c * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function puntiDi(samples: string): PuntoProfilo[] {
  const punti: PuntoProfilo[] = [];
  for (const waypoint of elementi(samples, "waypoint")) {
    const d = numero(primo(waypoint.inner, "depth"));
    const t = numero(primo(waypoint.inner, "divetime"));
    if (d == null || t == null || d < 0 || d > 400 || t < 0 || t > 200_000) continue;
    punti.push({ t: Math.round(t), d: Math.round(d * 100) / 100 });
  }
  punti.sort((a, b) => a.t - b.t);
  if (punti.length <= MAX_PUNTI) return punti;
  const out: PuntoProfilo[] = [];
  const step = (punti.length - 1) / (MAX_PUNTI - 1);
  for (let i = 0; i < MAX_PUNTI; i += 1) out.push(punti[Math.round(i * step)]);
  return out;
}

function gasDi(xml: string): Map<string, Mix> {
  const map = new Map<string, Mix>();
  for (const mix of elementi(xml, "mix")) {
    const id = attr(mix.attrs, "id");
    const o2raw = numero(primo(mix.inner, "o2"));
    const heraw = numero(primo(mix.inner, "he"));
    if (!id || o2raw == null) continue;
    map.set(id, {
      o2: o2raw > 1 ? o2raw / 100 : o2raw,
      he: heraw == null ? 0 : heraw > 1 ? heraw / 100 : heraw,
      name: testo(primo(mix.inner, "name")),
    });
  }
  return map;
}

function mixDi(dive: string, gas: Map<string, Mix>): { miscela: string; ossigeno: string } {
  let scelto: Mix | null = null;
  for (const match of dive.matchAll(/\bref\s*=\s*"([^"]+)"/gi)) {
    const item = gas.get(match[1] ?? "");
    if (item) {
      scelto = item;
      break;
    }
  }
  if (!scelto) return { miscela: "Aria", ossigeno: "" };
  const ossigeno = scelto.o2 > 0 ? String(Math.round(scelto.o2 * 100)) : "";
  if (/trimix/i.test(scelto.name) || scelto.he > 0.001) return { miscela: "Trimix", ossigeno };
  if (/nitrox|ean/i.test(scelto.name) || (scelto.o2 > 0.22 && scelto.o2 < 1)) return { miscela: "Nitrox", ossigeno };
  return { miscela: "Aria", ossigeno: "" };
}

function buddyDi(dive: string): string {
  const nomi = elementi(dive, "buddy").map((buddy) => {
    const first = testo(primo(buddy.inner, "firstname"));
    const last = testo(primo(buddy.inner, "lastname"));
    return [first, last].filter(Boolean).join(" ") || testo(primo(buddy.inner, "name"));
  }).filter(Boolean);
  return nomi.join(", ");
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;")
    .replace(/'/g, "&" + "apos;");
}
