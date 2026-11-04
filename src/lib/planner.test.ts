import assert from "node:assert/strict";
import test from "node:test";
import { densitaFondo, endAzoto, gasResiduo, intervalloSuperficie, litriPerGas, miscelaLoop, planDive, serieGrafici, tempoNonDeco, type Gas, type PlanInput, type PlanResult } from "./planner.ts";

/**
 * Fascia di Dive Tools, confrontata con Subsurface, MultiDeco e Shearwater
 * (ZHL-16C, acqua dolce, discesa 20 m/min, risalita 10 m/min fino a 6 m,
 * poi 1 m/min, tappe da 3 m, ultima a 6 m). Il tempo di fondo è il runtime di
 * uscita dal fondo, discesa compresa, come in planDive. Il confronto toglie i
 * minuti in più della risalita lenta: le tabelle pubblicate usano 10 m/min
 * fino in superficie. Tolleranza: runtime ±2 min o ±5%, prima tappa ±3 m,
 * CNS ±10 punti, OTU ±15%.
 * I profili aria con decompressione della tabella coincidono con GF 30/70,
 * non con 100/100: a 30 m / 25 min il runtime 48 è quello di GF 30/70.
 */
const ARIA: Gas = { o2: 21, he: 0, switchM: 0 };
const EAN50: Gas = { o2: 50, he: 0, switchM: 21 };
const OSSIGENO: Gas = { o2: 100, he: 0, switchM: 6 };

type Profilo = {
  nome: string;
  depth: number;
  bottomMin: number;
  gfLow: number;
  gfHigh: number;
  bottom: Gas;
  deco: Gas[];
  runtime: number[];
  prima: number[];
  cns: number[];
  otu: number[];
};

const PROFILI: Profilo[] = [
  { nome: "Aria 18 m / 30 min, in curva", depth: 18, bottomMin: 30, gfLow: 100, gfHigh: 100, bottom: ARIA, deco: [], runtime: [32, 32, 31, 32], prima: [], cns: [4, 4, 4], otu: [6, 7, 6] },
  { nome: "Aria 30 m / 25 min, GF 30/70", depth: 30, bottomMin: 25, gfLow: 30, gfHigh: 70, bottom: ARIA, deco: [], runtime: [48, 48, 50, 53], prima: [12, 12, 12, 12], cns: [6, 6, 6, 6], otu: [17, 18, 17] },
  { nome: "Aria 40 m / 30 min, EAN50 a 21 m, GF 30/70", depth: 40, bottomMin: 30, gfLow: 30, gfHigh: 70, bottom: ARIA, deco: [EAN50], runtime: [66, 67, 68, 71], prima: [18, 21, 21, 21], cns: [19, 20, 21, 21], otu: [56, 60, 60] },
  { nome: "Tx 21/35, 45 m / 25 min, GF 30/70", depth: 45, bottomMin: 25, gfLow: 30, gfHigh: 70, bottom: { o2: 21, he: 35, switchM: 0 }, deco: [EAN50, OSSIGENO], runtime: [52, 51, 53, 54], prima: [21, 21, 24, 21], cns: [30, 43, 38, 29], otu: [68, 68, 72] },
  { nome: "Tx 21/35, 45 m / 25 min, GF 40/85", depth: 45, bottomMin: 25, gfLow: 40, gfHigh: 85, bottom: { o2: 21, he: 35, switchM: 0 }, deco: [EAN50, OSSIGENO], runtime: [47, 47, 47, 48], prima: [18, 21, 21, 18], cns: [26, 41, 33, 25], otu: [] },
  { nome: "Tx 21/35, 45 m / 25 min, GF 50/85", depth: 45, bottomMin: 25, gfLow: 50, gfHigh: 85, bottom: { o2: 21, he: 35, switchM: 0 }, deco: [EAN50, OSSIGENO], runtime: [47, 46, 46, 47], prima: [15, 21, 18, 15], cns: [26, 41, 31, 24], otu: [] },
  { nome: "Tx 18/45, 60 m / 25 min, GF 30/70", depth: 60, bottomMin: 25, gfLow: 30, gfHigh: 70, bottom: { o2: 18, he: 45, switchM: 0 }, deco: [EAN50, OSSIGENO], runtime: [82, 81, 81, 82], prima: [33, 30, 33, 30], cns: [51, 77, 62, 47], otu: [108, 110, 112] },
  { nome: "Tx 10/70, 90 m / 20 min, GF 30/70", depth: 90, bottomMin: 20, gfLow: 30, gfHigh: 70, bottom: { o2: 10, he: 70, switchM: 0 }, deco: [{ o2: 21, he: 35, switchM: 42 }, EAN50, OSSIGENO], runtime: [140, 147, 144, 132], prima: [54, 54, 60, 51], cns: [86, 149, 111, 74], otu: [] },
];

