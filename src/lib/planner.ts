export type Algo = "zhl16b" | "zhl16c" | "vpm";

export const CHIAVE_PIANO_LOGBOOK = "tritone-piano-logbook";

export type Gas = { o2: number; he: number; switchM: number };

export type TissueState = { n2: number[]; he: number[] };

export type PlanInput = {
  algo: Algo;
  depth: number;
  /** Runtime a cui inizia la risalita, in minuti. La discesa è già compresa. */
  bottomMin: number;
  gfLow: number;
  gfHigh: number;
  vpmLevel: number;
  descent: number;
  ascent: number;
  lastStop: 3 | 5 | 6;
  bottom: Gas;
  deco: Gas[];
  /** Tessuti già carichi, dopo un intervallo di superficie. Senza, si parte da saturati in aria. */
  start?: TissueState;
  /** Gas di deco perso: da questa quota in su non si usa più. L'indice è nella lista deco. */
  perdi?: { indice: number; daM: number };
  /** Se presente, il fondo è a circuito chiuso. Il gas di fondo è il diluente. */
  ccr?: {
    discesa: number;
    fondo: number;
    deco: number;
    diluente: Gas;
    metabolismo: number;
    rmv: number;
  };
  /** Tratti in quota dopo il fondo, prima della risalita finale. */
  livelli?: { depth: number; minutes: number }[];
  /** Quota a cui si passa al circuito aperto sui gas di bailout. Solo con ccr. */
  bailoutDa?: number;
};

export type Segment = {
  fase: string;
  /** Quota di partenza del tratto, in metri. */
  da: number;
  depth: number;
  minutes: number;
  gas: string;
  runtime: number;
};

export type PlanResult = {
  segments: Segment[];
  runtime: number;
  decoMin: number;
  ppo2: number;
  end: number;
  cns: number;
  otu: number;
  warnings: string[];
  firstStop: number;
  tissues: TissueState;
  /** Litri di ossigeno metabolico e di diluente, e la miscela del loop in fondo. */
  ccr?: { o2Litri: number; dilLitri: number; fo2: number; fhe: number };
};

const N = 16;
const HT_N2 = [5, 8, 12.5, 18.5, 27, 38.3, 54.3, 77, 109, 146, 187, 239, 305, 390, 498, 635];
const HT_HE = [1.88, 3.02, 4.72, 6.99, 10.21, 14.48, 20.53, 29.11, 41.2, 55.19, 70.69, 90.34, 115.29, 147.42, 188.24, 240.03];
const B_N2 = [0.5578, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.891, 0.9092, 0.9222, 0.9319, 0.9403, 0.9477, 0.9544, 0.9602, 0.9653];
const A_HE = [1.6189, 1.383, 1.1919, 1.0458, 0.922, 0.8205, 0.7305, 0.6502, 0.595, 0.5545, 0.5333, 0.5189, 0.5181, 0.5176, 0.5172, 0.5119];
const B_HE = [0.477, 0.5747, 0.6527, 0.7223, 0.7582, 0.7957, 0.8279, 0.8553, 0.8757, 0.8903, 0.8997, 0.9073, 0.9122, 0.9171, 0.9217, 0.9267];
const A_N2: Record<"zhl16b" | "zhl16c", number[]> = {
  zhl16b: [1.1696, 1, 0.8618, 0.7562, 0.6667, 0.56, 0.4947, 0.45, 0.4187, 0.3798, 0.3497, 0.3223, 0.285, 0.2737, 0.2523, 0.2327],
  zhl16c: [1.1696, 1, 0.8618, 0.7562, 0.62, 0.5043, 0.441, 0.4, 0.375, 0.35, 0.3295, 0.3065, 0.2835, 0.261, 0.248, 0.2327],
};

const SURFACE = 1.01325;
const VAPOR = 0.0627;
const K_N2 = HT_N2.map((ht) => Math.LN2 / ht);
const K_HE = HT_HE.map((ht) => Math.LN2 / ht);

const GAMMA = 0.0179;
const GAMMA_C = 0.257;
const R_N2 = 0.55e-6;
const R_HE = 0.45e-6;
const LAMBDA = 7500 / 33;
const VPM_BUMP = [1, 1.05, 1.12, 1.22, 1.35, 1.5];

type Load = TissueState;

function emptyLoad(): Load {
  const n2 = Array.from({ length: N }, () => (SURFACE - VAPOR) * 0.7902);
  const he = Array.from({ length: N }, () => 0);
  return { n2, he };
}

function clone(load: Load): Load {
  return { n2: load.n2.slice(), he: load.he.slice() };
}

const ARIA: Gas = { o2: 21, he: 0, switchM: 0 };

/** In superficie si respira aria: l'azoto e l'elio ancora nei tessuti scendono verso l'equilibrio. */
export function intervalloSuperficie(load: TissueState, minutes: number): TissueState {
  const next = clone(load);
  expose(next, ARIA, 0, 0, Math.max(0, minutes));
  return next;
}

export function gasResiduo(load: TissueState): { bar: number; equilibrio: number } {
  let bar = 0;
  for (let i = 0; i < N; i += 1) bar = Math.max(bar, load.n2[i] + load.he[i]);
  return { bar, equilibrio: (SURFACE - VAPOR) * 0.7902 };
}

function ambient(depth: number): number {
  return SURFACE + depth / 10;
}

function fractions(gas: Gas): { o2: number; he: number; n2: number } {
  const o2 = gas.o2 / 100;
  const he = gas.he / 100;
  return { o2, he, n2: Math.max(0, 1 - o2 - he) };
}

function inspired(gas: Gas, depth: number): { n2: number; he: number } {
  const dry = Math.max(0, ambient(depth) - VAPOR);
  const mix = fractions(gas);
  return { n2: dry * mix.n2, he: dry * mix.he };
}

function schreiner(p0: number, pi0: number, pi1: number, k: number, minutes: number): number {
  if (minutes <= 0) return p0;
  const r = (pi1 - pi0) / minutes;
  const e = Math.exp(-k * minutes);
  return pi0 + r * (minutes - 1 / k) - (pi0 - p0 - r / k) * e;
}

function expose(load: Load, gas: Gas, from: number, to: number, minutes: number) {
  if (minutes <= 0) return;
  const a = inspired(gas, from);
  const b = inspired(gas, to);
  for (let i = 0; i < N; i += 1) {
    load.n2[i] = schreiner(load.n2[i], a.n2, b.n2, K_N2[i], minutes);
    load.he[i] = schreiner(load.he[i], a.he, b.he, K_HE[i], minutes);
  }
}

function ceilingBuhl(load: Load, algo: "zhl16b" | "zhl16c", gf: number): number {
  let worst = 0;
  const g = Math.min(1, Math.max(0.05, gf));
  for (let i = 0; i < N; i += 1) {
    const pt = load.n2[i] + load.he[i];
    const ratio = pt > 1e-9 ? load.he[i] / pt : 0;
    const a = A_N2[algo][i] * (1 - ratio) + A_HE[i] * ratio;
    const b = B_N2[i] * (1 - ratio) + B_HE[i] * ratio;
    const amb = (pt - g * a) / (g / b + 1 - g);
    const depth = (amb - SURFACE) * 10;
    if (depth > worst) worst = depth;
  }
  return Math.max(0, worst);
}

function boyle(g0: number, pFirst: number, pAmb: number): number {
  if (g0 <= 0.01) return g0;
  const c = (g0 + pFirst) / (g0 * g0 * g0);
  let g = g0;
  for (let n = 0; n < 16; n += 1) {
    const f = c * g * g * g - g - pAmb;
    const df = 3 * c * g * g - 1;
    if (Math.abs(df) < 1e-8) break;
    const next = g - f / df;
    g = next > 0.02 ? next : g / 2;
  }
  return g;
}

