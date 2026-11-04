import { useState, type ReactNode } from "react";
import type { CambioIbcd, CampioneGrafico, SerieGrafici, Segment } from "@/lib/planner";
import { useT } from "@/lib/i18n";

const W = 460;
const H = 252;
const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 22;
const PAD_B = 34;

function sx(t: number, maxT: number) {
  return PAD_L + (Math.max(0, t) / Math.max(maxT, 0.001)) * (W - PAD_L - PAD_R);
}

function sy(valore: number, min: number, max: number, versoIlBasso: boolean) {
  const span = Math.max(0.001, max - min);
  const quota = (valore - min) / span;
  const y = versoIlBasso ? quota : 1 - quota;
  return PAD_T + y * (H - PAD_T - PAD_B);
}

function percorso(punti: { t: number; y: number }[], maxT: number, min: number, max: number, versoIlBasso: boolean) {
  return punti
    .map((punto, index) => `${index === 0 ? "M" : "L"} ${sx(punto.t, maxT).toFixed(1)} ${sy(punto.y, min, max, versoIlBasso).toFixed(1)}`)
    .join(" ");
}

function Tela({
  aria,
  maxT,
  min,
  max,
  tacche,
  unita,
  versoIlBasso = false,
  children,
}: {
  aria: string;
  maxT: number;
  min: number;
  max: number;
  tacche: number[];
  unita: string;
  versoIlBasso?: boolean;
  children: ReactNode;
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full rounded-2xl border border-line bg-deep" role="img" aria-label={aria}>
      {tacche.map((valore) => (
        <g key={valore}>
          <line x1={PAD_L} y1={sy(valore, min, max, versoIlBasso)} x2={W - PAD_R} y2={sy(valore, min, max, versoIlBasso)} className="stroke-mist/35" strokeWidth="1" />
          <text x={4} y={sy(valore, min, max, versoIlBasso) + 4} className="fill-foam" fontSize="13">{etichettaAsse(valore)}</text>
        </g>
      ))}
      <text x={4} y={14} className="fill-mist" fontSize="12">{unita}</text>
      {children}
      <text x={PAD_L} y={H - 8} className="fill-foam" fontSize="13">0</text>
      <text x={W - PAD_R} y={H - 8} className="fill-foam" fontSize="13" textAnchor="end">{Math.round(maxT)} min</text>
    </svg>
  );
}

function etichettaAsse(valore: number) {
  if (Math.abs(valore) >= 10) return String(Math.round(valore));
  const testo = valore.toFixed(valore >= 2 ? 1 : 2);
  return testo.replace(/\.?0+$/, "");
}

function cambiSuAsse(cambi: CambioIbcd[], maxT: number) {
  return cambi.map((cambio) => (
    <line key={`${cambio.t}-${cambio.a}`} x1={sx(cambio.t, maxT)} y1={PAD_T} x2={sx(cambio.t, maxT)} y2={H - PAD_B} className="stroke-brass/50" strokeWidth="1" strokeDasharray="2 3" />
  ));
}

function Legenda({ voci }: { voci: { classe: string; testo: string; tratteggio?: boolean }[] }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-mist">
      {voci.map((voce) => (
        <span key={voce.testo} className="inline-flex items-center gap-1.5">
          {voce.tratteggio ? (
            <i className="inline-block w-5 border-t-2 border-dashed border-foam" />
          ) : (
            <i className={`inline-block h-0.5 w-5 rounded ${voce.classe}`} />
          )}
          {voce.testo}
        </span>
      ))}
    </p>
  );
}