function base(partial: Partial<PlanInput> & Pick<PlanInput, "depth" | "bottomMin">): PlanInput {
  return {
    algo: "zhl16c",
    gfLow: 30,
    gfHigh: 70,
    vpmLevel: 0,
    descent: 20,
    ascent: 10,
    lastStop: 6,
    bottom: ARIA,
    deco: [],
    ...partial,
  };
}

function nellaFascia(valore: number, riferimenti: number[], assoluto: number, relativo: number) {
  return riferimenti.some((riferimento) => Math.abs(valore - riferimento) <= Math.max(assoluto, Math.abs(riferimento) * relativo));
}

/** Minuti in più rispetto a una risalita costante a 10 m/min, solo da 6 m in su. */
function extraRisalitaLenta(plan: PlanResult): number {
  let extra = 0;
  for (const riga of plan.segments) {
    if (riga.da <= riga.depth) continue;
    const zona = Math.max(0, Math.min(riga.da, 6) - Math.max(riga.depth, 0));
    extra += zona * (1 - 1 / 10);
  }
  return extra;
}

function pianoDi(profilo: Profilo): PlanResult {
  return planDive(base({
    depth: profilo.depth,
    bottomMin: profilo.bottomMin,
    gfLow: profilo.gfLow,
    gfHigh: profilo.gfHigh,
    bottom: profilo.bottom,
    deco: profilo.deco,
  }));
}

for (const profilo of PROFILI) {
  test(profilo.nome, () => {
    const plan = pianoDi(profilo);
    assert.ok(nellaFascia(plan.runtime - extraRisalitaLenta(plan), profilo.runtime, 2, 0.05), `runtime ${plan.runtime}`);
    if (profilo.prima.length === 0) assert.equal(plan.firstStop, 0);
    else assert.ok(nellaFascia(plan.firstStop, profilo.prima, 3, 0), `prima tappa ${plan.firstStop}`);
    if (profilo.cns.length > 0) assert.ok(nellaFascia(plan.cns, profilo.cns, 10, 0), `cns ${plan.cns}`);
    if (profilo.otu.length > 0) assert.ok(nellaFascia(plan.otu, profilo.otu, 0, 0.15), `otu ${plan.otu}`);
  });
}

test("Aria 30 m / 20 min, GF 50/85", () => {
  const plan = planDive(base({ depth: 30, bottomMin: 20, gfLow: 50, gfHigh: 85 }));
  const stretto = planDive(base({ depth: 30, bottomMin: 20, gfLow: 30, gfHigh: 70 }));
  assert.ok(Number.isFinite(plan.runtime));
  assert.ok(plan.runtime <= stretto.runtime);
});

test("il runtime è la somma dei tratti e le tappe stanno sulla griglia", () => {
  const plan = pianoDi(PROFILI[1]);
  const somma = plan.segments.reduce((totale, riga) => totale + riga.minutes, 0);
  assert.ok(Math.abs(somma - plan.runtime) < 0.05);
  assert.equal(plan.segments.at(-1)?.runtime, plan.runtime);
  for (const riga of plan.segments) {
    if (!riga.fase.startsWith("Sosta")) continue;
    assert.equal(riga.depth % 3, 0);
  }
  const finale = plan.segments.find((riga) => riga.fase === "Risalita in superficie");
  assert.ok(finale);
  assert.ok(finale.da <= 6.05);
  assert.ok(Math.abs(finale.minutes - (finale.da - finale.depth)) < 0.05);
});

