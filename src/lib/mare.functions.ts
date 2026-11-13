import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { oraDelIndice, cuboMare, cuboPerGiorno, leggiSerie, oreDelGiorno, seriePunto } from "@/lib/copernicus";
import { getSql } from "@/lib/db";

const ONDA = ["MEDSEA_ANALYSISFORECAST_WAV_006_017", "cmems_mod_med_wav_anfc_4.2km_PT1H-i"] as const;
const ACQUA = ["MEDSEA_ANALYSISFORECAST_PHY_006_013", "cmems_mod_med_phy-tem_anfc_4.2km-2D_PT1H-m"] as const;
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
  corrente: number | null;
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
    const chiave = `2|${data.lat.toFixed(2)},${data.lon.toFixed(2)},${giornoRoma(0)}`;
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
      const oreLocali = ore.map((indice) => oraDelIndice(onde, indice, data.lon));
      const finestra = finestraCalma(oreLocali, altezze);
      giorni.push({
        giorno: giorniIso[i],
        punteggio: null,
        giudizio: null,
        onda,
        periodo: picco ? arrotonda(periodi[picco.indice], 0) : null,
        direzione: picco && direzioni[picco.indice] != null ? Math.round(Number(direzioni[picco.indice])) : null,
        acqua: null,
        corrente: null,
        secchi: null,
        secchiDel: null,
        secchiNota: i > 2 ? "previsione" : "assente",
        vista: null,
        finestraDa: finestra?.da ?? null,
        finestraA: finestra?.a ?? null,
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

    giorni.forEach(chiudiGiudizio);

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
