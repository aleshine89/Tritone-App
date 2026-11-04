import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireSpeciePro } from "@/lib/fondale.functions";

export type SpecieFoto = { url: string; autore: string };

export type SchedaSpecie = {
  nome: string;
  scientifico: string;
  gruppo: string;
  testo: string;
  segno: string;
  foto: SpecieFoto[];
  scheda: string;
};

export type Riconoscimento =
  | { marino: false; messaggio: string }
  | { marino: true; probabile: boolean; opzioni: SchedaSpecie[]; domanda?: DomandaSpecie };

export type DomandaSpecie = { testo: string; si: string; no: string };

const UA = "DivingHub/1.0 (quaderno di bordo; educational)";

const MARINE = new Set([
  "Actinopterygii",
  "Chondrichthyes",
  "Elasmobranchii",
  "Mollusca",
  "Gastropoda",
  "Nudibranchia",
  "Bivalvia",
  "Cephalopoda",
  "Polyplacophora",
  "Cnidaria",
  "Scyphozoa",
  "Hydrozoa",
  "Anthozoa",
  "Cubozoa",
  "Staurozoa",
  "Echinodermata",
  "Asteroidea",
  "Echinoidea",
  "Holothuroidea",
  "Crinoidea",
  "Ophiuroidea",
  "Porifera",
  "Annelida",
  "Polychaeta",
  "Platyhelminthes",
  "Ctenophora",
  "Bryozoa",
  "Nemertea",
  "Brachiopoda",
  "Crustacea",
  "Malacostraca",
  "Decapoda",
  "Ascidiacea",
  "Tunicata",
  "Thaliacea",
  "Cetacea",
  "Pinnipedia",
  "Sirenia",
  "Chelonioidea",
  "Pycnogonida",
  "Chaetognatha",
  "Hemichordata",
  "Cheloniidae",
  "Dermochelyidae",
  "Urochordata",
  "Hexacorallia",
  "Octocorallia",
  "Scleractinia",
  "Teleostei",
  "Osteichthyes",
  "Heterobranchia",
  "Opisthobranchia",
  "Polycladida",
  "Rhabditophora",
  "Sipuncula",
  "Stomatopoda",
  "Amphipoda",
  "Copepoda",
  "Thecostraca",
  "Rhodophyta",
  "Phaeophyceae",
  "Chlorophyta",
  "Ulvophyceae",
  "Posidonia",
  "Zostera",
  "Cymodocea",
]);

const GRUPPO: [string, string][] = [
  ["Rhodophyta", "Alga rossa"],
  ["Phaeophyceae", "Alga bruna"],
  ["Chlorophyta", "Alga verde"],
  ["Posidonia", "Pianta marina"],
  ["Nudibranchia", "Nudibranco"],
  ["Platyhelminthes", "Verme piatto"],
  ["Ascidiacea", "Tunicato"],
  ["Tunicata", "Tunicato"],
  ["Cubozoa", "Medusa"],
  ["Scyphozoa", "Medusa"],
  ["Hydrozoa", "Idrozoo"],
  ["Anthozoa", "Corallo o anemone"],
  ["Cnidaria", "Cnidario"],
  ["Cephalopoda", "Cefalopode"],
  ["Bivalvia", "Bivalve"],
  ["Polyplacophora", "Chitone"],
  ["Gastropoda", "Mollusco"],
  ["Mollusca", "Mollusco"],
  ["Decapoda", "Crostaceo"],
  ["Malacostraca", "Crostaceo"],
  ["Crustacea", "Crostaceo"],
  ["Actinopterygii", "Pesce"],
  ["Elasmobranchii", "Squalo o razza"],
  ["Chondrichthyes", "Squalo o razza"],
  ["Echinoidea", "Riccio di mare"],
  ["Asteroidea", "Stella marina"],
  ["Holothuroidea", "Cetriolo di mare"],
  ["Ophiuroidea", "Stella serpentina"],
  ["Echinodermata", "Echinoderma"],
  ["Porifera", "Spugna"],
  ["Polychaeta", "Verme"],
  ["Annelida", "Verme"],
  ["Cetacea", "Cetaceo"],
  ["Chelonioidea", "Tartaruga marina"],
  ["Pycnogonida", "Ragno di mare"],
];

type Taxon = {
  id: number;
  name: string;
  rank?: string;
  preferred_common_name?: string;
  iconic_taxon_name?: string;
  wikipedia_summary?: string;
  ancestors?: { name?: string; preferred_common_name?: string; rank?: string }[];
  taxon_photos?: { photo?: Photo }[];
  default_photo?: Photo;
};

type Photo = {
  license_code?: string | null;
  attribution?: string;
  medium_url?: string;
  large_url?: string;
  url?: string;
};

function accorcia(text: string): string {
  if (text.length <= 700) return text;
  const cut = text.slice(0, 700);
  const dot = cut.lastIndexOf(". ");
  return `${(dot > 280 ? cut.slice(0, dot + 1) : cut).trim()}…`;
}

function plain(html: string): string {
  const amp = String.fromCharCode(38);
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(new RegExp(`${amp}nbsp;`, "g"), " ")
    .replace(new RegExp(`${amp}amp;`, "g"), amp)
    .replace(new RegExp(`${amp}quot;`, "g"), '"')
    .replace(new RegExp(`${amp}#39;`, "g"), "'")
    .replace(new RegExp(`${amp}apos;`, "g"), "'")
    .replace(/\s+/g, " ")
    .trim();
}

function gruppoDi(taxon: Taxon): string {
  const names = [taxon.name, ...(taxon.ancestors ?? []).map((item) => item.name ?? "")];
  for (const [latin, label] of GRUPPO) {
    if (names.includes(latin)) return label;
  }
  return "Organismo marino";
}

function marino(taxon: Taxon): boolean {
  const names = new Set([taxon.name, taxon.iconic_taxon_name ?? "", ...(taxon.ancestors ?? []).map((item) => item.name ?? "")]);
  for (const name of names) if (MARINE.has(name)) return true;
  return false;
}

function fotoOk(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "inaturalist-open-data.s3.amazonaws.com" || host === "static.inaturalist.org";
  } catch {
    return false;
  }
}

function grande(url: string): string {
  return url.replace("/square.", "/large.").replace("/small.", "/large.").replace("/medium.", "/large.");
}

function raccogli(photos: Photo[]): SpecieFoto[] {
  const out: SpecieFoto[] = [];
  const seen = new Set<string>();
  for (const photo of photos) {
    if (!photo.license_code) continue;
    const raw = photo.large_url || photo.medium_url || photo.url;
    if (!raw || !fotoOk(raw)) continue;
    const url = grande(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, autore: (photo.attribution || "iNaturalist").replace(/\s+/g, " ").trim() });
    if (out.length >= 6) break;
  }
  return out;
}