test("l'ultima tappa può essere a 5 m e da 6 m si risale a 1 m/min", () => {
  const plan = planDive(base({ depth: 30, bottomMin: 25, lastStop: 5, ascent: 10 }));
  const soste = plan.segments.filter((riga) => riga.fase.startsWith("Sosta"));
  assert.ok(soste.some((riga) => riga.depth === 5));
  assert.ok(soste.every((riga) => riga.depth === 5 || riga.depth % 3 === 0));
  assert.equal(soste.some((riga) => riga.depth === 3), false);
  const lenti = plan.segments.filter((riga) => riga.da <= 6.05 && riga.depth < riga.da && !riga.fase.startsWith("Sosta"));
  const metri = lenti.reduce((totale, riga) => totale + riga.da - riga.depth, 0);
  const minuti = lenti.reduce((totale, riga) => totale + riga.minutes, 0);
  assert.ok(Math.abs(metri - 6) < 0.05, `metri lenti ${metri}`);
  assert.ok(Math.abs(minuti - 6) < 0.05, `minuti lenti ${minuti}`);
  const profondo = plan.segments.find((riga) => riga.fase.startsWith("Risalita") && riga.depth >= 6 && riga.da > riga.depth);
  assert.ok(profondo);
  assert.ok(Math.abs(profondo.minutes - (profondo.da - profondo.depth) / 10) < 0.05);
  const aTre = planDive(base({ depth: 30, bottomMin: 25, lastStop: 3, ascent: 9 }));
  assert.ok(aTre.segments.some((riga) => riga.fase.startsWith("Sosta") && riga.depth === 3));
});

test("ZHL-16C non è più permissivo di ZHL-16B e un GF più basso allunga il piano", () => {
  const comune = { depth: 40, bottomMin: 25, deco: [EAN50] };
  const b = planDive(base({ ...comune, algo: "zhl16b" }));
  const c = planDive(base({ ...comune, algo: "zhl16c" }));
  const largo = planDive(base({ ...comune, gfLow: 50, gfHigh: 85 }));
  assert.ok(c.runtime + 0.05 >= b.runtime);
  assert.ok(c.runtime >= largo.runtime);
});

test("un gas di decompressione perso allunga le tappe", () => {
  const con = planDive(base({ depth: 40, bottomMin: 25, deco: [EAN50, OSSIGENO] }));
  const senza = planDive(base({ depth: 40, bottomMin: 25, deco: [EAN50, OSSIGENO], perdi: { indice: 0, daM: 21 } }));
  assert.ok(senza.decoMin >= con.decoMin);
  assert.ok(senza.runtime >= con.runtime);
});

test("la ripetitiva, dopo un intervallo breve, ha meno margine", () => {
  const prima = planDive(base({ depth: 30, bottomMin: 25 }));
  const dopo = planDive(base({ depth: 18, bottomMin: 30, start: intervalloSuperficie(prima.tissues, 20) }));
  const pulita = planDive(base({ depth: 18, bottomMin: 30 }));
  const residuo = gasResiduo(prima.tissues);
  assert.ok(residuo.bar > 0);
  assert.ok(dopo.runtime >= pulita.runtime);
});

test("il tempo di non decompressione scende con la quota", () => {
  const basso = tempoNonDeco(base({ depth: 18, bottomMin: 30 }));
  const alto = tempoNonDeco(base({ depth: 30, bottomMin: 25 }));
  assert.ok(alto.minuti < basso.minuti);
});

test("avvisi di PpO2, ipossia, miscela impossibile e narcosi", () => {
  const alto = planDive(base({ depth: 40, bottomMin: 20, bottom: { o2: 40, he: 0, switchM: 0 } }));
  const ipossico = planDive(base({ depth: 40, bottomMin: 20, bottom: { o2: 10, he: 50, switchM: 0 } }));
  const rotto = planDive(base({ depth: 30, bottomMin: 20, bottom: { o2: 80, he: 40, switchM: 0 } }));
  assert.ok(alto.warnings.some((riga) => riga.includes("1.40") || riga.includes("1.60")));
  assert.ok(ipossico.warnings.some((riga) => riga.toLowerCase().includes("iposs")));
  assert.ok(rotto.warnings.some((riga) => riga.includes("100%")));
  assert.ok(planDive(base({ depth: 40, bottomMin: 20 })).warnings.some((riga) => riga.includes("END") || riga.includes("narcos")));
});

test("densità, END e litri restano fisici", () => {
  assert.ok(densitaFondo(21, 0, 0) > 1 && densitaFondo(21, 0, 0) < 1.4);
  assert.ok(densitaFondo(21, 0, 30) > densitaFondo(21, 0, 0));
  assert.ok(Math.abs(endAzoto(30, 0.79) - 30) < 0.2);
  const plan = planDive(base({ depth: 30, bottomMin: 25 }));
  const litri = litriPerGas(plan.segments, 20, 15);
  assert.ok(litri.some((riga) => riga.gas === "Aria" && riga.litri > 100));
});