function nucleusGradient(radius: number, pCrushBar: number): number {
  const skin = 2 * (GAMMA_C - GAMMA);
  const crushPa = Math.max(0, pCrushBar) * 1e5;
  const crushed = skin / (crushPa + skin / radius);
  const gPa = 2 * (GAMMA / GAMMA_C) * (GAMMA_C - GAMMA) / crushed;
  return gPa / 1e5;
}

function ceilingVpm(load: Load, g0: number, pFirst: number): number {
  let worst = 0;
  for (let depth = 0; depth <= 160; depth += 0.5) {
    const p = ambient(depth);
    const g = pFirst > 0 ? boyle(g0, pFirst, p) : g0;
    let limited = false;
    for (let i = 0; i < N; i += 1) {
      if (load.n2[i] + load.he[i] > p + g) limited = true;
    }
    if (!limited) return depth;
    worst = depth;
  }
  return worst;
}

function gasName(gas: Gas): string {
  const o2 = Math.round(gas.o2);
  const he = Math.round(gas.he);
  if (he <= 0 && o2 >= 99) return "Ossigeno";
  if (he <= 0 && o2 >= 20 && o2 <= 22) return "Aria";
  if (he <= 0) return `EAN${o2}`;
  return `Tx ${o2}/${he}`;
}

const FASCE_CNS: [number, number][] = [
  [0.6, 720],
  [0.7, 570],
  [0.8, 450],
  [0.9, 360],
  [1, 300],
  [1.1, 240],
  [1.2, 210],
  [1.3, 180],
  [1.4, 150],
  [1.5, 120],
  [1.6, 45],
];

/** Minuti NOAA per il 100% alla ppO2 reale. Non sale alla fascia più alta. Sotto 0,5 non conta. */
function limiteCns(ppo2: number): number | null {
  if (ppo2 < 0.5) return null;
  const usata = ppo2 > 1.6 ? 1.6 : ppo2;
  let limite: number | null = null;
  for (const [soglia, minuti] of FASCE_CNS) {
    if (usata + 1e-9 >= soglia) limite = minuti;
  }
  return limite;
}

function otuPerMin(ppo2: number): number {
  if (ppo2 <= 0.5) return 0;
  return ((ppo2 - 0.5) / 0.5) ** 0.83;
}

function snapUp(depth: number, step: number, last: number): number {
  if (depth <= 0.05) return 0;
  const grid = Math.ceil((depth - 1e-6) / step) * step;
  return Math.max(last, grid);
}

/** Da 6 m in su la risalita è a 1 m/min. Più fondo resta la velocità impostata. */
const QUOTA_LENTA = 6;

function minutiRisalita(da: number, a: number, ascent: number): number {
  if (da <= a) return 0;
  const veloce = Math.max(0, da - Math.max(a, QUOTA_LENTA));
  const lento = Math.max(0, Math.min(da, QUOTA_LENTA) - Math.max(0, a));
  return veloce / Math.max(1, ascent) + lento / 1;
}

/** Spezza sul confine dei 6 m, così il profilo mostra il cambio di velocità. */
function quoteRisalita(da: number, a: number): number[] {
  if (da <= a + 1e-6) return [];
  if (da > QUOTA_LENTA + 0.05 && a < QUOTA_LENTA - 0.05) return [QUOTA_LENTA, a];
  return [a];
}

function pickGas(depth: number, bottom: Gas, deco: Gas[]): Gas {
  let chosen = bottom;
  for (const gas of deco) {
    if (gas.switchM + 0.05 < depth) continue;
    const ppo2 = fractions(gas).o2 * ambient(depth);
    if (ppo2 > 1.65) continue;
    if (fractions(gas).o2 >= fractions(chosen).o2) chosen = gas;
  }
  return chosen;
}

function controllingK(load: Load): number {
  let best = 0;
  let k = K_N2[N - 1];
  for (let i = 0; i < N; i += 1) {
    const p = load.n2[i] + load.he[i];
    if (p > best) {
      best = p;
      const he = p > 0 ? load.he[i] / p : 0;
      k = K_N2[i] * (1 - he) + K_HE[i] * he;
    }
  }
  return k;
}

function relaxGradient(g0: number, gCrush: number, k: number, decoMin: number): number {
  if (decoMin <= 0 || g0 <= 0) return g0;
  const alpha = Math.max(k, 1e-6);
  const t = decoMin + 1 / alpha;
  const a = t;
  const b = -(LAMBDA + t * g0);
  const c = LAMBDA * alpha * Math.max(gCrush, 0);
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return g0;
  const root = (-b + Math.sqrt(disc)) / (2 * a);
  if (!Number.isFinite(root) || root < g0) return g0;
  return root;
}

/** END sull'azoto. Ossigeno ed elio non sono narcotici. fn2 è la frazione, da 0 a 1. */
export function endAzoto(depth: number, fn2: number): number {
  return Math.max(0, (depth + 10) * (Math.max(0, fn2) / 0.79) - 10);
}

