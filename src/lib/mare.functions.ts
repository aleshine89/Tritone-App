import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { cuboMare, cuboPerGiorno, leggiSerie, oreDelGiorno, seriePunto } from "@/lib/copernicus";

const ONDA = ["MEDSEA_ANALYSISFORECAST_WAV_006_017", "cmems_mod_med_wav_anfc_4.2km_PT1H-i"] as const;
const ACQUA = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "cmems_mod_med_phy-tem_anfc_4.2km-2D_PT1H-m"] as const;
const CORRENTE = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "cmems_mod_med_phy-cur_anfc_4.2km-2D_PT1H-m"] as const;
const LUCE = ["OCEANCOLOUR_GLO_BGC_L4_NRT_009_102", "cmems_obs-oc_glo_bgc-transp_nrt_l4-gapfree-multi-4km_P1D"] as const;

const OTTICA = ["MEDSEA_ANALYSISFORECAST_BGC_006_014", "cmems_mod_med_bgc-optics_anfc_4.2km_P1D-m"] as const;

const DOI = ["10.48670/mds-00373", "10.48670/mds-00359", "10.48670/moi-00279", "10.48670/mds-00358"];

export type GiornoMare = {
  giorno: string;
  punteggio: number | null;
  giudizio: "calmo" | "mosso" | "molto" | null;
  onda: number | null;
  periodo: number | null;
  direzione: number | null;
  acqua: number | null;
  corrente: number | null;
  secchi: number | null;
  secchiDel: string | null;
  secchiNota: "satellite" | "assente" | "previsione";
  vista: number | null;
};