test("VPM-B e un livello intermedio producono un piano finito", () => {
  const plan = planDive(base({ algo: "vpm", depth: 40, bottomMin: 25, vpmLevel: 2, deco: [EAN50] }));
  assert.ok(plan.runtime > 25);
  assert.ok(plan.segments.length > 2);
  assert.ok(plan.segments.every((riga) => Number.isFinite(riga.minutes)));
});

test("sul CCR il loop in fondo tiene il setpoint", () => {
  const loop = miscelaLoop(30, 1.3, 21, 0);
  assert.ok(Math.abs(loop.po2 - 1.3) < 0.05);
  const plan = planDive(base({
    depth: 30,
    bottomMin: 40,
    ccr: { discesa: 1.3, fondo: 1.3, deco: 1.3, diluente: ARIA, metabolismo: 1, rmv: 15 },
  }));
  assert.ok(plan.ccr);
  assert.ok(Math.abs(plan.ppo2 - 1.3) < 0.05);
});

const CCR = [
  { nome: "CCR EAN32, 30 m / 60 min, SP 1.3", depth: 30, bottomMin: 60, dil: { o2: 32, he: 0, switchM: 0 } as Gas },
  { nome: "CCR Tx 21/35, 45 m / 45 min, SP 1.3", depth: 45, bottomMin: 45, dil: { o2: 21, he: 35, switchM: 0 } as Gas },
  { nome: "CCR Tx 18/45, 70 m / 30 min, SP 1.3", depth: 70, bottomMin: 30, dil: { o2: 18, he: 45, switchM: 0 } as Gas },
  { nome: "CCR Tx 10/70, 100 m / 25 min, SP 1.3", depth: 100, bottomMin: 25, dil: { o2: 10, he: 70, switchM: 0 } as Gas },
];

for (const profilo of CCR) {
  test(profilo.nome, () => {
    const plan = planDive(base({
      depth: profilo.depth,
      bottomMin: profilo.bottomMin,
      bottom: profilo.dil,
      ccr: { discesa: 1.3, fondo: 1.3, deco: 1.3, diluente: profilo.dil, metabolismo: 1, rmv: 15 },
    }));
    assert.ok(plan.segments.every((riga) => riga.gas.startsWith("SP ")));
    if (plan.ppo2 > 1.35) assert.ok(plan.warnings.some((riga) => riga.includes("diluente supera il setpoint")));
    else assert.ok(Math.abs(plan.ppo2 - 1.3) < 0.05);
    assert.ok(plan.runtime > profilo.bottomMin);
    assert.ok(Number.isFinite(plan.cns) && Number.isFinite(plan.otu));
  });
}

test("CCR bailout da 70 m, Tx 15/55, EAN50, ossigeno", () => {
  const dil = { o2: 15, he: 55, switchM: 0 };
  const plan = planDive(base({
    depth: 70,
    bottomMin: 20,
    bottom: dil,
    deco: [EAN50, OSSIGENO],
    ccr: { discesa: 1.3, fondo: 1.3, deco: 1.3, diluente: dil, metabolismo: 1, rmv: 15 },
    bailoutDa: 40,
  }));
  assert.ok(plan.segments.some((riga) => riga.gas.startsWith("SP ")));
  assert.ok(plan.segments.some((riga) => riga.gas === "EAN50" || riga.gas === "Ossigeno"));
});

test("in CCR un setpoint di deco più alto accorcia le tappe e il diluente non cresce sul fondo", () => {
  const chiuso = (deco: number, bottomMin: number) => planDive(base({
    depth: 45,
    bottomMin,
    bottom: { o2: 21, he: 35, switchM: 0 },
    ccr: { discesa: 1.3, fondo: 1.3, deco, diluente: { o2: 21, he: 35, switchM: 0 }, metabolismo: 0.8, rmv: 15 },
  }));
  const basso = chiuso(1.2, 30);
  const alto = chiuso(1.5, 30);
  assert.ok(alto.decoMin < basso.decoMin);
  const corto = chiuso(1.3, 25);
  const lungo = chiuso(1.3, 40);
  assert.equal(corto.ccr?.dilLitri, lungo.ccr?.dilLitri);
  assert.ok((corto.ccr?.dilLitri ?? 0) > 0);
  assert.ok((lungo.ccr?.o2Litri ?? 0) > (corto.ccr?.o2Litri ?? 0));
});

