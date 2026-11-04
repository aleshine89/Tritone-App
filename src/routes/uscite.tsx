import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { ScuolaChiusa } from "@/components/lucchetto";
import {
  aggiungiGruppoUscita,
  aggiungiPartecipante,
  aggiornaIntestazioneUscita,
  chiudiRegistro,
  chiudiVerifica,
  creaUscita,
  eliminaGiornata,
  getUscita,
  listaFoglioBarca,
  listCandidatiUscita,
  listGuideUscita,
  listImbarcazioni,
  listUscite,
  riapriRegistro,
  togliGruppoUscita,
  togliPartecipante,
  type CandidatoUscita,
  type FoglioBarca,
  type GruppoUscita,
  type GuidaUscita,
  type RigaUscita,
  type UscitaGiorno,
} from "@/lib/fondale.functions";
import { formatDay, mesiCompiuti } from "@/lib/format";
import { scriviPdfElenco, scriviPdfFoglio } from "@/lib/foglio-pdf";
import { messaggioErrore, linguaAttuale, useT, type Traduci } from "@/lib/i18n";

export const Route = createFileRoute("/uscite")({
  validateSearch: (search: Record<string, unknown>) => {
    const id = Number(search.id);
    return { id: Number.isInteger(id) && id > 0 ? id : undefined };
  },
  component: Page,
});