function planDiveOc(input: PlanInput): PlanResult {
  const warnings: string[] = [];
  const bottom = input.bottom;
  const mix = fractions(bottom);
  if (mix.o2 + mix.he > 1.001) warnings.push("Ossigeno e elio insieme superano il 100%.");
  const ppo2 = mix.o2 * ambient(input.depth);
  const end = endAzoto(input.depth, mix.n2);
  if (ppo2 > 1.4) warnings.push(`PpO2 di fondo ${ppo2.toFixed(2)} bar: sopra 1.40.`);
  if (ppo2 > 1.6) warnings.push("PpO2 di fondo sopra 1.60: miscela non usabile a questa quota.");
  if (ppo2 < 0.18) warnings.push("PpO2 di fondo sotto 0.18: ipossica a questa quota.");
  else if (mix.o2 * SURFACE < 0.18) {
    warnings.push("In superficie questa miscela è ipossica: non respirarla prima della quota in cui la PpO2 sale.");
  }
  for (const gas of input.deco) {
    if (gas.o2 + gas.he > 100.5) warnings.push(`${gasName(gas)}: ossigeno e elio superano il 100%.`);
    if (gas.switchM >= input.depth) {
      warnings.push(`${gasName(gas)}: il cambio a ${Math.round(gas.switchM)} m non è sopra il fondo, resta fuori dal piano.`);
      continue;
    }
    const switchPo2 = fractions(gas).o2 * ambient(Math.max(0, gas.switchM));
    if (switchPo2 > 1.65) {
      warnings.push(`${gasName(gas)} a ${Math.round(gas.switchM)} m ha PpO2 ${switchPo2.toFixed(2)} bar, oltre 1.65: non viene scelta.`);
    }
  }

  const buhl = input.algo === "vpm" ? "zhl16c" : input.algo;
  const load = input.start ? clone(input.start) : emptyLoad();
  let cns = 0;
  let otu = 0;
  const addTox = (gas: Gas, depth: number, minutes: number) => {
    const po2 = fractions(gas).o2 * ambient(depth);
    otu += otuPerMin(po2) * minutes;
  };

  const descentMin = input.depth / Math.max(1, input.descent);
  // Il tempo impostato è il runtime di uscita dal fondo: la discesa non si somma.
  const fondoMin = Math.max(0, input.bottomMin - descentMin);
  if (input.bottomMin + 1e-6 < descentMin) {
    warnings.push("Il tempo di fondo è più corto della discesa: la risalita inizia appena raggiunta la quota.");
  }
  expose(load, bottom, 0, input.depth, descentMin);
  addTox(bottom, input.depth / 2, descentMin);
  let gCrush = 0;
  for (let i = 0; i < N; i += 1) {
    gCrush = Math.max(gCrush, ambient(input.depth) - load.n2[i] - load.he[i]);
  }
  expose(load, bottom, input.depth, input.depth, fondoMin);
  addTox(bottom, input.depth, fondoMin);

  const level = Math.min(5, Math.max(0, Math.round(input.vpmLevel)));
  const bump = VPM_BUMP[level];
  const pCrush = Math.max(0, ambient(input.depth) - SURFACE);
  let g0 =
    nucleusGradient(R_N2 * bump, pCrush) * mix.n2 + nucleusGradient(R_HE * bump, pCrush) * mix.he;
  if (g0 < 0.2) g0 = nucleusGradient(R_N2 * bump, pCrush);

  const gfLow = input.gfLow / 100;
  const gfHigh = input.gfHigh / 100;
  const step = 3;
  const last = input.lastStop;
  const decoAlla = (depth: number) => {
    const perso = input.perdi;
    if (!perso || perso.indice < 0 || perso.indice >= input.deco.length) return input.deco;
    if (depth > perso.daM + 0.05) return input.deco;
    return input.deco.filter((_, index) => index !== perso.indice);
  };

  let gradient = input.algo === "vpm" ? g0 : 0;

  const build = (g: number) => {
    const work = clone(load);
    const high = input.algo === "vpm" ? ceilingVpm(work, g, 0) : ceilingBuhl(work, buhl, gfHigh);
    const low = input.algo === "vpm" ? high : ceilingBuhl(work, buhl, gfLow);
    const obligation = input.algo === "vpm" ? high : high;
    let first = obligation <= 0.5 ? 0 : snapUp(Math.max(high, low), step, last);
    if (first > input.depth) first = snapUp(input.depth, step, last);
    const pFirst = first > 0 ? ambient(first) : SURFACE;
    const rows: { depth: number; minutes: number; gas: Gas; kind: "move" | "stop" }[] = [];
    const tox: { gas: Gas; depth: number; minutes: number }[] = [];
    const addToxHold = (gasNow: Gas, depth: number, minutes: number) => {
      tox.push({ gas: gasNow, depth, minutes });
    };
    if (first <= 0) {
      const rows: { depth: number; minutes: number; gas: Gas; kind: "move" | "stop" }[] = [];
      let qui = input.depth;
      for (const meta of quoteRisalita(qui, 0)) {
        const minutes = minutiRisalita(qui, meta, input.ascent);
        expose(work, bottom, qui, meta, minutes);
        addToxHold(bottom, (qui + meta) / 2, minutes);
        rows.push({ depth: meta, minutes, gas: bottom, kind: "move" });
        qui = meta;
      }
      return { rows, first: 0, deco: 0, tox, tissues: work };
    }

    const switches = input.deco
      .map((gas) => gas.switchM)
      .filter((depth) => depth < input.depth - 0.1 && depth > first)
      .sort((a, b) => b - a);
    let cursor = input.depth;
    let gas = bottom;
    const ascendTo = (target: number) => {
      for (const meta of quoteRisalita(cursor, target)) {
        const minutes = minutiRisalita(cursor, meta, input.ascent);
        expose(work, gas, cursor, meta, minutes);
        addToxHold(gas, (cursor + meta) / 2, minutes);
        rows.push({ depth: meta, minutes, gas, kind: "move" });
        cursor = meta;
      }
    };
    for (const depth of switches) {
      ascendTo(depth);
      gas = pickGas(depth, bottom, decoAlla(depth));
    }
    if (cursor > first) ascendTo(first);

    let deco = 0;
    let depth = first;
    while (depth >= last - 0.01) {
      gas = pickGas(depth, bottom, decoAlla(depth));
      const next = depth <= last + 0.01 ? 0 : Math.max(last, depth - step);
      const target = next <= 0 ? 0 : next;
      let wait = 0;
      for (let guard = 0; guard < 300; guard += 1) {
        const trial = clone(work);
        if (wait > 0) expose(trial, gas, depth, depth, wait);
        const gf =
          input.algo === "vpm" ? 0 : gfHigh + (gfLow - gfHigh) * (target / Math.max(first, 0.1));
        const ceil = input.algo === "vpm" ? ceilingVpm(trial, g, pFirst) : ceilingBuhl(trial, buhl, gf);
        if (ceil <= target + 0.15) break;
        wait += 1;
      }
      if (wait >= 300) warnings.push("Sosta oltre 300 minuti: piano interrotto.");
      if (wait > 0) {
        expose(work, gas, depth, depth, wait);
        addToxHold(gas, depth, wait);
        rows.push({ depth, minutes: wait, gas, kind: "stop" });
        deco += wait;
      }
      if (next <= 0) {
        for (const meta of quoteRisalita(depth, 0)) {
          const minutes = minutiRisalita(depth, meta, input.ascent);
          expose(work, gas, depth, meta, minutes);
          addToxHold(gas, (depth + meta) / 2, minutes);
          rows.push({ depth: meta, minutes, gas, kind: "move" });
          depth = meta;
        }
        break;
      }
      for (const meta of quoteRisalita(depth, next)) {
        const minutes = minutiRisalita(depth, meta, input.ascent);
        expose(work, gas, depth, meta, minutes);
        addToxHold(gas, (depth + meta) / 2, minutes);
        rows.push({ depth: meta, minutes, gas, kind: "move" });
        depth = meta;
      }
    }
    return { rows, first, deco, tox, tissues: work };
  };

  let built = build(gradient);
  if (input.algo === "vpm" && built.deco > 0) {
    for (let pass = 0; pass < 4; pass += 1) {
      const raw = relaxGradient(g0, gCrush, controllingK(load), built.deco);
      const next = Math.min(raw, Math.max(g0 * 1.6, g0 + 0.15));
      if (next <= gradient + 0.03) break;
      const trial = build(next);
      if (trial.deco < 1 || trial.first + 6 < built.first) break;
      gradient = next;
      built = trial;
    }
  }
  for (const dose of built.tox ?? []) addTox(dose.gas, dose.depth, dose.minutes);

  const tratti = [
    { gas: bottom, depth: input.depth / 2, minutes: descentMin },
    { gas: bottom, depth: input.depth, minutes: fondoMin },
    ...(built.tox ?? []),
  ];
  for (const tratto of tratti) {
    const po2 = fractions(tratto.gas).o2 * ambient(tratto.depth);
    const limite = limiteCns(po2);
    if (limite != null && tratto.minutes > 0) cns += (tratto.minutes / limite) * 100;
  }

  const segments: Segment[] = [];
  let runtime = 0;
  const push = (fase: string, da: number, depth: number, minutes: number, gas: Gas) => {
    runtime += minutes;
    segments.push({ fase, da, depth, minutes, gas: gasName(gas), runtime });
  };
  push("Discesa", 0, input.depth, descentMin, bottom);
  if (fondoMin > 0) push("Fondo", input.depth, input.depth, fondoMin, bottom);
  let decoMin = 0;
  let firstActual = 0;
  let quota = input.depth;
  for (const row of built.rows) {
    if (row.kind === "stop") {
      if (firstActual === 0) firstActual = row.depth;
      decoMin += row.minutes;
      push(`Sosta ${Math.round(row.depth)} m`, row.depth, row.depth, row.minutes, row.gas);
      quota = row.depth;
      continue;
    }
    const da = quota;
    quota = row.depth;
    const name = gasName(row.gas);
    const prev = segments[segments.length - 1];
    if (prev?.fase.startsWith("Risalita") && prev.gas === name && ((prev.da >= 6 && prev.depth >= 6 && row.depth >= 6) || (prev.da <= 6 && prev.depth <= 6 && row.depth <= 6))) {
      runtime += row.minutes;
      prev.minutes += row.minutes;
      prev.depth = row.depth;
      prev.runtime = runtime;
      prev.fase = row.depth <= 0 ? "Risalita in superficie" : `Risalita a ${Math.round(row.depth)} m`;
      continue;
    }
    push(row.depth <= 0 ? "Risalita in superficie" : `Risalita a ${Math.round(row.depth)} m`, da, row.depth, row.minutes, row.gas);
  }
  if (firstActual <= 0) warnings.push("Nessuna sosta decompressiva. Resta prudente una sosta di sicurezza di 3 minuti intorno ai 5 m.");
  if (cns > 80) warnings.push(`CNS ${Math.round(cns)}%: carico di ossigeno alto.`);
  if (end > 30) warnings.push(`END ${end.toFixed(0)} m: narcosi da tenere d'occhio.`);

  return {
    segments,
    runtime,
    decoMin,
    ppo2,
    end,
    cns,
    otu,
    warnings,
    firstStop: firstActual,
    tissues: built.tissues,
  };
}

