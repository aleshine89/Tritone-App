import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { oraDelIndice, cuboMare, cuboPerGiorno, leggiSerie, oreDelGiorno, type Cubo } from "@/lib/copernicus";
import { getSql } from "@/lib/db";

const ONDA = ["MEDSEA_ANALYSISFORECAST_WAV_006_017", "cmems_mod_med_wav_anfc_4.2km_PT1H-i"] as const;
const ACQUA = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "cmems_mod_med_phy-tem_anfc_4.2km-2D_PT1H-m"] as const;
const ACQUA_FONDO = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "4.2km-3D_PT1H-m"] as const;
const CORRENTE = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "cmems_mod_med_phy-cur_anfc_4.2km-2D_PT1H-m"] as const;
const LUCE = ["OCEANCOLOUR_GLO_BGC_L4_NRT_009_102", "cmems_obs-oc_glo_bgc-transp_nrt_l4-gapfree-multi-4km_P1D"] as const;

const OTTICA = ["MEDSEA_ANALYSISFORECAST_BGC_006_014", "cmems_mod_med_bgc-optics_anfc_4.2km_P1D-m"] as const;

const DOI = ["10.48670/mds-00373", "10.48670/mds-00359", "10.48670/moi-00279", "10.48670/mds-00358"];

export type GiornoMare = {
  giorno: string;
  punteggio: number | null;
  giudizio: "entra" | "limite" | "no" | null;
  onda: number | null;
  periodo: number | null;
  direzione: number | null;
  acqua: number | null;
  acqua18: number | null;
  acqua40: number | null;
  corrente: number | null;
  correnteVerso: number | null;
  mare: "lunga" | "corto" | null;
  secchi: number | null;
  secchiDel: string | null;
  secchiNota: "satellite" | "assente" | "previsione";
  vista: number | null;
  finestraDa: number | null;
  finestraA: number | null;
};

export type LetturaMare = {
  copertura: boolean;
  giorni: GiornoMare[];
  migliore: string | null;
  doi: string[];
  memoriaN: number;
  memoriaMedia: number | null;
};

export type LuogoCosta = { nome: string; lat: number; lon: number };

const memoria = new Map<string, { at: number; lettura: LetturaMare }>();

