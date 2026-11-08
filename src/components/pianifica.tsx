import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, BookmarkPlus, BookOpen, ChevronDown, FileDown, FlaskConical, Gauge, GitCompare, Lock, Timer, Waves } from "lucide-react";
import { useFondale } from "@/components/app-frame";
import { SegnoPro } from "@/components/segno-pro";
import { ScaricoDocumento } from "@/components/scarico-doc";
import { messaggioErrore, useT, type Traduci } from "@/lib/i18n";
import { accettaScaricoPianificatore, statoScaricoPianificatore } from "@/lib/fondale.functions";
import { scriviPdfPiano } from "@/lib/foglio-pdf";
import { SCARICO_LINK } from "@/lib/scarico-pianificatore";
import { CHIAVE_PIANO_LOGBOOK, planDive, densitaFondo, endAzoto, gasResiduo, intervalloSuperficie, litriPerGas, miscelaLoop, serieGrafici, tempoNonDeco, type Algo, type PlanInput, type PlanResult, type Segment, type SerieGrafici } from "@/lib/planner";
import { PannelloGrafici } from "@/components/grafici-piano";

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass";

const ALGOS: { id: Algo; label: string }[] = [
  { id: "zhl16b", label: "Bühlmann ZHL-16B" },
  { id: "zhl16c", label: "Bühlmann ZHL-16C" },
  { id: "vpm", label: "VPM-B" },
];

type DecoDraft = { on: boolean; o2: string; he: string; switchM: string; litri: string };

const START_DECO: DecoDraft[] = [
  { on: false, o2: "50", he: "0", switchM: "21", litri: "" },
  { on: false, o2: "100", he: "0", switchM: "6", litri: "" },
  { on: false, o2: "36", he: "0", switchM: "36", litri: "" },
];

type ExtraPiano = {
  circuito: "oc" | "ccr";
  spFisso: boolean;
  sp: string;
  spDiscesa: string;
  spFondo: string;
  spDeco: string;
  metabolismo: string;
  litriO2: string;
  livelli: { depth: string; minutes: string }[];
};

const MAX_LIVELLI = 6;

const EXTRA_VUOTO: ExtraPiano = {
  circuito: "oc",
  spFisso: true,
  sp: "1.3",
  spDiscesa: "0.7",
  spFondo: "1.3",
  spDeco: "1.3",
  metabolismo: "1.0",
  litriO2: "",
  livelli: [],
};

function copiaExtra(row: ExtraPiano): ExtraPiano {
  return { ...row, livelli: row.livelli.map((livello) => ({ ...livello })) };
}

type VocePiano = {
  n: number;
  intervallo: number | null;
  residuo: { bar: number; equilibrio: number } | null;
  ndl: number;
  ndlOltre: boolean;
  algo: Algo;
  gfLow: string;
  gfHigh: string;
  vpmLevel: number;
  depth: string;
  bottomMin: string;
  o2: string;
  he: string;
  lastStop: 3 | 5 | 6;
  consumoFondo: number;
  consumoDeco: number;
  litriFondo: string;
  descent: string;
  ascent: string;
  deco: DecoDraft[];
  extra: ExtraPiano;
  result: PlanResult;
};