type RigaSalita = { depth: number; minutes: number; gas: Gas | string; kind: "move" | "stop" };

function loopAt(depth: number, setpoint: number, dil: Gas) {
  const dry = Math.max(0.2, ambient(depth) - VAPOR);
  const mix = fractions(dil);
  const po2Dil = dry * mix.o2;
  const po2Max = dry;
  let po2: number;
  let pn2: number;
  let phe: number;
  if (setpoint >= po2Max - 1e-6) {
    po2 = po2Max;
    pn2 = 0;
    phe = 0;
  } else if (setpoint <= po2Dil + 1e-6) {
    po2 = po2Dil;
    pn2 = dry * mix.n2;
    phe = dry * mix.he;
  } else {
    po2 = setpoint;
    const inert = mix.n2 + mix.he;
    const prem = Math.max(0, dry - po2);
    if (inert <= 1e-6) {
      pn2 = 0;
      phe = 0;
    } else {
      pn2 = prem * (mix.n2 / inert);
      phe = prem * (mix.he / inert);
    }
  }
  return { po2, pn2, phe, fo2: po2 / dry, fhe: phe / dry, fn2: pn2 / dry };
}

function quoteLoop(from: number, to: number, setpoint: number, dil: Gas): number[] {
  const fo2 = fractions(dil).o2;
  const limiti = [from];
  const candidati = [setpoint + VAPOR <= SURFACE ? -1 : (setpoint + VAPOR - SURFACE) * 10];
  if (fo2 > 0.02) candidati.push((setpoint / fo2 + VAPOR - SURFACE) * 10);
  const basso = Math.min(from, to);
  const alto = Math.max(from, to);
  for (const quota of candidati) {
    if (quota > basso + 0.05 && quota < alto - 0.05) limiti.push(quota);
  }
  limiti.push(to);
  limiti.sort((a, b) => (to >= from ? a - b : b - a));
  return limiti;
}

function exposeLoop(load: Load, from: number, to: number, minutes: number, setpoint: number, dil: Gas, onPo2: (po2: number, minutes: number) => void) {
  if (minutes <= 0) return;
  const quote = quoteLoop(from, to, setpoint, dil);
  const span = Math.max(0.001, Math.abs(to - from));
  if (Math.abs(to - from) < 0.001) {
    const qui = loopAt(from, setpoint, dil);
    for (let i = 0; i < N; i += 1) {
      load.n2[i] = schreiner(load.n2[i], qui.pn2, qui.pn2, K_N2[i], minutes);
      load.he[i] = schreiner(load.he[i], qui.phe, qui.phe, K_HE[i], minutes);
    }
    onPo2(qui.po2, minutes);
    return;
  }
  for (let s = 1; s < quote.length; s += 1) {
    const a = quote[s - 1];
    const b = quote[s];
    const parte = Math.abs(b - a) / span * minutes;
    const da = loopAt(a, setpoint, dil);
    const aFine = loopAt(b, setpoint, dil);
    for (let i = 0; i < N; i += 1) {
      load.n2[i] = schreiner(load.n2[i], da.pn2, aFine.pn2, K_N2[i], parte);
      load.he[i] = schreiner(load.he[i], da.phe, aFine.phe, K_HE[i], parte);
    }
    onPo2((da.po2 + aFine.po2) / 2, parte);
  }
}

function etichettaSp(setpoint: number) {
  return `SP ${setpoint.toFixed(2)}`;
}

/** Miscela inspirata sul loop a una quota. fo2 e fhe sono in percentuale. */
export function miscelaLoop(depth: number, setpoint: number, o2: number, he: number) {
  const loop = loopAt(depth, setpoint, { o2, he, switchM: 0 });
  return { po2: loop.po2, fo2: loop.fo2 * 100, fhe: loop.fhe * 100, fn2: loop.fn2 * 100, end: endAzoto(depth, loop.fn2) };
}