function Page() {
  return (
    <AppFrame>
      <RegistroGiorno />
    </AppFrame>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-transparent px-3 text-foam outline-none";
const KIT = ["ARA monobombola", "ARA bibombola", "Rebreather", "Snorkeling", "Apnea"] as const;
const MIX = ["Aria", "Nitrox", "Trimix"] as const;

function RegistroGiorno() {
  const frame = useFondale();
  const search = Route.useSearch();
  if (!frame.abbonamento.scuolaAperta) return <ScuolaChiusa />;
  if (search.id) return <SchedaUscita id={search.id} />;
  return <Elenco />;
}

function Elenco() {
  const frame = useFondale();
  const t = useT();
  const riva = !frame.club.mezzoNautico;
  const [rows, setRows] = useState<{ id: number; data: string; localita: string; imbarcazione: string; guidaNome: string; persone: number; fase: "prima" | "dopo" | "chiusa" }[] | null>(null);
  const [guide, setGuide] = useState<GuidaUscita[] | null>(null);
  const [barche, setBarche] = useState<{ id: number; nome: string }[] | null>(null);
  const [data, setData] = useState(frame.oggi);
  const [localita, setLocalita] = useState("");
  const [punto, setPunto] = useState("");
  const [ora, setOra] = useState("");
  const [barca, setBarca] = useState("");
  const [scelte, setScelte] = useState<string[]>([]);
  const [passaggio, setPassaggio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aperta, setAperta] = useState(false);
  const [cancellando, setCancellando] = useState<number | null>(null);
  const [calendario, setCalendario] = useState(false);
  const [mese, setMese] = useState(frame.oggi.slice(0, 7));
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");

  useEffect(() => {
    let live = true;
    listUscite()
      .then((items) => {
        if (live) setRows(items);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    if (riva) return () => {
      live = false;
    };
    listGuideUscita()
      .then((items) => {
        if (live) setGuide(items);
      })
      .catch(() => {
        if (live) setGuide([]);
      });
    listImbarcazioni()
      .then((items) => {
        if (live) setBarche(items);
      })
      .catch(() => {
        if (live) setBarche([]);
      });
    return () => {
      live = false;
    };
  }, [riva]);

  function toggleGuida(userId: string) {
    setScelte((current) => (current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]));
  }

  function intervallo(): { da: string; a: string } | null {
    if (!dal) return null;
    if (!al || al === dal) return { da: dal, a: dal };
    return dal < al ? { da: dal, a: al } : { da: al, a: dal };
  }

  function scegliGiorno(iso: string) {
    if (!dal || al) {
      setDal(iso);
      setAl("");
      return;
    }
    if (iso === dal) {
      setDal("");
      setAl("");
      return;
    }
    if (iso < dal) {
      setAl(dal);
      setDal(iso);
    } else setAl(iso);
  }

  function nelPeriodo(giorno: string): boolean {
    const scelto = intervallo();
    if (!scelto) return true;
    return giorno >= scelto.da && giorno <= scelto.a;
  }

  function stampaElenco() {
    const scelto = intervallo();
    const da = scelto?.da ?? frame.oggi;
    const a = scelto?.a ?? frame.oggi;
    const voci = (rows ?? [])
      .filter((row) => {
        const giorno = row.data.slice(0, 10);
        return giorno >= da && giorno <= a;
      })
      .sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : x.id - y.id));
    const bytes = scriviPdfElenco({
      titolo: t("Registro"),
      periodo: da === a ? formatDay(da) : `${formatDay(da)} – ${formatDay(a)}`,
      colonne: [t("Data"), t("Barca"), t("Località"), t("Persone")],
      vuoto: t("Nessuna uscita in questa data."),
      righe: voci.map((row) => ({
        data: formatDay(row.data),
        barca: row.imbarcazione || t("Da riva"),
        localita: row.localita || t("Senza località"),
        persone: String(row.persone),
      })),
    });
    const binario = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binario).set(bytes);
    const file = new File([binario], `registro-${da}${a === da ? "" : `-${a}`}.pdf`, { type: "application/pdf" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const visibili = (rows ?? []).filter((row) => nelPeriodo(row.data.slice(0, 10)));
  const periodo = intervallo();

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm text-lagoon">
        Home
      </Link>
      <h1 className="mt-2 text-3xl leading-none">{riva ? t("Registro attività") : t("Registro")}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" aria-expanded={calendario} onClick={() => setCalendario((aperto) => !aperto)}>
          {t("Data")}{periodo ? ` · ${periodo.da === periodo.a ? formatDay(periodo.da) : `${formatDay(periodo.da)} – ${formatDay(periodo.a)}`}` : ""}
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={stampaElenco}>
          {t("Download Lista")}
        </button>
      </div>
      {calendario ? (
        <MiniCalendario
          mese={mese}
          oggi={frame.oggi}
          dal={periodo?.da ?? ""}
          al={periodo?.a ?? ""}
          segnati={(rows ?? []).map((row) => row.data.slice(0, 10))}
          onMese={setMese}
          onGiorno={scegliGiorno}
          onPulisci={() => {
            setDal("");
            setAl("");
          }}
        />
      ) : null}
      <p className="mt-2 text-sm text-mist">{riva ? t("Uscite da riva: data, località e persone. Senza barca e senza guide.") : t("Un foglio per barca. Sotto, i subacquei di ogni guida. Il PDF è sulla giornata chiusa.")}</p>

      {aperta ? (
      <form
        className="mt-5 space-y-3 rounded-card border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void creaUscita({
            data: {
              data,
              localita,
              punto,
              orarioInizio: ora,
              daRiva: riva || barca === "riva",
              imbarcazioneId: riva || barca === "riva" ? 0 : Number(barca),
              guideIds: riva ? [] : scelte,
              passaggio: riva || passaggio,
            },
          })
            .then((created) => {
              window.location.assign(`/uscite?id=${created.id}`);
            })
            .catch((reason: unknown) => {
              setError(messaggioErrore(reason, "Non riesco ad aprire l'uscita."));
              setBusy(false);
            });
        }}
      >
        <h2 className="text-2xl">{t("Nuova uscita")}</h2>
        <label className="block text-sm">
          {t("Data")}
          <input type="date" required value={data} onChange={(event) => setData(event.target.value)} className={inputClass} />
        </label>
        {riva ? null : (
        <>
        <label className="block text-sm">
          {t("Imbarcazione")}
          <select required value={barca} onChange={(event) => setBarca(event.target.value)} className={inputClass}>
            <option value="">{t("Scegli")}</option>
            <option value="riva">{t("Da riva")}</option>
            {(barche ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-mist">{t("Le barche si registrano nel profilo della scuola, da titolare. Da riva è per l'uscita senza barca.")}</p>
        </>
        )}
        <label className="block text-sm">
          {t("Località")}
          <input required value={localita} onChange={(event) => setLocalita(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          {t("Punto")}
          <input value={punto} onChange={(event) => setPunto(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          {t("Orario di inizio immersione")}
          <input type="time" required value={ora} onChange={(event) => setOra(event.target.value)} className={inputClass} />
        </label>
        <fieldset className="space-y-2">
          {riva ? null : (
          <>
          <legend className="text-sm">{t("Guide sulla barca")}</legend>
          {(guide ?? []).filter((item) => item.puoUscire).map((item) => (
            <label key={item.userId} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={scelte.includes(item.userId)}
                onChange={() => toggleGuida(item.userId)}
                className="h-5 w-5"
              />
              {item.cognome} {item.nome}
            </label>
          ))}
          {(guide ?? []).filter((item) => item.puoUscire).length === 0 ? <p className="text-sm text-mist">{t("Nessuna guida in regola, per ora.")}</p> : null}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={passaggio} onChange={(event) => setPassaggio(event.target.checked)} className="h-5 w-5" />
            {t("Solo passaggio, senza guida in acqua")}
          </label>
          </>
          )}
        </fieldset>
        {error ? <p className="text-sm text-brass">{error}</p> : null}
        <button type="submit" disabled={busy || (!riva && !scelte.length && !passaggio)} className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium disabled:opacity-60">
          {busy ? t("Apro…") : t("Apri l'uscita")}
        </button>
        {(guide ?? []).some((item) => !item.puoUscire) && !riva ? (
          <ul className="space-y-1 text-sm text-danger">
            {guide?.filter((item) => !item.puoUscire).map((item) => (
              <li key={item.userId}>
                {item.cognome} {item.nome}: {item.motivo.split(". ").map((piece) => t(piece)).join(". ")}.
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      ) : (
        <button type="button" className="mt-5 min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => setAperta(true)}>
          {t("Nuova uscita")}
        </button>
      )}

      <ul className="mt-5 space-y-2">
        {visibili
          .slice()
          .sort((a, b) => Number(a.fase === "chiusa") - Number(b.fase === "chiusa"))
          .map((row) => {
            const apertaUscita = row.fase !== "chiusa";
            return (
              <li key={row.id} className={`overflow-hidden rounded-card border ${apertaUscita ? "border-brass bg-amber" : "border-line"}`}>
                <Link to="/uscite" search={{ id: row.id }} className="block px-4 py-3">
                  <p className={`text-sm ${apertaUscita ? "text-brass" : ""}`}>
                    {formatDay(row.data)} · {!riva && row.imbarcazione ? `${row.imbarcazione} · ` : ""}
                    {row.localita || t("Senza località")}
                    {apertaUscita ? ` · ${t("Da chiudere")}` : ""}
                  </p>
                  <p className={`mt-1 text-xs ${apertaUscita ? "text-brass" : "text-mist"}`}>
                    {riva ? "" : `${row.guidaNome} · `}{row.persone === 1 ? t("{n} persona", { n: row.persone }) : t("{n} persone", { n: row.persone })} · {faseLabel(row.fase, t)}
                    {row.fase === "chiusa" ? " · PDF" : ""}
                    {row.fase === "chiusa" && mesiCompiuti(row.data, frame.oggi) ? ` · ${t("Sei mesi compiuti")}` : ""}
                  </p>
                </Link>
                {apertaUscita ? (
                  <button
                    type="button"
                    disabled={cancellando === row.id}
                    className="min-h-11 w-full border-t border-brass px-4 text-sm font-medium text-brass"
                    onClick={() => {
                      if (!window.confirm(t("Eliminare questo foglio? Non si recupera."))) return;
                      setCancellando(row.id);
                      setError(null);
                      void eliminaGiornata({ data: { id: row.id } })
                        .then(() => setRows((current) => (current ?? []).filter((item) => item.id !== row.id)))
                        .catch((reason: unknown) => setError(messaggioErrore(reason, "Non eliminato.")))
                        .finally(() => setCancellando(null));
                    }}
                  >
                    {cancellando === row.id ? t("Elimino…") : t("Elimina foglio")}
                  </button>
                ) : null}
              </li>
            );
          })}
      </ul>
      {error && !aperta ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessuna uscita, per ora.")}</p> : null}
      {rows && rows.length > 0 && visibili.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessuna uscita in questa data.")}</p> : null}
      <Link to="/archivio" className="mt-6 inline-flex min-h-11 items-center text-sm text-lagoon">
        {t("Archivio moduli")}
      </Link>
    </div>
  );
}

function MiniCalendario({
  mese,
  oggi,
  dal,
  al,
  segnati,
  onMese,
  onGiorno,
  onPulisci,
}: {
  mese: string;
  oggi: string;
  dal: string;
  al: string;
  segnati: string[];
  onMese: (mese: string) => void;
  onGiorno: (giorno: string) => void;
  onPulisci: () => void;
}) {
  const t = useT();
  const [anno, numero] = mese.split("-").map(Number);
  const titolo = new Intl.DateTimeFormat(linguaAttuale() === "en" ? "en-GB" : "it-IT", { month: "long", year: "numeric" }).format(new Date(anno, numero - 1, 1));
  const inizio = new Date(anno, numero - 1, 1);
  const vuoti = (inizio.getDay() + 6) % 7;
  const giorni = new Date(anno, numero, 0).getDate();
  const celle: (string | null)[] = Array.from({ length: vuoti }, () => null);
  for (let giorno = 1; giorno <= giorni; giorno += 1) celle.push(`${mese}-${String(giorno).padStart(2, "0")}`);
  const presenti = new Set(segnati);
  const nomi = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  function sposta(delta: number) {
    const data = new Date(anno, numero - 1 + delta, 1);
    onMese(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <div className="mt-3 rounded-2xl border border-line bg-deep p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="min-h-11 min-w-11 text-lg text-lagoon" aria-label={t("Mese precedente")} onClick={() => sposta(-1)}>‹</button>
        <p className="text-sm capitalize">{titolo}</p>
        <button type="button" className="min-h-11 min-w-11 text-lg text-lagoon" aria-label={t("Mese successivo")} onClick={() => sposta(1)}>›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-mist">
        {nomi.map((nome) => <span key={nome}>{t(nome)}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celle.map((data, index) => {
          if (!data) return <span key={`vuoto-${index}`} />;
          const dentro = Boolean(dal) && data >= dal && data <= (al || dal);
          return (
            <button
              key={data}
              type="button"
              onClick={() => onGiorno(data)}
              className={`min-h-10 rounded-lg border text-sm ${dentro ? "border-lagoon bg-lagoon/15" : "border-line"} ${data === oggi ? "text-lagoon" : ""}`}
            >
              {Number(data.slice(8))}
              {presenti.has(data) ? <span className="mt-0.5 block text-[10px] leading-none text-lagoon">•</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-mist">{t("Tocca un giorno. Un secondo tocco sceglie il periodo.")}</p>
      {dal ? (
        <button type="button" className="mt-2 text-sm text-lagoon" onClick={onPulisci}>{t("Tutte le date")}</button>
      ) : null}
    </div>
  );
}

function faseLabel(fase: "prima" | "dopo" | "chiusa", t: Traduci) {
  if (fase === "chiusa") return t("Registro chiuso");
  if (fase === "dopo") return t("In acqua, da chiudere");
  return t("Verifica brevetti aperta");
}

function testoMetriScheda(metri: number | null | undefined, t: Traduci): string {
  if (metri == null || !(metri > 0)) return t("profondità non indicata");
  const valore = Number.isInteger(metri) ? String(metri) : metri.toFixed(1).replace(".", ",");
  return `${valore} m`;
}

function testoBrevetto(item: CandidatoUscita, t: Traduci): string {
  const nome = item.nomeBrevetto.trim() || [item.livello, item.didattica].filter(Boolean).join(" ") || t("Brevetto");
  const specifica = item.didatticaSpecifica.trim();
  const titolo = specifica && specifica.toLowerCase() !== nome.toLowerCase() ? `${specifica}, ${nome}` : nome;
  if (item.profondita == null || !(item.profondita > 0)) return t("{brevetto}, profondità non indicata", { brevetto: titolo });
  const metri = Number.isInteger(item.profondita) ? String(item.profondita) : item.profondita.toFixed(1).replace(".", ",");
  return t("{brevetto}, {metri} m", { brevetto: titolo, metri });
}

function rigaBrevetto(row: { allievo: boolean; didattica: string; livello: string; numeroBrevetto: string }, t: Traduci) {
  if (row.allievo) return row.livello ? t("Allievo · {livello}", { livello: row.livello }) : t("Allievo, senza brevetto");
  return [row.didattica, row.livello, row.numeroBrevetto].filter(Boolean).join(" ");
}

function RigaSubScelta({
  selezionato,
  disabled,
  onClick,
  nome,
  azione,
  children,
}: {
  selezionato: boolean;
  disabled: boolean;
  onClick: () => void;
  nome: string;
  azione: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left disabled:opacity-60 ${selezionato ? "border-lagoon bg-lagoon/15" : "border-line bg-deep active:border-lagoon active:bg-lagoon/15"}`}
    >
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${selezionato ? "border-lagoon bg-lagoon" : "border-lagoon"}`} aria-hidden>
        {selezionato ? <span className="size-2.5 rounded-full bg-deep" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg leading-tight">{nome}</span>
        {children}
      </span>
      <span className="shrink-0 text-xs text-lagoon">{azione}</span>
    </button>
  );
}

function SchedaUscita({ id }: { id: number }) {
  const frame = useFondale();
  const t = useT();
  const riva = !frame.club.mezzoNautico;
  const [uscita, setUscita] = useState<UscitaGiorno | null>(null);
  const [candidati, setCandidati] = useState<{ delGiorno: CandidatoUscita[]; archivio: CandidatoUscita[] }>({ delGiorno: [], archivio: [] });
  const [cerca, setCerca] = useState("");
  const [manuale, setManuale] = useState({ cognome: "", nome: "", didattica: "", livello: "", numero: "" });
  const [allievo, setAllievo] = useState({ cognome: "", nome: "", corso: "" });
  const [modo, setModo] = useState<null | "archivio" | "brevetto" | "allievo">(null);
  const [gruppoAperto, setGruppoAperto] = useState<number | null>(null);
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const [comuni, setComuni] = useState<Record<number, { orarioFine: string; profondita: string; autorespiratore: string; miscela: string }>>({});
  const [motivi, setMotivi] = useState<Record<number, string>>({});
  const [rientri, setRientri] = useState<Record<number, Pick<RigaUscita, "orarioFine" | "profondita" | "autorespiratore" | "miscela" | "percentualeO2">>>({});
  const [guide, setGuide] = useState<GuidaUscita[]>([]);
  const [nuovaGuida, setNuovaGuida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foglio, setFoglio] = useState<FoglioBarca | null>(null);
  const [modifica, setModifica] = useState(false);
  const [barche, setBarche] = useState<{ id: number; nome: string }[]>([]);
  const [testa, setTesta] = useState({ data: "", localita: "", punto: "", ora: "", barca: "" });

  function load(next: UscitaGiorno) {
    setUscita(next);
    setMotivi(Object.fromEntries(next.gruppi.map((gruppo) => [gruppo.id, gruppo.motivoRapporto])));
    setRientri(
      Object.fromEntries(
        next.righe.map((row) => [
          row.id,
          {
            orarioFine: row.orarioFine,
            profondita: row.profondita,
            autorespiratore: row.autorespiratore || "ARA monobombola",
            miscela: row.miscela || "Aria",
            percentualeO2: row.percentualeO2,
          },
        ]),
      ),
    );
    if (!riva) {
      void listaFoglioBarca({ data: { id: next.id } })
        .then(setFoglio)
        .catch(() => undefined);
    }
  }

  useEffect(() => {
    let live = true;
    getUscita({ data: { id } })
      .then((item) => {
        if (live) load(item);
      })
      .catch((reason: unknown) => {
        if (live) setError(messaggioErrore(reason, "Non trovo l'uscita."));
      });
    listCandidatiUscita({ data: { id } })
      .then((items) => {
        if (live) setCandidati(items);
      })
      .catch(() => undefined);
    if (!riva) {
      listGuideUscita()
        .then((items) => {
          if (live) setGuide(items);
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    setModifica(sessionStorage.getItem(`registro-modifica-${id}`) === "1");
  }, [id]);

  useEffect(() => {
    if (!modifica || !uscita) return;
    setTesta({
      data: uscita.data,
      localita: uscita.localita,
      punto: uscita.punto,
      ora: uscita.orarioInizio,
      barca: uscita.imbarcazioneId == null ? "riva" : String(uscita.imbarcazioneId),
    });
    void listImbarcazioni()
      .then(setBarche)
      .catch(() => setBarche([]));
  }, [modifica, uscita?.id]);

  if (!uscita) {
    return <p className="text-sm text-mist">{error ?? t("Apro il registro…")}</p>;
  }

  const giornata = uscita;
  const chiusaPrima = Boolean(giornata.chiusaPrima);
  const chiusaDopo = Boolean(giornata.chiusaDopo);
  const giaDentro = new Set(giornata.righe.map((row) => row.userId).filter((value): value is string => Boolean(value)));
  const delGiorno = candidati.delGiorno.filter((item) => item.fonte && !giaDentro.has(item.userId));
  const parole = cerca.trim().toLowerCase();
  const trovati = parole.length < 2
    ? []
    : candidati.archivio
        .filter((item) => item.fonte && !giaDentro.has(item.userId) && !delGiorno.some((row) => row.userId === item.userId) && `${item.cognome} ${item.nome}`.toLowerCase().includes(parole))
        .slice(0, 8);
  const giaGuide = new Set(giornata.gruppi.map((gruppo) => gruppo.guidaUserId).filter((value): value is string => Boolean(value)));
  const haPassaggio = giornata.gruppi.some((gruppo) => gruppo.passaggio);

  function aggiungiDa(item: CandidatoUscita, gruppoId: number) {
    setSceltoId(item.userId);
    setBusy(true);
    setError(null);
    void aggiungiPartecipante({
      data: {
        id,
        gruppoId,
        userId: item.userId,
        cognome: item.cognome,
        nome: item.nome,
        didattica: item.didattica,
        livello: item.livello,
        numero: item.numero,
        allievo: false,
      },
    })
      .then((next) => {
        setCerca("");
        setModo(null);
        load(next);
      })
      .catch((reason: unknown) => setError(messaggioErrore(reason, "Non aggiunto.")))
      .finally(() => {
        setSceltoId(null);
        setBusy(false);
      });
  }

  function applicaGruppo(gruppo: GruppoUscita, next: { orarioFine: string; profondita: string; autorespiratore: string; miscela: string }) {
    setComuni((current) => ({ ...current, [gruppo.id]: next }));
    setRientri((current) => {
      const copy = { ...current };
      for (const row of gruppo.righe) {
        const prev = copy[row.id] ?? { orarioFine: "", profondita: "", autorespiratore: "ARA monobombola", miscela: "Aria", percentualeO2: "" };
        copy[row.id] = { ...prev, orarioFine: next.orarioFine, profondita: next.profondita, autorespiratore: next.autorespiratore, miscela: next.miscela };
      }
      return copy;
    });
  }

  function etichettaBrevetto(row: FoglioBarca["righe"][number]): string {
    if (row.allievo) return row.livello ? t("Allievo · {livello}", { livello: row.livello }) : t("Allievo, senza brevetto");
    return [row.didattica, row.livello, row.numeroBrevetto].filter(Boolean).join(" ") || t("Brevetto non indicato");
  }

  function metri(row: FoglioBarca["righe"][number]): string {
    if (row.profonditaMassima == null) return t("Profondità non indicata");
    const valore = Number.isInteger(row.profonditaMassima) ? String(row.profonditaMassima) : row.profonditaMassima.toFixed(1).replace(".", ",");
    return `${valore} m`;
  }

  function listaCorrente(): FoglioBarca {
    if (foglio) return foglio;
    return {
      data: giornata.data,
      uscita: [giornata.imbarcazione, giornata.localita, giornata.punto].filter(Boolean).join(" · "),
      ora: giornata.orarioInizio,
      righe: giornata.righe.map((row) => ({
        cognome: row.cognome,
        nome: row.nome,
        didattica: row.didattica,
        livello: row.livello,
        numeroBrevetto: row.numeroBrevetto,
        allievo: row.allievo,
        profonditaMassima: null,
      })),
    };
  }

  function stampaLista() {
    document.body.classList.add("stampa-lista");
    const fine = () => {
      document.body.classList.remove("stampa-lista");
      window.removeEventListener("afterprint", fine);
    };
    window.addEventListener("afterprint", fine);
    window.print();
  }

  async function condividiPdf() {
    if (!frame.desk || frame.comeCliente) return;
    const listaPdf = listaCorrente();
    const bytes = scriviPdfFoglio({
      titolo: t("Foglio barca"),
      data: formatDay(listaPdf.data),
      uscita: [listaPdf.uscita, listaPdf.ora ? t("uscita {ora}", { ora: listaPdf.ora }) : ""].filter(Boolean).join(" · "),
      colonne: [t("Nome"), t("Brevetto"), t("Profondità massima")],
      righe: listaPdf.righe.map((row) => ({
        nome: `${row.cognome} ${row.nome}`.trim(),
        brevetto: etichettaBrevetto(row),
        profondita: metri(row),
      })),
    });
    const binario = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binario).set(bytes);
    const file = new File([binario], `foglio-barca-${listaPdf.data}.pdf`, { type: "application/pdf" });
    const dati = { files: [file], title: t("Foglio barca") };
    const puo = typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(dati));
    if (puo) {
      try {
        await navigator.share(dati);
        setError(null);
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(t("Condivisione non riuscita."));
        return;
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    setError(t("Su questo telefono non posso allegare il PDF. L'ho scaricato."));
  }

  const lista = listaCorrente();

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {riva ? null : (
      <div className="print-only lista-skipper text-ink">
        <p className="text-lg">{formatDay(lista.data)}</p>
        <p>
          {[lista.uscita, lista.ora ? t("uscita {ora}", { ora: lista.ora }) : ""].filter(Boolean).join(" · ")}
        </p>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-rule py-1 pr-3">{t("Nome")}</th>
              <th className="border-b border-rule py-1 pr-3">{t("Brevetto")}</th>
              <th className="border-b border-rule py-1">{t("Profondità massima")}</th>
            </tr>
          </thead>
          <tbody>
            {lista.righe.map((row, index) => (
              <tr key={`${row.cognome}-${row.nome}-${index}`}>
                <td className="border-b border-rule py-1 pr-3">{row.cognome} {row.nome}</td>
                <td className="border-b border-rule py-1 pr-3">{etichettaBrevetto(row)}</td>
                <td className="border-b border-rule py-1">
                  {row.profonditaMassima == null ? t("Profondità non indicata") : metri(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="no-print">
        <Link to="/uscite" search={{ id: undefined }} className="text-sm text-lagoon">
          {riva ? t("Attività") : t("Registro")}
        </Link>
        {frame.desk && !frame.comeCliente && !riva ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={stampaLista}>
              {t("Stampa")}
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => void condividiPdf()}>
              {t("Condividi PDF")}
            </button>
          </div>
        ) : null}
        <p className="mt-3 text-2xl leading-none text-lagoon">
          {chiusaDopo ? t("Registro chiuso") : chiusaPrima ? t("Adesso: rientro") : t("Adesso: verifica brevetti")}
        </p>
        {!chiusaDopo ? (
          <button
            type="button"
            className="mt-3 min-h-12 w-full rounded-full border border-danger text-sm font-medium text-danger"
            onClick={() => {
              if (!window.confirm(t("Eliminare questo foglio? Non si recupera."))) return;
              setBusy(true);
              void eliminaGiornata({ data: { id: uscita.id } })
                .then(() => {
                  window.location.assign("/uscite");
                })
                .catch((reason: unknown) => {
                  setError(messaggioErrore(reason, "Non eliminato."));
                  setBusy(false);
                });
            }}
          >
            {t("Elimina questo foglio")}
          </button>
        ) : null}
      </div>
      {modifica && !chiusaDopo ? (
        <form
          className="no-print mt-4 space-y-3 rounded-card border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            void aggiornaIntestazioneUscita({
              data: {
                id,
                data: testa.data,
                localita: testa.localita,
                punto: testa.punto,
                orarioInizio: testa.ora,
                daRiva: riva || testa.barca === "riva",
                imbarcazioneId: riva || testa.barca === "riva" ? 0 : Number(testa.barca),
              },
            })
              .then(load)
              .catch((reason: unknown) => setError(messaggioErrore(reason, "Parametri non salvati.")))
              .finally(() => setBusy(false));
          }}
        >
          <h2 className="text-xl">{t("Parametri dell'uscita")}</h2>
          <label className="block text-sm">
            {t("Data")}
            <input type="date" required value={testa.data} onChange={(event) => setTesta({ ...testa, data: event.target.value })} className={inputClass} />
          </label>
          {riva ? null : (
          <label className="block text-sm">
            {t("Imbarcazione")}
            <select required value={testa.barca} onChange={(event) => setTesta({ ...testa, barca: event.target.value })} className={inputClass}>
              <option value="">{t("Scegli")}</option>
              <option value="riva">{t("Da riva")}</option>
              {barche.map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </select>
          </label>
          )}
          <label className="block text-sm">
            {t("Località")}
            <input required value={testa.localita} onChange={(event) => setTesta({ ...testa, localita: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm">
            {t("Punto")}
            <input value={testa.punto} onChange={(event) => setTesta({ ...testa, punto: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm">
            {t("Orario di inizio immersione")}
            <input type="time" required value={testa.ora} onChange={(event) => setTesta({ ...testa, ora: event.target.value })} className={inputClass} />
          </label>
          {riva ? null : <p className="text-sm text-mist">{t("Le guide si aggiungono o si tolgono qui sotto, insieme ai subacquei.")}</p>}
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
            {busy ? t("Salvo…") : t("Salva i parametri")}
          </button>
        </form>
      ) : null}
      <article className="paper mt-3 rounded-card border border-rule bg-paper p-5 text-ink">
        <p className="text-xs font-medium uppercase tracking-widest text-lagoon">{t("Art. 12 · registro del centro")}</p>
        <h1 className="mt-1 text-3xl text-ink">{uscita.imbarcazione || uscita.localita}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {formatDay(uscita.data)} · {uscita.localita}
          {uscita.punto ? ` · ${uscita.punto}` : ""} · {t("uscita {ora}", { ora: uscita.orarioInizio })}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{uscita.guidaNome}</p>
        {uscita.chiusaPrima ? <p className="mt-2 text-sm text-ink">{t("Verifica brevetti chiusa il {quando}.", { quando: uscita.chiusaPrima.replace("T", " ") })}</p> : null}
        {uscita.chiusaDopo ? <p className="mt-1 text-sm text-ink">{t("Registro chiuso il {quando}. Conservare almeno 6 mesi.", { quando: uscita.chiusaDopo.replace("T", " ") })}</p> : null}
        {chiusaDopo && mesiCompiuti(uscita.data, frame.oggi) ? (
          <p className="no-print mt-3 rounded-xl bg-amber px-3 py-3 text-sm text-brass">
            {t("Sei mesi compiuti. Puoi tenere questo registro o cancellare la giornata.")}
            {frame.owner ? (
              <button
                type="button"
                className="mt-3 block min-h-11 w-full rounded-full border border-brass px-4"
                onClick={() => {
                  if (!window.confirm(t("Cancellare questa giornata? Non si recupera."))) return;
                  setBusy(true);
                  void eliminaGiornata({ data: { id: uscita.id } })
                    .then(() => {
                      window.location.assign("/uscite");
                    })
                    .catch((reason: unknown) => {
                      setError(messaggioErrore(reason, "Non cancellata."));
                      setBusy(false);
                    });
                }}
              >
                {t("Cancella la giornata")}
              </button>
            ) : null}
          </p>
        ) : null}
        {chiusaDopo ? (
          <button
            type="button"
            disabled={busy}
            className="no-print mt-4 min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium text-ink"
            onClick={() => {
              setBusy(true);
              setError(null);
              void riapriRegistro({ data: { id } })
                .then((next) => {
                  sessionStorage.setItem(`registro-modifica-${id}`, "1");
                  setModifica(true);
                  load(next);
                })
                .catch((reason: unknown) => setError(messaggioErrore(reason, "Registro non riaperto.")))
                .finally(() => setBusy(false));
            }}
          >
            {t("Modifica")}
          </button>
        ) : null}
        {chiusaDopo && !riva ? (
          <button type="button" className="no-print mt-4 min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => window.print()}>
            {t("Stampa il PDF del giorno")}
          </button>
        ) : null}
        {chiusaDopo && frame.owner ? (
          <button
            type="button"
            className="no-print mt-3 min-h-12 w-full rounded-full border border-danger px-4 text-sm font-medium text-danger"
            onClick={() => {
              if (!window.confirm(t("Eliminare questo foglio? Non si recupera."))) return;
              setBusy(true);
              void eliminaGiornata({ data: { id: uscita.id } })
                .then(() => {
                  window.location.assign("/uscite");
                })
                .catch((reason: unknown) => {
                  setError(messaggioErrore(reason, "Non eliminato."));
                  setBusy(false);
                });
            }}
          >
            {t("Elimina questo foglio")}
          </button>
        ) : null}

        {uscita.gruppi.map((gruppo) => {
          const comune = comuni[gruppo.id] ?? { orarioFine: "", profondita: "", autorespiratore: "ARA monobombola", miscela: "Aria" };
          const nomeGruppo = riva && gruppo.passaggio ? t("Uscita da riva") : gruppo.guidaNome;
          const oltreGruppo = gruppo.righe.length > 6;
          return (
            <section key={gruppo.id} className="mt-5 border-t border-rule pt-4">
              <h2 className="text-xl text-ink">{nomeGruppo}</h2>
              <p className="text-xs text-ink-soft">
                {gruppo.righe.length === 1 ? t("{n} subacqueo", { n: gruppo.righe.length }) : t("{n} subacquei", { n: gruppo.righe.length })}
                {gruppo.passaggio && !riva ? ` · ${t("nessuna guida in acqua")}` : ""}
              </p>
              <div className="screen-cards mt-3 space-y-3">
                {chiusaPrima && !chiusaDopo ? (
                  <div className="rounded-xl border border-rule p-3">
                    <p className="text-sm font-medium">{t("Per questo gruppo")}</p>
                    <p className="mt-1 text-xs text-ink-soft">{t("Lo scrivi una volta. Sotto puoi cambiare una persona.")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input type="time" aria-label={t("Orario di fine per il gruppo")} value={comune.orarioFine} onChange={(event) => applicaGruppo(gruppo, { ...comune, orarioFine: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink" />
                      <input inputMode="decimal" placeholder={t("Profondità m")} aria-label={t("Profondità per il gruppo")} value={comune.profondita} onChange={(event) => applicaGruppo(gruppo, { ...comune, profondita: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink" />
                      <select aria-label={t("Autorespiratore per il gruppo")} value={comune.autorespiratore} onChange={(event) => applicaGruppo(gruppo, { ...comune, autorespiratore: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink">
                        {KIT.map((item) => (
                          <option key={item} value={item}>{t(item)}</option>
                        ))}
                      </select>
                      <select aria-label={t("Miscela per il gruppo")} value={comune.miscela} onChange={(event) => applicaGruppo(gruppo, { ...comune, miscela: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink">
                        {MIX.map((item) => (
                          <option key={item} value={item}>{t(item)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
                {gruppo.righe.map((row) => (
                  <div key={row.id} className="rounded-xl border border-rule p-3">
                    <p className="text-sm font-medium">{row.cognome} {row.nome}</p>
                    <p className="mt-1 text-xs text-ink-soft">{testoMetriScheda(row.metriBrevetto, t)}</p>
                    <p className="mt-1 text-xs text-ink-soft">{rigaBrevetto(row, t)}</p>
                    {chiusaPrima && !chiusaDopo ? (
                      <Rientro value={rientri[row.id]} onChange={(next) => setRientri((current) => ({ ...current, [row.id]: next }))} />
                    ) : chiusaDopo ? (
                      <p className="mt-2 text-sm">
                        {t("Fine {ora}", { ora: row.orarioFine })} · {row.profondita} m · {row.autorespiratore ? t(row.autorespiratore) : ""} · {row.miscela ? t(row.miscela) : ""}
                        {row.percentualeO2 ? ` ${row.percentualeO2}%` : ""}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="no-print mt-2 text-sm text-danger"
                        onClick={() => {
                          setBusy(true);
                          void togliPartecipante({ data: { id, rigaId: row.id } })
                            .then(load)
                            .catch((reason: unknown) => setError(messaggioErrore(reason, "Non tolto.")))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {t("Togli")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <table className={`${riva ? "hidden" : "print-only"} mt-3 w-full border-collapse text-left text-xs`}>
                <thead>
                  <tr>
                    <th className="border-b border-rule py-1">{t("Subacqueo")}</th>
                    <th className="border-b border-rule py-1">{t("Brevetto")}</th>
                    <th className="border-b border-rule py-1">{t("Fine")}</th>
                    <th className="border-b border-rule py-1">{t("Prof.")}</th>
                    <th className="border-b border-rule py-1">{t("ARA")}</th>
                    <th className="border-b border-rule py-1">{t("Miscela")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gruppo.righe.map((row) => (
                    <tr key={row.id}>
                      <td className="border-b border-rule py-1">{row.cognome} {row.nome}</td>
                      <td className="border-b border-rule py-1">{rigaBrevetto(row, t)}</td>
                      <td className="border-b border-rule py-1">{row.orarioFine}</td>
                      <td className="border-b border-rule py-1">{row.profondita}</td>
                      <td className="border-b border-rule py-1">{row.autorespiratore ? t(row.autorespiratore) : ""}</td>
                      <td className="border-b border-rule py-1">{row.miscela ? t(row.miscela) : ""}{row.percentualeO2 ? ` ${row.percentualeO2}%` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {oltreGruppo ? (
                <p className="mt-3 text-sm">
                  {t("Oltre 6 subacquei per {guida}.", { guida: gruppo.guidaNome })}
                  {gruppo.motivoRapporto ? ` ${t("Motivo: {motivo}", { motivo: gruppo.motivoRapporto })}` : ""}
                </p>
              ) : null}
            </section>
          );
        })}
      </article>

      <div className="no-print mt-4 space-y-3">
        {error ? <p className="text-sm text-brass">{error}</p> : null}
        {!chiusaPrima ? (
          <>
            {giornata.gruppi.map((gruppo) => (
              <section key={gruppo.id} className="space-y-3 rounded-card border border-line p-4">
                <h3 className="text-xl">{riva && gruppo.passaggio ? t("Uscita da riva") : gruppo.guidaNome}</h3>
                <p className="text-sm text-mist">
                  {gruppo.righe.length === 1 ? t("{n} subacqueo", { n: gruppo.righe.length }) : t("{n} subacquei", { n: gruppo.righe.length })}
                  {gruppo.righe.length > 6 ? ` · ${t("oltre il rapporto di sei")}` : ""}
                </p>
                {gruppoAperto === gruppo.id ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["archivio", "Del giorno"],
                          ["brevetto", "Con brevetto"],
                          ["allievo", "Allievo"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`min-h-11 rounded-full px-2 text-sm ${modo === key ? "bg-lagoon font-medium" : "border border-line"}`}
                          onClick={() => setModo(key)}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                    {modo === "archivio" ? (
                      <>
                        <p className="text-sm">{t("Hanno mandato il modulo per questa data")}</p>
                        {delGiorno.length === 0 ? (
                          <p className="text-sm text-mist">{t("Nessuno per questa data. Cercali per cognome, oppure aggiungili a mano.")}</p>
                        ) : (
                          <ul className="grid gap-3">
                            {delGiorno.map((item) => (
                              <li key={item.userId}>
                                <RigaSubScelta
                                  selezionato={sceltoId === item.userId}
                                  disabled={busy}
                                  onClick={() => aggiungiDa(item, gruppo.id)}
                                  nome={`${item.cognome} ${item.nome}`}
                                  azione={t("Aggiungi")}
                                >
                                  <span className="mt-0.5 block text-xs text-mist">{testoMetriScheda(item.profondita, t)}</span>
                                  {item.periodoInizio && item.periodoFine ? (
                                    <span className="mt-0.5 block text-xs text-mist">
                                      {t("Periodo: dal {inizio} al {fine}", { inizio: formatDay(item.periodoInizio), fine: formatDay(item.periodoFine) })}
                                    </span>
                                  ) : null}
                                </RigaSubScelta>
                              </li>
                            ))}
                          </ul>
                        )}
                        <label className="block text-sm">
                          {t("Cerca per cognome")}
                          <input value={cerca} onChange={(event) => setCerca(event.target.value)} placeholder={t("Almeno 2 lettere")} className={inputClass} />
                        </label>
                        {cerca.trim().length >= 2 && trovati.length === 0 ? <p className="text-sm text-mist">{t("Nessuno con questo cognome.")}</p> : null}
                        <ul className="grid gap-3">
                          {trovati.map((item) => (
                            <li key={item.userId}>
                              <RigaSubScelta
                                selezionato={sceltoId === item.userId}
                                disabled={busy}
                                onClick={() => aggiungiDa(item, gruppo.id)}
                                nome={`${item.cognome} ${item.nome}`}
                                azione={t("Aggiungi")}
                              >
                                <span className="mt-0.5 block text-xs text-mist">{testoBrevetto(item, t)}</span>
                              </RigaSubScelta>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {modo === "brevetto" ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input placeholder={t("Cognome")} value={manuale.cognome} onChange={(event) => setManuale({ ...manuale, cognome: event.target.value })} className={inputClass} />
                          <input placeholder={t("Nome")} value={manuale.nome} onChange={(event) => setManuale({ ...manuale, nome: event.target.value })} className={inputClass} />
                          <input placeholder={t("Didattica")} value={manuale.didattica} onChange={(event) => setManuale({ ...manuale, didattica: event.target.value })} className={inputClass} />
                          <input placeholder={t("Livello")} value={manuale.livello} onChange={(event) => setManuale({ ...manuale, livello: event.target.value })} className={inputClass} />
                          <input placeholder={t("Numero brevetto")} value={manuale.numero} onChange={(event) => setManuale({ ...manuale, numero: event.target.value })} className={`${inputClass} sm:col-span-2`} />
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          className="min-h-11 rounded-full border border-line px-4 text-sm"
                          onClick={() => {
                            setBusy(true);
                            setError(null);
                            void aggiungiPartecipante({ data: { id, gruppoId: gruppo.id, userId: "", ...manuale, allievo: false } })
                              .then((next) => {
                                setManuale({ cognome: "", nome: "", didattica: "", livello: "", numero: "" });
                                setModo(null);
                                load(next);
                              })
                              .catch((reason: unknown) => setError(messaggioErrore(reason, "Non aggiunto.")))
                              .finally(() => setBusy(false));
                          }}
                        >
                          {t("Aggiungi")}
                        </button>
                      </>
                    ) : null}
                    {modo === "allievo" ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input placeholder={t("Cognome")} value={allievo.cognome} onChange={(event) => setAllievo({ ...allievo, cognome: event.target.value })} className={inputClass} />
                          <input placeholder={t("Nome")} value={allievo.nome} onChange={(event) => setAllievo({ ...allievo, nome: event.target.value })} className={inputClass} />
                          <input placeholder={t("Corso, se lo sai")} value={allievo.corso} onChange={(event) => setAllievo({ ...allievo, corso: event.target.value })} className={`${inputClass} sm:col-span-2`} />
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
                          onClick={() => {
                            setBusy(true);
                            setError(null);
                            void aggiungiPartecipante({
                              data: { id, gruppoId: gruppo.id, userId: "", cognome: allievo.cognome, nome: allievo.nome, didattica: "", livello: allievo.corso, numero: "", allievo: true },
                            })
                              .then((next) => {
                                setAllievo({ cognome: "", nome: "", corso: "" });
                                setModo(null);
                                load(next);
                              })
                              .catch((reason: unknown) => setError(messaggioErrore(reason, "Allievo non aggiunto.")))
                              .finally(() => setBusy(false));
                          }}
                        >
                          {t("Aggiungi allievo")}
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="min-h-11 text-sm text-mist" onClick={() => setGruppoAperto(null)}>
                      {t("Chiudi")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium"
                    onClick={() => {
                      setGruppoAperto(gruppo.id);
                      setModo("archivio");
                    }}
                  >
                    {t("Aggiungi a {nome}", { nome: riva && gruppo.passaggio ? t("Uscita da riva") : gruppo.guidaNome })}
                  </button>
                )}
                {gruppo.righe.length === 0 && giornata.gruppi.length > 1 && !riva ? (
                  <button
                    type="button"
                    className="min-h-11 text-sm text-danger"
                    onClick={() => {
                      setBusy(true);
                      void togliGruppoUscita({ data: { id, gruppoId: gruppo.id } })
                        .then(load)
                        .catch((reason: unknown) => setError(messaggioErrore(reason, "Guida non tolta.")))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t("Togli questa guida")}
                  </button>
                ) : null}
                {gruppo.righe.length > 6 ? (
                  <label className="block text-sm">
                    {t("Oltre 6 subacquei per {guida}. Scrivi perché", { guida: gruppo.guidaNome })}
                    <textarea
                      value={motivi[gruppo.id] ?? ""}
                      onChange={(event) => setMotivi((current) => ({ ...current, [gruppo.id]: event.target.value }))}
                      className={`${inputClass} py-2`}
                      rows={3}
                    />
                  </label>
                ) : null}
              </section>
            ))}
            {riva ? null : (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!nuovaGuida) return;
                setBusy(true);
                setError(null);
                void aggiungiGruppoUscita({ data: { id, guidaUserId: nuovaGuida } })
                  .then((next) => {
                    setNuovaGuida("");
                    load(next);
                  })
                  .catch((reason: unknown) => setError(messaggioErrore(reason, "Guida non aggiunta.")))
                  .finally(() => setBusy(false));
              }}
            >
              <label className="block text-sm">
                {t("Aggiungi un'altra guida a questa uscita")}
                <select value={nuovaGuida} onChange={(event) => setNuovaGuida(event.target.value)} className={inputClass}>
                  <option value="">{t("Scegli")}</option>
                  {haPassaggio ? null : <option value="passaggio">{t("Solo passaggio")}</option>}
                  {guide.filter((item) => item.puoUscire && !giaGuide.has(item.userId)).map((item) => (
                    <option key={item.userId} value={item.userId}>
                      {item.cognome} {item.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy || !nuovaGuida} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60">
                {t("Aggiungi la guida")}
              </button>
            </form>
            )}
          </>
        ) : null}
      </div>
      {!chiusaDopo ? (
        <div className="no-print fixed inset-x-0 z-20 border-t border-line bg-deep px-4 py-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] md:bottom-0">
          <div className="mx-auto max-w-3xl">
            {!chiusaPrima ? (
              <button
                type="button"
                disabled={busy}
                className="min-h-12 w-full rounded-full bg-lagoon px-4 font-medium"
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void chiudiVerifica({
                    data: {
                      id,
                      motivi: giornata.gruppi.map((gruppo) => ({ gruppoId: gruppo.id, motivo: motivi[gruppo.id] ?? "" })),
                    },
                  })
                    .then(load)
                    .catch((reason: unknown) => setError(messaggioErrore(reason, "Verifica non chiusa.")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("Chiudi la verifica")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="min-h-12 w-full rounded-full bg-lagoon px-4 font-medium"
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void chiudiRegistro({
                    data: {
                      id,
                      righe: uscita.righe.map((row) => ({ id: row.id, ...(rientri[row.id] ?? { orarioFine: "", profondita: "", autorespiratore: "", miscela: "", percentualeO2: "" }) })),
                    },
                  })
                    .then(load)
                    .catch((reason: unknown) => setError(messaggioErrore(reason, "Registro non chiuso.")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("Chiudi il registro")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Rientro({
  value,
  onChange,
}: {
  value?: Pick<RigaUscita, "orarioFine" | "profondita" | "autorespiratore" | "miscela" | "percentualeO2">;
  onChange: (next: Pick<RigaUscita, "orarioFine" | "profondita" | "autorespiratore" | "miscela" | "percentualeO2">) => void;
}) {
  const t = useT();
  const current = value ?? { orarioFine: "", profondita: "", autorespiratore: "ARA monobombola", miscela: "Aria", percentualeO2: "" };
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <input type="time" value={current.orarioFine} onChange={(event) => onChange({ ...current, orarioFine: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink" />
      <input inputMode="decimal" placeholder={t("Profondità m")} value={current.profondita} onChange={(event) => onChange({ ...current, profondita: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink" />
      <select value={current.autorespiratore} onChange={(event) => onChange({ ...current, autorespiratore: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink">
        {KIT.map((item) => (
          <option key={item} value={item}>{t(item)}</option>
        ))}
      </select>
      <select value={current.miscela} onChange={(event) => onChange({ ...current, miscela: event.target.value })} className="min-h-11 rounded-xl border border-rule bg-white px-2 text-ink">
        {MIX.map((item) => (
          <option key={item} value={item}>{t(item)}</option>
        ))}
      </select>
    </div>
  );
}