function PianificatoreTecnico({ onCambia, attivo }: { onRefuse: () => void; onCambia: () => void; attivo: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const [algo, setAlgo] = useState<Algo>("zhl16c");
  const [gfLow, setGfLow] = useState("30");
  const [gfHigh, setGfHigh] = useState("70");
  const [vpmLevel, setVpmLevel] = useState(0);
  const [depth, setDepth] = useState("30");
  const [bottomMin, setBottomMin] = useState("25");
  const [descent, setDescent] = useState("20");
  const [ascent, setAscent] = useState("9");
  const [lastStop, setLastStop] = useState<3 | 5 | 6>(3);
  const [o2, setO2] = useState("21");
  const [he, setHe] = useState("0");
  const [consumoFondo, setConsumoFondo] = useState("20");
  const [consumoDeco, setConsumoDeco] = useState("15");
  const [litriFondo, setLitriFondo] = useState("");
  const [extra, setExtra] = useState<ExtraPiano>(EXTRA_VUOTO);
  const [aperte, setAperte] = useState({ base: true, livelli: false, gas: true, ccr: false, avanzate: false });
  const [deco, setDeco] = useState<DecoDraft[]>(START_DECO);
  const [serie, setSerie] = useState<VocePiano[]>([]);
  const [aperta, setAperta] = useState(1);
  const [modifica, setModifica] = useState<number | null>(null);
  const [conferma, setConferma] = useState<null | { tipo: "elimina" | "modifica"; n: number }>(null);
  const [intervallo, setIntervallo] = useState("45");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [modelli, setModelli] = useState<ModelloPiano[]>([]);
  const [nomeModello, setNomeModello] = useState("");

  useEffect(() => {
    setModelli(leggiModelli());
  }, []);

  const mix = readMix(o2, he);
  const depthN = numberOrNull(depth);
  const mod14 = mix && mix.o2 > 0 ? (1.4 / (mix.o2 / 100) - 1) * 10 : null;
  const endNow = mix && mix.n2 >= 0 && depthN != null ? endAzoto(depthN, mix.n2 / 100) : null;
  const ppo2Now = mix && depthN != null ? (mix.o2 / 100) * (1.01325 + depthN / 10) : null;
  const setpointVivo = extra.circuito !== "ccr" ? null : numberOrNull(extra.spFisso ? extra.sp : extra.spFondo);
  const loopNow = extra.circuito === "ccr" && mix && depthN != null && setpointVivo != null ? miscelaLoop(depthN, setpointVivo, mix.o2, mix.he) : null;
  const densitaNow = loopNow && depthN != null ? densitaFondo(loopNow.fo2, loopNow.fhe, depthN) : mix && depthN != null && depthN >= 0 ? densitaFondo(mix.o2, mix.he, depthN) : null;
  const ppo2Vivo = loopNow ? loopNow.po2 : ppo2Now;
  const endVivo = loopNow ? loopNow.end : endNow;

  function forget() {
    setError(null);
    setCopied(null);
  }

  function patchLivello(index: number, campo: "depth" | "minutes", value: string) {
    setExtra((cur) => ({
      ...cur,
      livelli: cur.livelli.map((row, i) => (i === index ? { ...row, [campo]: value } : row)),
    }));
  }

  function spostaLivello(index: number, verso: -1 | 1) {
    setExtra((cur) => {
      const next = cur.livelli.slice();
      const altro = index + verso;
      if (altro < 0 || altro >= next.length) return cur;
      const [row] = next.splice(index, 1);
      next.splice(altro, 0, row);
      return { ...cur, livelli: next };
    });
    forget();
  }

  function togliLivello(index: number) {
    setExtra((cur) => ({ ...cur, livelli: cur.livelli.filter((_, i) => i !== index) }));
    forget();
  }

  function aggiungiLivello() {
    setExtra((cur) => (cur.livelli.length >= MAX_LIVELLI ? cur : { ...cur, livelli: [...cur.livelli, { depth: "", minutes: "" }] }));
    setAperte((cur) => ({ ...cur, livelli: true }));
    forget();
  }

  function corpo(): Omit<PlanInput, "start"> {
    const bottomO2 = num(o2, t("Ossigeno di fondo"), 1, 100);
    const bottomHe = num(he, t("Elio di fondo"), 0, 99);
    if (bottomO2 + bottomHe > 100) throw new Error("Ossigeno e elio di fondo superano il 100%.");
    const low = num(gfLow, t("GF basso"), 5, 100);
    const high = num(gfHigh, t("GF alto"), 5, 100);
    if (algo !== "vpm" && low > high) throw new Error("Il GF basso non può superare il GF alto.");
    const gases = deco
      .filter((gas) => gas.on)
      .map((gas, index) => {
        const gasO2 = num(gas.o2, t("Ossigeno del gas {n}", { n: index + 1 }), 1, 100);
        const gasHe = num(gas.he, t("Elio del gas {n}", { n: index + 1 }), 0, 99);
        if (gasO2 + gasHe > 100) throw new Error(`Il gas ${index + 1} supera il 100%.`);
        return { o2: gasO2, he: gasHe, switchM: num(gas.switchM, t("Cambio del gas {n}", { n: index + 1 }), 0, 150) };
      });
    const livelli = extra.livelli.flatMap((row, index) => {
      const quota = row.depth.trim();
      const minuti = row.minutes.trim();
      if (!quota && !minuti) return [];
      return [{
        depth: num(quota, t("Quota del livello {n}", { n: index + 1 }), 3, 150),
        minutes: num(minuti, t("Minuti del livello {n}", { n: index + 1 }), 1, 180),
      }];
    });
    const bottom = { o2: bottomO2, he: bottomHe, switchM: 0 };
    const piano: Omit<PlanInput, "start"> = {
      algo,
      depth: num(depth, t("Profondità"), 3, 150),
      bottomMin: num(bottomMin, t("Tempo di fondo"), 1, 300),
      gfLow: low,
      gfHigh: high,
      vpmLevel,
      descent: num(descent, t("Discesa"), 1, 40),
      ascent: num(ascent, t("Risalita"), 1, 20),
      lastStop,
      bottom,
      deco: gases,
    };
    if (livelli.length > 0) piano.livelli = livelli;
    if (extra.circuito === "ccr") {
      const fisso = extra.spFisso ? num(extra.sp, t("Setpoint"), 0.4, 1.6) : null;
      piano.ccr = {
        discesa: fisso ?? num(extra.spDiscesa, t("Setpoint di discesa"), 0.4, 1.6),
        fondo: fisso ?? num(extra.spFondo, t("Setpoint di fondo"), 0.4, 1.6),
        deco: fisso ?? num(extra.spDeco, t("Setpoint di decompressione"), 0.4, 1.6),
        diluente: bottom,
        metabolismo: num(extra.metabolismo, t("Metabolismo"), 0.4, 3),
        rmv: num(consumoFondo, t("Consumo di fondo"), 1, 80),
      };
    }
    return piano;
  }

  function voceDa(input: PlanInput, meta: Pick<VocePiano, "n" | "intervallo" | "residuo">): VocePiano {
    const plan = planDive(input);
    const ndl = tempoNonDeco(input);
    return {
      ...meta,
      ndl: ndl.minuti,
      ndlOltre: ndl.oltre,
      algo,
      gfLow,
      gfHigh,
      vpmLevel,
      depth,
      bottomMin,
      o2,
      he,
      lastStop,
      consumoFondo: num(consumoFondo, t("Consumo di fondo"), 1, 80),
      consumoDeco: num(consumoDeco, t("Consumo in decompressione"), 1, 80),
      litriFondo,
      descent,
      ascent,
      deco: deco.map((gas) => ({ ...gas })),
      extra: copiaExtra(extra),
      result: plan,
    };
  }

  function pianoModificato(n: number): VocePiano {
    if (n === 1) return voceDa(corpo(), { n: 1, intervallo: null, residuo: null });
    const precedente = serie.find((voce) => voce.n === n - 1);
    if (!precedente) throw new Error("Manca l'immersione precedente.");
    const minuti = num(intervallo, t("Intervallo di superficie"), 0, 1440);
    const tessuti = intervalloSuperficie(precedente.result.tissues, minuti);
    return voceDa({ ...corpo(), start: tessuti }, { n, intervallo: minuti, residuo: gasResiduo(tessuti) });
  }

  function applicaModifica(n: number) {
    setCopied(null);
    try {
      const voce = pianoModificato(n);
      setSerie((rows) => [...rows.filter((row) => row.n < n), voce]);
      setAperta(n);
      setModifica(null);
      setConferma(null);
      setError(null);
    } catch (reason) {
      setConferma(null);
      setError(messaggioErrore(reason, "Controlla i numeri."));
    }
  }

  function chiediSalva() {
    if (modifica == null) return;
    if (serie.some((voce) => voce.n > modifica)) {
      setConferma({ tipo: "modifica", n: modifica });
      return;
    }
    applicaModifica(modifica);
  }

  function eseguiElimina(n: number) {
    const rest = serie.filter((voce) => voce.n < n);
    setSerie(rest);
    setModifica((cur) => (cur != null && cur >= n ? null : cur));
    setAperta(rest.length ? rest[rest.length - 1].n : 1);
    setConferma(null);
    setError(null);
  }

  function calcola() {
    setCopied(null);
    try {
      if (serie.length > 0) return;
      setSerie([voceDa(corpo(), { n: 1, intervallo: null, residuo: null })]);
      setAperta(1);
      setError(null);
    } catch (reason) {
      setError(messaggioErrore(reason, "Controlla i numeri."));
    }
  }

  function aggiungi() {
    const ultimo = serie[serie.length - 1];
    if (!ultimo) return;
    setCopied(null);
    try {
      const minuti = num(intervallo, t("Intervallo di superficie"), 0, 1440);
      const tessuti = intervalloSuperficie(ultimo.result.tissues, minuti);
      const n = serie.length + 1;
      const voce = voceDa(
        { ...corpo(), start: tessuti },
        { n, intervallo: minuti, residuo: gasResiduo(tessuti) },
      );
      setSerie((rows) => [...rows, voce]);
      setAperta(n);
      setError(null);
    } catch (reason) {
      setError(messaggioErrore(reason, "Controlla i numeri."));
    }
  }

  function mostra(voce: VocePiano) {
    setAperta(voce.n);
    setAlgo(voce.algo);
    setGfLow(voce.gfLow);
    setGfHigh(voce.gfHigh);
    setVpmLevel(voce.vpmLevel);
    setDepth(voce.depth);
    setBottomMin(voce.bottomMin);
    setDescent(voce.descent);
    setAscent(voce.ascent);
    setLastStop(voce.lastStop);
    setO2(voce.o2);
    setHe(voce.he);
    setConsumoFondo(String(voce.consumoFondo));
    setConsumoDeco(String(voce.consumoDeco));
    setLitriFondo(voce.litriFondo ?? "");
    setExtra(normalizzaExtra(voce.extra ?? EXTRA_VUOTO));
    setDeco(voce.deco.map((gas) => ({ ...gas, litri: gas.litri ?? "" })));
    setAperte((cur) => ({
      ...cur,
      livelli: (voce.extra?.livelli ?? []).some((livello) => livello.depth.trim() || livello.minutes.trim()),
      ccr: voce.extra?.circuito === "ccr",
    }));
    if (voce.intervallo != null) setIntervallo(String(voce.intervallo));
    setError(null);
    setCopied(null);
  }

  async function copia(voce: VocePiano) {
    const text = pianoTesto(voce, t);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(voce.n);
    } catch {
      setError(t("Non riesco a copiare. Seleziona il piano a mano."));
    }
  }

  function salvaModello() {
    const nome = nomeModello.trim().slice(0, 40);
    if (!nome) {
      setError(t("Dai un nome al modello."));
      return;
    }
    const next = [
      ...modelli,
      {
        id: `${Date.now()}`,
        nome,
        algo,
        gfLow,
        gfHigh,
        vpmLevel,
        depth,
        bottomMin,
        descent,
        ascent,
        lastStop,
        o2,
        he,
        consumoFondo,
        consumoDeco,
        litriFondo,
        extra: copiaExtra(extra),
        deco: deco.map((gas) => ({ ...gas })),
      },
    ];
    setModelli(next);
    scriviModelli(next);
    setNomeModello("");
    setError(null);
  }

  function richiama(modello: ModelloPiano) {
    setAlgo(modello.algo);
    setGfLow(modello.gfLow);
    setGfHigh(modello.gfHigh);
    setVpmLevel(modello.vpmLevel);
    setDepth(modello.depth);
    setBottomMin(modello.bottomMin);
    setDescent(modello.descent);
    setAscent(modello.ascent);
    setLastStop(modello.lastStop);
    setO2(modello.o2);
    setHe(modello.he);
    setConsumoFondo(modello.consumoFondo);
    setConsumoDeco(modello.consumoDeco);
    setLitriFondo(modello.litriFondo ?? "");
    const extraModello = normalizzaExtra(modello.extra);
    setExtra(extraModello);
    setDeco(modello.deco.length ? modello.deco.map((gas) => ({ ...gas, litri: gas.litri ?? "" })) : START_DECO.map((gas) => ({ ...gas })));
    setAperte((cur) => ({
      ...cur,
      livelli: extraModello.livelli.some((livello) => livello.depth.trim() || livello.minutes.trim()),
      ccr: extraModello.circuito === "ccr",
    }));
    forget();
  }

  function registra(voce: VocePiano) {
    const o2n = Number(voce.o2);
    const hen = Number(voce.he);
    const miscela = hen > 0 ? "Trimix" : o2n > 22 ? "Nitrox" : "Aria";
    const titolo = voce.algo === "vpm" ? `VPM-B +${voce.vpmLevel}` : `${voce.algo === "zhl16b" ? "ZHL-16B" : "ZHL-16C"} GF ${voce.gfLow}/${voce.gfHigh}`;
    const note = [
      t("Piano Tritone · {titolo}", { titolo }),
      t("Fondo {bottom} min · runtime {runtime} min", { bottom: voce.bottomMin, runtime: fmtMin(voce.result.runtime) }),
      t("Gas {gas}", { gas: voce.result.ccr ? t("Diluente") + " " + t(nomeGas(o2n, hen)) : t(nomeGas(o2n, hen)) }),
      voce.result.ccr ? t("CCR · ossigeno {o2} L · diluente {dil} L", { o2: Math.round(voce.result.ccr.o2Litri), dil: Math.round(voce.result.ccr.dilLitri) }) : "",
      t("Studio. Confronta con un altro strumento prima di entrare in acqua."),
    ].join("\n");
    sessionStorage.setItem(CHIAVE_PIANO_LOGBOOK, JSON.stringify({
      profondita: String(Math.round(Number(voce.depth) || 0)),
      minuti: String(Math.round(voce.result.runtime)),
      miscela,
      ossigeno: miscela === "Aria" ? "" : String(Math.round(o2n)),
      note,
    }));
    void navigate({ to: "/logbook", search: { nuova: 1, condivisione: undefined } });
  }

  let riga: string | null = null;
  if (attivo) {
    try {
      const base = corpo();
      let input: PlanInput = base;
      if (modifica != null && modifica > 1) {
        const precedente = serie.find((voce) => voce.n === modifica - 1);
        if (!precedente) throw new Error("Manca l'immersione precedente.");
        const minuti = num(intervallo, t("Intervallo di superficie"), 0, 1440);
        input = { ...base, start: intervalloSuperficie(precedente.result.tissues, minuti) };
      } else if (modifica == null && serie.length > 0) {
        const ultimo = serie[serie.length - 1];
        const minuti = num(intervallo, t("Intervallo di superficie"), 0, 1440);
        input = { ...base, start: intervalloSuperficie(ultimo.result.tissues, minuti) };
      }
      const plan = planDive(input);
      const livelliN = base.livelli?.length ?? 0;
      if (plan.firstStop > 0) riga = t("Prima tappa {m} m", { m: Math.round(plan.firstStop) });
      else {
        const ndl = tempoNonDeco(input);
        riga = ndl.oltre ? t("{n} min o più senza tappa", { n: ndl.minuti }) : t("{n} min senza tappa", { n: ndl.minuti });
      }
      if (livelliN > 0) riga = t("{piano} · {n} livelli", { piano: riga, n: livelliN });
    } catch {
      riga = null;
    }
  }

  const modelloScelto = algo === "vpm" ? `VPM-B +${vpmLevel}` : `${ALGOS.find((item) => item.id === algo)?.label ?? algo} · GF ${gfLow}/${gfHigh}`;
  const fondoNome = mix ? nomeGas(mix.o2, mix.he) : "—";
  const cambiAccesi = deco.filter((gas) => gas.on);
  const sommarioGas = [fondoNome, ...cambiAccesi.map((gas) => `${nomeGas(Number(gas.o2), Number(gas.he))} ${gas.switchM} m`)].join(" · ");
  const prontiLivelli = extra.livelli.filter((livello) => livello.depth.trim() && livello.minutes.trim());
  const sommarioLivelli = prontiLivelli.length === 0
    ? t("Nessun livello: il profilo resta a quadrato.")
    : prontiLivelli.map((livello) => `${livello.depth} m × ${livello.minutes} min`).join(" · ");
  const sommarioCcr = extra.spFisso ? `SP ${extra.sp} · ${fondoNome}` : `SP ${extra.spDiscesa}/${extra.spFondo}/${extra.spDeco} · ${fondoNome}`;

  function StatoMix({ loop }: { loop: boolean }) {
    if (loop && loopNow) {
      return (
        <p className="mt-3 text-sm text-mist">
          {t("Loop in fondo: O2 {o2}% · He {he}%.", { o2: Math.round(loopNow.fo2), he: Math.round(loopNow.fhe) })}
          {` ${t("PpO2 di fondo {val}.", { val: loopNow.po2.toFixed(2) })}`}
          {` ${t("END {m} m.", { m: endVivo != null ? endVivo.toFixed(0) : "—" })}`}
          {densitaNow != null ? ` ${t("{n} g/L", { n: densitaNow.toFixed(1) })}` : ""}
        </p>
      );
    }
    return (
      <p className="mt-3 text-sm text-mist">
        {mix && mix.n2 >= 0 ? t("Azoto {n}%.", { n: Math.round(mix.n2) }) : t("La somma supera il 100%.")}
        {mod14 != null && Number.isFinite(mod14) ? ` ${t("MOD a PpO2 1.40: {m} m.", { m: mod14.toFixed(0) })}` : ""}
        {ppo2Now != null ? ` ${t("PpO2 di fondo {val}.", { val: ppo2Now.toFixed(2) })}` : ""}
        {endNow != null ? ` ${t("END {m} m.", { m: endNow.toFixed(0) })}` : ""}
        {densitaNow != null ? ` ${t("{n} g/L", { n: densitaNow.toFixed(1) })}` : ""}
      </p>
    );
  }

  return (
    <section className="mt-6">
      <div className="flex items-center gap-3">
        <Gauge className="size-6 shrink-0 text-lagoon" aria-hidden />
        <h2 className="text-xl">{t("Pianificatore tecnico")}<SegnoPro /></h2>
      </div>
      <div className="mt-4 rounded-card border border-line bg-deep px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <BookmarkPlus className="size-4 text-brass" aria-hidden />
          {t("Modelli salvati")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={nomeModello} onChange={(event) => setNomeModello(event.target.value)} placeholder={t("Nome del modello")} className={inputClass} />
          <button type="button" className="min-h-11 shrink-0 rounded-full bg-tide px-4 text-sm font-medium text-white" onClick={salvaModello}>
            {t("Salva modello")}
          </button>
        </div>
        {modelli.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {modelli.map((modello) => (
              <li key={modello.id} className="flex items-center gap-1 rounded-full border border-line bg-surface pl-3">
                <button type="button" className="min-h-11 pr-2 text-sm" onClick={() => richiama(modello)}>
                  {modello.nome}
                </button>
                <button type="button" className="min-h-11 px-3 text-xs text-mist" onClick={() => { const next = modelli.filter((item) => item.id !== modello.id); setModelli(next); scriviModelli(next); }} aria-label={t("Togli modello")}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-mist">{t("Salva un piano ricorrente e richiamalo da qui.")}</p>
        )}
      </div>
      {serie.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {serie.map((voce) => (
            <button
              key={voce.n}
              type="button"
              onClick={() => {
                setAperta(voce.n);
                setModifica(null);
                setError(null);
              }}
              className={`min-h-11 rounded-full border px-4 text-sm ${aperta === voce.n ? "border-brass bg-deep" : "border-line"}`}
            >
              {t("Immersione {n}", { n: voce.n })}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="no-print mt-4"
        onChange={forget}
        onSubmit={(event) => {
          event.preventDefault();
          if (modifica != null) chiediSalva();
          else if (serie.length === 0) calcola();
          else aggiungi();
        }}
      >
        <Sezione
          id="parametri-base"
          titolo={t("Parametri base")}
          sommario={t("{m} m · {min} min · {modello}", { m: depth || "—", min: bottomMin || "—", modello: extra.circuito === "ccr" ? `CCR · ${modelloScelto}` : modelloScelto })}
          aperta={aperte.base}
          onToggle={() => setAperte((cur) => ({ ...cur, base: !cur.base }))}
        >
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-mist"><Waves className="size-4 text-lagoon" aria-hidden />{t("Profondità (m)")}</span>
              <input inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} className="w-full bg-transparent text-5xl leading-none text-lagoon outline-none" />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-mist"><Timer className="size-4 text-brass" aria-hidden />{t("Tempo di fondo (min)")}</span>
              <input inputMode="decimal" value={bottomMin} onChange={(event) => setBottomMin(event.target.value)} className="w-full bg-transparent text-5xl leading-none outline-none" />
            </label>
          </div>
          <p className="mt-3 text-xs text-mist">{t("Il tempo di fondo è il runtime a cui lasci la profondità massima. La discesa è già compresa. I livelli, se ci sono, vengono dopo.")}</p>
          <p className="mt-3 text-lg text-lagoon">{riga ?? "—"}</p>
          <div className="mt-4">
            <p className="text-sm font-medium">{t("Circuito")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["oc", "ccr"] as const).map((modo) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => {
                    setExtra((cur) => ({ ...cur, circuito: modo }));
                    if (modo === "ccr") setAperte((cur) => ({ ...cur, ccr: true }));
                    forget();
                  }}
                  className={`min-h-11 rounded-xl border text-sm ${extra.circuito === modo ? "border-brass bg-surface text-brass" : "border-line"}`}
                >
                  {modo === "oc" ? t("Circuito aperto") : "CCR"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Field label={t("Algoritmo")}>
              <select value={algo} onChange={(event) => setAlgo(event.target.value as Algo)} className={inputClass}>
                {ALGOS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </Field>
            {algo === "vpm" ? (
              <div className="mt-3">
                <p className="text-sm text-mist">{t("Conservatività VPM-B")}</p>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        setVpmLevel(level);
                        forget();
                      }}
                      className={`min-h-11 rounded-xl border text-sm ${vpmLevel === level ? "border-brass bg-surface text-brass" : "border-line"}`}
                    >
                      +{level}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-mist">{t("+0 è il VPM-B di base. Salendo, le tappe si allungano.")}</p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label={t("GF basso")}>
                  <input inputMode="decimal" value={gfLow} onChange={(event) => setGfLow(event.target.value)} className={inputClass} />
                </Field>
                <Field label={t("GF alto")}>
                  <input inputMode="decimal" value={gfHigh} onChange={(event) => setGfHigh(event.target.value)} className={inputClass} />
                </Field>
                <p className="col-span-2 text-xs text-mist">{t("Il GF basso sposta la prima tappa. Il GF alto decide quando puoi tornare in superficie. 30/70 è un punto di partenza, non una regola.")}</p>
              </div>
            )}
          </div>
        </Sezione>

        <Sezione
          id="multilivello"
          titolo={t("Immersione multilivello")}
          sommario={sommarioLivelli}
          aperta={aperte.livelli}
          onToggle={() => setAperte((cur) => ({ ...cur, livelli: !cur.livelli }))}
        >
          <p className="text-sm text-mist">{t("Dopo il tempo alla profondità massima, il piano segue i livelli nell'ordine della lista e poi inizia la risalita. Su ogni livello usa il gas valido a quella quota.")}</p>
          {extra.livelli.length === 0 ? (
            <p className="mt-3 text-sm">{t("Nessun livello: il profilo resta a quadrato.")}</p>
          ) : (
            <ol className="mt-3 grid gap-3">
              {extra.livelli.map((livello, index) => {
                const quota = numberOrNull(livello.depth);
                const fondo = numberOrNull(depth);
                const oltre = quota != null && fondo != null && quota > fondo + 0.5;
                return (
                  <li key={index} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-lagoon">{t("Livello {n}", { n: index + 1 })}</p>
                      <div className="flex gap-2">
                        <button type="button" disabled={index === 0} onClick={() => spostaLivello(index, -1)} className="min-h-11 rounded-full border border-line px-3 text-sm disabled:opacity-40">{t("Su")}</button>
                        <button type="button" disabled={index === extra.livelli.length - 1} onClick={() => spostaLivello(index, 1)} className="min-h-11 rounded-full border border-line px-3 text-sm disabled:opacity-40">{t("Giù")}</button>
                        <button type="button" onClick={() => togliLivello(index)} className="min-h-11 rounded-full border border-line px-3 text-sm text-danger">{t("Togli")}</button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Field label={t("Quota del livello {n}", { n: index + 1 })}>
                        <input inputMode="decimal" value={livello.depth} placeholder={t("metri")} onChange={(event) => patchLivello(index, "depth", event.target.value)} className={inputClass} />
                      </Field>
                      <Field label={t("Minuti del livello {n}", { n: index + 1 })}>
                        <input inputMode="decimal" value={livello.minutes} placeholder={t("minuti")} onChange={(event) => patchLivello(index, "minutes", event.target.value)} className={inputClass} />
                      </Field>
                    </div>
                    {oltre ? <p className="mt-2 text-xs text-brass">{t("Più fondo della profondità massima: il profilo scende ancora.")}</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
          <button type="button" disabled={extra.livelli.length >= MAX_LIVELLI} onClick={aggiungiLivello} className="mt-3 min-h-11 rounded-full border border-brass px-4 text-sm text-brass disabled:opacity-40">
            {t("Aggiungi livello")}
          </button>
          {prontiLivelli.length > 0 ? (
            <p className="mt-3 text-sm text-foam">{t("Ordine: {fondo} m, poi {lista}, poi la risalita.", { fondo: depth || "—", lista: prontiLivelli.map((livello) => `${livello.depth} m × ${livello.minutes} min`).join(", ") })}</p>
          ) : null}
          <p className="mt-2 text-xs text-mist">{t("Se la risalita fra un livello e l'altro passa la quota di decompressione, il piano lo segnala.")}</p>
        </Sezione>

        <Sezione
          id="gas-piano"
          titolo={t("Gas")}
          sommario={sommarioGas}
          aperta={aperte.gas}
          onToggle={() => setAperte((cur) => ({ ...cur, gas: !cur.gas }))}
        >
          <ElencoGas fondo={fondoNome} deco={deco} ccr={extra.circuito === "ccr"} />
          {extra.circuito === "ccr" ? (
            <div className="mt-4">
              <p className="text-sm text-mist">{t("Diluente e bailout si modificano nella sezione CCR.")}</p>
              <button type="button" onClick={() => setAperte((cur) => ({ ...cur, ccr: true }))} className="mt-3 min-h-11 rounded-full border border-brass px-4 text-sm text-brass">{t("Apri la sezione CCR")}</button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-medium">{t("Gas di fondo")}</p>
              <div className="mt-3">
                <CampiMix o2={o2} he={he} onO2={setO2} onHe={setHe} />
              </div>
              <StatoMix loop={false} />
              <AvvisiVivi ppo2={ppo2Vivo} densita={densitaNow} />
              <div className="mt-5">
                <CampiDeco
                  deco={deco}
                  setDeco={setDeco}
                  titolo={t("Gas di decompressione")}
                  nota={t("Fino a tre. Il piano passa al gas più ricco di ossigeno quando la quota è uguale o sopra il cambio e la PpO2 resta entro 1.65. L'ossigeno a 6 m ci sta. Vale anche sui livelli.")}
                />
              </div>
            </div>
          )}
        </Sezione>

        {extra.circuito === "ccr" ? (
          <Sezione
            id="ccr-piano"
            titolo="CCR"
            sommario={sommarioCcr}
            aperta={aperte.ccr}
            onToggle={() => setAperte((cur) => ({ ...cur, ccr: !cur.ccr }))}
          >
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setExtra((cur) => ({ ...cur, spFisso: true })); forget(); }} className={`min-h-11 rounded-xl border text-sm ${extra.spFisso ? "border-brass bg-surface text-brass" : "border-line"}`}>{t("Setpoint fisso")}</button>
              <button type="button" onClick={() => { setExtra((cur) => ({ ...cur, spFisso: false })); forget(); }} className={`min-h-11 rounded-xl border text-sm ${extra.spFisso ? "border-line" : "border-brass bg-surface text-brass"}`}>{t("Setpoint variabile")}</button>
            </div>
            {extra.spFisso ? (
              <div className="mt-3">
                <Field label={t("Setpoint (bar)")}>
                  <input inputMode="decimal" value={extra.sp} onChange={(event) => setExtra((cur) => ({ ...cur, sp: event.target.value }))} className={inputClass} />
                </Field>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Field label={t("Discesa")}>
                  <input inputMode="decimal" value={extra.spDiscesa} onChange={(event) => setExtra((cur) => ({ ...cur, spDiscesa: event.target.value }))} className={inputClass} />
                </Field>
                <Field label={t("Fondo")}>
                  <input inputMode="decimal" value={extra.spFondo} onChange={(event) => setExtra((cur) => ({ ...cur, spFondo: event.target.value }))} className={inputClass} />
                </Field>
                <Field label={t("Deco")}>
                  <input inputMode="decimal" value={extra.spDeco} onChange={(event) => setExtra((cur) => ({ ...cur, spDeco: event.target.value }))} className={inputClass} />
                </Field>
              </div>
            )}
            <div className="mt-3">
              <Field label={t("Metabolismo O2 (L/min)")}>
                <input inputMode="decimal" value={extra.metabolismo} onChange={(event) => setExtra((cur) => ({ ...cur, metabolismo: event.target.value }))} className={inputClass} />
              </Field>
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium">{t("Diluente")}</p>
              <p className="mt-1 text-xs text-mist">{t("Il diluente è il gas di fondo. Se il setpoint non sta nel gas secco, il loop diventa ossigeno puro. Se il diluente è già sopra il setpoint, respiri il diluente.")}</p>
              <div className="mt-3">
                <CampiMix o2={o2} he={he} onO2={setO2} onHe={setHe} />
              </div>
              <StatoMix loop />
              <AvvisiVivi ppo2={ppo2Vivo} densita={densitaNow} />
            </div>
            <div className="mt-5">
              <CampiDeco
                deco={deco}
                setDeco={setDeco}
                titolo={t("Gas di bailout")}
                nota={t("Fino a tre. Servono quando simuli il bailout: da quella quota in su il piano resta a circuito aperto e sceglie il gas più ricco di ossigeno, con PpO2 entro 1.65.")}
              />
            </div>
          </Sezione>
        ) : null}

        <Sezione
          id="opzioni-avanzate"
          titolo={t("Opzioni avanzate")}
          sommario={t("Discesa {discesa} m/min · risalita {risalita} m/min · ultima tappa {stop} m", { discesa: descent, risalita: ascent, stop: lastStop })}
          aperta={aperte.avanzate}
          onToggle={() => setAperte((cur) => ({ ...cur, avanzate: !cur.avanzate }))}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Discesa (m/min)")}>
              <input inputMode="decimal" value={descent} onChange={(event) => setDescent(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("Risalita (m/min)")}>
              <input inputMode="decimal" value={ascent} onChange={(event) => setAscent(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="mt-4">
            <p className="text-sm text-mist">{t("Ultima tappa")}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([3, 5, 6] as const).map((stop) => (
                <button key={stop} type="button" onClick={() => { setLastStop(stop); forget(); }} className={`min-h-11 rounded-xl border text-sm ${lastStop === stop ? "border-brass bg-surface text-brass" : "border-line"}`}>{stop} m</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-mist">{t("Da 6 m alla superficie la risalita è a 1 m/min, qualunque sia la velocità impostata.")}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={t("Consumo di fondo (L/min)")}>
              <input inputMode="decimal" value={consumoFondo} onChange={(event) => setConsumoFondo(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("Consumo in decompressione (L/min)")}>
              <input inputMode="decimal" value={consumoDeco} onChange={(event) => setConsumoDeco(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-mist">
            {extra.circuito === "ccr"
              ? t("In CCR il consumo di fondo stima il diluente solo in discesa, come se fosse circuito aperto. L'ossigeno è il metabolismo per tutto il tempo sul loop. I gas di bailout usano il consumo in decompressione.")
              : t("Litri al minuto in superficie. Il fondo vale per discesa e quota. La decompressione vale per tappe e risalite.")}
          </p>
          <div className="mt-3">
            <Field label={extra.circuito === "ccr" ? t("Litri di diluente") : t("Litri disponibili, fondo")}>
              <input inputMode="decimal" value={litriFondo} onChange={(event) => setLitriFondo(event.target.value)} placeholder={t("Vuoto: nessun controllo")} className={inputClass} />
            </Field>
            <p className="mt-2 text-xs text-mist">{t("Litri di superficie in bombola, per esempio 12 × 200 = 2400. Se il piano ne chiede di più, l'avviso diventa rosso.")}</p>
          </div>
          {extra.circuito === "ccr" ? (
            <div className="mt-3">
              <Field label={t("Litri di ossigeno")}>
                <input inputMode="decimal" value={extra.litriO2} onChange={(event) => setExtra((cur) => ({ ...cur, litriO2: event.target.value }))} placeholder={t("Vuoto: nessun controllo")} className={inputClass} />
              </Field>
            </div>
          ) : null}
          {densitaNow != null ? <p className="mt-4 text-sm">{t("Densità al fondo: {n} g/L.", { n: densitaNow.toFixed(1) })}</p> : null}
          <p className="mt-3 text-sm text-mist">{t("La perdita di un gas si simula sotto il piano, dopo il calcolo.")}</p>
          <p className="mt-3 text-sm text-mist">{t("Profilo a quadrato: discesa, fondo, risalita a tappe da 3 m. Scegli ZHL-16B, ZHL-16C o VPM-B. Vale anche per trimix e per la decompressione, con gas di fondo e fino a tre gas di risalita. Dopo un piano puoi aggiungerne un altro: i minuti in superficie lasciano il gas inerte ancora nei tessuti, e il piano successivo ne tiene conto.")}</p>
          <p className="mt-3 rounded-2xl border border-brass/40 bg-surface px-4 py-3 text-sm">{t("Questo non è un computer e non è un planner certificato. I minuti che escono sono uno studio, da confrontare con un altro strumento e con la formazione prima di entrare in acqua. Non usarli come unico piano, soprattutto se l'immersione è tecnica, con trimix o con decompressione.")}</p>
        </Sezione>

        {modifica != null ? (
          <p className="mt-3 text-sm text-brass">{t("Stai modificando l'immersione {n}. Se dopo ci sono altre immersioni, salvarla le cancella: intervallo e gas residuo non varrebbero più.", { n: modifica })}</p>
        ) : null}

        {(modifica != null && modifica > 1) || (modifica == null && serie.length > 0) ? (
          <div className="mt-5">
            <Field label={t("Intervallo di superficie (min)")}>
              <input inputMode="decimal" value={intervallo} onChange={(event) => setIntervallo(event.target.value)} className={inputClass} />
            </Field>
            <p className="mt-2 text-xs text-mist">{t("Minuti in superficie, respirando aria, prima dell'immersione successiva. Il gas inerte non ancora desaturato resta nei tessuti e accorcia il tempo di non decompressione.")}</p>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
        <button type="submit" className="mt-5 min-h-12 w-full rounded-2xl bg-tide px-5 text-sm font-medium text-white">
          {modifica != null ? t("Salva modifica") : serie.length === 0 ? t("Calcola il piano") : t("Aggiungi immersione")}
        </button>
      </form>
      <button type="button" className="no-print mt-3 min-h-11 rounded-full border border-line px-4 text-sm" onClick={onCambia}>
        {t("Cambia pianificatore")}
      </button>

      {serie
        .filter((voce) => voce.n === aperta)
        .map((voce) => (
          <Piano
            key={voce.n}
            voce={voce}
            serie={serie}
            copied={copied === voce.n}
            onCopy={() => void copia(voce)}
            onEdit={() => {
              mostra(voce);
              setModifica(voce.n);
            }}
            onDelete={() => setConferma({ tipo: "elimina", n: voce.n })}
            onRegistra={() => registra(voce)}
          />
        ))}
      {conferma ? (
        <ConfermaPiano
          tipo={conferma.tipo}
          n={conferma.n}
          onCancel={() => setConferma(null)}
          onConfirm={() => (conferma.tipo === "elimina" ? eseguiElimina(conferma.n) : applicaModifica(conferma.n))}
        />
      ) : null}
    </section>
  );
}

function ConfermaPiano({
  tipo,
  n,
  onCancel,
  onConfirm,
}: {
  tipo: "elimina" | "modifica";
  n: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-abyss/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-card border border-brass/50 bg-surface p-5 shadow-xl">
        <h2 className="text-2xl">{tipo === "elimina" ? t("Elimina") : t("Modifica")}</h2>
        <p className="mt-3 text-sm">
          {tipo === "elimina"
            ? t("Eliminare l'immersione {n} e tutte quelle dopo? Le immersioni precedenti di questa sequenza restano.", { n })
            : t("Salvare la modifica dell'immersione {n}? Le immersioni successive vengono cancellate, perché l'intervallo e il gas residuo non sono più validi. Le precedenti restano.", { n })}
        </p>
        <button type="button" className="mt-5 min-h-11 w-full rounded-full bg-lagoon px-4 text-sm font-medium" onClick={onConfirm}>
          {tipo === "elimina" ? t("Elimina") : t("Salva modifica")}
        </button>
        <button type="button" className="mt-2 min-h-11 w-full rounded-full border border-line px-4 text-sm" onClick={onCancel}>
          {t("Annulla")}
        </button>
      </div>
    </div>
  );
}

function Scarico({ onAccept, onRefuse }: { onAccept: () => void; onRefuse: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-abyss/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="scarico-titolo">
      <div className="w-full max-w-md rounded-card border border-brass/50 bg-surface p-5 shadow-xl">
        <h2 id="scarico-titolo" className="text-2xl">{t("Scarico di responsabilità")}</h2>
        <div className="mt-3 grid gap-3 text-sm">
          <p>{t("Questo pianificatore è solo uno studio. I tempi e le tappe possono essere sbagliati o incompleti.")}</p>
          <p>{t("La responsabilità dell'immersione è soltanto tua: gas, quota, tappe e ogni scelta in acqua. Tritone e chi ha fatto questa app non rispondono di incidenti, danni o errori legati a questi calcoli.")}</p>
          <p>{t("Non sostituisce un computer subacqueo, un planner validato né la formazione.")}</p>
        </div>
        <button type="button" className="mt-5 min-h-11 w-full rounded-full bg-lagoon px-4 text-sm font-medium" onClick={onAccept}>
          {t("Accetto. La responsabilità è mia.")}
        </button>
        <button type="button" className="mt-2 min-h-11 w-full rounded-full border border-line px-4 text-sm" onClick={onRefuse}>
          {t("Non accetto")}
        </button>
      </div>
    </div>
  );
}

function Piano({
  voce,
  serie,
  copied,
  onCopy,
  onEdit,
  onDelete,
  onRegistra,
}: {
  voce: VocePiano;
  serie: VocePiano[];
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRegistra: () => void;
}) {
  const t = useT();
  const { algo, gfLow, gfHigh, vpmLevel, depth, bottomMin, o2, he, lastStop, result } = voce;
  const titolo = algo === "vpm" ? `VPM-B +${vpmLevel}` : `${algo === "zhl16b" ? "ZHL-16B" : "ZHL-16C"} GF ${gfLow}/${gfHigh}`;
  const ndl = voce.ndlOltre ? t("{n} min o più", { n: voce.ndl }) : t("{n} min", { n: voce.ndl });
  const avvisi = avvisiPiano(voce);
  return (
    <div className="plan-sheet mt-6 rounded-card border border-line bg-surface p-4 sm:p-5">
      <p className="print-only text-sm">{t("Tritone · piano di immersione. È uno studio, non un'autorizzazione a immergersi.")}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl">{t("Immersione {n}", { n: voce.n })}</h3>
          <p className="mt-1 text-sm text-mist">
            {t("{titolo} · {depth} m · {bottom} min · ultima tappa {stop} m", { titolo, depth, bottom: bottomMin, stop: lastStop })}
          </p>
          {voce.extra?.circuito === "ccr" ? <p className="mt-1 text-sm text-lagoon">{testoCircuito(voce.extra)}</p> : null}
          {voce.intervallo != null ? (
            <p className="mt-1 text-sm text-mist">{t("Intervallo di superficie: {min} min, respirando aria.", { min: voce.intervallo })}</p>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className="min-h-11 rounded-full border border-line px-4 text-sm">
            {t("Modifica")}
          </button>
          <button type="button" onClick={onDelete} className="min-h-11 rounded-full border border-line px-4 text-sm">
            {t("Elimina")}
          </button>
          <button type="button" onClick={onCopy} className="min-h-11 rounded-full border border-line px-4 text-sm">
            {copied ? t("Copiato") : t("Copia")}
          </button>
          <button type="button" onClick={() => scaricaPdfPiano(voce, t)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-tide px-4 text-sm font-medium text-white">
            <FileDown className="size-4" aria-hidden />
            {t("Esporta PDF")}
          </button>
          <button type="button" onClick={onRegistra} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brass px-4 text-sm text-brass">
            <BookOpen className="size-4" aria-hidden />
            {t("Registra come immersione")}
          </button>
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-full border border-line px-4 text-sm">
            {t("Stampa")}
          </button>
        </div>
      </div>

      {avvisi.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {avvisi.map((avviso) => (
            <li key={avviso.chiave + avviso.livello + (avviso.gas ?? "") + avviso.val}>
              <Chip livello={avviso.livello}>{t(avviso.chiave, { n: avviso.n ?? avviso.val, val: avviso.val, gas: avviso.gas ? t(avviso.gas) : "" })}</Chip>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Waves className="size-4 text-lagoon" aria-hidden />
          {t("Profilo")}
        </p>
        <ProfiloGrafico segments={result.segments} />
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-mist">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded bg-lagoon" />{t("Profilo")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1 w-4 rounded bg-brass" />{t("Soste")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2 rounded-full border border-lagoon bg-brass" />{t("Cambio gas")}</span>
          <span>{t("Asse in basso: runtime")}</span>
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label={t("Runtime")} value={`${fmtMin(result.runtime)} min`} />
        <Stat label={t("Deco")} value={result.decoMin > 0 ? `${fmtMin(result.decoMin)} min` : t("Nessuna")} />
        <Stat label={t("Prima tappa")} value={result.firstStop > 0 ? `${Math.round(result.firstStop)} m` : "—"} />
        <Stat label={t("PpO2 fondo")} value={result.ppo2.toFixed(2)} tono={result.ppo2 > 1.6 ? "rosso" : result.ppo2 > 1.4 ? "ambra" : undefined} />
        <Stat label={t("END")} value={`${Math.round(result.end)} m`} />
        <Stat label={t("CNS")} value={`${Math.round(result.cns)}%`} tono={result.cns >= 80 ? "rosso" : result.cns >= 50 ? "ambra" : undefined} />
        <Stat label={t("OTU")} value={Math.round(result.otu).toString()} />
        <Stat label={t("Non deco")} value={ndl} />
        <Stat label={result.ccr ? t("Diluente") : t("Gas fondo")} value={t(nomeGas(Number(o2), Number(he)))} />
        {result.ccr ? <Stat label={t("Loop")} value={t("O2 {o2}% · He {he}%", { o2: Math.round(result.ccr.fo2), he: Math.round(result.ccr.fhe) })} /> : null}
        {result.ccr ? <Stat label={t("Ossigeno metabolico")} value={`${Math.round(result.ccr.o2Litri)} L`} /> : null}
        {result.ccr ? <Stat label={t("Diluente usato")} value={`${Math.round(result.ccr.dilLitri)} L`} tono={tonoScorta(result.ccr.dilLitri, litriDisponibili(voce.litriFondo))} /> : null}
      </dl>
      {voce.residuo ? (
        <p className="mt-3 text-sm text-mist">
          {t("Gas inerte ancora nei tessuti: il comparto più carico è a {bar} bar, contro {eq} bar di equilibrio in superficie con aria.", {
            bar: voce.residuo.bar.toFixed(2),
            eq: voce.residuo.equilibrio.toFixed(2),
          })}
        </p>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-mist">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">{t("Fase")}</th>
              <th className="py-2 pr-3 font-normal">{t("Quota")}</th>
              <th className="py-2 pr-3 font-normal">{t("Minuti")}</th>
              <th className="py-2 pr-3 font-normal">{t("Gas")}</th>
              <th className="py-2 font-normal">{t("Runtime")}</th>
            </tr>
          </thead>
          <tbody>
            {result.segments.map((row, index) => {
              const gasChanged = index > 0 && result.segments[index - 1].gas !== row.gas;
              const stop = row.fase.startsWith("Sosta") || row.fase.startsWith("Livello");
              return (
                <tr key={`${row.fase}-${index}`} className={`border-b border-line/70 ${stop ? "bg-amber/40" : gasChanged ? "bg-lagoon/10" : ""}`}>
                  <td className={`py-2 pr-3 ${stop ? "font-medium text-brass" : ""}`}>{traduciFase(row.fase, t)}</td>
                  <td className="py-2 pr-3">{Math.round(row.depth)} m</td>
                  <td className="py-2 pr-3">{fmtMin(row.minutes)}</td>
                  <td className={`py-2 pr-3 ${gasChanged ? "font-medium text-lagoon" : ""}`}>{t(row.gas)}</td>
                  <td className="py-2">{fmtMin(row.runtime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2 rounded-xl border border-brass/40 bg-amber/30 px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass" aria-hidden />
              <span>{traduciAvviso(warning, t)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {result.ccr ? <BailoutCcr voce={voce} serie={serie} /> : <Contingenza voce={voce} serie={serie} />}
      {algo !== "vpm" ? <ConfrontoGf voce={voce} serie={serie} /> : null}
      <Report voce={voce} titolo={titolo} />
      <p className="mt-4 text-xs text-mist">
        {t("Studio Tritone. Non sostituisce un computer subacqueo, un planner validato né la formazione. Controlla miscele, cambi gas e tappe prima di immergerti.")}
      </p>
      <GraficiExtra voce={voce} serie={serie} />
    </div>
  );
}

function GraficiExtra({ voce, serie }: { voce: VocePiano; serie: VocePiano[] }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  let dati: SerieGrafici | null = null;
  let errore = false;
  if (aperto) {
    try {
      dati = serieGrafici(inputDaVoce(voce, serie));
    } catch {
      errore = true;
    }
  }
  return (
    <section className="mt-6 border-t border-line pt-2">
      <button
        type="button"
        aria-expanded={aperto}
        aria-controls={`grafici-extra-${voce.n}`}
        onClick={() => setAperto((cur) => !cur)}
        className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-medium">{t("Grafici extra")}</span>
          <span className="mt-0.5 block text-xs text-mist">{t("Profilo, PpO2, END, tessuti e controdiffusione. Restano chiusi finché non li apri.")}</span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-brass transition ${aperto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aperto ? (
        <div id={`grafici-extra-${voce.n}`} className="pb-1">
          {errore || !dati ? <p className="text-sm text-brass">{t("Non riesco a disegnare questi grafici.")}</p> : <PannelloGrafici dati={dati} segments={voce.result.segments} />}
        </div>
      ) : null}
    </section>
  );
}

function Report({ voce, titolo }: { voce: VocePiano; titolo: string }) {
  const t = useT();
  const litri = litriPerGas(voce.result.segments, voce.consumoFondo, voce.consumoDeco);
  const densita = densitaDelPiano(voce);
  const zona = voce.result.firstStop > 0 ? t("{m} m", { m: Math.round(voce.result.firstStop) }) : t("Nessuna");
  const ccr = voce.result.ccr;
  const rigaLitri = (gas: string, richiesti: number, hai: number | undefined) => {
    const livello = livelloScorta(richiesti, hai);
    const classe = livello === "rosso" ? "font-medium text-danger" : livello === "ambra" ? "font-medium text-brass" : "";
    const testo = hai == null
      ? t("{gas}: {litri} L", { gas: t(gas), litri: Math.round(richiesti) })
      : t("{gas}: {n} L su {val} L", { gas: t(gas), n: Math.round(richiesti), val: Math.round(hai) });
    return { classe, testo };
  };
  return (
    <section className="mt-6 rounded-2xl border border-brass/35 bg-deep px-4 py-4">
      <h4 className="text-lg text-brass">{t("Report")}</h4>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label={t("Immersione")} value={String(voce.n)} />
        <Stat label={t("Algoritmo")} value={titolo} />
        <Stat label={t("Altitudine")} value="0 m" />
        <Stat label={t("CNS")} value={`${Math.round(voce.result.cns)}%`} tono={voce.result.cns >= 80 ? "rosso" : voce.result.cns >= 50 ? "ambra" : undefined} />
        <Stat label={t("OTU")} value={Math.round(voce.result.otu).toString()} />
        <Stat label={t("Densità gas di fondo")} value={`${densita.toFixed(1)} g/L`} tono={densita >= 6.2 ? "rosso" : densita >= 5.2 ? "ambra" : undefined} />
        <Stat label={t("Inizio zona deco")} value={zona} />
        {voce.intervallo != null ? <Stat label={t("Intervallo di superficie")} value={t("{n} min", { n: voce.intervallo })} /> : null}
      </dl>
      <ul className="mt-3 grid gap-1 text-sm">
        {ccr ? (
          <>
            <li className={rigaLitri("Ossigeno", ccr.o2Litri, litriDisponibili(voce.extra?.litriO2)).classe}>
              {rigaLitri("Ossigeno", ccr.o2Litri, litriDisponibili(voce.extra?.litriO2)).testo}
            </li>
            <li className={rigaLitri("Diluente", ccr.dilLitri, litriDisponibili(voce.litriFondo)).classe}>
              {rigaLitri("Diluente", ccr.dilLitri, litriDisponibili(voce.litriFondo)).testo}
            </li>
          </>
        ) : null}
        {litri.map((riga) => {
          const hai = scortePiano(voce).get(riga.gas);
          const voceLitri = rigaLitri(riga.gas, riga.litri, hai);
          return (
            <li key={riga.gas} className={voceLitri.classe}>{voceLitri.testo}</li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, value, tono }: { label: string; value: string; tono?: "ambra" | "rosso" }) {
  const bordo = tono === "rosso" ? "border-danger/50 bg-danger/10" : tono === "ambra" ? "border-brass/50 bg-amber/40" : "border-line";
  const colore = tono === "rosso" ? "text-danger" : tono === "ambra" ? "text-brass" : "";
  return (
    <div className={`rounded-xl border px-3 py-3 ${bordo}`}>
      <dt className="text-xs text-mist">{label}</dt>
      <dd className={`mt-1 text-base font-medium ${colore}`}>{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-mist">{label}</span>
      {children}
    </label>
  );
}

function Sezione({ id, titolo, sommario, aperta, onToggle, children }: { id: string; titolo: string; sommario: string; aperta: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="mt-3 rounded-2xl border border-line bg-deep">
      <button type="button" aria-expanded={aperta} aria-controls={id} onClick={onToggle} className="flex min-h-14 w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{titolo}</span>
          <span className="mt-1 block text-sm text-mist">{sommario}</span>
        </span>
        <ChevronDown className={`mt-0.5 size-5 shrink-0 text-brass transition ${aperta ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aperta ? <div id={id} className="border-t border-line px-4 py-4">{children}</div> : null}
    </section>
  );
}

function CampiMix({ o2, he, onO2, onHe }: { o2: string; he: string; onO2: (value: string) => void; onHe: (value: string) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("Ossigeno %")}>
        <input inputMode="decimal" value={o2} onChange={(event) => onO2(event.target.value)} className={inputClass} />
      </Field>
      <Field label={t("Elio %")}>
        <input inputMode="decimal" value={he} onChange={(event) => onHe(event.target.value)} className={inputClass} />
      </Field>
    </div>
  );
}

function CampiDeco({ deco, setDeco, titolo, nota }: { deco: DecoDraft[]; setDeco: (value: DecoDraft[] | ((rows: DecoDraft[]) => DecoDraft[])) => void; titolo: string; nota: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-sm font-medium">{titolo}</p>
      <p className="mt-1 text-xs text-mist">{nota}</p>
      <ul className="mt-3 grid gap-3">
        {deco.map((gas, index) => (
          <li key={index} className="rounded-2xl border border-line bg-surface p-3">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={gas.on}
                onChange={(event) => {
                  const on = event.target.checked;
                  setDeco((rows) => rows.map((row, i) => (i === index ? { ...row, on } : row)));
                }}
                className="size-5 accent-lagoon"
              />
              <span className={gas.on ? "font-medium text-lagoon" : ""}>
                {gas.on ? `${nomeGas(Number(gas.o2), Number(gas.he))} · ${t("Da {m} m", { m: gas.switchM || "—" })}` : t("Gas {n}", { n: index + 1 })}
              </span>
              {!gas.on ? <span className="text-mist">{t("spento")}</span> : null}
            </label>
            {gas.on ? (
              <>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label={t("O2 %")}>
                    <input inputMode="decimal" value={gas.o2} onChange={(event) => { const value = event.target.value; setDeco((rows) => rows.map((row, i) => (i === index ? { ...row, o2: value } : row))); }} className={inputClass} />
                  </Field>
                  <Field label={t("He %")}>
                    <input inputMode="decimal" value={gas.he} onChange={(event) => { const value = event.target.value; setDeco((rows) => rows.map((row, i) => (i === index ? { ...row, he: value } : row))); }} className={inputClass} />
                  </Field>
                  <Field label={t("Cambio (m)")}>
                    <input inputMode="decimal" value={gas.switchM} onChange={(event) => { const value = event.target.value; setDeco((rows) => rows.map((row, i) => (i === index ? { ...row, switchM: value } : row))); }} className={inputClass} />
                  </Field>
                </div>
                <div className="mt-2">
                  <Field label={t("Litri disponibili")}>
                    <input inputMode="decimal" value={gas.litri} placeholder={t("Vuoto: nessun controllo")} onChange={(event) => { const value = event.target.value; setDeco((rows) => rows.map((row, i) => (i === index ? { ...row, litri: value } : row))); }} className={inputClass} />
                  </Field>
                </div>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ElencoGas({ fondo, deco, ccr }: { fondo: string; deco: DecoDraft[]; ccr: boolean }) {
  const t = useT();
  const accesi = deco
    .filter((gas) => gas.on)
    .slice()
    .sort((a, b) => Number(b.switchM) - Number(a.switchM));
  return (
    <ol className="grid gap-2">
      <li className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 text-sm">
        <span className="size-2.5 shrink-0 rounded-full bg-lagoon" aria-hidden />
        <span>{ccr ? t("Loop e livelli: setpoint sul diluente {gas}", { gas: fondo }) : t("Fondo e livelli, finché un cambio non entra: {gas}", { gas: fondo })}</span>
      </li>
      {accesi.map((gas) => (
        <li key={`${gas.o2}-${gas.he}-${gas.switchM}`} className="flex items-center gap-3 rounded-xl border border-brass/40 px-3 py-3 text-sm">
          <span className="size-2.5 shrink-0 rounded-full bg-brass" aria-hidden />
          <span>{t("Da {m} m: {gas}", { m: gas.switchM || "—", gas: nomeGas(Number(gas.o2), Number(gas.he)) })}</span>
        </li>
      ))}
    </ol>
  );
}

function readMix(o2s: string, hes: string) {
  const o2 = numberOrNull(o2s);
  const he = numberOrNull(hes);
  if (o2 == null || he == null) return null;
  return { o2, he, n2: 100 - o2 - he };
}

function numberOrNull(value: string) {
  const n = Number(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function num(value: string, label: string, min: number, max: number) {
  const n = numberOrNull(value);
  if (n == null || n < min || n > max) throw new Error(`${label}: indica un numero tra ${min} e ${max}.`);
  return n;
}

function fmtMin(n: number) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function Pianifica({ onRefuse }: { onRefuse: () => void }) {
  const t = useT();
  const frame = useFondale();
  const tecnicoChiuso = frame.abbonamento.ruolo === "sub" && !frame.abbonamento.proAperto;
  const [modo, setModo] = useState<"scelta" | "ricreativo" | "tecnico">("scelta");
  const [tecnicoAperto, setTecnicoAperto] = useState(false);
  const [scaricoOk, setScaricoOk] = useState<boolean | null>(null);
  const [pendente, setPendente] = useState<null | "ricreativo" | "tecnico">(null);
  const [attesa, setAttesa] = useState<null | "ricreativo" | "tecnico">(null);
  const [spunta, setSpunta] = useState(false);
  const [documento, setDocumento] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroreScarico, setErroreScarico] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    statoScaricoPianificatore()
      .then((value) => {
        if (live) setScaricoOk(value.ok);
      })
      .catch(() => {
        if (live) setScaricoOk(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!pendente || scaricoOk === null) return;
    if (scaricoOk) entra(pendente);
    else {
      setSpunta(false);
      setErroreScarico(null);
      setAttesa(pendente);
    }
    setPendente(null);
  }, [pendente, scaricoOk]);

  function entra(next: "ricreativo" | "tecnico") {
    if (next === "tecnico") setTecnicoAperto(true);
    setModo(next);
    setAttesa(null);
    setSpunta(false);
  }

  function scegli(next: "ricreativo" | "tecnico") {
    if (next === "tecnico" && tecnicoChiuso) return;
    if (scaricoOk === true) {
      entra(next);
      return;
    }
    if (scaricoOk === false) {
      setSpunta(false);
      setErroreScarico(null);
      setAttesa(next);
      return;
    }
    setPendente(next);
  }

  return (
    <>
      {modo === "scelta" ? (
        <section className="mt-8">
          <h2 className="text-2xl">{t("Pianifica")}</h2>
          <div className="mt-4 grid gap-3">
            <button type="button" className="rounded-2xl bg-tide px-4 py-4 text-left text-white" onClick={() => scegli("ricreativo")}>
              <span className="block text-base font-medium">{t("Pianificatore ricreativo")}</span>
              <span className="mt-1 block text-sm text-white/80">{t("Aria, EAN32, EAN36. Minuti senza tappa")}</span>
            </button>
            <button
              type="button"
              disabled={tecnicoChiuso}
              className="rounded-2xl border border-lagoon px-4 py-4 text-left disabled:opacity-60"
              onClick={() => scegli("tecnico")}
            >
              <span className="block text-base font-medium">{t("Pianificatore tecnico")}{tecnicoChiuso ? null : <SegnoPro />}</span>
              <span className="mt-1 block text-sm text-mist">
                {tecnicoChiuso ? t("Disponibile con Pro") : t("CCR, bailout, livelli, gas")}
              </span>
            </button>
          </div>
        </section>
      ) : null}
      {modo === "ricreativo" ? <Ricreativo onCambia={() => setModo("scelta")} /> : null}
      {tecnicoAperto ? (
        <div className={modo === "tecnico" ? undefined : "hidden"}>
          <PianificatoreTecnico onRefuse={onRefuse} onCambia={() => setModo("scelta")} attivo={modo === "tecnico"} />
        </div>
      ) : null}
      {attesa ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-abyss/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-xl">
            <h2 className="text-2xl">{t("Scarico di responsabilità del pianificatore")}</h2>
            <div className="mt-4 flex items-start gap-3 text-sm">
              <input id="scarico-pianificatore" type="checkbox" className="mt-1" checked={spunta} onChange={(event) => setSpunta(event.target.checked)} />
              <p>
                <label htmlFor="scarico-pianificatore">{t("Ho letto e accetto lo")}</label>{" "}
                <button type="button" className="text-lagoon underline" onClick={() => setDocumento(true)}>
                  {t(SCARICO_LINK)}
                </button>
                <label htmlFor="scarico-pianificatore">{t(". I calcoli sono solo di supporto e non sostituiscono la mia verifica e responsabilità.")}</label>
              </p>
            </div>
            {erroreScarico ? <p className="mt-3 text-sm text-brass">{t(erroreScarico)}</p> : null}
            <button
              type="button"
              disabled={!spunta || salvando}
              className="mt-5 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
              onClick={() => {
                if (!attesa) return;
                const scelto = attesa;
                setSalvando(true);
                setErroreScarico(null);
                void accettaScaricoPianificatore({ data: { accetto: true } })
                  .then(() => {
                    setScaricoOk(true);
                    entra(scelto);
                  })
                  .catch((reason: unknown) => {
                    setErroreScarico(messaggioErrore(reason, "Non salvato."));
                    setSalvando(false);
                  });
              }}
            >
              {salvando ? t("Salvo…") : t("Continua")}
            </button>
          </div>
        </div>
      ) : null}
      {documento ? <ScaricoDocumento onClose={() => setDocumento(false)} /> : null}
    </>
  );
}

const ARIA_DOPPLER: [number, number][] = [
  [3, 245],
  [4.5, 217],
  [6, 205],
  [7.5, 166],
  [9, 145],
  [10.5, 131],
  [12, 108],
  [13.5, 82],
  [15, 63],
  [18, 45],
  [21, 37],
  [24, 28],
  [27, 24],
  [30, 18],
  [33, 16],
  [36, 10],
  [39, 6],
  [42, 4],
  [45, 3],
];

const EAN32_DOPPLER: [number, number][] = [
  [4.5, 245],
  [6, 217],
  [7.5, 205],
  [9, 166],
  [12, 145],
  [13.5, 131],
  [15, 108],
  [16.5, 82],
  [18, 63],
  [21, 45],
  [24, 37],
  [27, 28],
  [33, 24],
  [36, 18],
];

/** Riga della tabella: se la quota cade tra due righe, vale la più fonda. */
function minutiDoppler(tabella: [number, number][], metri: number): number | null {
  for (const [quota, minuti] of tabella) {
    if (metri <= quota) return minuti;
  }
  return null;
}

function eadAria(metri: number, o2: number): number {
  return (metri + 10) * ((100 - o2) / 100 / 0.79) - 10;
}

type GasRicreativo = "aria" | "ean32" | "ean36";

const GAS_RICREATIVI: { id: GasRicreativo; nome: string; limite: number; tetto: string }[] = [
  { id: "aria", nome: "Aria", limite: 40, tetto: "40 m" },
  { id: "ean32", nome: "32", limite: 33, tetto: "fino a 33 m" },
  { id: "ean36", nome: "36", limite: 28, tetto: "fino a 28 m" },
];

/** Sempre acceso sulle ripetitive: circa il 12% in meno della tabella. Non è una spunta. */
const BASE_RIPETITIVA = 0.88;
/** Ogni fattore opzionale toglie un altro 5%. */
const FATTORE_RIPETITIVA = 0.95;
/** Emivita dell'azoto residuo in curva, in minuti. */
const EMIVITA_RESIDUA_MIN = 60;

const FATTORI_RIPETITIVA = [
  { id: "fredda", label: "Acqua fredda (< 15 °C)" },
  { id: "stress", label: "Stanchezza / stress" },
  { id: "consumo", label: "Consumo elevato" },
  { id: "forma", label: "Forma fisica non ottimale" },
] as const;

function ndlTabella(gas: GasRicreativo, metri: number): number | null {
  if (!(metri > 0)) return null;
  const limite = GAS_RICREATIVI.find((item) => item.id === gas)?.limite ?? 40;
  if (metri > limite) return null;
  return minutiDoppler(gas === "ean32" ? EAN32_DOPPLER : ARIA_DOPPLER, gas === "ean36" ? eadAria(metri, 36) : metri);
}

function esitoRipetitiva(
  gas: GasRicreativo,
  primaM: number,
  primaMin: number,
  intervallo: number,
  dopoM: number,
  fattori: number,
): { stato: "fuori"; ndlPrima: number } | { stato: "ok"; residuo: number; disponibile: number } | null {
  const ndlPrima = ndlTabella(gas, primaM);
  const ndlDopo = ndlTabella(gas, dopoM);
  if (ndlPrima == null || ndlDopo == null || !(primaMin > 0) || intervallo < 0) return null;
  if (primaMin > ndlPrima) return { stato: "fuori", ndlPrima };
  const residua = (primaMin / ndlPrima) * 2 ** (-intervallo / EMIVITA_RESIDUA_MIN);
  const residuo = Math.min(ndlDopo, Math.round(residua * ndlDopo));
  const grezzo = Math.max(0, ndlDopo - residuo);
  const disponibile = Math.floor(grezzo * BASE_RIPETITIVA * FATTORE_RIPETITIVA ** fattori + 1e-9);
  return { stato: "ok", residuo, disponibile };
}

function Ricreativo({ onCambia }: { onCambia: () => void }) {
  const t = useT();
  const frame = useFondale();
  const chiusa = !frame.abbonamento.proAperto;
  const [gas, setGas] = useState<GasRicreativo>("aria");
  const [depth, setDepth] = useState("18");
  const [ripetitiva, setRipetitiva] = useState(false);
  const [precM, setPrecM] = useState("");
  const [precT, setPrecT] = useState("");
  const [intervallo, setIntervallo] = useState("");
  const [fattori, setFattori] = useState<string[]>([]);
  const scelto = GAS_RICREATIVI.find((item) => item.id === gas) ?? GAS_RICREATIVI[0];
  const metri = numberOrNull(depth);
  const oltre = metri != null && metri > scelto.limite;
  const minuti = metri == null || metri <= 0 || oltre ? null : minutiDoppler(gas === "ean32" ? EAN32_DOPPLER : ARIA_DOPPLER, gas === "ean36" ? eadAria(metri, 36) : metri);
  const gasNome = gas === "aria" ? t("Aria") : gas === "ean32" ? "EAN32" : "EAN36";
  const aperta = ripetitiva && !chiusa;
  const primaM = numberOrNull(precM);
  const primaT = numberOrNull(precT);
  const superficie = numberOrNull(intervallo);
  const primaOltre = primaM != null && primaM > scelto.limite;
  const campiPronti =
    precM.trim() !== "" &&
    precT.trim() !== "" &&
    intervallo.trim() !== "" &&
    primaM != null &&
    primaM > 0 &&
    primaT != null &&
    primaT > 0 &&
    superficie != null &&
    superficie >= 0 &&
    superficie <= 10080;
  const esito = aperta && campiPronti && !primaOltre && !oltre && metri != null && metri > 0 ? esitoRipetitiva(gas, primaM, primaT, superficie, metri, fattori.length) : null;
  const nomiFattori = FATTORI_RIPETITIVA.filter((item) => fattori.includes(item.id)).map((item) => t(item.label));

  function toggleFattore(id: string) {
    setFattori((correnti) => (correnti.includes(id) ? correnti.filter((voce) => voce !== id) : [...correnti, id]));
  }

  let cifra = "—";
  let didascalia = t("senza tappa");
  if (oltre) {
    cifra = t("Cambia gas");
  } else if (!aperta && minuti != null) {
    cifra = t("{n} min", { n: minuti });
  } else if (esito?.stato === "ok") {
    cifra = t("{n} min", { n: esito.disponibile });
    didascalia = t("NDL disponibile per la successiva");
  } else if (esito?.stato === "fuori") {
    cifra = t("{n} min", { n: 0 });
    didascalia = t("Fuori dalla curva");
  } else if (aperta && primaOltre) {
    didascalia = t("Cambia gas");
  } else if (aperta) {
    didascalia = t("Compila la prima immersione");
  }

  return (
    <section className="mt-6">
      <div className="flex items-center gap-3">
        <Waves className="size-6 shrink-0 text-lagoon" aria-hidden />
        <h2 className="text-xl">{t("Pianificatore ricreativo")}</h2>
      </div>
      <p className="mt-4 rounded-2xl border border-brass/40 bg-amber/30 px-4 py-3 text-sm">
        {t("Questo non è un computer e non è un planner certificato. I minuti sono uno studio, da confrontare con un altro strumento e con la formazione.")}
      </p>
      {chiusa ? (
        <button type="button" disabled className="mt-4 flex min-h-16 w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-line bg-deep px-4 text-left">
          <Lock className="size-5 shrink-0 text-brass" aria-hidden />
          <span>
            <span className="block text-base font-medium">{t("Immersione ripetitiva")}</span>
            <span className="mt-0.5 block text-sm text-brass">{t("Disponibile con Pro")}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-pressed={ripetitiva}
          className={`mt-4 flex min-h-16 w-full items-center rounded-2xl border px-4 text-left ${ripetitiva ? "border-lagoon bg-lagoon/15" : "border-line bg-deep"}`}
          onClick={() => setRipetitiva((ora) => !ora)}
        >
          <span>
            <span className="block text-base font-medium">{t("Immersione ripetitiva")}<SegnoPro /></span>
            <span className="mt-0.5 block text-sm text-mist">{t("Prima immersione, intervallo e NDL della successiva")}</span>
          </span>
        </button>
      )}
      {aperta ? (
        <div className="mt-3 rounded-2xl border border-line bg-deep px-4 py-4">
          <p className="text-sm text-brass">{t("Tempi conservativi. Il conservativismo di base è sempre attivo, circa il 12% in meno della tabella, e non si può togliere. Ogni fattore toglie un altro 5%.")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label={t("Profondità precedente (m)")}>
              <input inputMode="decimal" value={precM} onChange={(event) => setPrecM(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("Tempo precedente (min)")}>
              <input inputMode="decimal" value={precT} onChange={(event) => setPrecT(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("Intervallo di superficie (min)")}>
              <input inputMode="decimal" value={intervallo} onChange={(event) => setIntervallo(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-mist">{t("Stesso gas per le due immersioni.")}</p>
          <div className="mt-4 grid gap-2">
            {FATTORI_RIPETITIVA.map((item) => (
              <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={fattori.includes(item.id)} onChange={() => toggleFattore(item.id)} />
                {t(item.label)}
              </label>
            ))}
          </div>
          {primaOltre ? <p className="mt-3 text-sm text-brass">{t("Cambia gas")}</p> : null}
          {esito?.stato === "fuori" ? (
            <p className="mt-3 text-sm text-brass">{t("La prima immersione supera il tempo senza tappa ({n} min). Non c'è un NDL per la successiva.", { n: esito.ndlPrima })}</p>
          ) : null}
          {esito?.stato === "ok" && primaM != null && primaT != null && superficie != null ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-mist">{t("Immersione precedente")}</dt>
                <dd className="mt-1">{t("{m} m · {min} min", { m: fmtMin(primaM), min: fmtMin(primaT) })} · {gasNome}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-mist">{t("Intervallo di superficie")}</dt>
                <dd className="mt-1">{t("{n} min", { n: fmtMin(superficie) })}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-mist">{t("NDL residuo")}</dt>
                <dd className="mt-1">{t("{n} min", { n: esito.residuo })}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-mist">{t("NDL disponibile per la successiva")}</dt>
                <dd className="mt-1 text-lg text-lagoon">{t("{n} min", { n: esito.disponibile })}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-mist">{t("Fattori aggiuntivi")}</dt>
                <dd className="mt-1">{nomiFattori.length ? nomiFattori.join(", ") : t("Nessun fattore aggiuntivo")}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 rounded-card border border-line bg-deep px-5 py-6">
        <p className="text-xs uppercase tracking-wide text-mist">{metri != null && metri > 0 ? `${fmtMin(metri)} m · ${gasNome}` : gasNome}</p>
        <p className={`mt-3 text-5xl leading-none ${oltre || esito?.stato === "fuori" ? "text-brass" : "text-lagoon"}`}>
          {cifra}
        </p>
        <p className="mt-3 text-sm text-mist">{didascalia}</p>
      </div>
      <div className="mt-6">
        <Field label={t(aperta ? "Profondità della successiva (m)" : "Profondità (m)")}>
          <input inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} className={`${inputClass} text-lg`} />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {GAS_RICREATIVI.map((item) => {
          const attivo = item.id === gas;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setGas(item.id)}
              className={`min-h-20 rounded-2xl px-2 py-3 text-sm ${attivo ? "bg-tide font-medium text-white" : "border border-line bg-deep"} ${attivo && oltre ? "ring-2 ring-brass" : ""}`}
            >
              <span className="block">{item.id === "aria" ? t(item.nome) : item.nome}</span>
              <span className={`mt-1 block text-xs ${attivo ? "text-white/80" : "text-mist"}`}>{t(item.tetto)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-mist">{t("ppO2 massima 1,4 ata")}</p>
      {oltre ? <p className="mt-3 rounded-xl border border-brass/50 bg-amber/40 px-3 py-2 text-sm text-brass">{t("Cambia gas")}</p> : null}
      <button type="button" className="mt-5 min-h-11 rounded-full border border-line px-4 text-sm" onClick={onCambia}>
        {t("Cambia pianificatore")}
      </button>
    </section>
  );
}

function nomeGas(o2: number, he: number) {
  if (!Number.isFinite(o2) || !Number.isFinite(he)) return "—";
  if (he <= 0 && o2 >= 99) return "Ossigeno";
  if (he <= 0 && o2 >= 20 && o2 <= 22) return "Aria";
  if (he <= 0) return `EAN${Math.round(o2)}`;
  return `Tx ${Math.round(o2)}/${Math.round(he)}`;
}

function traduciFase(fase: string, t: Traduci): string {
  if (fase === "Discesa" || fase === "Fondo" || fase === "Risalita in superficie") return t(fase);
  const sosta = /^Sosta (\d+) m$/.exec(fase);
  if (sosta) return t("Sosta {m} m", { m: sosta[1] });
  const livello = /^Livello (\d+) m$/.exec(fase);
  if (livello) return t("Livello {m} m", { m: livello[1] });
  const risalita = /^Risalita a (\d+) m$/.exec(fase);
  if (risalita) return t("Risalita a {m} m", { m: risalita[1] });
  return t(fase);
}

function traduciAvviso(warning: string, t: Traduci): string {
  const ppo2 = /^PpO2 di fondo (.+) bar: sopra 1\.40\.$/.exec(warning);
  if (ppo2) return t("PpO2 di fondo {val} bar: sopra 1.40.", { val: ppo2[1] });
  const cns = /^CNS (\d+)%: carico di ossigeno alto\.$/.exec(warning);
  if (cns) return t("CNS {n}%: carico di ossigeno alto.", { n: cns[1] });
  const end = /^END (\d+) m: narcosi da tenere d'occhio\.$/.exec(warning);
  if (end) return t("END {m} m: narcosi da tenere d'occhio.", { m: end[1] });
  const somma = /^(.+): ossigeno e elio superano il 100%\.$/.exec(warning);
  if (somma) return t("{gas}: ossigeno e elio superano il 100%.", { gas: t(somma[1]) });
  const cambio = /^(.+): il cambio a (\d+) m non è sopra il fondo, resta fuori dal piano\.$/.exec(warning);
  if (cambio) return t("{gas}: il cambio a {m} m non è sopra il fondo, resta fuori dal piano.", { gas: t(cambio[1]), m: cambio[2] });
  const oltre = /^(.+) a (\d+) m ha PpO2 (.+) bar, oltre 1\.65: non viene scelta\.$/.exec(warning);
  if (oltre) return t("{gas} a {m} m ha PpO2 {val} bar, oltre 1.65: non viene scelta.", { gas: t(oltre[1]), m: oltre[2], val: oltre[3] });
  return t(warning);
}

function pianoTesto(voce: VocePiano, t: Traduci) {
  const { algo, gfLow, gfHigh, vpmLevel, depth, bottomMin, o2, he, lastStop, result } = voce;
  const titolo = algo === "vpm" ? `VPM-B +${vpmLevel}` : `${algo === "zhl16b" ? "ZHL-16B" : "ZHL-16C"} GF ${gfLow}/${gfHigh}`;
  const righe = result.segments.map((row) => `${traduciFase(row.fase, t)}\t${Math.round(row.depth)} m\t${fmtMin(row.minutes)} min\t${t(row.gas)}\t${fmtMin(row.runtime)}`);
  const prima = result.firstStop > 0 ? t("{m} m", { m: Math.round(result.firstStop) }) : t("nessuna");
  const ndl = voce.ndlOltre ? t("{n} min o più", { n: voce.ndl }) : t("{n} min", { n: voce.ndl });
  return [
    t("Tritone · piano di immersione (studio, non un'autorizzazione)"),
    t("Immersione {n}", { n: voce.n }),
    voce.intervallo != null ? t("Intervallo di superficie: {min} min, respirando aria.", { min: voce.intervallo }) : "",
    t("{titolo} · {depth} m · fondo {bottom} min · ultima tappa {stop} m · gas {gas}", {
      titolo,
      depth,
      bottom: bottomMin,
      stop: lastStop,
      gas: t(nomeGas(Number(o2), Number(he))),
    }),
    t("Tempo di non decompressione: {ndl}", { ndl }),
    voce.residuo
      ? t("Gas inerte ancora nei tessuti: il comparto più carico è a {bar} bar, contro {eq} bar di equilibrio in superficie con aria.", {
          bar: voce.residuo.bar.toFixed(2),
          eq: voce.residuo.equilibrio.toFixed(2),
        })
      : "",
    t("Runtime {runtime} min · deco {deco} min · prima tappa {stop}", {
      runtime: fmtMin(result.runtime),
      deco: fmtMin(result.decoMin),
      stop: prima,
    }),
    t("PpO2 {ppo2} · END {end} m · CNS {cns}% · OTU {otu}", {
      ppo2: result.ppo2.toFixed(2),
      end: Math.round(result.end),
      cns: Math.round(result.cns),
      otu: Math.round(result.otu),
    }),
    voce.extra?.circuito === "ccr" ? testoCircuito(voce.extra) : "",
    result.ccr
      ? t("Ossigeno metabolico {o2} L · diluente {dil} L · loop O2 {fo2}% · He {he}%", {
          o2: Math.round(result.ccr.o2Litri),
          dil: Math.round(result.ccr.dilLitri),
          fo2: Math.round(result.ccr.fo2),
          he: Math.round(result.ccr.fhe),
        })
      : "",
    "",
    ...righe,
    "",
    ...result.warnings.map((warning) => traduciAvviso(warning, t)),
    "",
    t("Report"),
    t("Immersione {n} · {titolo}", { n: voce.n, titolo }),
    t("Altitudine 0 m · CNS {cns}% · OTU {otu}", { cns: Math.round(result.cns), otu: Math.round(result.otu) }),
    ...(result.ccr
      ? [
          t("{gas}: {litri} L", { gas: t("Ossigeno"), litri: Math.round(result.ccr.o2Litri) }),
          t("{gas}: {litri} L", { gas: t("Diluente"), litri: Math.round(result.ccr.dilLitri) }),
        ]
      : []),
    ...litriPerGas(result.segments, voce.consumoFondo, voce.consumoDeco).map((riga) =>
      t("{gas}: {litri} L", { gas: t(riga.gas), litri: Math.round(riga.litri) }),
    ),
    t("Densità gas di fondo: {val} g/L", { val: densitaDelPiano(voce).toFixed(1) }),
    t("Inizio zona deco: {zona}", { zona: result.firstStop > 0 ? t("{m} m", { m: Math.round(result.firstStop) }) : t("Nessuna") }),
    voce.intervallo != null ? t("Intervallo di superficie: {min} min", { min: voce.intervallo }) : "",
    "",
    t("Non sostituisce un computer, un planner validato né la formazione."),
  ].join("\n");
}

const CHIAVE_MODELLI = "tritone-modelli-piano";

type ModelloPiano = {
  id: string;
  nome: string;
  algo: Algo;
  gfLow: string;
  gfHigh: string;
  vpmLevel: number;
  depth: string;
  bottomMin: string;
  descent: string;
  ascent: string;
  lastStop: 3 | 5 | 6;
  o2: string;
  he: string;
  consumoFondo: string;
  consumoDeco: string;
  litriFondo: string;
  extra?: ExtraPiano;
  deco: DecoDraft[];
};

function leggiModelli(): ModelloPiano[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHIAVE_MODELLI);
    const data = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as ModelloPiano;
      if (typeof row.id !== "string" || typeof row.nome !== "string" || !Array.isArray(row.deco)) return [];
      return [{
        ...row,
        litriFondo: typeof row.litriFondo === "string" ? row.litriFondo : "",
        lastStop: row.lastStop === 5 || row.lastStop === 6 ? row.lastStop : 3,
        extra: normalizzaExtra(row.extra),
        deco: START_DECO.map((base, index) => {
          const gas = row.deco[index];
          const bozza = gas && typeof gas === "object" ? gas : base;
          return {
            on: bozza.on === true,
            o2: typeof bozza.o2 === "string" ? bozza.o2 : base.o2,
            he: typeof bozza.he === "string" ? bozza.he : base.he,
            switchM: typeof bozza.switchM === "string" ? bozza.switchM : base.switchM,
            litri: typeof bozza.litri === "string" ? bozza.litri : "",
          };
        }),
      }];
    });
  } catch {
    return [];
  }
}

function scriviModelli(righe: ModelloPiano[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHIAVE_MODELLI, JSON.stringify(righe));
}

function Chip({ livello, children }: { livello: "ambra" | "rosso"; children: ReactNode }) {
  const classe = livello === "rosso"
    ? "border-danger/50 bg-danger/10 text-danger"
    : "border-brass/50 bg-amber/40 text-brass";
  return (
    <span className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium ${classe}`}>
      <AlertTriangle className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

function AvvisiVivi({ ppo2, densita }: { ppo2: number | null; densita: number | null }) {
  const t = useT();
  const voci: { livello: "ambra" | "rosso"; testo: string }[] = [];
  if (densita != null && densita >= 6.2) voci.push({ livello: "rosso", testo: t("Densità gas alta · {n} g/L", { n: densita.toFixed(1) }) });
  else if (densita != null && densita >= 5.2) voci.push({ livello: "ambra", testo: t("Densità gas alta · {n} g/L", { n: densita.toFixed(1) }) });
  if (ppo2 != null && ppo2 > 1.6) voci.push({ livello: "rosso", testo: t("MOD superata · PpO2 {val}", { val: ppo2.toFixed(2) }) });
  else if (ppo2 != null && ppo2 > 1.4) voci.push({ livello: "ambra", testo: t("MOD superata · PpO2 {val}", { val: ppo2.toFixed(2) }) });
  if (!voci.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {voci.map((voce) => (
        <li key={voce.testo}><Chip livello={voce.livello}>{voce.testo}</Chip></li>
      ))}
    </ul>
  );
}

function avvisiPiano(voce: VocePiano): { livello: "ambra" | "rosso"; chiave: string; val: string; n?: string; gas?: string }[] {
  const densita = densitaDelPiano(voce);
  const voci: { livello: "ambra" | "rosso"; chiave: string; val: string; n?: string; gas?: string }[] = [];
  if (densita >= 6.2) voci.push({ livello: "rosso", chiave: "Densità gas alta · {n} g/L", val: densita.toFixed(1) });
  else if (densita >= 5.2) voci.push({ livello: "ambra", chiave: "Densità gas alta · {n} g/L", val: densita.toFixed(1) });
  if (voce.result.cns >= 80) voci.push({ livello: "rosso", chiave: "CNS elevato · {n}%", val: String(Math.round(voce.result.cns)) });
  else if (voce.result.cns >= 50) voci.push({ livello: "ambra", chiave: "CNS elevato · {n}%", val: String(Math.round(voce.result.cns)) });
  if (voce.result.ppo2 > 1.6) voci.push({ livello: "rosso", chiave: "MOD superata · PpO2 {val}", val: voce.result.ppo2.toFixed(2) });
  else if (voce.result.ppo2 > 1.4) voci.push({ livello: "ambra", chiave: "MOD superata · PpO2 {val}", val: voce.result.ppo2.toFixed(2) });
  const pushScorta = (gas: string, richiesti: number, hai: number | undefined) => {
    const livello = livelloScorta(richiesti, hai);
    if (!livello || hai == null) return;
    voci.push({
      livello,
      chiave: livello === "rosso" ? "Gas non sufficiente · {gas}: {n} L su {val} L" : "Gas al limite · {gas}: {n} L su {val} L",
      n: String(Math.round(richiesti)),
      val: String(Math.round(hai)),
      gas,
    });
  };
  if (voce.result.ccr) {
    pushScorta("Diluente", voce.result.ccr.dilLitri, litriDisponibili(voce.litriFondo));
    pushScorta("Ossigeno", voce.result.ccr.o2Litri, litriDisponibili(voce.extra?.litriO2));
  }
  const scorte = scortePiano(voce);
  for (const riga of litriPerGas(voce.result.segments, voce.consumoFondo, voce.consumoDeco)) {
    pushScorta(riga.gas, riga.litri, scorte.get(riga.gas));
  }
  return voci;
}

function scortePiano(voce: VocePiano): Map<string, number> {
  const map = new Map<string, number>();
  const aggiungi = (nome: string, raw: string | undefined) => {
    const testo = (raw ?? "").trim();
    if (!testo) return;
    const n = numberOrNull(testo);
    if (n == null || n < 0) return;
    map.set(nome, (map.get(nome) ?? 0) + n);
  };
  aggiungi(nomeGas(Number(voce.o2), Number(voce.he)), voce.litriFondo);
  for (const gas of voce.deco) {
    if (!gas.on) continue;
    aggiungi(nomeGas(Number(gas.o2), Number(gas.he)), gas.litri);
  }
  return map;
}

function livelloScorta(richiesti: number, hai: number | undefined): "ambra" | "rosso" | undefined {
  if (hai == null || richiesti <= 0) return undefined;
  if (richiesti > hai) return "rosso";
  if (richiesti >= hai * 0.8) return "ambra";
  return undefined;
}

function ProfiloGrafico({ segments, compatto = false }: { segments: Segment[]; compatto?: boolean }) {
  const maxD = Math.max(6, ...segments.map((row) => Math.max(row.da, row.depth)));
  const maxT = Math.max(1, segments[segments.length - 1]?.runtime ?? 1);
  const w = compatto ? 320 : 460;
  const h = compatto ? 168 : 300;
  const padL = compatto ? 32 : 48;
  const padR = compatto ? 16 : 112;
  const padT = compatto ? 14 : 24;
  const padB = compatto ? 26 : 40;
  const x = (tempo: number) => padL + (tempo / maxT) * (w - padL - padR);
  const y = (metri: number) => padT + (metri / maxD) * (h - padB - padT);
  let traccia = `M ${x(0).toFixed(1)} ${y(0).toFixed(1)}`;
  const soste: { x1: number; x2: number; y: number; testo: string }[] = [];
  const cambi: { x: number; y: number; testo: string; vicinoSosta: boolean }[] = [];
  segments.forEach((row, index) => {
    const t0 = Math.max(0, row.runtime - row.minutes);
    traccia += ` L ${x(t0).toFixed(1)} ${y(row.da).toFixed(1)} L ${x(row.runtime).toFixed(1)} ${y(row.depth).toFixed(1)}`;
    const sosta = row.fase.startsWith("Sosta") || row.fase.startsWith("Livello");
    const cambio = index > 0 && segments[index - 1].gas !== row.gas;
    if (sosta) {
      soste.push({
        x1: x(t0),
        x2: x(row.runtime),
        y: y(row.depth),
        testo: `${Math.round(row.depth)} m · ${fmtMin(row.minutes)} min${cambio ? ` · ${row.gas}` : ""}`,
      });
    }
    if (cambio) cambi.push({ x: x(t0), y: y(row.da), testo: row.gas, vicinoSosta: sosta });
  });
  const area = `${traccia} L ${x(maxT).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const uscita = [...segments].reverse().find((row) => row.fase === "Fondo") ?? segments.find((row) => row.fase === "Discesa");
  const mostraUscita = !compatto && uscita != null && uscita.runtime > maxT * 0.14 && uscita.runtime < maxT * 0.8;
  const lenta = !compatto
    ? [...segments].reverse().find((row) => row.da <= 6.05 && row.depth < row.da - 0.2 && !row.fase.startsWith("Sosta") && !row.fase.startsWith("Livello"))
    : undefined;
  const quote = [0, maxD / 2, maxD];
  let ultimoY = -99;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`${compatto ? "h-44" : "h-80"} w-full rounded-2xl border border-line bg-deep`} role="img">
      {quote.map((metri) => (
        <g key={metri}>
          <line x1={padL} y1={y(metri)} x2={w - padR} y2={y(metri)} className="stroke-mist/35" strokeWidth="1" />
          <text x={4} y={y(metri) + 4} className="fill-foam" fontSize={compatto ? 11 : 13}>{Math.round(metri)}</text>
        </g>
      ))}
      <text x={4} y={padT - 6} className="fill-mist" fontSize="12">m</text>
      <path d={area} className="fill-lagoon/15" />
      <path d={traccia} fill="none" className="stroke-lagoon" strokeWidth={compatto ? 2.5 : 3} strokeLinejoin="round" strokeLinecap="round" />
      {lenta ? (
        <text
          x={x(((lenta.runtime - lenta.minutes) + lenta.runtime) / 2)}
          y={Math.max(padT + 12, y((lenta.da + lenta.depth) / 2) - 8)}
          className="fill-brass"
          fontSize="12"
          textAnchor="middle"
        >
          1 m/min
        </text>
      ) : null}
      {soste.map((sosta, index) => (
        <line key={`sosta-${index}`} x1={sosta.x1} y1={sosta.y} x2={Math.max(sosta.x2, sosta.x1 + 4)} y2={sosta.y} className="stroke-brass" strokeWidth={compatto ? 4 : 7} strokeLinecap="round" />
      ))}
      {cambi.map((cambio, index) => (
        <g key={`cambio-${index}`}>
          <circle cx={cambio.x} cy={cambio.y} r={compatto ? 3.5 : 4.5} className="fill-deep stroke-lagoon" strokeWidth="1.6" />
          <circle cx={cambio.x} cy={cambio.y} r="1.8" className="fill-brass" />
        </g>
      ))}
      {!compatto
        ? soste.map((sosta, index) => {
            const mostra = Math.abs(sosta.y - ultimoY) > 12;
            if (mostra) ultimoY = sosta.y;
            if (!mostra) return null;
            return (
              <text key={`etichetta-${index}`} x={Math.min(w - 6, sosta.x2 + 8)} y={sosta.y + 4} className="fill-brass" fontSize="13">
                {sosta.testo}
              </text>
            );
          })
        : null}
      {!compatto
        ? cambi
            .filter((cambio) => !cambio.vicinoSosta)
            .slice(0, 3)
            .map((cambio, index) => (
              <text key={`gas-${index}`} x={cambio.x + 8} y={cambio.y - 8} className="fill-lagoon" fontSize="13">
                {cambio.testo}
              </text>
            ))
        : null}
      <text x={x(0)} y={h - 10} className="fill-foam" fontSize="13">0</text>
      <text x={w - padR} y={h - 10} className="fill-foam" fontSize="13" textAnchor="end">{Math.round(maxT)} min</text>
      {mostraUscita && uscita ? (
        <text x={x(uscita.runtime)} y={h - 10} className="fill-brass" fontSize="13" textAnchor="middle">{Math.round(uscita.runtime)}</text>
      ) : null}
    </svg>
  );
}

function testoCircuito(extra: ExtraPiano): string {
  if (extra.spFisso) return `CCR · SP ${extra.sp}`;
  return `CCR · SP ${extra.spDiscesa}/${extra.spFondo}/${extra.spDeco}`;
}

function densitaDelPiano(voce: VocePiano): number {
  const metri = Number(voce.depth);
  if (voce.result.ccr) return densitaFondo(voce.result.ccr.fo2, voce.result.ccr.fhe, metri);
  return densitaFondo(Number(voce.o2), Number(voce.he), metri);
}

function litriDisponibili(raw: string | undefined): number | undefined {
  const testo = (raw ?? "").trim();
  if (!testo) return undefined;
  const n = numberOrNull(testo);
  if (n == null || n < 0) return undefined;
  return n;
}

function tonoScorta(richiesti: number, hai: number | undefined): "ambra" | "rosso" | undefined {
  return livelloScorta(richiesti, hai);
}

function normalizzaExtra(raw: unknown): ExtraPiano {
  const row = raw && typeof raw === "object" ? raw as Partial<ExtraPiano> : {};
  return {
    circuito: row.circuito === "ccr" ? "ccr" : "oc",
    spFisso: row.spFisso !== false,
    sp: typeof row.sp === "string" ? row.sp : EXTRA_VUOTO.sp,
    spDiscesa: typeof row.spDiscesa === "string" ? row.spDiscesa : EXTRA_VUOTO.spDiscesa,
    spFondo: typeof row.spFondo === "string" ? row.spFondo : EXTRA_VUOTO.spFondo,
    spDeco: typeof row.spDeco === "string" ? row.spDeco : EXTRA_VUOTO.spDeco,
    metabolismo: typeof row.metabolismo === "string" ? row.metabolismo : EXTRA_VUOTO.metabolismo,
    litriO2: typeof row.litriO2 === "string" ? row.litriO2 : "",
    livelli: (Array.isArray(row.livelli) ? row.livelli : []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const livello = item as { depth?: unknown; minutes?: unknown };
      const depth = typeof livello.depth === "string" ? livello.depth : "";
      const minutes = typeof livello.minutes === "string" ? livello.minutes : "";
      if (!depth.trim() && !minutes.trim()) return [];
      return [{ depth, minutes }];
    }).slice(0, MAX_LIVELLI),
  };
}

function BailoutCcr({ voce, serie }: { voce: VocePiano; serie: VocePiano[] }) {
  const t = useT();
  const accesi = voce.deco.flatMap((gas, index) => (gas.on ? [{ gas, index }] : []));
  const [metri, setMetri] = useState(voce.depth);
  const [perde, setPerde] = useState(false);
  const [scelto, setScelto] = useState(accesi[0]?.index ?? 0);
  const gas = accesi.find((item) => item.index === scelto) ?? accesi[0];
  const [perdiM, setPerdiM] = useState(gas?.gas.switchM ?? "21");
  const quota = numberOrNull(metri);
  const quotaPersa = numberOrNull(perdiM);
  let piano: PlanResult | null = null;
  const quotaOk = quota != null && quota >= 0 && quota <= 150;
  const persoOk = !perde || (gas != null && quotaPersa != null && quotaPersa >= 0 && quotaPersa <= 150);
  if (quotaOk && persoOk && quota != null) {
    try {
      const input = inputDaVoce(voce, serie);
      input.bailoutDa = quota;
      if (perde && gas && quotaPersa != null) {
        const indice = voce.deco.slice(0, gas.index).filter((item) => item.on).length;
        input.perdi = { indice, daM: quotaPersa };
      }
      piano = planDive(input);
    } catch {
      piano = null;
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-line bg-deep px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-brass" aria-hidden />
        {t("Bailout")}
      </p>
      <div className="mt-3 max-w-xs">
        <Field label={t("Bailout da (m)")}>
          <input inputMode="decimal" value={metri} onChange={(event) => setMetri(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-mist">
        {accesi.length === 0
          ? t("Senza gas di bailout la risalita da quella quota è a circuito aperto sul diluente.")
          : t("Da {m} m in su resti a circuito aperto e non torni sul loop.", { m: quota != null ? Math.round(quota) : "—" })}
      </p>
      {accesi.length > 0 ? (
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={perde} onChange={(event) => setPerde(event.target.checked)} className="size-5 accent-lagoon" />
          {t("Perdo anche un gas di bailout")}
        </label>
      ) : null}
      {perde && accesi.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {accesi.map((item) => (
              <button
                key={item.index}
                type="button"
                className={`min-h-11 rounded-full border px-3 text-sm ${item.index === gas?.index ? "border-brass bg-surface text-brass" : "border-line"}`}
                onClick={() => {
                  setScelto(item.index);
                  setPerdiM(item.gas.switchM);
                }}
              >
                {t(nomeGas(Number(item.gas.o2), Number(item.gas.he)))}
              </button>
            ))}
          </div>
          <div className="mt-3 max-w-xs">
            <Field label={t("Perdo il gas a (m)")}>
              <input inputMode="decimal" value={perdiM} onChange={(event) => setPerdiM(event.target.value)} className={inputClass} />
            </Field>
          </div>
        </>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SchedaProfilo titolo={t("Piano sul loop")} piano={voce.result} />
        <SchedaProfilo titolo={piano ? t("Profilo di bailout") : t("Quota non valida")} piano={piano} />
      </div>
    </section>
  );
}

function Contingenza({ voce, serie }: { voce: VocePiano; serie: VocePiano[] }) {
  const t = useT();
  const accesi = voce.deco.flatMap((gas, index) => (gas.on ? [{ gas, index }] : []));
  const [scelto, setScelto] = useState(accesi[0]?.index ?? 0);
  const gas = accesi.find((item) => item.index === scelto) ?? accesi[0];
  const [metri, setMetri] = useState(gas?.gas.switchM ?? "21");
  const quota = numberOrNull(metri);
  let piano: PlanResult | null = null;
  if (gas && quota != null && quota >= 0 && quota <= 150) {
    try {
      const indice = voce.deco.slice(0, gas.index).filter((item) => item.on).length;
      piano = planDive({ ...inputDaVoce(voce, serie), perdi: { indice, daM: quota } });
    } catch {
      piano = null;
    }
  }
  const nome = gas ? t(nomeGas(Number(gas.gas.o2), Number(gas.gas.he))) : "";
  return (
    <section className="mt-6 rounded-2xl border border-line bg-deep px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-brass" aria-hidden />
        {t("Gas perso")}
      </p>
      {accesi.length === 0 ? (
        <p className="mt-2 text-sm text-mist">{t("Accendi un gas di decompressione per simulare la perdita.")}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {accesi.map((item) => (
              <button
                key={item.index}
                type="button"
                className={`min-h-11 rounded-full border px-3 text-sm ${item.index === gas?.index ? "border-brass bg-surface text-brass" : "border-line"}`}
                onClick={() => {
                  setScelto(item.index);
                  setMetri(item.gas.switchM);
                }}
              >
                {t(nomeGas(Number(item.gas.o2), Number(item.gas.he)))}
              </button>
            ))}
          </div>
          <div className="mt-3 max-w-xs">
            <Field label={t("Perdo il gas a (m)")}>
              <input inputMode="decimal" value={metri} onChange={(event) => setMetri(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-mist">
            {quota != null && nome ? t("Da {m} m in su non usi più {gas}. Il fondo resta quello del piano.", { m: Math.round(quota), gas: nome }) : t("Indica la quota.")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SchedaProfilo titolo={t("Piano originale")} piano={voce.result} />
            <SchedaProfilo titolo={piano ? t("Piano contingency") : t("Quota non valida")} piano={piano} />
          </div>
        </>
      )}
    </section>
  );
}

function SchedaProfilo({ titolo, piano }: { titolo: string; piano: PlanResult | null }) {
  const t = useT();
  if (!piano) return <div className="rounded-xl border border-line px-3 py-3 text-sm text-mist">{titolo}</div>;
  const soste = piano.segments.filter((row) => row.fase.startsWith("Sosta") || row.fase.startsWith("Livello"));
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-3">
      <p className="text-sm font-medium text-lagoon">{titolo}</p>
      {piano.segments.length > 0 ? <div className="mt-3"><ProfiloGrafico segments={piano.segments} compatto /></div> : null}
      <p className="mt-2 text-sm">{t("Runtime {n} min", { n: fmtMin(piano.runtime) })}</p>
      <p className="text-sm">{t("Deco {n} min", { n: fmtMin(piano.decoMin) })}</p>
      {soste.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {soste.map((row, index) => {
            const cambio = index === 0 || soste[index - 1].gas !== row.gas;
            return (
              <li key={`${row.fase}-${index}`} className={cambio ? "text-lagoon" : "text-brass"}>
                {traduciFase(row.fase, t)} · {fmtMin(row.minutes)} min · {t(row.gas)}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-mist">{t("Nessuna")}</p>
      )}
    </div>
  );
}

function inputDaVoce(voce: VocePiano, serie: VocePiano[]): PlanInput {
  const bottom = { o2: Number(voce.o2), he: Number(voce.he), switchM: 0 };
  const input: PlanInput = {
    algo: voce.algo,
    depth: Number(voce.depth),
    bottomMin: Number(voce.bottomMin),
    gfLow: Number(voce.gfLow),
    gfHigh: Number(voce.gfHigh),
    vpmLevel: voce.vpmLevel,
    descent: Number(voce.descent),
    ascent: Number(voce.ascent),
    lastStop: voce.lastStop,
    bottom,
    deco: voce.deco.filter((gas) => gas.on).map((gas) => ({ o2: Number(gas.o2), he: Number(gas.he), switchM: Number(gas.switchM) })),
  };
  const extra = voce.extra ?? EXTRA_VUOTO;
  if (extra.circuito === "ccr") {
    const sp = (raw: string) => Number(String(raw).replace(",", "."));
    const fisso = extra.spFisso ? sp(extra.sp) : null;
    input.ccr = {
      discesa: fisso ?? sp(extra.spDiscesa),
      fondo: fisso ?? sp(extra.spFondo),
      deco: fisso ?? sp(extra.spDeco),
      diluente: bottom,
      metabolismo: sp(extra.metabolismo),
      rmv: voce.consumoFondo,
    };
  }
  const livelli = extra.livelli
    .map((row) => ({ depth: Number(String(row.depth).replace(",", ".")), minutes: Number(String(row.minutes).replace(",", ".")) }))
    .filter((row) => row.minutes > 0 && row.depth >= 3 && row.depth <= 150);
  if (livelli.length > 0) input.livelli = livelli;
  if (voce.n > 1 && voce.intervallo != null) {
    const precedente = serie.find((row) => row.n === voce.n - 1);
    if (precedente) input.start = intervalloSuperficie(precedente.result.tissues, voce.intervallo);
  }
  return input;
}

function ConfrontoGf({ voce, serie }: { voce: VocePiano; serie: VocePiano[] }) {
  const t = useT();
  const [basso, setBasso] = useState("40");
  const [alto, setAlto] = useState("85");
  let sinistra: PlanResult | null = null;
  let destra: PlanResult | null = null;
  try {
    const base = inputDaVoce(voce, serie);
    sinistra = planDive({ ...base, gfLow: Number(voce.gfLow), gfHigh: Number(voce.gfHigh) });
    const low = Number(basso.replace(",", "."));
    const high = Number(alto.replace(",", "."));
    if (low >= 5 && high >= 5 && high <= 100 && low <= high) destra = planDive({ ...base, gfLow: low, gfHigh: high });
  } catch {
    sinistra = null;
    destra = null;
  }
  return (
    <section className="mt-6 rounded-2xl border border-line bg-deep px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GitCompare className="size-4 text-brass" aria-hidden />
        {t("Confronta i GF")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={t("GF basso")}>
          <input inputMode="decimal" value={basso} onChange={(event) => setBasso(event.target.value)} className={inputClass} />
        </Field>
        <Field label={t("GF alto")}>
          <input inputMode="decimal" value={alto} onChange={(event) => setAlto(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SchedaGf titolo={`GF ${voce.gfLow}/${voce.gfHigh}`} piano={sinistra} />
        <SchedaGf titolo={destra ? `GF ${basso}/${alto}` : t("Secondo set non valido")} piano={destra} />
      </div>
    </section>
  );
}

function SchedaGf({ titolo, piano }: { titolo: string; piano: PlanResult | null }) {
  const t = useT();
  if (!piano) return <div className="rounded-xl border border-line px-3 py-3 text-sm text-mist">{titolo}</div>;
  const soste = piano.segments.filter((row) => row.fase.startsWith("Sosta") || row.fase.startsWith("Livello"));
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-3">
      <p className="text-sm font-medium text-lagoon">{titolo}</p>
      {piano.segments.length > 0 ? <div className="mt-3"><ProfiloGrafico segments={piano.segments} compatto /></div> : null}
      <p className="mt-2 text-sm">{t("Runtime {n} min", { n: fmtMin(piano.runtime) })}</p>
      <p className="text-sm">{t("Deco {n} min", { n: fmtMin(piano.decoMin) })}</p>
      <p className="text-sm text-mist">{piano.firstStop > 0 ? t("Prima tappa {m} m", { m: Math.round(piano.firstStop) }) : t("Nessuna")}</p>
      {soste.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-brass">
          {soste.map((row, index) => (
            <li key={`${row.fase}-${index}`}>{traduciFase(row.fase, t)} · {fmtMin(row.minutes)} min · {t(row.gas)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function scaricaPdfPiano(voce: VocePiano, t: Traduci) {
  const titoloAlgo = voce.algo === "vpm" ? `VPM-B +${voce.vpmLevel}` : `${voce.algo === "zhl16b" ? "ZHL-16B" : "ZHL-16C"} GF ${voce.gfLow}/${voce.gfHigh}`;
  const densita = densitaDelPiano(voce);
  const bytes = scriviPdfPiano({
    titolo: t("Tritone · piano di immersione"),
    sottotitolo: t("Immersione {n} · {titolo}", { n: voce.n, titolo: titoloAlgo }),
    info: [
      t("{depth} m · fondo {bottom} min · ultima tappa {stop} m · gas {gas}", {
        depth: voce.depth,
        bottom: voce.bottomMin,
        stop: voce.lastStop,
        gas: t(nomeGas(Number(voce.o2), Number(voce.he))),
      }),
      voce.extra?.circuito === "ccr" ? testoCircuito(voce.extra) : "",
      voce.result.ccr
        ? t("Ossigeno metabolico {o2} L · diluente {dil} L · loop O2 {fo2}% · He {he}%", {
            o2: Math.round(voce.result.ccr.o2Litri),
            dil: Math.round(voce.result.ccr.dilLitri),
            fo2: Math.round(voce.result.ccr.fo2),
            he: Math.round(voce.result.ccr.fhe),
          })
        : "",
      t("Runtime {runtime} min · deco {deco} min · CNS {cns}% · densità {val} g/L", {
        runtime: fmtMin(voce.result.runtime),
        deco: fmtMin(voce.result.decoMin),
        cns: Math.round(voce.result.cns),
        val: densita.toFixed(1),
      }),
      ...avvisiPiano(voce).map((avviso) =>
        avviso.chiave.replaceAll("{n}", avviso.n ?? avviso.val).replaceAll("{val}", avviso.val).replaceAll("{gas}", avviso.gas ?? ""),
      ),
    ].filter((riga) => riga.length > 0),
    colonne: [t("Fase"), t("Quota"), t("Minuti"), t("Gas"), t("Runtime")],
    righe: voce.result.segments.map((row) => [
      traduciFase(row.fase, t),
      `${Math.round(row.depth)} m`,
      fmtMin(row.minutes),
      t(row.gas),
      fmtMin(row.runtime),
    ]),
    avvisi: voce.result.warnings.map((warning) => traduciAvviso(warning, t)),
    segmenti: voce.result.segments.map((row, index) => ({
      da: row.da,
      depth: row.depth,
      runtime: row.runtime,
      minutes: row.minutes,
      sosta: row.fase.startsWith("Sosta") || row.fase.startsWith("Livello"),
      cambio: index > 0 && voce.result.segments[index - 1].gas !== row.gas,
    })),
    nota: t("Studio. Confronta con un altro strumento prima di entrare in acqua."),
  });
  const binario = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(binario).set(bytes);
  const file = new File([binario], `piano-tritone-${voce.n}.pdf`, { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