/** CCR, livelli e bailout. Il circuito aperto quadrato resta in planDiveOc. */
function planDiveEsteso(input: PlanInput, livelli: { depth: number; minutes: number }[]): PlanResult {
  const warnings: string[] = [];
  const ccr = input.ccr;
  const bottom = ccr?.diluente ?? input.bottom;
  const mix = fractions(bottom);
  if (mix.o2 + mix.he > 1.001) warnings.push("Ossigeno e elio insieme superano il 100%.");
  const loopFondo = ccr ? loopAt(input.depth, ccr.fondo, bottom) : null;
  const ppo2 = loopFondo ? loopFondo.po2 : mix.o2 * ambient(input.depth);
  const end = loopFondo ? endAzoto(input.depth, loopFondo.fn2) : endAzoto(input.depth, mix.n2);
  if (!ccr) {
    if (ppo2 > 1.4) warnings.push(`PpO2 di fondo ${ppo2.toFixed(2)} bar: sopra 1.40.`);
    if (ppo2 > 1.6) warnings.push("PpO2 di fondo sopra 1.60: miscela non usabile a questa quota.");
    if (ppo2 < 0.18) warnings.push("PpO2 di fondo sotto 0.18: ipossica a questa quota.");
  } else {
    if (ppo2 > 1.4) warnings.push(`PpO2 di fondo ${ppo2.toFixed(2)} bar: sopra 1.40.`);
    if (ppo2 > 1.6) warnings.push("PpO2 di fondo sopra 1.60: miscela non usabile a questa quota.");
    const dilPo2 = mix.o2 * Math.max(0.2, ambient(input.depth) - VAPOR);
    if (ccr.fondo <= dilPo2 + 0.02) warnings.push("A questa quota il diluente supera il setpoint: il loop è il diluente.");
  }
  if (mix.o2 * SURFACE < 0.18) {
    warnings.push("In superficie questa miscela è ipossica: non respirarla prima della quota in cui la PpO2 sale.");
  }
  for (const gas of input.deco) {
    if (gas.o2 + gas.he > 100.5) warnings.push(`${gasName(gas)}: ossigeno e elio superano il 100%.`);
    if (gas.switchM >= input.depth) {
      warnings.push(`${gasName(gas)}: il cambio a ${Math.round(gas.switchM)} m non è sopra il fondo, resta fuori dal piano.`);
      continue;
    }
    const switchPo2 = fractions(gas).o2 * ambient(Math.max(0, gas.switchM));
    if (switchPo2 > 1.65) {
      warnings.push(`${gasName(gas)} a ${Math.round(gas.switchM)} m ha PpO2 ${switchPo2.toFixed(2)} bar, oltre 1.65: non viene scelta.`);
    }
  }

  const buhl = input.algo === "vpm" ? "zhl16c" : input.algo;
  const load = input.start ? clone(input.start) : emptyLoad();
  let cns = 0;
  let otu = 0;
  let dilLitri = 0;
  let minutiCcr = 0;
  const tossico = (po2: number, minutes: number) => {
    otu += otuPerMin(po2) * minutes;
    const limite = limiteCns(po2);
    if (limite != null && minutes > 0) cns += (minutes / limite) * 100;
  };
  const applicaOc = (gas: Gas, from: number, to: number, minutes: number) => {
    if (minutes <= 0) return;
    expose(load, gas, from, to, minutes);
    tossico(fractions(gas).o2 * ambient((from + to) / 2), minutes);
  };
  const applicaCcr = (from: number, to: number, minutes: number, setpoint: number) => {
    if (!ccr || minutes <= 0) return;
    exposeLoop(load, from, to, minutes, setpoint, bottom, tossico);
    minutiCcr += minutes;
    if (to > from + 0.05) {
      const media = (ambient(from) + ambient(to)) / 2;
      dilLitri += ccr.rmv * minutes * (media / SURFACE);
    }
  };

  const descentMin = input.depth / Math.max(1, input.descent);
  const fondoMin = Math.max(0, input.bottomMin - descentMin);
  if (input.bottomMin + 1e-6 < descentMin) {
    warnings.push("Il tempo di fondo è più corto della discesa: la risalita inizia appena raggiunta la quota.");
  }
  if (ccr) applicaCcr(0, input.depth, descentMin, ccr.discesa);
  else applicaOc(bottom, 0, input.depth, descentMin);
  let gCrush = 0;
  for (let i = 0; i < N; i += 1) gCrush = Math.max(gCrush, ambient(input.depth) - load.n2[i] - load.he[i]);
  if (ccr) applicaCcr(input.depth, input.depth, fondoMin, ccr.fondo);
  else applicaOc(bottom, input.depth, input.depth, fondoMin);

  const trattiExtra: { fase: string; da: number; depth: number; minutes: number; gas: Gas | string }[] = [];
  let cursor = input.depth;
  const decoAlla = (depth: number) => {
    const perso = input.perdi;
    if (!perso || perso.indice < 0 || perso.indice >= input.deco.length) return input.deco;
    if (depth > perso.daM + 0.05) return input.deco;
    return input.deco.filter((_, index) => index !== perso.indice);
  };
  const muoviVerso = (meta: number) => {
    if (ccr) {
      const salendo = meta < cursor;
      const tappe = salendo ? quoteRisalita(cursor, meta) : [meta];
      for (const tappa of tappe) {
        const minuti = salendo ? minutiRisalita(cursor, tappa, input.ascent) : Math.abs(tappa - cursor) / Math.max(1, input.descent);
        applicaCcr(cursor, tappa, minuti, tappa > cursor ? ccr.discesa : ccr.fondo);
        trattiExtra.push({
          fase: tappa > cursor ? "Discesa" : `Risalita a ${Math.round(tappa)} m`,
          da: cursor,
          depth: tappa,
          minutes: minuti,
          gas: etichettaSp(tappa > cursor ? ccr.discesa : ccr.fondo),
        });
        cursor = tappa;
      }
      return;
    }
    if (meta > cursor) {
      const gas = pickGas(meta, bottom, decoAlla(meta));
      const minuti = (meta - cursor) / Math.max(1, input.descent);
      applicaOc(gas, cursor, meta, minuti);
      trattiExtra.push({ fase: "Discesa", da: cursor, depth: meta, minutes: minuti, gas });
      cursor = meta;
      return;
    }
    const quote = decoAlla(cursor)
      .map((gas) => gas.switchM)
      .filter((depth) => depth < cursor - 0.1 && depth > meta + 0.05)
      .sort((a, b) => b - a);
    let gas = pickGas(cursor, bottom, decoAlla(cursor));
    const vai = (target: number) => {
      for (const tappa of quoteRisalita(cursor, target)) {
        const minuti = minutiRisalita(cursor, tappa, input.ascent);
        applicaOc(gas, cursor, tappa, minuti);
        trattiExtra.push({ fase: `Risalita a ${Math.round(tappa)} m`, da: cursor, depth: tappa, minutes: minuti, gas });
        cursor = tappa;
        gas = pickGas(tappa, bottom, decoAlla(tappa));
      }
    };
    for (const depth of quote) vai(depth);
    if (cursor > meta + 0.05) vai(meta);
  };
  for (const livello of livelli) {
    const meta = livello.depth;
    if (Math.abs(meta - cursor) > 0.4) {
      if (meta + 1 < cursor) {
        const soffitto = input.algo === "vpm" ? ceilingVpm(load, 0.2, 0) : ceilingBuhl(load, buhl, input.gfHigh / 100);
        if (meta + 1 < soffitto) warnings.push("Tra un livello e l'altro la risalita passa oltre la quota di decompressione.");
      }
      muoviVerso(meta);
    }
    const gasLivello = ccr ? etichettaSp(ccr.fondo) : pickGas(meta, bottom, decoAlla(meta));
    if (ccr) applicaCcr(meta, meta, livello.minutes, ccr.fondo);
    else applicaOc(gasLivello as Gas, meta, meta, livello.minutes);
    trattiExtra.push({ fase: `Livello ${Math.round(meta)} m`, da: meta, depth: meta, minutes: livello.minutes, gas: gasLivello });
  }

  const partenza = cursor;
  const profMix = ccr ? loopAt(input.depth, ccr.fondo, bottom) : { fn2: mix.n2, fhe: mix.he };
  const level = Math.min(5, Math.max(0, Math.round(input.vpmLevel)));
  const bump = VPM_BUMP[level];
  const pCrush = Math.max(0, ambient(input.depth) - SURFACE);
  let g0 = nucleusGradient(R_N2 * bump, pCrush) * profMix.fn2 + nucleusGradient(R_HE * bump, pCrush) * profMix.fhe;
  if (g0 < 0.2) g0 = nucleusGradient(R_N2 * bump, pCrush);
  const gfLow = input.gfLow / 100;
  const gfHigh = input.gfHigh / 100;
  const step = 3;
  const last = input.lastStop;

  const salitaOc = (work: Load, da: number, gasFondo: Gas, g: number) => {
    const rows: RigaSalita[] = [];
    const tox: { gas: Gas; depth: number; minutes: number }[] = [];
    const alta = input.algo === "vpm" ? ceilingVpm(work, g, 0) : ceilingBuhl(work, buhl, gfHigh);
    const bassa = input.algo === "vpm" ? alta : ceilingBuhl(work, buhl, gfLow);
    let first = alta <= 0.5 ? 0 : snapUp(Math.max(alta, bassa), step, last);
    if (first > da) first = snapUp(da, step, last);
    const pFirst = first > 0 ? ambient(first) : SURFACE;
    if (first <= 0) {
      const rows: RigaSalita[] = [];
      let qui = da;
      for (const meta of quoteRisalita(qui, 0)) {
        const minutes = minutiRisalita(qui, meta, input.ascent);
        expose(work, gasFondo, qui, meta, minutes);
        tox.push({ gas: gasFondo, depth: (qui + meta) / 2, minutes });
        rows.push({ depth: meta, minutes, gas: gasFondo, kind: "move" });
        qui = meta;
      }
      return { rows, first: 0, deco: 0, tox, tissues: work };
    }
    const switches = decoAlla(da)
      .map((gas) => gas.switchM)
      .filter((depth) => depth < da - 0.1 && depth > first)
      .sort((a, b) => b - a);
    let qui = da;
    let gas = pickGas(da, gasFondo, decoAlla(da));
    const vai = (target: number) => {
      for (const meta of quoteRisalita(qui, target)) {
        const minutes = minutiRisalita(qui, meta, input.ascent);
        expose(work, gas, qui, meta, minutes);
        tox.push({ gas, depth: (qui + meta) / 2, minutes });
        rows.push({ depth: meta, minutes, gas, kind: "move" });
        qui = meta;
      }
    };
    for (const depth of switches) {
      vai(depth);
      gas = pickGas(depth, gasFondo, decoAlla(depth));
    }
    if (qui > first) vai(first);
    let deco = 0;
    let depth = first;
    while (depth >= last - 0.01) {
      gas = pickGas(depth, gasFondo, decoAlla(depth));
      const next = depth <= last + 0.01 ? 0 : Math.max(last, depth - step);
      let wait = 0;
      for (let guard = 0; guard < 300; guard += 1) {
        const trial = clone(work);
        if (wait > 0) expose(trial, gas, depth, depth, wait);
        const gf = input.algo === "vpm" ? 0 : gfHigh + (gfLow - gfHigh) * ((next <= 0 ? 0 : next) / Math.max(first, 0.1));
        const ceil = input.algo === "vpm" ? ceilingVpm(trial, g, pFirst) : ceilingBuhl(trial, buhl, gf);
        if (ceil <= (next <= 0 ? 0 : next) + 0.15) break;
        wait += 1;
      }
      if (wait >= 300) warnings.push("Sosta oltre 300 minuti: piano interrotto.");
      if (wait > 0) {
        expose(work, gas, depth, depth, wait);
        tox.push({ gas, depth, minutes: wait });
        rows.push({ depth, minutes: wait, gas, kind: "stop" });
        deco += wait;
      }
      for (const meta of quoteRisalita(depth, next <= 0 ? 0 : next)) {
        const minutes = minutiRisalita(depth, meta, input.ascent);
        expose(work, gas, depth, meta, minutes);
        tox.push({ gas, depth: (depth + meta) / 2, minutes });
        rows.push({ depth: meta, minutes, gas, kind: "move" });
        depth = meta;
      }
      if (next <= 0) break;
    }
    return { rows, first, deco, tox, tissues: work };
  };

  const salitaCcr = (g: number) => {
    const work = clone(load);
    const rows: RigaSalita[] = [];
    const sp = ccr?.deco ?? 1.3;
    const bail = ccr && input.bailoutDa != null && input.bailoutDa >= 0 ? input.bailoutDa : null;
    let qui = partenza;
    let first = 0;
    let deco = 0;
    const muovi = (target: number) => {
      const tappe = quoteRisalita(qui, target);
      const mete = tappe.length > 0 ? tappe : qui > target + 0.05 ? [target] : [];
      for (const meta of mete) {
        const minutes = minutiRisalita(qui, meta, input.ascent);
        exposeLoop(work, qui, meta, minutes, sp, bottom, () => undefined);
        rows.push({ depth: meta, minutes, gas: etichettaSp(sp), kind: "move" });
        qui = meta;
      }
    };
    const sosta = (depth: number, minutes: number) => {
      exposeLoop(work, depth, depth, minutes, sp, bottom, () => undefined);
      rows.push({ depth, minutes, gas: etichettaSp(sp), kind: "stop" });
      deco += minutes;
    };
    const soffitto = () => {
      const alta = input.algo === "vpm" ? ceilingVpm(work, g, 0) : ceilingBuhl(work, buhl, gfHigh);
      const bassa = input.algo === "vpm" ? alta : ceilingBuhl(work, buhl, gfLow);
      let stop = alta <= 0.5 ? 0 : snapUp(Math.max(alta, bassa), step, last);
      if (stop > qui) stop = snapUp(qui, step, last);
      return stop;
    };
    for (let guardia = 0; guardia < 40 && qui > 0.05; guardia += 1) {
      if (bail != null && qui <= bail + 0.15) {
        const aperto = salitaOc(work, qui, bottom, g);
        rows.push(...aperto.rows);
        first = first || aperto.first;
        deco += aperto.deco;
        return { rows, first, deco, tissues: aperto.tissues, tox: [] as { gas: Gas; depth: number; minutes: number }[] };
      }
      const stop = soffitto();
      if (first === 0 && stop > 0) first = stop;
      if (stop <= 0) {
        muovi(0);
        break;
      }
      if (bail != null && bail < qui - 0.1 && bail >= stop - 0.1) {
        muovi(bail);
        continue;
      }
      if (qui > stop + 0.1) muovi(stop);
      const next = stop <= last + 0.01 ? 0 : Math.max(last, stop - step);
      let obiettivo = next <= 0 ? 0 : next;
      if (bail != null && bail < stop - 0.05 && bail > obiettivo) obiettivo = bail;
      const pFirst = ambient(Math.max(stop, 0.1));
      let wait = 0;
      for (let guard = 0; guard < 300; guard += 1) {
        const trial = clone(work);
        if (wait > 0) exposeLoop(trial, stop, stop, wait, sp, bottom, () => undefined);
        const gf = input.algo === "vpm" ? 0 : gfHigh + (gfLow - gfHigh) * (obiettivo / Math.max(first, 0.1));
        const ceil = input.algo === "vpm" ? ceilingVpm(trial, g, pFirst) : ceilingBuhl(trial, buhl, gf);
        if (ceil <= obiettivo + 0.15) break;
        wait += 1;
      }
      if (wait >= 300) warnings.push("Sosta oltre 300 minuti: piano interrotto.");
      if (wait > 0) sosta(stop, wait);
      muovi(obiettivo);
      if (obiettivo <= 0) break;
    }
    if (qui > 0.5) warnings.push("Risalita incompleta: il piano si è fermato prima della superficie.");
    return { rows, first, deco, tissues: work, tox: [] as { gas: Gas; depth: number; minutes: number }[] };
  };

  let gradient = input.algo === "vpm" ? g0 : 0;
  const sale = (g: number) => (ccr ? salitaCcr(g) : salitaOc(clone(load), partenza, bottom, g));
  let built = sale(gradient);
  if (input.algo === "vpm" && built.deco > 0) {
    for (let pass = 0; pass < 4; pass += 1) {
      const raw = relaxGradient(g0, gCrush, controllingK(load), built.deco);
      const next = Math.min(raw, Math.max(g0 * 1.6, g0 + 0.15));
      if (next <= gradient + 0.03) break;
      const trial = sale(next);
      if (trial.deco < 1 || trial.first + 6 < built.first) break;
      gradient = next;
      built = trial;
    }
  }
  if (!ccr) {
    for (const dose of built.tox ?? []) tossico(fractions(dose.gas).o2 * ambient(dose.depth), dose.minutes);
  }

  const segments: Segment[] = [];
  let runtime = 0;
  const push = (fase: string, da: number, depth: number, minutes: number, gas: Gas | string) => {
    if (minutes <= 0) return;
    runtime += minutes;
    segments.push({ fase, da, depth, minutes, gas: typeof gas === "string" ? gas : gasName(gas), runtime });
  };
  push("Discesa", 0, input.depth, descentMin, ccr ? etichettaSp(ccr.discesa) : bottom);
  if (fondoMin > 0) push("Fondo", input.depth, input.depth, fondoMin, ccr ? etichettaSp(ccr.fondo) : bottom);
  for (const tratto of trattiExtra) push(tratto.fase, tratto.da, tratto.depth, tratto.minutes, tratto.gas);
  let decoMin = 0;
  let firstActual = 0;
  let quota = partenza;
  const etichetta = (gas: Gas | string) => (typeof gas === "string" ? gas : gasName(gas));
  for (const row of built.rows) {
    if (row.kind === "stop") {
      if (firstActual === 0) firstActual = row.depth;
      decoMin += row.minutes;
      push(`Sosta ${Math.round(row.depth)} m`, row.depth, row.depth, row.minutes, row.gas);
      quota = row.depth;
      continue;
    }
    const da = quota;
    quota = row.depth;
    const name = etichetta(row.gas);
    const prev = segments[segments.length - 1];
    if (prev?.fase.startsWith("Risalita") && prev.gas === name && ((prev.da >= 6 && prev.depth >= 6 && row.depth >= 6) || (prev.da <= 6 && prev.depth <= 6 && row.depth <= 6))) {
      runtime += row.minutes;
      prev.minutes += row.minutes;
      prev.depth = row.depth;
      prev.runtime = runtime;
      prev.fase = row.depth <= 0 ? "Risalita in superficie" : `Risalita a ${Math.round(row.depth)} m`;
      continue;
    }
    push(row.depth <= 0 ? "Risalita in superficie" : `Risalita a ${Math.round(row.depth)} m`, da, row.depth, row.minutes, row.gas);
  }
  if (ccr) {
    let da = partenza;
    for (const row of built.rows) {
      const prof = row.kind === "stop" ? row.depth : (da + row.depth) / 2;
      if (typeof row.gas === "string") {
        minutiCcr += row.minutes;
        tossico(loopAt(Math.max(0, prof), ccr.deco, bottom).po2, row.minutes);
      } else {
        tossico(fractions(row.gas).o2 * ambient(Math.max(0, prof)), row.minutes);
      }
      da = row.depth;
    }
  }
  if (firstActual <= 0) warnings.push("Nessuna sosta decompressiva. Resta prudente una sosta di sicurezza di 3 minuti intorno ai 5 m.");
  if (cns > 80) warnings.push(`CNS ${Math.round(cns)}%: carico di ossigeno alto.`);
  if (end > 30) warnings.push(`END ${end.toFixed(0)} m: narcosi da tenere d'occhio.`);

  return {
    segments,
    runtime,
    decoMin,
    ppo2,
    end,
    cns,
    otu,
    warnings,
    firstStop: firstActual,
    tissues: built.tissues,
    ccr: ccr
      ? { o2Litri: ccr.metabolismo * minutiCcr, dilLitri, fo2: loopFondo ? loopFondo.fo2 * 100 : bottom.o2, fhe: loopFondo ? loopFondo.fhe * 100 : bottom.he }
      : undefined,
  };
}

