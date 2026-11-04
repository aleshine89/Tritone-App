import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppFrame, useFondale } from "@/components/app-frame";
import { graficiScuola, type GraficiScuola } from "@/lib/fondale.functions";
import { formatDay } from "@/lib/format";
import { useT, type Traduci } from "@/lib/i18n";

export const Route = createFileRoute("/grafici")({ component: Page });

const PERIODI = [
  { id: "giorno", label: "Giornaliero" },
  { id: "settimana", label: "Settimanale" },
  { id: "mese", label: "Mensile" },
  { id: "anno", label: "Annuale" },
] as const;

function Page() {
  return (
    <AppFrame>
      <Grafici />
    </AppFrame>
  );
}

function Grafici() {
  const t = useT();
  const frame = useFondale();
  const scuola = frame.pronta && frame.desk && !frame.comeCliente;
  const [periodo, setPeriodo] = useState<(typeof PERIODI)[number]["id"]>("settimana");
  const [dato, setDato] = useState<GraficiScuola | null>(null);
  const [errore, setErrore] = useState(false);
  const chiara = useChiara();

  useEffect(() => {
    if (!scuola) return;
    let live = true;
    setDato(null);
    setErrore(false);
    graficiScuola({ data: { periodo } })
      .then((value) => {
        if (live) setDato(value);
      })
      .catch(() => {
        if (live) setErrore(true);
      });
    return () => {
      live = false;
    };
  }, [scuola, periodo]);

  if (!scuola) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t("Statistiche")}</h1>
        <p className="mt-3 text-sm text-mist">{t("Solo titolare e staff vedono le statistiche.")}</p>
      </div>
    );
  }

  const inchiostro = chiara ? "#4e6168" : "#d5e2e8";
  const barra = chiara ? "#0f766e" : "#5eead4";
  const tecnica = chiara ? "#8a5610" : "#e8b86d";
  const tooltip = {
    background: chiara ? "#ffffff" : "#0c1a22",
    border: chiara ? "1px solid rgba(16,32,40,.16)" : "1px solid rgba(255,255,255,.24)",
    borderRadius: 12,
    color: chiara ? "#122028" : "#f4f1ea",
    fontSize: 13,
  };

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <Link to="/" className="text-sm text-lagoon">{t("Home")}</Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Statistiche")}</h1>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PERIODI.map((voce) => (
          <button
            key={voce.id}
            type="button"
            className={`min-h-11 rounded-full px-2 text-sm ${periodo === voce.id ? "bg-tide font-medium text-white" : "border border-line"}`}
            onClick={() => setPeriodo(voce.id)}
          >
            {t(voce.label)}
          </button>
        ))}
      </div>
      {dato ? <p className="mt-3 text-xs text-mist">{formatDay(dato.dal)} – {formatDay(dato.al)}</p> : null}
      {errore ? <p className="mt-4 text-sm text-brass">{t("Non riesco a leggere le statistiche.")}</p> : null}
      {!dato && !errore ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {dato ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Scheda titolo="Immersioni totali" valore={dato.immersioni} delta={dato.delta.immersioni} />
            <Scheda titolo="N. Subacquei" valore={dato.subacquei} delta={dato.delta.subacquei} />
            <Scheda titolo="N. Uscite" valore={dato.uscite} delta={dato.delta.uscite} />
            <Scheda titolo="Moduli compilati" valore={dato.moduli} delta={dato.delta.moduli} />
          </div>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-4 py-4">
            <p className="text-sm text-mist">{t("Tempo totale in acqua")}</p>
            <p className="mt-1 font-display text-4xl leading-none">{tempoTesto(dato.minuti, t)}</p>
            <Variazione value={dato.delta.minuti} />
          </section>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-3 py-4">
            <h2 className="px-1 text-sm font-medium">{t("Soci per anno")}</h2>
            {dato.sociAnni.length === 0 ? (
              <p className="mt-3 px-1 text-sm text-mist">{t("Nessun socio accettato.")}</p>
            ) : (
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dato.sociAnni.map((row) => ({ nome: String(row.anno), n: row.n }))}>
                    <XAxis dataKey="nome" tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={28} tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "transparent" }} contentStyle={tooltip} />
                    <Bar dataKey="n" name={t("Soci")} fill={tecnica} radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-3 py-4">
            <h2 className="px-1 text-sm font-medium">{t("Soci dell'anno in corso")}</h2>
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dato.sociMesi.map((row) => ({ ...row, nome: t(row.chiave) }))}>
                  <XAxis dataKey="nome" tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "transparent" }} contentStyle={tooltip} />
                  <Bar dataKey="n" name={t("Soci")} fill={barra} radius={[6, 6, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-3 py-4">
            <h2 className="px-1 text-sm font-medium">{t(periodo === "anno" ? "Uscite per mese" : "Uscite per giorno")}</h2>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dato.barre.map((row) => ({ ...row, nome: t(row.chiave) }))}>
                  <XAxis dataKey="nome" tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} interval={periodo === "mese" ? 2 : 0} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "transparent" }} contentStyle={tooltip} />
                  <Bar dataKey="uscite" fill={barra} radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-4 py-4">
            <h2 className="text-sm font-medium">{t("Distribuzione immersioni")}</h2>
            {dato.torta.ricreative + dato.torta.tecniche === 0 ? (
              <p className="mt-3 text-sm text-mist">{t("Nessun dato in questo periodo.")}</p>
            ) : (
              <div className="mt-2 grid items-center gap-2 sm:grid-cols-[12rem_1fr]">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: t("Ricreative"), value: dato.torta.ricreative, fill: barra },
                          { name: t("Tecniche"), value: dato.torta.tecniche, fill: tecnica },
                        ].filter((row) => row.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={68}
                        stroke="none"
                      >
                        {[
                          { name: t("Ricreative"), value: dato.torta.ricreative, fill: barra },
                          { name: t("Tecniche"), value: dato.torta.tecniche, fill: tecnica },
                        ]
                          .filter((row) => row.value > 0)
                          .map((row) => (
                            <Cell key={row.name} fill={row.fill} />
                          ))}
                      </Pie>
                      <Tooltip contentStyle={tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: barra }} />{t("Ricreative")}</span>
                    <span>{dato.torta.ricreative}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tecnica }} />{t("Tecniche")}</span>
                    <span>{dato.torta.tecniche}</span>
                  </li>
                </ul>
              </div>
            )}
          </section>
          <section className="mt-3 rounded-2xl border border-line bg-deep px-3 py-4">
            <h2 className="px-1 text-sm font-medium">{t("Guide più attive")}</h2>
            {dato.guide.length === 0 ? (
              <p className="mt-3 px-1 text-sm text-mist">{t("Nessuna guida in questo periodo.")}</p>
            ) : (
              <div className="mt-3" style={{ height: Math.max(160, dato.guide.length * 36) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dato.guide} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: inchiostro, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" width={108} tick={{ fill: inchiostro, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "transparent" }} contentStyle={tooltip} />
                    <Bar dataKey="immersioni" fill={barra} radius={[0, 6, 6, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Scheda({ titolo, valore, delta }: { titolo: string; valore: number; delta: number | null }) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-line bg-deep px-4 py-4">
      <p className="text-xs text-mist">{t(titolo)}</p>
      <p className="mt-2 font-display text-4xl leading-none">{valore}</p>
      <Variazione value={delta} />
    </section>
  );
}

function Variazione({ value }: { value: number | null }) {
  const t = useT();
  if (value === null) return <p className="mt-2 text-xs text-brass">{t("nuovo")}</p>;
  if (value === 0) return <p className="mt-2 text-xs text-mist">{t("come il periodo precedente")}</p>;
  const su = value > 0;
  return <p className={`mt-2 text-xs ${su ? "text-lagoon" : "text-brass"}`}>{su ? `+${value}%` : `${value}%`}</p>;
}

function tempoTesto(minuti: number, t: Traduci): string {
  const ore = Math.floor(minuti / 60);
  const min = minuti % 60;
  return t("{ore} h {min} min", { ore, min });
}

function useChiara(): boolean {
  const [chiara, setChiara] = useState(false);
  useEffect(() => {
    const leggi = () => setChiara(document.documentElement.classList.contains("chiara"));
    leggi();
    const obs = new MutationObserver(leggi);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return chiara;
}