async function leggi(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Il database delle specie non risponde.");
  return response.json();
}

async function taxonPieno(id: number): Promise<Taxon | null> {
  const body = (await leggiMorbido(`https://api.inaturalist.org/v1/taxa/${id}?locale=it`, 6000)) as { results?: Taxon[] } | null;
  return body?.results?.[0] ?? null;
}

type Suggerimento = { id: number; name: string; rank?: string; matched_term?: string };

function pulisci(nome: string): string {
  return nome
    .replace(/[(),]/g, " ")
    .replace(/\b(cf|aff|sp|spp|subsp|var)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stesso(a: string, b: string): boolean {
  return pulisci(a).toLowerCase() === pulisci(b).toLowerCase();
}

async function leggiMorbido(url: string, ms = 15000): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(ms),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function suggerimenti(q: string): Promise<Suggerimento[]> {
  const body = (await leggiMorbido(
    `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(q)}&locale=it&per_page=6&is_active=true`,
    5000,
  )) as { results?: Suggerimento[] } | null;
  return body?.results ?? [];
}

async function nomeAccettato(nome: string): Promise<string | null> {
  const body = await leggiMorbido(
    `https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(binomio(nome))}?like=false&marine_only=true`,
    5000,
  );
  const rows = Array.isArray(body)
    ? (body as { valid_name?: string; scientificname?: string }[])
    : [];
  const valido = rows.find((row) => row.valid_name)?.valid_name || rows.find((row) => row.scientificname)?.scientificname;
  return valido ? binomio(valido) : null;
}

async function nomeGbif(nome: string): Promise<string | null> {
  const body = (await leggiMorbido(
    `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(binomio(nome))}&kingdom=Animalia`,
  )) as { canonicalName?: string; confidence?: number; matchType?: string } | null;
  if (!body?.canonicalName) return null;
  if ((body.confidence ?? 0) < 90 && body.matchType !== "EXACT") return null;
  return binomio(body.canonicalName);
}

async function nomeEol(nome: string): Promise<string | null> {
  const body = (await leggiMorbido(
    `https://eol.org/api/search/1.0.json?q=${encodeURIComponent(binomio(nome))}&page=1&exact=true`,
    8000,
  )) as { results?: { title?: string }[] } | null;
  const title = body?.results?.find((item) => item.title && item.title.split(" ").length >= 2)?.title;
  return title ? binomio(title) : null;
}

async function nomeItis(nome: string): Promise<string | null> {
  const body = (await leggiMorbido(
    `https://www.itis.gov/ITISWebService/jsonservice/searchByScientificName?srchKey=${encodeURIComponent(binomio(nome))}`,
    8000,
  )) as { scientificNames?: { combinedName?: string }[] } | null;
  const title = body?.scientificNames?.find((item) => item.combinedName && item.combinedName.split(" ").length >= 2)?.combinedName;
  return title ? binomio(title) : null;
}

function binomio(nome: string): string {
  const parts = pulisci(nome).split(" ").filter(Boolean);
  return parts.slice(0, 2).join(" ");
}

async function cerca(nome: string): Promise<{ taxon: Taxon; exact: boolean } | null> {
  const clean = binomio(pulisci(nome));
  if (clean.length < 3) return null;
  const [hits0, worms] = await Promise.all([suggerimenti(clean), nomeAccettato(clean)]);
  const via = binomio(worms || clean);
  const hits = stesso(via, clean) ? hits0 : [...(await suggerimenti(via)), ...hits0];
  const base = clean.toLowerCase();
  const accettato = via.toLowerCase();
  const hit =
    hits.find(
      (item) =>
        stesso(item.name, via) ||
        stesso(item.matched_term ?? "", via) ||
        stesso(item.name, clean) ||
        stesso(item.matched_term ?? "", clean) ||
        pulisci(item.name).toLowerCase() === accettato,
    ) ??
    hits.find((item) => {
      const name = pulisci(item.name).toLowerCase();
      const matched = pulisci(item.matched_term ?? "").toLowerCase();
      return name.startsWith(`${base} `) || matched === base || matched.startsWith(`${base} `);
    });
  if (!hit) return null;
  const taxon = await taxonPieno(hit.id);
  if (!taxon) return null;
  const exact = stesso(taxon.name, clean) || stesso(hit.matched_term ?? "", clean) || stesso(taxon.name, via);
  return { taxon, exact };
}

async function specieVicine(genus: string): Promise<Taxon[]> {
  const hits = await suggerimenti(genus);
  const species = hits
    .filter((item) => item.rank === "species" && pulisci(item.name).toLowerCase().startsWith(`${genus.toLowerCase()} `))
    .slice(0, 4);
  const full = await Promise.all(species.map((item) => taxonPieno(item.id)));
  return full.filter((item): item is Taxon => Boolean(item && marino(item)));
}

async function schedaDi(taxon: Taxon, segno: string): Promise<SchedaSpecie> {
  const proprie = (taxon.taxon_photos ?? []).map((item) => item.photo).filter((item): item is Photo => Boolean(item));
  if (taxon.default_photo) proprie.unshift(taxon.default_photo);
  let foto = raccogli(proprie);
  if (foto.length < 1) foto = raccogli([...proprie, ...(await altreFoto(taxon.id))]);
  return {
    nome: nomeItaliano(taxon) || taxon.preferred_common_name || taxon.name,
    scientifico: taxon.name,
    gruppo: gruppoDi(taxon),
    testo: notaDi(taxon) || accorcia(plain(taxon.wikipedia_summary ?? "")) || "Nel database c'è il nome e il gruppo, ma non una scheda descrittiva.",
    segno,
    foto: foto.slice(0, 4),
    scheda: `https://www.inaturalist.org/taxa/${taxon.id}`,
  };
}

async function altreFoto(id: number): Promise<Photo[]> {
  const body = (await leggiMorbido(
    `https://api.inaturalist.org/v1/observations?taxon_id=${id}&photos=true&quality_grade=research&per_page=8&order_by=votes&locale=it`,
  )) as { results?: { photos?: Photo[] }[] } | null;
  return (body?.results ?? []).flatMap((row) => row.photos ?? []);
}

export const fotoCatalogo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const nome = String((input as { nome?: unknown } | null)?.nome ?? "").trim().slice(0, 80);
    if (!/^[A-Za-z][A-Za-z .'-]{2,78}$/.test(nome)) throw new Error("Specie non valida.");
    return { nome };
  })
  .handler(async ({ context, data }): Promise<{ url: string }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const body = (await leggiMorbido(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(data.nome)}&per_page=5&is_active=true`,
      6000,
    )) as { results?: Taxon[] } | null;
    const taxon = (body?.results ?? []).find((item) => item.name?.toLowerCase() === data.nome.toLowerCase()) ?? body?.results?.[0];
    const photo = taxon?.default_photo;
    if (!photo?.license_code) return { url: "" };
    const raw = photo.medium_url || photo.url || "";
    if (!raw || !fotoOk(raw)) return { url: "" };
    return { url: grande(raw) };
  });

export const riconosciSpecie = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = input as { data?: unknown; nota?: unknown } | null;
    if (typeof body?.data !== "string") throw new Error("Serve una foto.");
    const jpeg = fotoNormale(body.data);
    if (!jpeg) throw new Error("La foto non è arrivata bene. Sceglila di nuovo dalla galleria.");
    if (jpeg.length > 700_000) throw new Error("La foto è troppo pesante. Avvicina e riprova.");
    const nota = typeof body.nota === "string" ? body.nota.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    return { data: jpeg, nota, scartate: nomiBrevi(body && "scartate" in body ? body.scartate : [], 8), memoria: memoriaBreve(body && "memoria" in body ? body.memoria : []) };
  })
  .handler(async ({ data }): Promise<Riconoscimento> => {
    const apiKey = chiaveGemini();
    if (!apiKey) throw new Error("Manca la chiave di Gemini. Aggiungila nei segreti dell'app, con il nome GEMINI_API_KEY.");

    let primo = (await chiedi(apiKey, data.data, data.nota, data.scartate, data.memoria)).filter((item) => !escluso(item.nome, data.scartate));
    if (!primo.length) {
      primo = (await chiediAlternative(apiKey, data.data)).filter((item) => !escluso(item.nome, data.scartate));
    }
    const unici = (await risolvi(primo.slice(0, 3))).filter((item) => !escluso(item.scheda.scientifico, data.scartate));
    if (!unici.length) {
      return {
        marino: false,
        messaggio: data.scartate.length
          ? "Questi nomi non vanno bene e non ne vedo un altro. Aggiungi un dettaglio nel campo e tocca Cerca."
          : ultimoErrore || "Non riesco a capire di che organismo si tratta. Avvicina, con più luce, e riprova.",
      };
    }

    const notaCoppia = unici.length >= 2 ? domandaNota(unici[0].scheda.scientifico, unici[1].scheda.scientifico) : undefined;
    const domanda =
      notaCoppia ??
      (unici.length >= 2 && !unici[0].alta
        ? {
            testo: `Non è ancora sicuro. È ${unici[0].scheda.nome}, oppure somiglia di più a ${unici[1].scheda.nome}?`,
            si: unici[0].scheda.scientifico,
            no: unici[1].scheda.scientifico,
          }
        : undefined);
    return {
      marino: true,
      probabile: Boolean(unici[0]?.alta) && !domanda,
      opzioni: unici.map((item) => item.scheda),
      domanda,
    };
  });

type Candidato = { nome: string; alta: boolean; segno: string };

function nomiBrevi(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const nome = item.replace(/[^A-Za-zÀ-ÿ .'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
    if (nome.length < 3 || out.some((seen) => seen.toLowerCase() === nome.toLowerCase())) continue;
    out.push(nome);
    if (out.length >= max) break;
  }
  return out;
}

function memoriaBreve(value: unknown): { sbagliato: string; giusto: string; nota: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { sbagliato: string; giusto: string; nota: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { sbagliato?: unknown; giusto?: unknown; nota?: unknown };
    const sbagliato = nomiBrevi([row.sbagliato], 1)[0];
    const giusto = nomiBrevi([row.giusto], 1)[0];
    if (!sbagliato || !giusto) continue;
    const nota = typeof row.nota === "string" ? row.nota.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    out.push({ sbagliato, giusto, nota });
    if (out.length >= 8) break;
  }
  return out;
}

function escluso(nome: string, scartate: string[]): boolean {
  const key = nome.toLowerCase();
  return scartate.some((item) => key.includes(item.toLowerCase()) || item.toLowerCase().includes(key));
}

async function chiedi(
  apiKey: string,
  image: string,
  nota: string,
  scartate: string[],
  memoria: { sbagliato: string; giusto: string; nota: string }[],
): Promise<Candidato[]> {
  ultimoErrore = "";
  const contesto = nota
    ? ` Note di chi ha scattato, da usare insieme alla foto: luogo, parte visibile e dettagli che in foto non si vedono. Se indicano un mare diverso dall'Adriatico, rispetta quel luogo. Note: ${nota}`
    : "";
  const esclusi = scartate.length ? ` Non proporre queste specie, sono sbagliate: ${scartate.join(", ")}.` : "";
  const gia = memoria.length
    ? ` Correzioni già confermate da chi usa l'app, da rispettare se i segni coincidono: ${memoria
        .map((item) => `${item.sbagliato} era sbagliata, il giusto è ${item.giusto}${item.nota ? ` (nota: ${item.nota})` : ""}`)
        .join("; ")}.`
    : "";
  const text =
    "Identifica l'organismo marino nella foto. Nome dell'animale, non della parte. Fino a 3 binomi reali, il più probabile prima. Non inventare. " +
    "Mantello bianco vellutato, trattini o punti neri, rinofori e ciuffo branchiale neri o bruno-neri, senza cerata: prima Jorunna parva, poi Jorunna tomentosa. Non è Felimare né uno spirografo. " +
    "Solo se i segni coincidono: lamelle chiare con linea gialla e senza tubo = Felimare picta. Filamenti che escono da un tubo = Sabella spallanzanii. Cerata scure ramificate e cresta fra i rinofori = Antiopella cristata. Tentacoli orali lunghissimi e lisci = Caloria quatrefagesi, non Cratena peregrina." +
    contesto +
    esclusi +
    gia +
    ' Solo JSON: {"candidati":[{"scientificName":"Genus species","confidence":"alta","segno":"breve"}]}';
  const raw = (await leggiVisione(apiKey, [image], text, 16000)) ?? "";
  if (!raw.trim()) return [];
  return candidatiDa(raw);
}

async function chiediAlternative(apiKey: string, image: string): Promise<Candidato[]> {
  const text =
    "Seconda lettura, indipendente dalla prima. Descrivi i segni che vedi e elenca fino a 4 specie marine possibili, compresi i sosia meno comuni. Non scegliere il nome più famoso se i segni non coincidono. Rispondi solo JSON: {\"candidati\":[{\"scientificName\":\"Genus species\",\"confidence\":\"bassa\",\"segno\":\"max 80 caratteri\"}]} senza duplicati.";
  const raw = (await leggiVisione(apiKey, [image], text, 12000)) ?? "";
  if (!raw.trim()) return [];
  return candidatiDa(raw).map((item) => ({ ...item, alta: false }));
}

function unisci(prima: Candidato[], seconda: Candidato[]): Candidato[] {
  const visti = new Set<string>();
  const out: Candidato[] = [];
  for (const item of [...prima, ...seconda]) {
    const key = item.nome.toLowerCase();
    if (!key || visti.has(key)) continue;
    visti.add(key);
    out.push(item);
    if (out.length >= 6) break;
  }
  return out;
}

let ultimoErrore = "";

const COPPIE: { a: string; b: string; testo: string; si: string; no: string }[] = [
  {
    a: "jorunna parva",
    b: "jorunna tomentosa",
    testo: "Rinofori e ciuffo branchiale erano neri, con trattini scuri sul mantello bianco? Se sì è Jorunna parva, se no Jorunna tomentosa.",
    si: "jorunna parva",
    no: "jorunna tomentosa",
  },
  {
    a: "periclimenes amethysteus",
    b: "alpheus dentipes",
    testo: "Una chela era molto più grande dell'altra?",
    si: "alpheus dentipes",
    no: "periclimenes amethysteus",
  },
  {
    a: "periclimenes amethysteus",
    b: "alpheus macrocheles",
    testo: "Una chela era molto più grande dell'altra?",
    si: "alpheus macrocheles",
    no: "periclimenes amethysteus",
  },
  {
    a: "periclimenes amethysteus",
    b: "periclimenes scriptus",
    testo: "Era su un'anemone, con bande violacee nette sull'addome?",
    si: "periclimenes amethysteus",
    no: "periclimenes scriptus",
  },
  {
    a: "caloria quatrefagesi",
    b: "cratena peregrina",
    testo: "I tentacoli orali erano lunghissimi, lisci e bianchi?",
    si: "caloria quatrefagesi",
    no: "cratena peregrina",
  },
  {
    a: "felimare villafranca",
    b: "felimare tricolor",
    testo: "Il bordo del mantello era arancio, con una sola linea arancio in mezzo?",
    si: "felimare villafranca",
    no: "felimare tricolor",
  },
  {
    a: "leptogorgia sarmentosa",
    b: "paramuricea clavata",
    testo: "I rami erano lunghi e irregolari, arancio, non un ventaglio viola?",
    si: "leptogorgia sarmentosa",
    no: "paramuricea clavata",
  },
  {
    a: "leptogorgia sarmentosa",
    b: "eunicella cavolini",
    testo: "La colonia era arancio, con rami lunghi e irregolari?",
    si: "leptogorgia sarmentosa",
    no: "eunicella cavolini",
  },
];

async function affinaConFoto(
  apiKey: string,
  foto: string,
  voci: { alta: boolean; scheda: SchedaSpecie }[],
): Promise<{ probabile: boolean; opzioni: SchedaSpecie[]; domanda?: DomandaSpecie }> {
  let lista = voci;
  let probabile = Boolean(lista[0]?.alta);
  let proposta: DomandaSpecie | undefined;
  if (lista.length >= 2) {
    const esito = await confronta(apiKey, foto, lista.slice(0, 3));
    if (esito?.nome) {
      lista = mettiPrimo(lista, esito.nome);
      probabile = esito.sicuro;
    }
    proposta = esito?.domanda;
  }
  const domanda = probabile ? undefined : proposta ?? domandaNota(lista[0]?.scheda.scientifico ?? "", lista[1]?.scheda.scientifico ?? "");
  return { probabile, opzioni: lista.map((item) => item.scheda), domanda };
}

async function confronta(
  apiKey: string,
  foto: string,
  voci: { scheda: SchedaSpecie }[],
): Promise<{ nome: string; sicuro: boolean; domanda?: DomandaSpecie } | null> {
  const usabili = voci.filter((item) => item.scheda.foto[0]?.url?.startsWith("https://"));
  if (usabili.length < 2) return null;
  const elenco = usabili.map((item, index) => `${index + 1}. ${item.scheda.scientifico}`).join("\n");
  const text =
    "La prima immagine è la foto del sub. Le immagini dopo sono foto vere di specie diverse, in questo ordine:\n" +
    elenco +
    '\nScegli il numero della foto vera che ha gli stessi segni della foto del sub. Non scegliere il nome più comune se i segni non combaciano. Se non sei sicuro, sicuro=false e scrivi una sola domanda sì/no, in italiano, che distingua i due più simili. Rispondi solo JSON: {"scelta":1,"sicuro":false,"domanda":"Era su un\'anemone?","si":1,"no":2}. scelta 0 se nessuna somiglia.';
  const raw = await leggiVisione(
    apiKey,
    [foto, ...usabili.map((item) => item.scheda.foto[0].url)],
    text,
    16000,
  );
  const parsed = raw ? jsonOggetto(raw) : null;
  if (!parsed) return null;
  const scelta = Number(parsed.scelta);
  const nome = scelta >= 1 && scelta <= usabili.length ? usabili[scelta - 1].scheda.scientifico : "";
  const si = Number(parsed.si);
  const no = Number(parsed.no);
  const testo = typeof parsed.domanda === "string" ? parsed.domanda.replace(/\s+/g, " ").trim() : "";
  const domanda =
    testo.length >= 8 &&
    testo.length <= 160 &&
    si >= 1 &&
    no >= 1 &&
    si !== no &&
    si <= usabili.length &&
    no <= usabili.length
      ? { testo, si: usabili[si - 1].scheda.scientifico, no: usabili[no - 1].scheda.scientifico }
      : undefined;
  return { nome, sicuro: parsed.sicuro === true && Boolean(nome), domanda };
}

function mettiPrimo<T extends { scheda: SchedaSpecie }>(voci: T[], nome: string): T[] {
  const index = voci.findIndex((item) => item.scheda.scientifico.toLowerCase() === nome.toLowerCase());
  if (index <= 0) return voci;
  const next = [...voci];
  const [item] = next.splice(index, 1);
  next.unshift(item);
  return next;
}

function domandaNota(primo: string, secondo: string): DomandaSpecie | undefined {
  const a = primo.toLowerCase();
  const b = secondo.toLowerCase();
  const row = COPPIE.find((item) => (item.a === a && item.b === b) || (item.a === b && item.b === a));
  if (!row) return;
  const si = row.si === a ? primo : row.si === b ? secondo : "";
  const no = row.no === a ? primo : row.no === b ? secondo : "";
  if (!si || !no) return;
  return { testo: row.testo, si, no };
}

function jsonOggetto(raw: string): Record<string, unknown> | null {
  const pulito = raw.replace(/```json|```/g, "").trim();
  try {
    const value = JSON.parse(pulito) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    const match = pulito.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const value = JSON.parse(match[0]) as unknown;
      return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

async function leggiVisione(apiKey: string, immagini: string[], text: string, attesa = 25000): Promise<string | null> {
  try {
    const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [{ text }];
    for (const url of immagini) {
      const foto = await parteImmagine(url);
      if (foto) parts.push(foto);
    }
    if (parts.length < 2) {
      ultimoErrore = "La foto non è arrivata bene. Sceglila di nuovo dalla galleria.";
      return null;
    }
    const contents = [{ parts: parts.map((part) => (part.text ? { text: part.text } : { inline_data: part.inline_data })) }];
    const models = ["gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash"];
    let ultimo = "";
    for (const model of models) {
      const esito = await unaLettura(apiKey, model, contents, attesa);
      if (esito.testo) return esito.testo;
      if (esito.errore) ultimo = esito.errore;
      if (esito.stop) break;
    }
    ultimoErrore = ultimo || "Non ho letto la foto. Tocca Riprova.";
    return null;
  } catch (reason) {
    ultimoErrore = motivoRete(reason);
    return null;
  }
}

async function unaLettura(
  apiKey: string,
  model: string,
  contents: { parts: ({ text: string } | { inline_data: { mime_type: string; data: string } | undefined })[] }[],
  attesa: number,
): Promise<{ testo?: string; errore?: string; stop?: boolean }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
  try {
    let chat = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(attesa),
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 400, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (chat.status === 400) {
      chat = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(attesa),
        body: JSON.stringify({ contents }),
      });
    }
    if (!chat.ok) {
      return { errore: await testoErrore(chat), stop: chat.status !== 404 && chat.status !== 400 };
    }
    const payload = (await chat.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const testo = payload.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    return testo ? { testo } : { errore: "Gemini non ha dato un nome." };
  } catch (reason) {
    return { errore: motivoRete(reason) };
  }
}

function motivoRete(reason: unknown): string {
  const error = reason instanceof Error ? reason : null;
  const cause = error?.cause instanceof Error ? error.cause.message : "";
  const message = `${error?.name ?? ""} ${error?.message ?? ""} ${cause}`;
  if (/timeout|aborted|abort/i.test(message)) return "Gemini ci ha messo troppo. Tocca Riprova.";
  if (/header|invalid character/i.test(message)) return "La chiave ha uno spazio o un a capo. Incollala di nuovo nei segreti.";
  if (/ENOTFOUND|ECONN|fetch failed|network/i.test(message)) return "Da qui non raggiungo Gemini. Tocca Riprova tra un momento.";
  return "Non ho letto la foto. Tocca Riprova.";
}

async function leggiInterazione(
  apiKey: string,
  parts: { text?: string; inline_data?: { mime_type: string; data: string } }[],
  attesa: number,
): Promise<string | null> {
  try {
    const chat = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(attesa),
      body: JSON.stringify({
        model: "gemini-3.8-flash",
        input: parts.map((part) => (part.text ? { type: "text", text: part.text } : { type: "image", mime_type: "image/jpeg", data: part.inline_data?.data })),
      }),
    });
    if (!chat.ok) {
      ultimoErrore = await testoErrore(chat);
      return null;
    }
    const payload = (await chat.json()) as {
      output_text?: string;
      steps?: { content?: { type?: string; text?: string }[] }[];
    };
    const daiPassi = (payload.steps ?? [])
      .flatMap((step) => step.content ?? [])
      .map((item) => item.text ?? "")
      .join("")
      .trim();
    return payload.output_text?.trim() || daiPassi || null;
  } catch {
    return null;
  }
}

async function parteImmagine(url: string): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  if (url.startsWith("data:image/")) {
    const jpeg = fotoNormale(url);
    if (!jpeg) return null;
    const body = jpeg.slice(jpeg.indexOf(",") + 1).replace(/\s/g, "");
    return { inline_data: { mime_type: "image/jpeg", data: body } };
  }
  if (!url.startsWith("https://")) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 1_200_000) return null;
    const mime = type.includes("png") ? "image/png" : type.includes("webp") ? "image/webp" : "image/jpeg";
    return { inline_data: { mime_type: mime, data: bytes.toString("base64") } };
  } catch {
    return null;
  }
}