export function planDive(input: PlanInput): PlanResult {
  const livelli = (input.livelli ?? []).filter((livello) => livello.minutes > 0 && livello.depth >= 3 && livello.depth <= 150);
  if (!input.ccr && livelli.length === 0) return planDiveOc(input);
  return planDiveEsteso(input, livelli);
}

/** Runtime di uscita dal fondo, discesa compresa, prima che compaia una sosta. 300 con oltre=true: ancora in curva. */
export function tempoNonDeco(input: PlanInput): { minuti: number; oltre: boolean } {
  const obbligo = (bottomMin: number) => planDive({ ...input, bottomMin }).firstStop > 0;
  if (!obbligo(300)) return { minuti: 300, oltre: true };
  if (obbligo(0)) return { minuti: 0, oltre: false };
  let lo = 0;
  let hi = 300;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (obbligo(mid)) hi = mid;
    else lo = mid;
  }
  return { minuti: lo, oltre: false };
}

const DENSITA_BAR = { o2: 1.331, n2: 1.165, he: 0.166 };

/** Densità del gas di fondo alla quota, in g/L, a circa 20 °C. */
export function densitaFondo(o2: number, he: number, depth: number): number {
  const fo2 = o2 / 100;
  const fhe = he / 100;
  const fn2 = Math.max(0, 1 - fo2 - fhe);
  const p = SURFACE + depth / 10;
  return p * (fo2 * DENSITA_BAR.o2 + fn2 * DENSITA_BAR.n2 + fhe * DENSITA_BAR.he);
}