function giornoRoma(spostamento: number): string {
  const data = new Date(Date.now() + spostamento * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(data);
}

function giornoRomaDa(giorno: string, spostamento: number): string {
  const data = new Date(`${giorno}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + spostamento);
  return data.toISOString().slice(0, 10);
}

function punteggioOnda(metri: number): number {
  const punti: [number, number][] = [
    [0, 9.8],
    [0.2, 9.2],
    [0.4, 8.1],
    [0.6, 7.2],
    [0.9, 5.6],
    [1.2, 4.2],
    [1.6, 2.8],
    [2.2, 1.6],
    [3, 1],
  ];
  if (metri <= 0) return 9.8;
  for (let i = 1; i < punti.length; i += 1) {
    const [prima, votoPrima] = punti[i - 1];
    const [dopo, votoDopo] = punti[i];
    if (metri <= dopo) {
      const tratto = (metri - prima) / (dopo - prima);
      return Math.round((votoPrima + (votoDopo - votoPrima) * tratto) * 10) / 10;
    }
  }
  return 1;
}

function giudizioDi(voto: number): GiornoMare["giudizio"] {
  if (voto >= 7.2) return "entra";
  if (voto >= 4.8) return "limite";
  return "no";
}

function scala(metri: number, punti: [number, number][]): number {
  if (metri <= punti[0][0]) return punti[0][1];
  for (let i = 1; i < punti.length; i += 1) {
    const [prima, votoPrima] = punti[i - 1];
    const [dopo, votoDopo] = punti[i];
    if (metri <= dopo) {
      const tratto = (metri - prima) / (dopo - prima);
      return votoPrima + (votoDopo - votoPrima) * tratto;
    }
  }
  return punti[punti.length - 1][1];
}

function punteggioCorrente(metri: number): number {
  return scala(metri, [
    [0, 9.6],
    [0.15, 8.4],
    [0.3, 7],
    [0.5, 5],
    [0.8, 3.2],
    [1.2, 1.6],
  ]);
}

function punteggioVista(metri: number): number {
  return scala(metri, [
    [1, 2],
    [3, 4.2],
    [5, 6.4],
    [8, 8],
    [15, 9.4],
    [25, 9.8],
  ]);
}

function chiudiGiudizio(giorno: GiornoMare) {
  const pezzi: number[] = [];
  if (giorno.onda != null) pezzi.push(punteggioOnda(giorno.onda));
  if (giorno.corrente != null) pezzi.push(punteggioCorrente(giorno.corrente));
  if (giorno.vista != null) pezzi.push(punteggioVista(giorno.vista));
  if (!pezzi.length) {
    giorno.punteggio = null;
    giorno.giudizio = null;
    return;
  }
  const voto = Math.round((pezzi.reduce((somma, valore) => somma + valore, 0) / pezzi.length) * 10) / 10;
  giorno.punteggio = voto;
  giorno.giudizio = giudizioDi(voto);
}

function finestraCalma(ore: number[], altezze: Array<number | null>): { da: number; a: number } | null {
  let meglio: { da: number; a: number; media: number } | null = null;
  for (let i = 0; i < ore.length - 1; i += 1) {
    const da = ore[i];
    const a = ore[i + 1];
    if (da < 7 || a > 19 || a <= da || a - da > 3) continue;
    const prima = altezze[i];
    const dopo = altezze[i + 1];
    if (prima == null || dopo == null) continue;
    const valore = (prima + dopo) / 2;
    if (!meglio || valore < meglio.media) meglio = { da, a, media: valore };
  }
  return meglio ? { da: meglio.da, a: meglio.a } : null;
}

function fattoreOnda(metri: number | null): number {
  if (metri == null) return 1;
  const punti: [number, number][] = [
    [0, 1],
    [0.3, 0.95],
    [0.6, 0.82],
    [1, 0.65],
    [1.4, 0.48],
    [2, 0.35],
    [3, 0.25],
  ];
  if (metri <= 0) return 1;
  for (let i = 1; i < punti.length; i += 1) {
    const [prima, fattorePrima] = punti[i - 1];
    const [dopo, fattoreDopo] = punti[i];
    if (metri <= dopo) {
      const tratto = (metri - prima) / (dopo - prima);
      return fattorePrima + (fattoreDopo - fattorePrima) * tratto;
    }
  }
  return 0.25;
}

function metriVista(base: number, onda: number | null, ondaRiferimento: number | null): number | null {
  const metri = base * (fattoreOnda(onda) / fattoreOnda(ondaRiferimento));
  if (!Number.isFinite(metri) || metri < 1 || metri > 40) return null;
  return Math.round(metri);
}

function vistaDa(kd: number | null): number | null {
  if (kd == null || kd < 0.03 || kd > 4) return null;
  const metri = 1.44 / kd;
  if (metri < 1 || metri > 40) return null;
  return Math.round(metri);
}

function secchiMetri(metri: number | null): number | null {
  if (metri == null || metri < 0.4 || metri > 60) return null;
  return Math.round(metri);
}

function massimo(lista: Array<number | null>): { valore: number; indice: number } | null {
  let scelto: { valore: number; indice: number } | null = null;
  lista.forEach((valore, indice) => {
    if (valore == null || !Number.isFinite(valore)) return;
    if (!scelto || valore > scelto.valore) scelto = { valore, indice };
  });
  return scelto;
}

function media(lista: Array<number | null>): number | null {
  const validi = lista.filter((valore): valore is number => valore != null && Number.isFinite(valore));
  if (!validi.length) return null;
  return validi.reduce((somma, valore) => somma + valore, 0) / validi.length;
}

function arrotonda(valore: number | null, cifre: number): number | null {
  if (valore == null || !Number.isFinite(valore)) return null;
  const fattore = 10 ** cifre;
  return Math.round(valore * fattore) / fattore;
}

function tipoMare(swell: number | null, vento: number | null, periodoSwell: number | null, periodo: number | null): GiornoMare["mare"] {
  if (swell != null && vento != null) {
    const respiro = periodoSwell ?? periodo;
    if (swell >= vento && (respiro == null || respiro >= 7)) return "lunga";
    if (vento > swell) return "corto";
  }
  if (periodo != null && periodo >= 8) return "lunga";
  if (periodo != null && periodo <= 5) return "corto";
  return null;
}

function versoCorrente(u: number, v: number): number | null {
  if (Math.hypot(u, v) < 0.05) return null;
  return ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
}

function quoteVicine(elev: Float32Array, metri: number): { a: number; b: number; peso: number } | null {
  const obiettivo = -Math.abs(metri);
  let profondo = -1;
  let basso = -1;
  for (let i = 0; i < elev.length; i += 1) {
    const z = elev[i];
    if (!Number.isFinite(z)) continue;
    if (z <= obiettivo) profondo = i;
    if (z >= obiettivo && basso < 0) basso = i;
  }
  if (profondo < 0 && basso < 0) return null;
  if (profondo < 0 || basso < 0 || profondo === basso) {
    const unico = profondo < 0 ? basso : profondo;
    return { a: unico, b: unico, peso: 0 };
  }
  const za = elev[profondo];
  const zb = elev[basso];
  const peso = za === zb ? 0 : (obiettivo - za) / (zb - za);
  return { a: profondo, b: basso, peso: Math.min(1, Math.max(0, peso)) };
}

function mescola(profondo: number | null, basso: number | null, peso: number): number | null {
  if (profondo == null) return basso;
  if (basso == null) return profondo;
  return profondo + (basso - profondo) * peso;
}

function miglioreDi(giorni: GiornoMare[]): string | null {
  const conVoto = giorni.filter((giorno) => giorno.punteggio != null);
  const scelto = conVoto.reduce<GiornoMare | null>((migliore, giorno) => {
    if (!migliore || (giorno.punteggio ?? 0) > (migliore.punteggio ?? 0)) return giorno;
    const indice = giorni.findIndex((voce) => voce.giorno === giorno.giorno);
    const indiceMigliore = giorni.findIndex((voce) => voce.giorno === migliore.giorno);
    if (giorno.punteggio === migliore.punteggio && Math.abs(indice - 2) < Math.abs(indiceMigliore - 2)) return giorno;
    return migliore;
  }, null);
  return scelto?.giorno ?? null;
}

async function misureVicine(userId: string, lat: number, lon: number): Promise<number[]> {
  try {
    const sql = await getSql();
    const righe = await sql<{ lat: string; lng: string; visibility_m: string }>`
      select lat, lng, visibility_m
      from logbook_entries
      where user_id = ${userId}
        and visibility_m <> ''
        and lat <> ''
        and lng <> ''
        and dive_date >= current_date - 120
    `;
    const misure: number[] = [];
    for (const riga of righe) {
      const la = Number(riga.lat);
      const lo = Number(riga.lng);
      const metri = Number(String(riga.visibility_m).replace(",", "."));
      if (!Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(metri) || metri < 1 || metri > 40) continue;
      const dy = (la - lat) * 111;
      const dx = (lo - lon) * 111 * Math.cos((lat * Math.PI) / 180);
      if (Math.hypot(dx, dy) > 20) continue;
      misure.push(metri);
    }
    return misure;
  } catch {
    return [];
  }
}

function conMemoria(base: LetturaMare, misure: number[]): LetturaMare {
  if (!misure.length) return { ...base, memoriaN: 0, memoriaMedia: null };
  const media = misure.reduce((somma, valore) => somma + valore, 0) / misure.length;
  const peso = Math.min(0.4, 0.12 * misure.length);
  const giorni = base.giorni.map((giorno) => {
    const copia = { ...giorno };
    if (copia.vista == null) copia.vista = Math.round(media);
    else copia.vista = Math.round(Math.min(40, Math.max(1, copia.vista * (1 - peso) + media * peso)));
    return copia;
  });
  giorni.forEach(chiudiGiudizio);
  return {
    ...base,
    giorni,
    migliore: miglioreDi(giorni),
    memoriaN: misure.length,
    memoriaMedia: Math.round(media),
  };
}

export const cercaCosta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const q = String(raw.q ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (q.length < 2) throw new Error("Scrivi almeno due lettere.");
    return { q };
  })
  .handler(async ({ data }): Promise<LuogoCosta[]> => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", data.q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "6");
    const res = await fetch(url, {
      headers: { "User-Agent": "Tritone/1.0 (tritoneapp.it)", "Accept-Language": "it" },
    });
    if (!res.ok) return [];
    const lista = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
    return lista
      .map((voce) => ({
        nome: String(voce.display_name ?? "").split(",").slice(0, 2).join(",").trim(),
        lat: Number(voce.lat),
        lon: Number(voce.lon),
      }))
      .filter((voce) => voce.nome && Number.isFinite(voce.lat) && Number.isFinite(voce.lon));
  });

export const leggiMare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error("Punto non valido.");
    }
    return { lat, lon };
  })
  .handler(async ({ data, context }): Promise<LetturaMare> => {
    const chiave = `3|${data.lat.toFixed(2)},${data.lon.toFixed(2)},${giornoRoma(0)}`;
    const tenuto = memoria.get(chiave);
    const lettura = tenuto && Date.now() - tenuto.at < 3 * 60 * 60 * 1000 ? tenuto.lettura : await leggiPunto(data.lat, data.lon);
    if (!tenuto || lettura !== tenuto.lettura) {
      if (lettura.copertura) memoria.set(chiave, { at: Date.now(), lettura });
    }
    const misure = await misureVicine(context.userId, data.lat, data.lon);
    return conMemoria(lettura, misure);
  });

async function leggiPunto(lat: number, lon: number): Promise<LetturaMare> {
  const giorniIso = [-2, -1, 0, 1, 2, 3, 4].map(giornoRoma);
  const variabiliOnda = ["VHM0", "VTM10", "VMDR", "VHM0_SW1", "VHM0_WW", "VTM01_SW1"];
  const [onde, luce, ottica, temperatura, fondo, corrente] = await Promise.all([
    apriCubo(() => cuboMare(ONDA[0], ONDA[1], variabiliOnda)),
    apriCubo(() => cuboMare(LUCE[0], LUCE[1], ["ZSD"])),
    apriCubo(() => cuboPerGiorno(OTTICA[0], OTTICA[1], ["kd490"], giorniIso[2])),
    apriCubo(() => cuboMare(ACQUA[0], ACQUA[1], ["thetao"])),
    apriCubo(() => cuboMare(ACQUA_FONDO[0], ACQUA_FONDO[1], ["thetao"])),
    apriCubo(() => cuboMare(CORRENTE[0], CORRENTE[1], ["uo", "vo"])),
  ]);

  const oreOnde = onde ? giorniIso.map((giorno) => oreDelGiorno(onde, giorno)) : giorniIso.map(() => [] as number[]);
  const tempiOnde = oreOnde.flat();
  const campioniAcqua = temperatura ? giorniIso.map((giorno) => oreCampione(temperatura, giorno, lon)) : [];
  const campioniCorrente = corrente ? giorniIso.map((giorno) => oreCampione(corrente, giorno, lon)) : [];
  const passiLuce = luce ? indiciLuce(luce, giorniIso) : [];
  const passiOttica = ottica
    ? giorniIso.map((giorno) => {
        const ore = oreDelGiorno(ottica, giorno);
        return ore.length ? ore[ore.length - 1] : null;
      })
    : [];
  const passiFondo = fondo
    ? giorniIso.map((giorno) => {
        const ore = oreDelGiorno(fondo, giorno);
        const mezzo = ore.find((indice) => oraDelIndice(fondo, indice, lon) === 12);
        return mezzo ?? (ore.length ? ore[Math.floor(ore.length / 2)] : null);
      })
    : [];
  const q18 = fondo?.elevazione ? quoteVicine(fondo.elevazione, 18) : null;
  const q40 = fondo?.elevazione ? quoteVicine(fondo.elevazione, 40) : null;
  const tempiFondo = passiFondo.filter((passo): passo is number => passo != null);

  const [serieOnde, serieLuce, serieOttica, serieAcqua, serieCorrente, fondo18a, fondo18b, fondo40a, fondo40b] = await Promise.all([
    onde && tempiOnde.length ? leggiSicuro(leggiSerie(onde, variabiliOnda, lat, lon, tempiOnde)) : null,
    luce && passiLuce.length ? leggiSicuro(leggiSerie(luce, ["ZSD"], lat, lon, passiLuce.map((voce) => voce.passo))) : null,
    ottica && passiOttica.some((passo) => passo != null) ? leggiSicuro(leggiSerie(ottica, ["kd490"], lat, lon, passiOttica.map((passo) => passo ?? passiOttica.find((voce) => voce != null) ?? 0))) : null,
    temperatura && campioniAcqua.some((ore) => ore.length) ? leggiSicuro(leggiSerie(temperatura, ["thetao"], lat, lon, campioniAcqua.flat())) : null,
    corrente && campioniCorrente.some((ore) => ore.length) ? leggiSicuro(leggiSerie(corrente, ["uo", "vo"], lat, lon, campioniCorrente.flat())) : null,
    fondo && q18 && tempiFondo.length ? leggiSicuro(leggiSerie(fondo, ["thetao"], lat, lon, tempiFondo, q18.a)) : null,
    fondo && q18 && q18.a !== q18.b && tempiFondo.length ? leggiSicuro(leggiSerie(fondo, ["thetao"], lat, lon, tempiFondo, q18.b)) : null,
    fondo && q40 && tempiFondo.length ? leggiSicuro(leggiSerie(fondo, ["thetao"], lat, lon, tempiFondo, q40.a)) : null,
    fondo && q40 && q40.a !== q40.b && tempiFondo.length ? leggiSicuro(leggiSerie(fondo, ["thetao"], lat, lon, tempiFondo, q40.b)) : null,
  ]);

  let cursore = 0;
  const giorni: GiornoMare[] = [];
  for (let i = 0; i < giorniIso.length; i += 1) {
    const ore = oreOnde[i];
    const altezze = serieOnde?.VHM0.slice(cursore, cursore + ore.length) ?? [];
    const periodi = serieOnde?.VTM10.slice(cursore, cursore + ore.length) ?? [];
    const direzioni = serieOnde?.VMDR.slice(cursore, cursore + ore.length) ?? [];
    const swell = serieOnde?.VHM0_SW1?.slice(cursore, cursore + ore.length) ?? [];
    const vento = serieOnde?.VHM0_WW?.slice(cursore, cursore + ore.length) ?? [];
    const periodoSwell = serieOnde?.VTM01_SW1?.slice(cursore, cursore + ore.length) ?? [];
    cursore += ore.length;
    const picco = massimo(altezze);
    const onda = picco ? arrotonda(picco.valore, 1) : null;
    const periodo = picco ? arrotonda(periodi[picco.indice], 0) : null;
    const oreLocali = onde ? ore.map((indice) => oraDelIndice(onde, indice, lon)) : [];
    const finestra = finestraCalma(oreLocali, altezze);
    giorni.push({
      giorno: giorniIso[i],
      punteggio: null,
      giudizio: null,
      onda,
      periodo,
      direzione: picco && direzioni[picco.indice] != null ? Math.round(Number(direzioni[picco.indice])) : null,
      acqua: null,
      acqua18: null,
      acqua40: null,
      corrente: null,
      correnteVerso: null,
      mare: picco ? tipoMare(swell[picco.indice] ?? null, vento[picco.indice] ?? null, periodoSwell[picco.indice] ?? null, periodo) : null,
      secchi: null,
      secchiDel: null,
      secchiNota: i > 2 ? "previsione" : "assente",
      vista: null,
      finestraDa: finestra?.da ?? null,
      finestraA: finestra?.a ?? null,
    });
  }

  passiLuce.forEach((voce, indice) => {
    const metri = secchiMetri(serieLuce?.ZSD[indice] ?? null);
    const giorno = giorni[voce.indiceGiorno];
    giorno.secchi = metri;
    giorno.secchiDel = metri == null ? null : voce.del;
    giorno.secchiNota = metri == null ? "assente" : "satellite";
  });

  const kds = passiOttica.map((passo, indice) => {
    if (passo == null) return null;
    const kd = serieOttica?.kd490[indice] ?? null;
    return kd != null && kd > 0.02 && kd < 4 ? kd : null;
  });
  const ancora = [...giorni].reverse().find((giorno) => giorno.secchi != null && giorno.giorno <= giorniIso[2]);
  let kdAncora: number | null = null;
  if (ottica && ancora?.secchiDel) {
    const gia = giorniIso.indexOf(ancora.secchiDel);
    if (gia >= 0) kdAncora = kds[gia] ?? null;
    else {
      const ore = oreDelGiorno(ottica, ancora.secchiDel);
      if (ore.length) {
        const serie = await leggiSicuro(leggiSerie(ottica, ["kd490"], lat, lon, [ore[ore.length - 1]]));
        const kd = serie?.kd490[0];
        kdAncora = kd != null && kd > 0.02 && kd < 4 ? kd : null;
      }
    }
  }
  giorni.forEach((giorno, indice) => {
    const kd = kds[indice] ?? null;
    const base = ancora?.secchi && kdAncora && kd ? ancora.secchi * (kdAncora / kd) : vistaDa(kd);
    if (base == null) return;
    const ondaRiferimento = ancora?.secchiDel ? (giorni.find((voce) => voce.giorno === ancora.secchiDel)?.onda ?? null) : null;
    giorno.vista = metriVista(base, giorno.onda, ondaRiferimento);
  });

  let cursoreAcqua = 0;
  campioniAcqua.forEach((ore, indice) => {
    const valori = serieAcqua?.thetao.slice(cursoreAcqua, cursoreAcqua + ore.length) ?? [];
    cursoreAcqua += ore.length;
    giorni[indice].acqua = arrotonda(media(valori), 1);
  });

  let cursoreFondo = 0;
  passiFondo.forEach((passo, indice) => {
    if (passo == null) return;
    const i = cursoreFondo;
    cursoreFondo += 1;
    if (q18 && fondo18a) {
      giorni[indice].acqua18 = arrotonda(mescola(fondo18a.thetao[i], fondo18b?.thetao[i] ?? fondo18a.thetao[i], q18.peso), 1);
    }
    if (q40 && fondo40a) {
      giorni[indice].acqua40 = arrotonda(mescola(fondo40a.thetao[i], fondo40b?.thetao[i] ?? fondo40a.thetao[i], q40.peso), 1);
    }
  });

  let cursoreCorrente = 0;
  campioniCorrente.forEach((ore, indice) => {
    const us = serieCorrente?.uo.slice(cursoreCorrente, cursoreCorrente + ore.length) ?? [];
    const vs = serieCorrente?.vo.slice(cursoreCorrente, cursoreCorrente + ore.length) ?? [];
    cursoreCorrente += ore.length;
    const mezzi = us.map((u, i) => {
      const v = vs[i];
      if (u == null || v == null) return null;
      return Math.sqrt(u * u + v * v);
    });
    giorni[indice].corrente = arrotonda(media(mezzi), 2);
    const uMedio = media(us);
    const vMedio = media(vs);
    giorni[indice].correnteVerso = uMedio == null || vMedio == null ? null : versoCorrente(uMedio, vMedio);
  });

  giorni.forEach(chiudiGiudizio);
  return {
    copertura: giorni.some((giorno) => giorno.punteggio != null),
    giorni,
    migliore: miglioreDi(giorni),
    doi: DOI,
    memoriaN: 0,
    memoriaMedia: null,
  };
}

async function apriCubo(lavoro: () => Promise<Cubo>): Promise<Cubo | null> {
  try {
    return await lavoro();
  } catch {
    return null;
  }
}

async function leggiSicuro<T>(lavoro: Promise<T>): Promise<T | null> {
  try {
    return await lavoro;
  } catch {
    return null;
  }
}

function oreCampione(cubo: Cubo, giorno: string, lon: number): number[] {
  const ore = oreDelGiorno(cubo, giorno);
  const scelte = ore.filter((indice) => {
    const ora = oraDelIndice(cubo, indice, lon);
    return ora === 9 || ora === 12 || ora === 15;
  });
  if (scelte.length) return scelte;
  if (!ore.length) return [];
  return [ore[Math.floor(ore.length / 2)]];
}

function indiciLuce(luce: Cubo, giorniIso: string[]): { indiceGiorno: number; passo: number; del: string }[] {
  const fuori: { indiceGiorno: number; passo: number; del: string }[] = [];
  giorniIso.forEach((giorno, indiceGiorno) => {
    if (indiceGiorno > 2) return;
    const ore = oreDelGiorno(luce, giorno);
    if (ore.length) {
      fuori.push({ indiceGiorno, passo: ore[ore.length - 1], del: giorno });
      return;
    }
    for (let indietro = 1; indietro <= 4; indietro += 1) {
      const prima = giornoRomaDa(giorno, -indietro);
      const orePrima = oreDelGiorno(luce, prima);
      if (orePrima.length) {
        fuori.push({ indiceGiorno, passo: orePrima[orePrima.length - 1], del: prima });
        return;
      }
    }
  });
  return fuori;
}

export type ContestoMare = {
  metri: number | null;
  livello: string;
  uscita: "riva" | "barca" | null;
  luogo: string;
  giorno: string;
};

function limiteBrevetto(ente: string, livello: string, titolo: string): { metri: number; etichetta: string } | null {
  const text = `${ente} ${livello} ${titolo}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!text.trim()) return null;
  const etichetta = [ente, livello].filter(Boolean).join(" ").trim() || titolo;
  if (/\b(divemaster|dive master|istruttore|instructor|owsi|msdt)\b/.test(text)) return { metri: 40, etichetta };
  if (/(\*\*\*|3\s*stelle|tre stelle|terzo grado|\bp3\b|three star)/.test(text)) return { metri: 40, etichetta };
  if (/\b(advanced|aowd|aow|rescue|master scuba)\b/.test(text)) return { metri: 30, etichetta };
  if (/(\*\*|2\s*stelle|due stelle|secondo grado|\bp2\b|two star)/.test(text)) return { metri: 30, etichetta };
  if (/\b(discover|try dive|battesimo)\b/.test(text) || /\bscuba diver\b/.test(text)) return { metri: 12, etichetta };
  if (/(\*|1\s*stella|una stella|primo grado|\bp1\b|one star)/.test(text)) return { metri: 18, etichetta };
  if (/\b(open water|owd)\b/.test(text)) return { metri: 18, etichetta };
  return null;
}

function daRiva(valore: boolean | string | null): "riva" | "barca" | null {
  if (valore === true || valore === "t" || valore === "true") return "barca";
  if (valore === false || valore === "f" || valore === "false") return "riva";
  return null;
}

export const contestoMare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ContestoMare> => {
    const vuoto: ContestoMare = { metri: null, livello: "", uscita: null, luogo: "", giorno: "" };
    try {
      const sql = await getSql();
      const brevetti = await sql<{ ente: string; livello: string; titolo: string }>`
        select ente, livello, titolo from brevetti where user_id = ${context.userId} order by id desc
      `;
      let scelto: { metri: number; etichetta: string } | null = null;
      for (const riga of brevetti) {
        const limite = limiteBrevetto(riga.ente, riga.livello, riga.titolo);
        if (limite && (!scelto || limite.metri > scelto.metri)) scelto = limite;
      }
      const club = await sql<{ mezzo: boolean | string | null }>`
        select c.mezzo_nautico as mezzo
        from profiles p
        left join club c on c.id = p.club_id
        where p.user_id = ${context.userId}
      `;
      const propria = await sql<{ giorno: string; luogo: string }>`
        select u.data::text as giorno, coalesce(nullif(u.punto, ''), u.localita) as luogo
        from uscita_righe r
        join uscite u on u.id = r.uscita_id
        where r.user_id = ${context.userId}
          and u.data >= current_date
          and u.data <= current_date + 4
          and u.localita <> ''
        order by u.data, u.id
        limit 1
      `;
      const delCentro = propria[0]
        ? []
        : await sql<{ giorno: string; luogo: string }>`
            select u.data::text as giorno, coalesce(nullif(u.punto, ''), u.localita) as luogo
            from uscite u
            join profiles p on p.club_id = u.club_id
            where p.user_id = ${context.userId}
              and u.data >= current_date
              and u.data <= current_date + 4
              and u.localita <> ''
            order by u.data, u.id
            limit 1
          `;
      const viaggio = propria[0] || delCentro[0]
        ? []
        : await sql<{ giorno: string; luogo: string }>`
            select v.dal::text as giorno,
              coalesce(nullif(v.ospite_nome, ''), nullif(ospite.citta, ''), nullif(ospite.nome, ''), nullif(casa.citta, ''), casa.nome) as luogo
            from viaggio_persone p
            join viaggi v on v.id = p.viaggio_id
            left join club ospite on ospite.id = v.ospite_club_id
            left join club casa on casa.id = v.club_id
            where p.user_id = ${context.userId}
              and v.al >= current_date
              and v.dal <= current_date + 4
            order by v.dal
            limit 1
          `;
      const appuntamento = propria[0] ?? delCentro[0] ?? viaggio[0];
      return {
        metri: scelto?.metri ?? null,
        livello: scelto?.etichetta ?? "",
        uscita: daRiva(club[0]?.mezzo ?? null),
        luogo: appuntamento?.luogo?.trim() ?? "",
        giorno: appuntamento?.giorno?.slice(0, 10) ?? "",
      };
    } catch {
      return vuoto;
    }
  });