async function testoErrore(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    const raw = body.error;
    const message =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "message" in raw && typeof raw.message === "string"
          ? raw.message
          : "";
    if (response.status === 401 || response.status === 403 || /api key|permission|unauth|denied/i.test(message)) {
      return "La chiave di Gemini non è accettata. Nei segreti il nome deve essere GEMINI_API_KEY, poi pubblica di nuovo.";
    }
    if (response.status === 429 || /quota|exhausted|billing/i.test(message)) {
      return "Gemini ha finito le richieste per oggi. Riprova più tardi.";
    }
    if (response.status === 404) return "Questo modello di Gemini non c'è più.";
    if (/jpeg|jpg|png|image|base64|dimension/i.test(message)) {
      return "La foto non è arrivata bene. Sceglila di nuovo dalla galleria.";
    }
    return "Non ho letto la foto. Tocca Riprova.";
  } catch {
    return `Non ho letto la foto (${response.status}). Avvicina e tocca Riprova.`;
  }
}

function candidatiDa(raw: string): Candidato[] {
  const pulito = raw.replace(/```json|```/g, "").trim();
  let guess: unknown;
  try {
    guess = JSON.parse(pulito);
  } catch {
    const match = pulito.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      guess = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const root = guess && typeof guess === "object" ? (guess as Record<string, unknown>) : {};
  const lista = listaDi(root);
  const mare = typeof root.mare === "string" ? root.mare.toLowerCase() : "";
  const visti = new Set<string>();
  const out = lista
    .map((item) => ({
      nome: nomeDi(item),
      alta: item.confidence === "alta" || item.confidenza === "alta",
      segno: segnoOk(item.segno ?? item.note ?? item.sign),
    }))
    .filter((item) => {
      const key = item.nome.toLowerCase();
      if (!item.nome || visti.has(key)) return false;
      visti.add(key);
      return true;
    });
  if (mare !== "tropicale" && out.some((item) => /goniobranchus (kuniei|geminus)/i.test(item.nome)) && !visti.has("felimida luteorosea")) {
    out.unshift({ nome: "Felimida luteorosea", alta: true, segno: "Macchie gialle cerchiate di bianco e bordo giallo, su roccia" });
    for (const item of out) {
      if (/goniobranchus/i.test(item.nome)) item.alta = false;
    }
  }
  affiancaSosia(out);
  return out.slice(0, 4);
}

function affiancaSosia(out: Candidato[]) {
  const ha = (nome: string) => out.some((item) => item.nome.toLowerCase().includes(nome));
  if ((ha("sabella") || ha("bispira")) && !ha("felimare picta")) {
    const segni = out.map((item) => item.segno).join(" ").toLowerCase();
    if (!/tubo/.test(segni)) {
      out.unshift({ nome: "Felimare picta", alta: false, segno: "Ciuffo branchiale piumato con linea gialla, senza tubo" });
      if (!ha("felimare villafranca")) out.push({ nome: "Felimare villafranca", alta: false, segno: "Branchie blu con linea gialla" });
      for (const item of out) {
        if (/sabella|bispira/i.test(item.nome)) item.alta = false;
      }
    }
  }
  if (ha("janolus cristatus") || ha("janolus cristata")) {
    const i = out.findIndex((item) => /janolus cristat/i.test(item.nome));
    if (i >= 0) out.splice(i, 1);
    if (!ha("antiopella cristata")) {
      out.unshift({
        nome: "Antiopella cristata",
        alta: true,
        segno: "Cerata giallo-arancio con disegno scuro ramificato e cresta fra i rinofori",
      });
    }
  }
  if (ha("facelina quatrefagesi")) {
    const i = out.findIndex((item) => /facelina quatrefagesi/i.test(item.nome));
    if (i >= 0) out.splice(i, 1);
    if (!ha("caloria quatrefagesi")) {
      out.unshift({ nome: "Caloria quatrefagesi", alta: true, segno: "Tentacoli orali lunghissimi e lisci, cerata arancio con punta chiara" });
    }
  }
  const segnoModello = out.map((item) => item.segno).join(" ").toLowerCase();
  if (ha("cratena peregrina") && !ha("caloria quatrefagesi")) {
    out.push({ nome: "Caloria quatrefagesi", alta: false, segno: "Tentacoli orali lunghissimi e lisci, cerata arancio con punta chiara" });
  } else if (ha("caloria quatrefagesi") && !ha("cratena peregrina")) {
    out.push({ nome: "Cratena peregrina", alta: false, segno: "Rinofori anulati, linee bianche sul corpo, tentacoli più corti" });
  }
  if (ha("caloria quatrefagesi") && ha("cratena peregrina")) {
    const caloria = out.findIndex((item) => /caloria quatrefagesi/i.test(item.nome));
    const cratena = out.findIndex((item) => /cratena peregrina/i.test(item.nome));
    if (/tentacol|lunghissim|lisci/.test(segnoModello) && caloria > cratena && caloria >= 0) {
      const [item] = out.splice(caloria, 1);
      out.unshift(item);
    }
    for (const item of out) {
      if (/caloria quatrefagesi|cratena peregrina/i.test(item.nome)) item.alta = false;
    }
  }
  const gorgonia = out.some((item) => /leptogorgia|paramuricea|eunicella|muricea|eunicea|antillogorgia|plexaura|gorgonia /i.test(item.nome));
  if (gorgonia && !ha("leptogorgia sarmentosa")) {
    out.push({ nome: "Leptogorgia sarmentosa", alta: false, segno: "Colonia arancio, rami lunghi e irregolari" });
  }
  if (ha("leptogorgia sarmentosa") && /arancio|arancione|orange|irregol|mattone/.test(segnoModello)) {
    const i = out.findIndex((item) => /leptogorgia sarmentosa/i.test(item.nome));
    if (i > 0) {
      const [item] = out.splice(i, 1);
      out.unshift(item);
    }
  }
  const gamberoTropicale = /thor amboinensis|alpheus bellulus|lysmata amboinensis|saron marmoratus|stenopus hispidus/;
  const sembraPistola = ha("alpheus dentipes") || ha("alpheus macrocheles") || ha("athanas nitescens") || out.some((item) => gamberoTropicale.test(item.nome.toLowerCase()));
  if (sembraPistola && !ha("periclimenes amethysteus")) {
    out.unshift({ nome: "Periclimenes amethysteus", alta: false, segno: "Bande violacee, antenne lunghe, chele piccole" });
  }
  if (ha("periclimenes amethysteus") && !ha("periclimenes scriptus")) {
    out.push({ nome: "Periclimenes scriptus", alta: false, segno: "Più trasparente, disegni viola diversi" });
  }
  if (ha("periclimenes amethysteus") && (ha("alpheus dentipes") || ha("alpheus macrocheles") || ha("athanas nitescens"))) {
    if (!/chela grande|pistola|diseguali/.test(segnoModello)) {
      const i = out.findIndex((item) => /periclimenes amethysteus/i.test(item.nome));
      if (i > 0) {
        const [item] = out.splice(i, 1);
        out.unshift(item);
      }
    }
    for (const item of out) {
      if (/periclimenes amethysteus|alpheus dentipes|alpheus macrocheles|athanas nitescens/i.test(item.nome)) item.alta = false;
    }
  }
  if (ha("hypselodoris villafranca") && !ha("felimare villafranca")) {
    out.unshift({ nome: "Felimare villafranca", alta: false, segno: "Nome accettato: doride di Villafranca" });
  }
  if (ha("felimare tricolor") && !ha("felimare villafranca")) {
    out.unshift({ nome: "Felimare villafranca", alta: false, segno: "Blu-nero, bordo e linea mediana arancio, rinofori scuri" });
  } else if (ha("felimare villafranca") && !ha("felimare tricolor")) {
    out.push({ nome: "Felimare tricolor", alta: false, segno: "Blu con tre linee giallo-bianco-giallo" });
  }
  if (!ha("felimare tricolor") || !ha("felimare villafranca")) return;
  const segno = out.map((item) => item.segno).join(" ").toLowerCase();
  const villa = out.findIndex((item) => /villafranca/i.test(item.nome));
  const tri = out.findIndex((item) => /tricolor/i.test(item.nome));
  if (/arancio|arancione/.test(segno) && villa > tri && villa >= 0) {
    const [item] = out.splice(villa, 1);
    out.unshift(item);
  }
  for (const item of out) {
    if (/felimare (tricolor|villafranca)/i.test(item.nome)) item.alta = false;
  }
}

function listaDi(root: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ["candidati", "candidates", "results", "species"]) {
    const value = root[key];
    if (Array.isArray(value) && value.length) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }
  if (nomeDi(root)) return [root];
  return [];
}

