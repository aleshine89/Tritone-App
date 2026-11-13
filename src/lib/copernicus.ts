import { Blosc } from "numcodecs";

const codec = Blosc.fromConfig({ id: "blosc", cname: "lz4", clevel: 5, shuffle: 1, blocksize: 0 });
const blocchi = new Map<string, Promise<Uint8Array>>();

type Campo = {
  chunks: number[];
  dtype: "<i2" | "<f4" | "<i4";
  fill: number;
  scale: number;
  offset: number;
};

export type Cubo = {
  base: string;
  lat: Float32Array;
  lon: Float32Array;
  tempo: Float64Array;
  origine: number;
  fattore: number;
  campi: Record<string, Campo>;
};

const cubi = new Map<string, Promise<Cubo>>();

export type FonteMare = { doi: string; prodotto: string };

async function scarica(url: string): Promise<Uint8Array> {
  let attesa = blocchi.get(url);
  if (!attesa) {
    attesa = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error("Dato non trovato.");
      const bytes = new Uint8Array(await res.arrayBuffer());
      return codec.decode(bytes);
    });
    blocchi.set(url, attesa);
  }
  return attesa;
}

function numeri(bytes: Uint8Array, dtype: Campo["dtype"]): Int16Array | Int32Array | Float32Array {
  const copia = bytes.slice();
  if (dtype === "<i2") return new Int16Array(copia.buffer);
  if (dtype === "<i4") return new Int32Array(copia.buffer);
  return new Float32Array(copia.buffer);
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Catalogo non letto.");
  return res.json() as Promise<T>;
}

async function arco(prodotto: string, include: string): Promise<{ base: string; doi: string }> {
  const scheda = await json<{ "sci:doi"?: string; links?: { href?: string }[] }>(
    `https://stac.marine.copernicus.eu/metadata/${prodotto}/product.stac.json`,
  );
  const hrefs = (scheda.links ?? [])
    .map((link) => link.href ?? "")
    .filter((href) => href.includes(include) && href.endsWith("dataset.stac.json"))
    .sort();
  for (const href of hrefs.reverse()) {
    const url = href.startsWith("http") ? href : `https://stac.marine.copernicus.eu/metadata/${prodotto}/${href}`;
    const dataset = await json<{ assets?: { geoChunked?: { href?: string } } }>(url);
    const base = dataset.assets?.geoChunked?.href;
    if (base) return { base, doi: scheda["sci:doi"] ?? "" };
  }
  throw new Error("Dataset senza lettura.");
}