export function PannelloGrafici({ dati, segments }: { dati: SerieGrafici; segments: Segment[] }) {
  const t = useT();
  const maxT = Math.max(1, dati.campioni.at(-1)?.t ?? 1);
  const ccr = dati.campioni.some((punto) => punto.setpoint != null);
  return (
    <div className="space-y-6">
      <Blocco titolo={t("Profilo immersione")} nota={t("Quota nel tempo: discesa, fondo, risalita. Oro: soste. Punto oro: cambio gas.")}>
        <ProfiloExtra segments={segments} aria={t("Profilo immersione")} />
      </Blocco>
      <Blocco titolo={t("Andamento PpO2")} nota={t("Pressione parziale dell'ossigeno. Oro tratteggiato: 1,40 e, in CCR, il setpoint. Rosso: 1,60.")}>
        <GraficoPpo2 campioni={dati.campioni} cambi={dati.cambi} maxT={maxT} picco={dati.piccoPo2} ccr={ccr} aria={t("Andamento PpO2")} />
        <Legenda voci={[
          { classe: "bg-lagoon", testo: t("PpO2") },
          { classe: "bg-brass", testo: t("Limite 1,40") },
          { classe: "bg-danger", testo: t("Limite 1,60") },
          ...(ccr ? [{ classe: "bg-brass", testo: t("Setpoint") }] : []),
        ]} />
        <p className={`mt-2 text-xs ${dati.piccoPo2 > 1.6 ? "font-medium text-danger" : dati.piccoPo2 > 1.4 ? "font-medium text-brass" : "text-mist"}`}>
          {t("Picco {n} bar", { n: dati.piccoPo2.toFixed(2) })}
        </p>
      </Blocco>
      <Blocco titolo={t("Andamento END")} nota={t("Profondità equivalente narcotica. La riga oro è il limite di 30 m già usato dal piano.")}>
        <GraficoEnd campioni={dati.campioni} cambi={dati.cambi} maxT={maxT} aria={t("Andamento END")} />
        <Legenda voci={[
          { classe: "bg-lagoon", testo: t("END") },
          { classe: "bg-brass", testo: t("Limite 30 m") },
        ]} />
        {dati.oltreEnd ? <p className="mt-2 text-xs font-medium text-brass">{t("Oltre 30 m")}</p> : null}
      </Blocco>
      <Blocco titolo={t("Carico dei tessuti")} nota={t("Un tessuto alla volta, con il suo valore M, oppure azoto ed elio del comparto più carico.")}>
        <CaricoTessuti dati={dati} maxT={maxT} />
      </Blocco>
      <Blocco titolo={t("Controllo IBCD")} nota={t("Pressioni parziali di azoto e elio nel gas inspirato. Un cambio è a rischio se l'azoto sale di almeno 0,5 bar mentre l'elio scende.")}>
        <GraficoIbcd campioni={dati.campioni} cambi={dati.cambi} maxT={maxT} aria={t("Controllo IBCD")} />
        <Legenda voci={[
          { classe: "bg-lagoon", testo: t("Azoto") },
          { classe: "bg-brass", testo: t("Elio") },
        ]} />
        <ElencoCambi cambi={dati.cambi} />
      </Blocco>
    </div>
  );
}