export type LetturaMare = {
  copertura: boolean;
  giorni: GiornoMare[];
  migliore: string | null;
  doi: string[];
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
  if (voto >= 7.5) return "calmo";
  if (voto >= 4.5) return "mosso";
  return "molto";
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
  .handler(async ({ data }): Promise<LetturaMare> => {
    const chiave = `${data.lat.toFixed(2)},${data.lon.toFixed(2)},${giornoRoma(0)}`;
    const tenuto = memoria.get(chiave);
    if (tenuto && Date.now() - tenuto.at < 3 * 60 * 60 * 1000) return tenuto.lettura;

    const giorniIso = [-2, -1, 0, 1, 2, 3, 4].map(giornoRoma);
    const onde = await cuboMare(ONDA[0], ONDA[1], ["VHM0", "VTM10", "VMDR"]);
    const oreOnde = giorniIso.map((giorno) => oreDelGiorno(onde, giorno));
    const tempiOnde = oreOnde.flat();
    const serieOnde = tempiOnde.length
      ? await seriePunto(ONDA[0], ONDA[1], ["VHM0", "VTM10", "VMDR"], data.lat, data.lon, tempiOnde)
      : { VHM0: [], VTM10: [], VMDR: [] };

    let cursore = 0;
    const giorni: GiornoMare[] = [];
    for (let i = 0; i < giorniIso.length; i += 1) {
      const ore = oreOnde[i];
      const altezze = serieOnde.VHM0.slice(cursore, cursore + ore.length);
      const periodi = serieOnde.VTM10.slice(cursore, cursore + ore.length);
      const direzioni = serieOnde.VMDR.slice(cursore, cursore + ore.length);
      cursore += ore.length;
      const picco = massimo(altezze);
      const onda = picco ? arrotonda(picco.valore, 1) : null;
      const voto = onda == null ? null : punteggioOnda(onda);
      giorni.push({
        giorno: giorniIso[i],
        punteggio: voto,
        giudizio: voto == null ? null : giudizioDi(voto),
        onda,
        periodo: picco ? arrotonda(periodi[picco.indice], 0) : null,
        direzione: picco && direzioni[picco.indice] != null ? Math.round(Number(direzioni[picco.indice])) : null,
        acqua: null,
        corrente: null,
        secchi: null,
        secchiDel: null,
        secchiNota: i > 2 ? "previsione" : "assente",
        vista: null,
      });
    }

    let ottica: Awaited<ReturnType<typeof cuboPerGiorno>> | null = null;
    try {
      ottica = await cuboPerGiorno(OTTICA[0], OTTICA[1], ["kd490"], giorniIso[2]);
    } catch {
      ottica = null;
    }

    try {
      const luce = await cuboMare(LUCE[0], LUCE[1], ["ZSD"]);
      await Promise.all(
        giorni.map(async (giorno, indice) => {
          if (indice > 2) return;
          const ore = oreDelGiorno(luce, giorno.giorno);
          let passo = ore.length ? ore[ore.length - 1] : null;
          let del = giorno.giorno;
          if (passo == null) {
            for (let indietro = 1; indietro <= 4 && passo == null; indietro += 1) {
              const prima = giornoRomaDa(giorno.giorno, -indietro);
              const orePrima = oreDelGiorno(luce, prima);
              if (orePrima.length) {
                passo = orePrima[orePrima.length - 1];
                del = prima;
              }
            }
          }
          if (passo == null) return;
          const serie = await seriePunto(LUCE[0], LUCE[1], ["ZSD"], data.lat, data.lon, [passo]);
          const metri = secchiMetri(serie.ZSD[0]);
          giorno.secchi = metri;
          giorno.secchiDel = metri == null ? null : del;
          giorno.secchiNota = metri == null ? "assente" : "satellite";
        }),
      );
    } catch {
      /* la trasparenza manca, il resto resta */
    }

    if (ottica) {
      const kds = await Promise.all(
        giorni.map(async (giorno) => {
          const ore = oreDelGiorno(ottica, giorno.giorno);
          if (!ore.length) return null;
          const serie = await leggiSerie(ottica, ["kd490"], data.lat, data.lon, [ore[ore.length - 1]]);
          const kd = serie.kd490[0];
          return kd != null && kd > 0.02 && kd < 4 ? kd : null;
        }),
      );
      const ancora = [...giorni].reverse().find((giorno) => giorno.secchi != null && giorno.giorno <= giorniIso[2]);
      let kdAncora: number | null = null;
      if (ancora?.secchiDel) {
        const ore = oreDelGiorno(ottica, ancora.secchiDel);
        if (ore.length) {
          const serie = await leggiSerie(ottica, ["kd490"], data.lat, data.lon, [ore[ore.length - 1]]);
          const kd = serie.kd490[0];
          kdAncora = kd != null && kd > 0.02 && kd < 4 ? kd : null;
        }
      }
      giorni.forEach((giorno, indice) => {
        const kd = kds[indice];
        const base = ancora?.secchi && kdAncora && kd ? ancora.secchi * (kdAncora / kd) : vistaDa(kd);
        if (base == null) return;
        const ondaRiferimento = ancora?.secchiDel ? (giorni.find((voce) => voce.giorno === ancora.secchiDel)?.onda ?? null) : null;
        giorno.vista = metriVista(base, giorno.onda, ondaRiferimento);
      });
    }

    try {
      const temperatura = await cuboMare(ACQUA[0], ACQUA[1], ["thetao"]);
      await Promise.all(
        giorni.map(async (giorno) => {
          const ore = oreDelGiorno(temperatura, giorno.giorno);
          if (!ore.length) return;
          const serie = await seriePunto(ACQUA[0], ACQUA[1], ["thetao"], data.lat, data.lon, ore);
          giorno.acqua = arrotonda(media(serie.thetao), 1);
        }),
      );
    } catch {
      /* la temperatura manca, il resto resta */
    }

    try {
      const corrente = await cuboMare(CORRENTE[0], CORRENTE[1], ["uo", "vo"]);
      await Promise.all(
        giorni.map(async (giorno) => {
          const ore = oreDelGiorno(corrente, giorno.giorno);
          if (!ore.length) return;
          const serie = await seriePunto(CORRENTE[0], CORRENTE[1], ["uo", "vo"], data.lat, data.lon, ore);
          const mezzi = ore.map((_, indice) => {
            const u = serie.uo[indice];
            const v = serie.vo[indice];
            if (u == null || v == null) return null;
            return Math.sqrt(u * u + v * v);
          });
          giorno.corrente = arrotonda(media(mezzi), 2);
        }),
      );
    } catch {
      /* la corrente manca, il resto resta */
    }

    const conVoto = giorni.filter((giorno) => giorno.punteggio != null);
    const migliore = conVoto.reduce<GiornoMare | null>((scelto, giorno) => {
      if (!scelto || (giorno.punteggio ?? 0) > (scelto.punteggio ?? 0)) return giorno;
      if (giorno.punteggio === scelto.punteggio && Math.abs(giorniIso.indexOf(giorno.giorno) - 2) < Math.abs(giorniIso.indexOf(scelto.giorno) - 2)) return giorno;
      return scelto;
    }, null);

    const lettura: LetturaMare = {
      copertura: conVoto.length > 0,
      giorni,
      migliore: migliore?.giorno ?? null,
      doi: DOI,
    };
    if (lettura.copertura) memoria.set(chiave, { at: Date.now(), lettura });
    return lettura;
  });