/** Litri di superficie di ogni gas. Il fondo usa il consumo di fondo, tappe e risalite quello di decompressione. */
export function litriPerGas(segments: Segment[], sacFondo: number, sacDeco: number): { gas: string; litri: number }[] {
  const map = new Map<string, number>();
  for (const row of segments) {
    if (row.gas.startsWith("SP ")) continue;
    const fondo = row.fase === "Discesa" || row.fase === "Fondo" || row.fase.startsWith("Livello");
    const sac = fondo ? sacFondo : sacDeco;
    const pMedia = SURFACE + (row.da + row.depth) / 20;
    const litri = sac * row.minutes * (pMedia / SURFACE);
    if (litri <= 0) continue;
    map.set(row.gas, (map.get(row.gas) ?? 0) + litri);
  }
  return [...map.entries()].map(([gas, litri]) => ({ gas, litri }));
}

const COMPARTI_GRAFICO = [0, 2, 4, 6, 8, 12];

export type CampioneGrafico = {
  t: number;
  depth: number;
  ppo2: number;
  end: number;
  gas: string;
  cambio: boolean;
  sosta: boolean;
  /** Setpoint nominale, solo in CCR. */
  setpoint: number | null;
  /** Pressioni parziali alveolari degli inerti, in bar. */
  pn2: number;
  phe: number;
  /** Azoto e elio nel comparto più carico, in bar. */
  n2Tessuto: number;
  heTessuto: number;
  /** Percentuale del limite del modello, un valore per comparto mostrato. */
  tessuti: number[];
  /** Pressione del gas inerte in ogni tessuto, in bar. */
  carichi: number[];
  /** Valore M del modello in ogni tessuto, alla quota del campione, in bar. */
  limiti: number[];
  /** Valore M di Bühlmann, a + Pamb / b, in ogni tessuto. */
  valoriM: number[];
};

export type CambioIbcd = {
  t: number;
  depth: number;
  da: string;
  a: string;
  pn2: number;
  phe: number;
  deltaN2: number;
  deltaHe: number;
  /** Azoto che sale di almeno 0,5 bar mentre l'elio scende: rischio di controdiffusione. */
  rischio: boolean;
};

export type SerieGrafici = {
  campioni: CampioneGrafico[];
  cambi: CambioIbcd[];
  compartimenti: string[];
  semitempi: string[];
  piccoPo2: number;
  oltreEnd: boolean;
  oltreTessuti: boolean;
  rischioIbcd: boolean;
};

type RespiroSegmento = { nome: string; ccr: boolean; sp: number; gas: Gas };

function leggiGasSegmento(nome: string, diluente: Gas): RespiroSegmento {
  const sp = /^SP\s+([0-9]+(?:[.,][0-9]+)?)/.exec(nome);
  if (sp) return { nome, ccr: true, sp: Number(sp[1].replace(",", ".")), gas: diluente };
  if (nome === "Aria") return { nome, ccr: false, sp: 0, gas: { o2: 21, he: 0, switchM: 0 } };
  if (nome === "Ossigeno") return { nome, ccr: false, sp: 0, gas: { o2: 100, he: 0, switchM: 0 } };
  const ean = /^EAN(\d+)/.exec(nome);
  if (ean) return { nome, ccr: false, sp: 0, gas: { o2: Number(ean[1]), he: 0, switchM: 0 } };
  const tx = /^Tx\s+(\d+)\/(\d+)/.exec(nome);
  if (tx) return { nome, ccr: false, sp: 0, gas: { o2: Number(tx[1]), he: Number(tx[2]), switchM: 0 } };
  return { nome, ccr: false, sp: 0, gas: diluente };
}

function respiroSegmento(spec: RespiroSegmento, depth: number): { ppo2: number; end: number; n2: number; he: number } {
  if (spec.ccr) {
    const loop = loopAt(depth, spec.sp, spec.gas);
    return { ppo2: loop.po2, end: endAzoto(depth, loop.fn2), n2: loop.pn2, he: loop.phe };
  }
  const mix = fractions(spec.gas);
  const alveolo = inspired(spec.gas, depth);
  return { ppo2: mix.o2 * ambient(depth), end: endAzoto(depth, mix.n2), n2: alveolo.n2, he: alveolo.he };
}

function gfAllaQuota(depth: number, first: number, gfLow: number, gfHigh: number): number {
  const basso = gfLow / 100;
  const alto = gfHigh / 100;
  if (first <= 0) return alto;
  const quota = Math.min(Math.max(0, depth), first);
  return alto + (basso - alto) * (quota / first);
}