test("i grafici extra seguono il piano, la PpO2, l'END e la controdiffusione", () => {
  const aria = base({ depth: 30, bottomMin: 25 });
  const piano = planDive(aria);
  const serie = serieGrafici(aria);
  assert.ok(Math.abs((serie.campioni.at(-1)?.t ?? 0) - piano.runtime) < 0.05);
  const fondo = serie.campioni.find((punto) => Math.abs(punto.depth - 30) < 0.05 && punto.t > 5);
  assert.ok(fondo);
  assert.ok(Math.abs(fondo.ppo2 - 0.21 * (1.01325 + 3)) < 0.03);
  assert.ok(Math.abs(fondo.end - 30) < 0.2);
  const inSosta = serie.campioni.find((punto) => punto.sosta && punto.depth <= 6);
  assert.ok(inSosta);
  assert.ok(fondo.n2Tessuto > (serie.campioni[0]?.n2Tessuto ?? 0));
  assert.ok(serie.campioni.every((punto) => punto.heTessuto < 0.02 && punto.n2Tessuto >= 0));
  assert.ok(inSosta.tessuti[2] > fondo.tessuti[2]);
  assert.ok(serie.campioni.every((punto) => punto.tessuti.every((valore) => Number.isFinite(valore) && valore >= 0)));
  assert.equal(serie.cambi.length, 0);
  assert.equal(serie.rischioIbcd, false);

  const rischioso = serieGrafici(base({
    depth: 40,
    bottomMin: 20,
    bottom: { o2: 18, he: 45, switchM: 0 },
    deco: [{ o2: 21, he: 0, switchM: 21 }],
  }));
  assert.ok(rischioso.cambi.some((cambio) => cambio.rischio && cambio.a === "Aria"));
  const fondoTx = rischioso.campioni.find((punto) => punto.depth > 30 && punto.t > 10);
  assert.ok(fondoTx);
  assert.ok(fondoTx.heTessuto > 0.2);
  assert.ok(fondoTx.n2Tessuto + fondoTx.heTessuto >= fondoTx.n2Tessuto);

  const mite = serieGrafici(base({
    depth: 45,
    bottomMin: 20,
    bottom: { o2: 21, he: 35, switchM: 0 },
    deco: [EAN50],
  }));
  assert.ok(mite.cambi.some((cambio) => cambio.a === "EAN50" && !cambio.rischio));

  const chiuso = serieGrafici(base({
    depth: 30,
    bottomMin: 40,
    ccr: { discesa: 0.7, fondo: 1.3, deco: 1.3, diluente: ARIA, metabolismo: 1, rmv: 15 },
  }));
  const sulFondo = chiuso.campioni.find((punto) => Math.abs(punto.depth - 30) < 0.05 && punto.t > 5);
  assert.ok(sulFondo);
  assert.ok(Math.abs((sulFondo.setpoint ?? 0) - 1.3) < 0.01);
  assert.ok(Math.abs(sulFondo.ppo2 - 1.3) < 0.05);
});

test("due livelli restano nel profilo, nell'ordine, e il cambio gas vale anche lì", () => {
  const quadro = planDive(base({ depth: 40, bottomMin: 20, deco: [EAN50] }));
  const multi = planDive(base({
    depth: 40,
    bottomMin: 20,
    deco: [EAN50],
    livelli: [{ depth: 24, minutes: 10 }, { depth: 15, minutes: 8 }],
  }));
  const nomi = multi.segments.map((riga) => riga.fase);
  const i24 = nomi.findIndex((fase) => fase.startsWith("Livello 24"));
  const i15 = nomi.findIndex((fase) => fase.startsWith("Livello 15"));
  assert.ok(i24 >= 0 && i15 > i24);
  assert.equal(multi.segments[i24].gas, "Aria");
  assert.equal(multi.segments[i15].gas, "EAN50");
  assert.ok(Math.abs(multi.segments[i24].minutes - 10) < 0.05);
  assert.ok(Math.abs(multi.segments[i15].minutes - 8) < 0.05);
  assert.ok(multi.runtime > quadro.runtime + 17);
  const grafico = serieGrafici(base({
    depth: 40,
    bottomMin: 20,
    deco: [EAN50],
    livelli: [{ depth: 24, minutes: 10 }, { depth: 15, minutes: 8 }],
  }));
  assert.ok(grafico.campioni.some((punto) => Math.abs(punto.depth - 15) < 0.2 && punto.sosta));
  assert.ok(grafico.cambi.some((cambio) => cambio.a === "EAN50"));
});