const SCHEDE: Record<string, { nome: string; testo: string }> = {
  "caloria quatrefagesi": {
    nome: "Caloria di Quatrefages",
    testo: "Nudibranco dell'Adriatico e del Mediterraneo. Corpo trasparente, tentacoli orali e rinofori lunghissimi, lisci e bianchi, cerata arancio o rossi con la punta chiara. Non è Cratena peregrina: quella ha i rinofori anulati, linee bianche sul corpo e tentacoli più corti. Il vecchio nome è Facelina quatrefagesi.",
  },
  "cratena peregrina": {
    nome: "Cratena pellegrina",
    testo: "Nudibranco mediterraneo con cerata arancio a punta bianca, rinofori anulati e linee bianche sul corpo. I tentacoli sono più corti di quelli di Caloria quatrefagesi.",
  },
  "felimida luteorosea": {
    nome: "Luteorosea",
    testo: "Nudibranco del Mediterraneo, rosa o viola, con macchie gialle cerchiate di bianco e bordo del mantello giallo. Vive sulla roccia.",
  },
  "felimare villafranca": {
    nome: "Doride di Villafranca",
    testo: "Nudibranco mediterraneo blu-nero. Il bordo del mantello e la linea mediana del dorso sono arancio o gialli; i rinofori sono scuri. Si confonde con Felimare tricolor, che ha tre linee longitudinali giallo-bianco-giallo più nette. Il nome accettato è Felimare villafranca.",
  },
  "antiopella cristata": {
    nome: "Janolo crestato",
    testo: "Nudibranco dell'Adriatico e del Mediterraneo. I cerata sono a clava, giallo-arancio e trasparenti: dentro ognuno si vede un disegno scuro ramificato e la punta è spesso bianca. Fra i rinofori c'è una cresta piumata. Non è un corallo. Il nome accettato è Antiopella cristata; prima si chiamava Janolus cristatus.",
  },
  "cladocora caespitosa": {
    nome: "Madrepora a cuscino",
    testo: "Corallo duro del Mediterraneo e dell'Adriatico. Forma cuscini di polipi grandi, marroni o verdastri, con lo scheletro chiaro. È la madrepora coloniale più comune su roccia e prateria.",
  },
  "balanophyllia europaea": {
    nome: "Madrepora molare",
    testo: "Corallo solitario del Mediterraneo. Un solo polipo ovale, marrone o verde, incrostato sulla roccia. Si distingue da Leptopsammia pruvoti, che è più giallo-arancio e vive spesso all'ombra.",
  },
  "leptopsammia pruvoti": {
    nome: "Madrepora gialla",
    testo: "Corallo solitario mediterraneo, giallo-arancio, tipico di grotte e soffitti. Il polipo è allungato. Non va confuso con i coralli tropicali.",
  },
  "felimare picta": {
    nome: "Doride dipinta",
    testo: "Nudibranco dell'Adriatico e del Mediterraneo. Il ciuffo branchiale è una corona di lamelle piumate, chiare, con una linea gialla su ogni asse. Non è uno spirografo: quello ha filamenti sottili che escono da un tubo. Si confonde con Felimare villafranca e Felimare tricolor.",
  },
  "sabella spallanzanii": {
    nome: "Spirografo",
    testo: "Verme tubicolo dell'Adriatico e del Mediterraneo. Il ciuffo esce da un tubo ed è fatto di filamenti sottili, non di lamelle piumate con la linea gialla: quello è il ciuffo di un nudibranco, spesso Felimare picta.",
  },
  "bispira volutacornis": {
    nome: "Verme pavone",
    testo: "Verme tubicolo mediterraneo con un ciuffo branchiale a spirale, spesso più regolare di quello dello spirografo. Vive in un tubo sulla roccia.",
  },
  "periclimenes amethysteus": {
    nome: "Gamberetto ametista",
    testo: "Gamberetto dell'Adriatico e del Mediterraneo, spesso sull'anemone o in una fessura. È snello, trasparente o beige, con bande scure e violacee sull'addome, antenne lunghe e chele piccole. Non è un gambero pistola: Alpheus ha una chela molto più grande dell'altra. Il sosia è Periclimenes scriptus.",
  },
  "periclimenes scriptus": {
    nome: "Gamberetto delle anemoni",
    testo: "Gamberetto mediterraneo delle anemoni, più trasparente di Periclimenes amethysteus, con disegni viola diversi e senza le stesse bande sull'addome.",
  },
  "alpheus dentipes": {
    nome: "Gambero pistola",
    testo: "Crostaceo dell'Adriatico e del Mediterraneo, nelle fessure. Si riconosce dalla chela grande, molto più dell'altra, che se scatta fa un suono secco. Non è Periclimenes amethysteus, che ha le chele piccole e le bande violacee.",
  },
  "alpheus macrocheles": {
    nome: "Gambero pistola maggiore",
    testo: "Gambero pistola del Mediterraneo, più robusto, con una chela molto grande. Vive in tane, spesso insieme a un ghiozzo. L'addome può essere fasciato.",
  },
  "athanas nitescens": {
    nome: "Gamberetto di fessura",
    testo: "Piccolo gamberetto mediterraneo delle fessure, con bande sul corpo e antenne lunghe. È più piccolo di Alpheus dentipes.",
  },
  "leptogorgia sarmentosa": {
    nome: "Gorgonia arancione",
    testo: "Gorgonia dell'Adriatico e del Mediterraneo. La colonia è arancio o rosso mattone, con rami lunghi, sottili e irregolari, spesso su più piani. Non è la gorgonia rossa (Paramuricea clavata), che fa un ventaglio più fitto e viola, né la gorgonia gialla (Eunicella cavolini), con rami più corti.",
  },
  "eunicella cavolini": {
    nome: "Gorgonia gialla",
    testo: "Gorgonia del Mediterraneo, a ventaglio, gialla o arancio, con rami fitti. In Adriatico è una delle gorgonie più comuni. Il sosia più chiaro è Eunicella singularis.",
  },
  "paramuricea clavata": {
    nome: "Gorgonia rossa",
    testo: "Gorgonia mediterranea a ventaglio, rossa, viola o bicolore, su pareti in corrente. Non è un corallo tropicale.",
  },
  "corallium rubrum": {
    nome: "Corallo rosso",
    testo: "Corallo prezioso del Mediterraneo. Colonie ramificate, rosso vivo, spesso in grotte e sotto i tetti. I polipi bianchi sono piccoli.",
  },
  "felimare tricolor": {
    nome: "Doride tricolore",
    testo: "Nudibranco mediterraneo blu, con tre linee longitudinali sul dorso: gialla, bianca e gialla. I rinofori sono blu-viola. Il sosia è Felimare villafranca, con bordo e linea mediana più arancio.",
  },
};