function inertiPiuCarichi(load: TissueState): { n2: number; he: number } {
  let n2 = load.n2[0] ?? 0;
  let he = load.he[0] ?? 0;
  let best = n2 + he;
  for (let i = 1; i < N; i += 1) {
    const tot = load.n2[i] + load.he[i];
    if (tot > best) {
      best = tot;
      n2 = load.n2[i];
      he = load.he[i];
    }
  }
  return { n2, he };
}

function percentualiTessuti(load: Load, depth: number, input: PlanInput, firstStop: number, limiteVpm: ((depth: number) => number) | null): number[] {
  const buhl = input.algo === "vpm" ? "zhl16c" : input.algo;
  const gf = gfAllaQuota(depth, firstStop, input.gfLow, input.gfHigh);
  const g = Math.min(1, Math.max(0.05, gf));
  const p = ambient(depth);
  return COMPARTI_GRAFICO.map((i) => {
    const pt = load.n2[i] + load.he[i];
    let limite: number;
    if (limiteVpm) limite = limiteVpm(depth);
    else {
      const ratio = pt > 1e-9 ? load.he[i] / pt : 0;
      const a = A_N2[buhl][i] * (1 - ratio) + A_HE[i] * ratio;
      const b = B_N2[i] * (1 - ratio) + B_HE[i] * ratio;
      limite = p * (g / b + 1 - g) + g * a;
    }
    if (!Number.isFinite(limite) || limite <= 0.05) return 0;
    return (pt / limite) * 100;
  });
}

function valoriTessuto(load: Load, depth: number, input: PlanInput, firstStop: number, limiteVpm: ((depth: number) => number) | null): { carichi: number[]; limiti: number[]; valoriM: number[] } {
  const buhl = input.algo === "vpm" ? "zhl16c" : input.algo;
  const gf = gfAllaQuota(depth, firstStop, input.gfLow, input.gfHigh);
  const g = Math.min(1, Math.max(0.05, gf));
  const p = ambient(depth);
  const carichi: number[] = [];
  const limiti: number[] = [];
  const valoriM: number[] = [];
  for (let i = 0; i < N; i += 1) {
    const pt = (load.n2[i] ?? 0) + (load.he[i] ?? 0);
    carichi.push(pt);
    const ratio = pt > 1e-9 ? (load.he[i] ?? 0) / pt : 0;
    const a = A_N2[buhl][i] * (1 - ratio) + A_HE[i] * ratio;
    const b = B_N2[i] * (1 - ratio) + B_HE[i] * ratio;
    const m = b > 0 ? a + p / b : 0;
    valoriM.push(Number.isFinite(m) ? m : 0);
    let limite: number;
    if (limiteVpm) limite = limiteVpm(depth);
    else limite = p * (g / b + 1 - g) + g * a;
    limiti.push(Number.isFinite(limite) ? limite : 0);
  }
  return { carichi, limiti, valoriM };
}

/** Campioni lungo il piano già calcolato: PpO2, END, tessuti e cambi gas. Non modifica il piano. */
export function serieGrafici(input: PlanInput): SerieGrafici {
  const plan = planDive(input);
  const diluente = input.ccr?.diluente ?? input.bottom;
  const vuota: SerieGrafici = {
    campioni: [],
    cambi: [],
    compartimenti: COMPARTI_GRAFICO.map((i) => String(HT_N2[i])),
    semitempi: HT_N2.map(String),
    piccoPo2: 0,
    oltreEnd: false,
    oltreTessuti: false,
    rischioIbcd: false,
  };
  if (plan.segments.length === 0) return vuota;

  const fondo = input.ccr ? loopAt(input.depth, input.ccr.fondo, diluente) : null;
  const fn2 = fondo ? fondo.fn2 : fractions(input.bottom).n2;
  const fhe = fondo ? fondo.fhe : fractions(input.bottom).he;
  const level = Math.min(5, Math.max(0, Math.round(input.vpmLevel)));
  const bump = VPM_BUMP[level];
  const pCrush = Math.max(0, ambient(input.depth) - SURFACE);
  let g0 = nucleusGradient(R_N2 * bump, pCrush) * fn2 + nucleusGradient(R_HE * bump, pCrush) * fhe;
  if (!(g0 > 0.2)) g0 = nucleusGradient(R_N2 * bump, pCrush);
  const pFirst = plan.firstStop > 0 ? ambient(plan.firstStop) : 0;
  const limiteVpm = input.algo === "vpm"
    ? (depth: number) => {
        const base = depth <= plan.firstStop + 0.5 && pFirst > 0 ? boyle(g0, pFirst, ambient(depth)) : g0;
        const g = Number.isFinite(base) && base > 0 ? base : g0;
        return ambient(depth) + g;
      }
    : null;

  const load = input.start ? clone(input.start) : emptyLoad();
  const campioni: CampioneGrafico[] = [];
  const cambi: CambioIbcd[] = [];
  const registra = (t: number, depth: number, spec: RespiroSegmento, cambio: boolean, sosta: boolean) => {
    const res = respiroSegmento(spec, depth);
    const inerti = inertiPiuCarichi(load);
    const valori = valoriTessuto(load, depth, input, plan.firstStop, limiteVpm);
    campioni.push({
      t,
      depth,
      ppo2: res.ppo2,
      end: res.end,
      gas: spec.nome,
      cambio,
      sosta,
      setpoint: spec.ccr ? spec.sp : null,
      pn2: res.n2,
      phe: res.he,
      n2Tessuto: inerti.n2,
      heTessuto: inerti.he,
      tessuti: percentualiTessuti(load, depth, input, plan.firstStop, limiteVpm),
      carichi: valori.carichi,
      limiti: valori.limiti,
      valoriM: valori.valoriM,
    });
  };

  let ultimo = leggiGasSegmento(plan.segments[0].gas, diluente);
  registra(0, 0, ultimo, false, false);
  for (const segment of plan.segments) {
    const spec = leggiGasSegmento(segment.gas, diluente);
    const t0 = Math.max(0, segment.runtime - segment.minutes);
    const sosta = segment.fase.startsWith("Sosta") || segment.fase.startsWith("Livello");
    if (spec.nome !== ultimo.nome) {
      const prima = respiroSegmento(ultimo, segment.da);
      const dopo = respiroSegmento(spec, segment.da);
      const deltaN2 = dopo.n2 - prima.n2;
      const deltaHe = dopo.he - prima.he;
      const rischio = deltaN2 >= 0.5 && deltaHe < -0.05;
      cambi.push({
        t: t0,
        depth: segment.da,
        da: ultimo.nome,
        a: spec.nome,
        pn2: dopo.n2,
        phe: dopo.he,
        deltaN2,
        deltaHe,
        rischio,
      });
      registra(t0, segment.da, spec, true, sosta);
      ultimo = spec;
    }
    const steps = Math.max(1, Math.ceil(segment.minutes));
    const dt = segment.minutes / steps;
    for (let step = 1; step <= steps; step += 1) {
      const d0 = segment.da + (segment.depth - segment.da) * ((step - 1) / steps);
      const d1 = segment.da + (segment.depth - segment.da) * (step / steps);
      if (spec.ccr) exposeLoop(load, d0, d1, dt, spec.sp, spec.gas, () => undefined);
      else expose(load, spec.gas, d0, d1, dt);
      registra(t0 + dt * step, d1, spec, false, sosta);
    }
  }

  let piccoPo2 = 0;
  let oltreEnd = false;
  let oltreTessuti = false;
  for (const punto of campioni) {
    if (punto.ppo2 > piccoPo2) piccoPo2 = punto.ppo2;
    if (punto.end > 30) oltreEnd = true;
    if (punto.tessuti.some((valore) => valore > 105)) oltreTessuti = true;
  }
  return {
    campioni,
    cambi,
    compartimenti: vuota.compartimenti,
    semitempi: vuota.semitempi,
    piccoPo2,
    oltreEnd,
    oltreTessuti,
    rischioIbcd: cambi.some((cambio) => cambio.rischio),
  };
}