function Blocco({ titolo, nota, children }: { titolo: string; nota: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-4">
      <h3 className="text-sm font-medium">{titolo}</h3>
      <p className="mt-1 text-xs text-mist">{nota}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProfiloExtra({ segments, aria }: { segments: Segment[]; aria: string }) {
  const t = useT();
  const maxD = Math.max(6, ...segments.map((row) => Math.max(row.da, row.depth)));
  const maxT = Math.max(1, segments.at(-1)?.runtime ?? 1);
  let traccia = `M ${sx(0, maxT).toFixed(1)} ${sy(0, 0, maxD, true).toFixed(1)}`;
  const soste: { x1: number; x2: number; y: number }[] = [];
  const cambi: { x: number; y: number; testo: string }[] = [];
  const fasi: { x: number; testo: string }[] = [];
  segments.forEach((row, index) => {
    const t0 = Math.max(0, row.runtime - row.minutes);
    traccia += ` L ${sx(t0, maxT).toFixed(1)} ${sy(row.da, 0, maxD, true).toFixed(1)} L ${sx(row.runtime, maxT).toFixed(1)} ${sy(row.depth, 0, maxD, true).toFixed(1)}`;
    if (row.fase.startsWith("Sosta") || row.fase.startsWith("Livello")) {
      soste.push({ x1: sx(t0, maxT), x2: sx(row.runtime, maxT), y: sy(row.depth, 0, maxD, true) });
    }
    if (index > 0 && segments[index - 1].gas !== row.gas) {
      cambi.push({ x: sx(t0, maxT), y: sy(row.da, 0, maxD, true), testo: row.gas });
    }
    const nome = row.fase === "Discesa" ? t("Discesa") : row.fase === "Fondo" ? t("Tempo di fondo") : row.fase.startsWith("Risalita") ? t("Risalita") : "";
    if (nome && !fasi.some((fase) => fase.testo === nome)) fasi.push({ x: sx((t0 + row.runtime) / 2, maxT), testo: nome });
  });
  const lenta = [...segments].reverse().find((row) => row.da <= 6.05 && row.depth < row.da - 0.2 && !row.fase.startsWith("Sosta") && !row.fase.startsWith("Livello"));
  const area = `${traccia} L ${sx(maxT, maxT).toFixed(1)} ${sy(0, 0, maxD, true).toFixed(1)} Z`;
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={maxD} tacche={[0, maxD / 2, maxD]} unita="m" versoIlBasso>
      <path d={area} className="fill-lagoon/15" />
      <path d={traccia} fill="none" className="stroke-lagoon" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {soste.map((sosta, index) => (
        <line key={`sosta-${index}`} x1={sosta.x1} y1={sosta.y} x2={Math.max(sosta.x2, sosta.x1 + 4)} y2={sosta.y} className="stroke-brass" strokeWidth="7" strokeLinecap="round" />
      ))}
      {cambi.map((cambio, index) => (
        <g key={`cambio-${index}`}>
          <circle cx={cambio.x} cy={cambio.y} r="4.5" className="fill-deep stroke-lagoon" strokeWidth="1.6" />
          <circle cx={cambio.x} cy={cambio.y} r="1.8" className="fill-brass" />
          <text x={Math.min(W - 8, cambio.x + 8)} y={Math.max(PAD_T + 28, cambio.y - 10)} className="fill-brass" fontSize="13">{cambio.testo}</text>
        </g>
      ))}
      {fasi.map((fase) => (
        <text key={fase.testo} x={fase.x} y={PAD_T + 16} className="fill-foam" fontSize="13" textAnchor="middle">{fase.testo}</text>
      ))}
      {lenta ? (
        <text
          x={sx(((lenta.runtime - lenta.minutes) + lenta.runtime) / 2, maxT)}
          y={Math.max(PAD_T + 28, sy((lenta.da + lenta.depth) / 2, 0, maxD, true) - 8)}
          className="fill-brass"
          fontSize="13"
          textAnchor="middle"
        >
          1 m/min
        </text>
      ) : null}
    </Tela>
  );
}

function GraficoPpo2({ campioni, cambi, maxT, picco, ccr, aria }: { campioni: CampioneGrafico[]; cambi: CambioIbcd[]; maxT: number; picco: number; ccr: boolean; aria: string }) {
  const max = Math.max(1.7, picco + 0.05);
  const linea = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.ppo2 })), maxT, 0, max, false);
  const setpoint = ccr ? percorso(campioni.filter((punto) => punto.setpoint != null).map((punto) => ({ t: punto.t, y: punto.setpoint ?? 0 })), maxT, 0, max, false) : "";
  const piccoPunto = campioni.reduce((migliore, punto) => (punto.ppo2 > migliore.ppo2 ? punto : migliore), campioni[0]);
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={max} tacche={[0.18, 1.4, 1.6].filter((valore) => valore <= max)} unita="bar">
      {cambiSuAsse(cambi, maxT)}
      <Riferimento y={sy(1.6, 0, max, false)} classe="stroke-danger" />
      <Riferimento y={sy(1.4, 0, max, false)} classe="stroke-brass" />
      <Riferimento y={sy(0.18, 0, max, false)} classe="stroke-mist/50" />
      {setpoint ? <path d={setpoint} fill="none" className="stroke-brass" strokeWidth="1.25" strokeDasharray="4 3" /> : null}
      <path d={linea} fill="none" className="stroke-lagoon" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {piccoPunto && piccoPunto.ppo2 > 1.4 ? <circle cx={sx(piccoPunto.t, maxT)} cy={sy(piccoPunto.ppo2, 0, max, false)} r="3.5" className="fill-brass" /> : null}
      {cambi.map((cambio) => {
        const punto = campioni.find((item) => item.cambio && Math.abs(item.t - cambio.t) < 0.05);
        if (!punto) return null;
        return <circle key={`${cambio.t}-po2`} cx={sx(punto.t, maxT)} cy={sy(punto.ppo2, 0, max, false)} r="3" className="fill-deep stroke-brass" strokeWidth="1.5" />;
      })}
    </Tela>
  );
}