function notaDi(taxon: Taxon): string {
  return SCHEDE[taxon.name.toLowerCase()]?.testo ?? "";
}

function nomeItaliano(taxon: Taxon): string {
  return SCHEDE[taxon.name.toLowerCase()]?.nome ?? "";
}

function nomeDi(item: Record<string, unknown>): string {
  for (const key of ["scientificName", "scientific_name", "name", "taxon", "species"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

type Zona = "adriatico" | "mediterraneo" | "mondo";

const ZONA_TESTO: Record<Zona, string> = {
  adriatico: "Segnalata in Adriatico",
  mediterraneo: "Nel Mediterraneo",
  mondo: "Fuori dal Mediterraneo",
};

async function contaGbif(nome: string, lat: string, lon: string): Promise<number> {
  const body = (await leggiMorbido(
    `https://api.gbif.org/v1/occurrence/search?scientificName=${encodeURIComponent(binomio(nome))}&decimalLatitude=${lat}&decimalLongitude=${lon}&limit=0`,
    8000,
  )) as { count?: number } | null;
  return body?.count ?? 0;
}

async function contaObis(nome: string): Promise<number> {
  const geometry = "POLYGON((12.2 40,19.6 40,19.6 45.8,12.2 45.8,12.2 40))";
  const body = (await leggiMorbido(
    `https://api.obis.org/occurrence?scientificname=${encodeURIComponent(binomio(nome))}&geometry=${encodeURIComponent(geometry)}&size=0`,
    8000,
  )) as { total?: number } | null;
  return body?.total ?? 0;
}

async function zoneWorms(nome: string): Promise<{ adriatico: boolean; mediterraneo: boolean }> {
  const body = await leggiMorbido(
    `https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(binomio(nome))}?like=false&marine_only=true`,
    8000,
  );
  const rows = Array.isArray(body) ? (body as { valid_AphiaID?: number; AphiaID?: number }[]) : [];
  const id = rows.find((row) => row.valid_AphiaID)?.valid_AphiaID || rows[0]?.AphiaID;
  if (!id) return { adriatico: false, mediterraneo: false };
  const dist = await leggiMorbido(`https://www.marinespecies.org/rest/AphiaDistributionsByAphiaID/${id}`, 8000);
  const text = JSON.stringify(dist ?? "");
  const adriatico = /adriatic|adriatico/i.test(text);
  const mediterraneo = /mediterranean|mediterrane|aegean|tyrrhenian|ionian|ligurian|balear|alboran|levantine|marmara|adriatic/i.test(text);
  return { adriatico, mediterraneo };
}

async function zonaDi(nome: string): Promise<Zona> {
  const [gbifAdriatico, gbifMediterraneo, obisAdriatico, worms] = await Promise.all([
    contaGbif(nome, "40,45.8", "12.2,19.6"),
    contaGbif(nome, "30,46", "-6,36"),
    contaObis(nome),
    zoneWorms(nome),
  ]);
  if (gbifAdriatico > 0 || obisAdriatico > 0 || worms.adriatico) return "adriatico";
  if (gbifMediterraneo > 0 || worms.mediterraneo) return "mediterraneo";
  return "mondo";
}

async function segnaZona(
  voci: { alta: boolean; scheda: SchedaSpecie }[],
): Promise<{ alta: boolean; scheda: SchedaSpecie; zona: Zona }[]> {
  const zone = await Promise.all(voci.map((item) => zonaDi(item.scheda.scientifico)));
  return voci.map((item, index) => {
    const zona = zone[index] ?? "mondo";
    const segno = [item.scheda.segno, ZONA_TESTO[zona]].filter(Boolean).join(" · ");
    return { alta: item.alta, scheda: { ...item.scheda, segno }, zona };
  });
}

function pareggioDiMare(
  opzioni: SchedaSpecie[],
  segnati: { scheda: SchedaSpecie; zona: Zona }[],
): SchedaSpecie[] {
  const peso: Record<Zona, number> = { adriatico: 3, mediterraneo: 2, mondo: 1 };
  const zone = new Map(segnati.map((item) => [item.scheda.scientifico.toLowerCase(), item.zona]));
  return [...opzioni].sort(
    (a, b) => (peso[zone.get(b.scientifico.toLowerCase()) ?? "mondo"] ?? 1) - (peso[zone.get(a.scientifico.toLowerCase()) ?? "mondo"] ?? 1),
  );
}

async function risolvi(richiesti: Candidato[]): Promise<{ alta: boolean; scheda: SchedaSpecie }[]> {
  const trovati = await Promise.all(richiesti.map(async (item) => ({ item, found: await cerca(item.nome) })));
  const out: { alta: boolean; scheda: SchedaSpecie }[] = [];
  const ids = new Set<number>();
  for (const row of trovati) {
    if (out.length >= 4) break;
    if (!row.found || !marino(row.found.taxon)) continue;
    const taxon = row.found.taxon;
    if (taxon.rank === "genus" || taxon.rank === "family") {
      const vicine = await specieVicine(taxon.name);
      for (const specie of vicine) {
        if (out.length >= 4 || ids.has(specie.id)) continue;
        ids.add(specie.id);
        out.push({ alta: false, scheda: await schedaDi(specie, row.item.segno) });
      }
      if (vicine.length) continue;
    }
    if (ids.has(taxon.id)) continue;
    ids.add(taxon.id);
    out.push({
      alta: row.item.alta && row.found.exact && taxon.rank === "species",
      scheda: await schedaDi(taxon, row.item.segno),
    });
  }
  return out;
}

function chiaveGemini(): string | undefined {
  const raw = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "").replace(/\s+/g, "");
  const key = raw.replace(/^["']|["']$/g, "");
  return key.length >= 20 ? key : undefined;
}

function fotoNormale(value: string): string | null {
  const comma = value.indexOf(",");
  if (comma < 0 || !value.slice(0, comma).includes("image/jpeg")) return null;
  const urlSafe = value.slice(0, comma).includes("base64url");
  let body = value.slice(comma + 1);
  body = urlSafe ? body.replace(/-/g, "+").replace(/_/g, "/") : body.replace(/ /g, "+");
  body = body.replace(/\s/g, "");
  while (body.length % 4) body += "=";
  const bytes = Buffer.from(body, "base64");
  if (bytes.length < 32 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function segnoOk(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 110) return "";
  return text;
}