function origineTempo(units: string): { origine: number; fattore: number } {
  const testo = units.trim().toLowerCase();
  const fattore = testo.startsWith("minutes") ? 60 : testo.startsWith("hours") ? 3600 : testo.startsWith("days") ? 86400 : 1;
  const trovato = units.match(/since\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
  const giorno = trovato?.[1] ?? "1970-01-01";
  const ora = trovato?.[2] ?? "00:00:00";
  return { origine: Date.parse(`${giorno}T${ora}Z`) / 1000, fattore };
}

export async function cuboPerGiorno(prodotto: string, include: string, variabili: string[], giorno: string): Promise<Cubo> {
  const scheda = await json<{ links?: { href?: string }[] }>(`https://stac.marine.copernicus.eu/metadata/${prodotto}/product.stac.json`);
  const hrefs = (scheda.links ?? [])
    .map((link) => link.href ?? "")
    .filter((href) => href.includes(include) && href.endsWith("dataset.stac.json"))
    .sort()
    .reverse();
  let ultimo: Cubo | null = null;
  for (const href of hrefs) {
    const url = href.startsWith("http") ? href : `https://stac.marine.copernicus.eu/metadata/${prodotto}/${href}`;
    const dataset = await json<{ assets?: { geoChunked?: { href?: string } } }>(url);
    const base = dataset.assets?.geoChunked?.href;
    if (!base) continue;
    const cubo = await apriBase(base, variabili);
    ultimo = cubo;
    if (oreDelGiorno(cubo, giorno).length) return cubo;
  }
  if (!ultimo) throw new Error("Dataset senza lettura.");
  return ultimo;
}

async function apriBase(base: string, variabili: string[]): Promise<Cubo> {
  const chiave = base;
  let attesa = cubi.get(chiave);
  if (!attesa) {
    attesa = (async () => {
      const meta = await json<{ metadata: Record<string, Record<string, unknown>> }>(`${base}/.zmetadata`);
      const campi: Record<string, Campo> = {};
      for (const nome of variabili) {
        const spec = meta.metadata[`${nome}/.zarray`];
        const attr = meta.metadata[`${nome}/.zattrs`] ?? {};
        if (!spec) continue;
        const dtype = spec.dtype;
        if (dtype !== "<i2" && dtype !== "<f4" && dtype !== "<i4") continue;
        campi[nome] = {
          chunks: spec.chunks as number[],
          dtype,
          fill: Number(attr.missing_value ?? attr._FillValue ?? spec.fill_value ?? NaN),
          scale: Number(attr.scale_factor ?? 1) || 1,
          offset: Number(attr.add_offset ?? 0) || 0,
        };
      }
      const tempoSpec = meta.metadata["time/.zarray"];
      const tempoAttr = meta.metadata["time/.zattrs"] ?? {};
      const { origine, fattore } = origineTempo(String(tempoAttr.units ?? "seconds since 1970-01-01"));
      const pezzi = Math.ceil(Number((tempoSpec.shape as number[])[0]) / Number((tempoSpec.chunks as number[])[0]));
      const dtypeTempo = String(tempoSpec.dtype);
      const liste: number[] = [];
      for (let i = 0; i < pezzi; i += 1) {
        const bytes = await scarica(`${base}/time/${i}`);
        const copia = bytes.slice();
        const grezzo = dtypeTempo === "<f8"
          ? new Float64Array(copia.buffer)
          : dtypeTempo.startsWith("<f")
            ? new Float32Array(copia.buffer)
            : new Int32Array(copia.buffer);
        for (const valore of grezzo) liste.push(Number(valore));
      }
      const [lat, lon] = await Promise.all([
        scarica(`${base}/latitude/0`).then((bytes) => numeri(bytes, "<f4") as Float32Array),
        scarica(`${base}/longitude/0`).then((bytes) => numeri(bytes, "<f4") as Float32Array),
      ]);
      return { base, lat, lon, tempo: Float64Array.from(liste), origine, fattore, campi };
    })();
    cubi.set(chiave, attesa);
  }
  return attesa;
}

function vicino(asse: Float32Array, valore: number): number {
  let indice = 0;
  let distanza = Number.POSITIVE_INFINITY;
  for (let i = 0; i < asse.length; i += 1) {
    const delta = Math.abs(asse[i] - valore);
    if (delta < distanza) {
      distanza = delta;
      indice = i;
    }
  }
  return indice;
}

function istante(cubo: Cubo, indice: number): number {
  const grezzo = cubo.tempo[indice];
  if (!Number.isFinite(grezzo) || grezzo <= 0) return 0;
  return cubo.origine + grezzo * cubo.fattore;
}

export function oreDelGiorno(cubo: Cubo, giorno: string): number[] {
  const inizio = Date.parse(`${giorno}T00:00:00Z`) / 1000;
  const fine = inizio + 86400;
  const indici: number[] = [];
  for (let i = 0; i < cubo.tempo.length; i += 1) {
    const quando = istante(cubo, i);
    if (quando >= inizio && quando < fine) indici.push(i);
  }
  return indici;
}

async function valore(cubo: Cubo, nome: string, t: number, y: number, x: number): Promise<number | null> {
  const campo = cubo.campi[nome];
  if (!campo) return null;
  const [ct, cy, cx] = campo.chunks;
  const url = `${cubo.base}/${nome}/${Math.floor(t / ct)}.${Math.floor(y / cy)}.${Math.floor(x / cx)}`;
  const serie = numeri(await scarica(url), campo.dtype);
  const offset = (t % ct) * cy * cx + (y % cy) * cx + (x % cx);
  const grezzo = Number(serie[offset]);
  if (!Number.isFinite(grezzo) || Math.abs(grezzo) > 1e6 || grezzo === campo.fill || grezzo <= -900) return null;
  return grezzo * campo.scale + campo.offset;
}

async function cellaUtile(cubo: Cubo, nome: string, t: number, y: number, x: number): Promise<{ y: number; x: number } | null> {
  if ((await valore(cubo, nome, t, y, x)) != null) return { y, x };
  const campo = cubo.campi[nome];
  if (!campo) return null;
  const cy = campo.chunks[1];
  const cx = campo.chunks[2];
  const y0 = Math.floor(y / cy) * cy;
  const x0 = Math.floor(x / cx) * cx;
  const yMin = Math.max(y0, y - 6);
  const yMax = Math.min(y0 + cy - 1, y + 6, cubo.lat.length - 1);
  const xMin = Math.max(x0, x - 6);
  const xMax = Math.min(x0 + cx - 1, x + 6, cubo.lon.length - 1);
  let scelta: { y: number; x: number; passi: number } | null = null;
  for (let yy = yMin; yy <= yMax; yy += 1) {
    for (let xx = xMin; xx <= xMax; xx += 1) {
      const passi = Math.abs(yy - y) + Math.abs(xx - x);
      if (passi === 0 || passi > 6) continue;
      if ((await valore(cubo, nome, t, yy, xx)) == null) continue;
      if (!scelta || passi < scelta.passi) scelta = { y: yy, x: xx, passi };
    }
  }
  return scelta;
}

export async function leggiSerie(
  cubo: Cubo,
  variabili: string[],
  lat: number,
  lon: number,
  tempi: number[],
): Promise<Record<string, Array<number | null>>> {
  const y = vicino(cubo.lat, lat);
  const x = vicino(cubo.lon, lon);
  const vuoto = Object.fromEntries(variabili.map((nome) => [nome, tempi.map(() => null)]));
  if (Math.abs(cubo.lat[y] - lat) > 0.3 || Math.abs(cubo.lon[x] - lon) > 0.3 || !tempi.length) return vuoto;
  const sonda = tempi[Math.min(tempi.length - 1, Math.floor(tempi.length / 2))];
  const cella = await cellaUtile(cubo, variabili[0], sonda, y, x);
  if (!cella) return vuoto;
  const fuori: Record<string, Array<number | null>> = {};
  await Promise.all(
    variabili.map(async (nome) => {
      fuori[nome] = await Promise.all(tempi.map((t) => valore(cubo, nome, t, cella.y, cella.x).catch(() => null)));
    }),
  );
  return fuori;
}

export async function seriePunto(
  prodotto: string,
  include: string,
  variabili: string[],
  lat: number,
  lon: number,
  tempi: number[],
): Promise<Record<string, Array<number | null>>> {
  return leggiSerie(await cuboMare(prodotto, include, variabili), variabili, lat, lon, tempi);
}

export async function cuboMare(prodotto: string, include: string, variabili: string[]): Promise<Cubo> {
  const { base } = await arco(prodotto, include);
  return apriBase(base, variabili);
}

export async function doiProdotto(prodotto: string): Promise<string> {
  const scheda = await json<{ "sci:doi"?: string }>(`https://stac.marine.copernicus.eu/metadata/${prodotto}/product.stac.json`);
  return scheda["sci:doi"] ?? "";
}