function GraficoEnd({ campioni, cambi, maxT, aria }: { campioni: CampioneGrafico[]; cambi: CambioIbcd[]; maxT: number; aria: string }) {
  const massimo = Math.max(36, ...campioni.map((punto) => punto.end));
  const linea = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.end })), maxT, 0, massimo, false);
  const tratti: string[] = [];
  let corrente: { t: number; y: number }[] = [];
  for (const punto of campioni) {
    if (punto.end > 30) corrente.push({ t: punto.t, y: punto.end });
    else if (corrente.length > 0) {
      tratti.push(percorso(corrente, maxT, 0, massimo, false));
      corrente = [];
    }
  }
  if (corrente.length > 0) tratti.push(percorso(corrente, maxT, 0, massimo, false));
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={massimo} tacche={[0, 30, massimo]} unita="m">
      {cambiSuAsse(cambi, maxT)}
      <Riferimento y={sy(30, 0, massimo, false)} classe="stroke-brass" />
      <path d={linea} fill="none" className="stroke-lagoon" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {tratti.map((tratto, index) => (
        <path key={`oltre-${index}`} d={tratto} fill="none" className="stroke-brass" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </Tela>
  );
}

function coloreTessuto(indice: number): string {
  const t = indice / 15;
  const hue = t < 0.62 ? 174 + (286 - 174) * (t / 0.62) : 286 + ((42 + 360 - 286) * (t - 0.62)) / 0.38;
  return `hsl(${Math.round(hue % 360)} 64% 58%)`;
}

function etichettaTessuto(semitempo: string, indice: number, traduci: (testo: string, valori?: Record<string, string | number>) => string): string {
  return traduci("Tessuto {n} - {min} min", { n: indice + 1, min: semitempo.replace(".", ",") });
}

function tessutoPilota(dati: SerieGrafici): number {
  const n = Math.max(dati.semitempi.length, dati.campioni[0]?.carichi.length ?? 0);
  let scelto = 0;
  let meglio = -1;
  for (let i = 0; i < n; i += 1) {
    let picco = 0;
    for (const punto of dati.campioni) {
      const carico = punto.carichi[i] ?? 0;
      const limite = punto.limiti[i] ?? 0;
      const rapporto = limite > 0.05 ? carico / limite : carico;
      if (rapporto > picco) picco = rapporto;
    }
    if (picco > meglio) {
      meglio = picco;
      scelto = i;
    }
  }
  return scelto;
}

function CaricoTessuti({ dati, maxT }: { dati: SerieGrafici; maxT: number }) {
  const t = useT();
  const pilota = tessutoPilota(dati);
  const [vista, setVista] = useState<"inerti" | "tessuti">("tessuti");
  const [indice, setIndice] = useState(pilota);
  const semitempi = dati.semitempi.length > 0 ? dati.semitempi : ["5"];
  const scelto = Math.min(indice, semitempi.length - 1);
  const colore = coloreTessuto(scelto);
  const nome = etichettaTessuto(semitempi[scelto] ?? "5", scelto, t);
  const nomePilota = etichettaTessuto(semitempi[pilota] ?? "5", pilota, t);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setVista("tessuti")} className={`min-h-11 rounded-xl border text-sm ${vista === "tessuti" ? "border-brass bg-deep text-brass" : "border-line"}`}>{t("Tessuti")}</button>
        <button type="button" onClick={() => setVista("inerti")} className={`min-h-11 rounded-xl border text-sm ${vista === "inerti" ? "border-brass bg-deep text-brass" : "border-line"}`}>{t("Gas inerti")}</button>
      </div>
      {vista === "inerti" ? (
        <>
          <GraficoInerti dati={dati} maxT={maxT} aria={t("Carico dei tessuti")} />
          <Legenda voci={[
            { classe: "bg-lagoon", testo: t("Azoto") },
            { classe: "bg-brass", testo: t("Elio") },
            { classe: "bg-foam", testo: t("Totale"), tratteggio: true },
          ]} />
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-lg font-medium">
            <i className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: colore }} />
            {nome}
          </p>
          <button
            type="button"
            onClick={() => setIndice(pilota)}
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-brass/15 px-3 text-sm font-medium text-brass"
          >
            {t("Tessuto pilota: {nome}", { nome: nomePilota })}
          </button>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-mist">{t("Tessuto")}</span>
            <select
              value={scelto}
              onChange={(event) => setIndice(Number(event.target.value))}
              className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
            >
              {semitempi.map((semitempo, index) => (
                <option key={`${index}-${semitempo}`} value={index}>
                  {etichettaTessuto(semitempo, index, t)}{index === pilota ? ` · ${t("pilota")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3">
            <GraficoTessutoSelezionato campioni={dati.campioni} cambi={dati.cambi} maxT={maxT} indice={scelto} colore={colore} aria={nome} etichettaM={t("Valore M")} />
          </div>
          {oltreValoreM(dati.campioni, scelto) ? <p className="mt-2 text-sm font-medium text-danger">{t("Tessuto oltre Valore M")}</p> : null}
          <DatiTecniciTessuto campioni={dati.campioni} indice={scelto} />
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-mist">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-5 rounded" style={{ background: colore }} />
              {nome}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-5 rounded" style={{ background: "#e25a2a" }} />
              {t("Valore M")}
            </span>
          </p>
        </>
      )}
      {dati.oltreTessuti ? <p className="mt-2 text-sm font-medium text-danger">{t("Oltre il limite del modello")}</p> : null}
    </div>
  );
}

function GraficoInerti({ dati, maxT, aria }: { dati: SerieGrafici; maxT: number; aria: string }) {
  const massimo = Math.max(1, ...dati.campioni.map((punto) => punto.n2Tessuto + punto.heTessuto));
  const tetto = Math.max(1, Math.ceil(massimo * 2) / 2);
  const meta = Math.round((tetto / 2) * 10) / 10;
  const tacche = meta > 0.15 && meta < tetto - 0.05 ? [0, meta, tetto] : [0, tetto];
  const azoto = percorso(dati.campioni.map((punto) => ({ t: punto.t, y: punto.n2Tessuto })), maxT, 0, tetto, false);
  const elio = percorso(dati.campioni.map((punto) => ({ t: punto.t, y: punto.heTessuto })), maxT, 0, tetto, false);
  const totale = percorso(dati.campioni.map((punto) => ({ t: punto.t, y: punto.n2Tessuto + punto.heTessuto })), maxT, 0, tetto, false);
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={tetto} tacche={tacche} unita="bar">
      {cambiSuAsse(dati.cambi, maxT)}
      <path d={totale} fill="none" className="stroke-foam" strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
      <path d={azoto} fill="none" className="stroke-lagoon" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={elio} fill="none" className="stroke-brass" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </Tela>
  );
}

function oltreValoreM(campioni: CampioneGrafico[], indice: number): boolean {
  return campioni.some((punto) => {
    const m = punto.valoriM[indice] ?? 0;
    const carico = punto.carichi[indice] ?? 0;
    return m > 0.05 && carico > m * 1.05;
  });
}

function pAmbiente(depth: number): number {
  return 1.01325 + depth / 10;
}

function puntoPiuVicino(campioni: CampioneGrafico[], indice: number): CampioneGrafico | null {
  let scelto: CampioneGrafico | null = null;
  let differenza = -Infinity;
  for (const punto of campioni) {
    const delta = (punto.carichi[indice] ?? 0) - (punto.valoriM[indice] ?? 0);
    if (delta > differenza) {
      differenza = delta;
      scelto = punto;
    }
  }
  return scelto;
}

function DatiTecniciTessuto({ campioni, indice }: { campioni: CampioneGrafico[]; indice: number }) {
  const t = useT();
  const [aperti, setAperti] = useState(false);
  const fondo = campioni.reduce<CampioneGrafico | null>((migliore, punto) => (!migliore || punto.depth > migliore.depth ? punto : migliore), null);
  const critico = puntoPiuVicino(campioni, indice);
  return (
    <div className="mt-3">
      <button type="button" className="min-h-11 text-sm text-lagoon" onClick={() => setAperti((cur) => !cur)} aria-expanded={aperti}>
        {aperti ? t("Nascondi dati tecnici") : t("Mostra dati tecnici")}
      </button>
      {aperti && fondo && critico ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <SchedaTecnica titolo={t("In profondità")} punto={fondo} indice={indice} />
          <SchedaTecnica titolo={t("Punto più vicino al valore M")} punto={critico} indice={indice} />
        </div>
      ) : null}
    </div>
  );
}

function SchedaTecnica({ titolo, punto, indice }: { titolo: string; punto: CampioneGrafico; indice: number }) {
  const t = useT();
  const carico = punto.carichi[indice] ?? 0;
  const valoreM = punto.valoriM[indice] ?? 0;
  const differenza = carico - valoreM;
  const oltre = valoreM > 0.05 && carico > valoreM * 1.05;
  return (
    <dl className={`rounded-xl border px-3 py-2 text-xs ${oltre ? "border-danger text-danger" : "border-line text-mist"}`}>
      <dt className="text-sm font-medium text-foam">{titolo}</dt>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt>{t("Profondità")}</dt>
        <dd>{punto.depth.toFixed(1)} m</dd>
        <dt>{t("Pressione ambiente")}</dt>
        <dd>{pAmbiente(punto.depth).toFixed(2)} bar</dd>
        <dt>{t("Valore M")}</dt>
        <dd>{valoreM.toFixed(2)} bar</dd>
        <dt>{t("Carico del tessuto")}</dt>
        <dd>{carico.toFixed(2)} bar</dd>
        <dt>{t("Differenza")}</dt>
        <dd>{differenza.toFixed(2)} bar</dd>
      </div>
    </dl>
  );
}

function GraficoTessutoSelezionato({
  campioni,
  cambi,
  maxT,
  indice,
  colore,
  aria,
  etichettaM,
}: {
  campioni: CampioneGrafico[];
  cambi: CambioIbcd[];
  maxT: number;
  indice: number;
  colore: string;
  aria: string;
  etichettaM: string;
}) {
  const carichi = campioni.map((punto) => punto.carichi[indice] ?? 0);
  const valoriM = campioni.map((punto) => punto.valoriM[indice] ?? 0);
  const massimo = Math.max(1, ...carichi, ...valoriM);
  const tetto = Math.max(1, Math.ceil(massimo * 2) / 2);
  const meta = Math.round((tetto / 2) * 10) / 10;
  const tacche = meta > 0.15 && meta < tetto - 0.05 ? [0, meta, tetto] : [0, tetto];
  const curva = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.carichi[indice] ?? 0 })), maxT, 0, tetto, false);
  const lineaM = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.valoriM[indice] ?? 0 })), maxT, 0, tetto, false);
  let picco = campioni[0];
  for (const punto of campioni) {
    if ((punto.valoriM[indice] ?? 0) > (picco?.valoriM[indice] ?? 0)) picco = punto;
  }
  const xPicco = picco ? sx(picco.t, maxT) : PAD_L + 8;
  const yPicco = picco ? sy(picco.valoriM[indice] ?? 0, 0, tetto, false) : PAD_T + 16;
  const xTesto = Math.min(Math.max(PAD_L + 4, xPicco + 6), W - PAD_R - 62);
  const yTesto = Math.max(PAD_T + 12, yPicco - 6);
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={tetto} tacche={tacche} unita="bar">
      {cambiSuAsse(cambi, maxT)}
      <path d={lineaM} fill="none" stroke="#e25a2a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x={xTesto} y={yTesto} fill="#e25a2a" fontSize="12">{etichettaM}</text>
      <path d={curva} fill="none" stroke={colore} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </Tela>
  );
}

function GraficoIbcd({ campioni, cambi, maxT, aria }: { campioni: CampioneGrafico[]; cambi: CambioIbcd[]; maxT: number; aria: string }) {
  const massimo = Math.max(1, ...campioni.map((punto) => Math.max(punto.pn2, punto.phe)));
  const azoto = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.pn2 })), maxT, 0, massimo, false);
  const elio = percorso(campioni.map((punto) => ({ t: punto.t, y: punto.phe })), maxT, 0, massimo, false);
  return (
    <Tela aria={aria} maxT={maxT} min={0} max={massimo} tacche={[0, massimo / 2, massimo]} unita="bar">
      {cambi.map((cambio) => (
        <line key={`${cambio.t}-ibcd`} x1={sx(cambio.t, maxT)} y1={PAD_T} x2={sx(cambio.t, maxT)} y2={H - PAD_B} className={cambio.rischio ? "stroke-danger" : "stroke-brass/50"} strokeWidth="1" strokeDasharray="2 3" />
      ))}
      <path d={azoto} fill="none" className="stroke-lagoon" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      <path d={elio} fill="none" className="stroke-brass" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {cambi.map((cambio) => (
        <g key={`${cambio.t}-punti`}>
          <circle cx={sx(cambio.t, maxT)} cy={sy(cambio.pn2, 0, massimo, false)} r="3.2" className={cambio.rischio ? "fill-danger" : "fill-lagoon"} />
          <circle cx={sx(cambio.t, maxT)} cy={sy(cambio.phe, 0, massimo, false)} r="3.2" className={cambio.rischio ? "fill-danger" : "fill-brass"} />
        </g>
      ))}
    </Tela>
  );
}

function Riferimento({ y, classe }: { y: number; classe: string }) {
  return <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} className={classe} strokeWidth="1.6" strokeDasharray="5 4" />;
}

function ElencoCambi({ cambi }: { cambi: CambioIbcd[] }) {
  const t = useT();
  if (cambi.length === 0) return <p className="mt-2 text-xs text-mist">{t("Nessun cambio gas in questo piano.")}</p>;
  return (
    <ul className="mt-3 space-y-2 text-xs">
      {cambi.map((cambio) => (
        <li key={`${cambio.t}-${cambio.a}`} className={cambio.rischio ? "font-medium text-danger" : "text-mist"}>
          {cambio.rischio
            ? t("Rischio di controdiffusione a {m} m: l'azoto sale di {n2} bar e l'elio scende di {he} bar.", {
                m: Math.round(cambio.depth),
                n2: cambio.deltaN2.toFixed(2),
                he: Math.abs(cambio.deltaHe).toFixed(2),
              })
            : t("Cambio a {m} m, minuto {min}: azoto {n2} bar, elio {he} bar.", {
                m: Math.round(cambio.depth),
                min: Math.round(cambio.t),
                n2: formatDelta(cambio.deltaN2),
                he: formatDelta(cambio.deltaHe),
              })}
        </li>
      ))}
    </ul>
  );
}

function formatDelta(valore: number) {
  const segno = valore > 0 ? "+" : "";
  return `${segno}${valore.toFixed(2)}`;
}
