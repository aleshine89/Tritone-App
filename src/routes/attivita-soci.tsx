import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FotoPiena } from "@/components/foto-vista";
import {
  aggiornaAttivitaSoci,
  creaAttivitaSoci,
  eliminaAttivitaSoci,
  iscrivitiAttivitaSoci,
  listaAttivitaSoci,
  type AttivitaSoci,
  type PaginaAttivitaSoci,
} from "@/lib/fondale.functions";
import { formatDay, oggiRoma } from "@/lib/format";
import { linguaAttuale, messaggioErrore, useT } from "@/lib/i18n";
import { prepareFile } from "@/lib/prepare-file";

export const Route = createFileRoute("/attivita-soci")({
  validateSearch: (search: Record<string, unknown>) => {
    const id = Number(search.id);
    const club = Number(search.club);
    const socio = search.socio === true || search.socio === "true" || search.socio === 1 || search.socio === "1";
    return {
      id: Number.isInteger(id) && id > 0 ? id : undefined,
      club: Number.isInteger(club) && club > 0 ? club : undefined,
      socio,
    };
  },
  component: Page,
});

function Page() {
  return (
    <AppFrame>
      <Attivita />
    </AppFrame>
  );
}

function Attivita() {
  const t = useT();
  const ricerca = Route.useSearch();
  const cercata = ricerca.id;
  const soloSocio = ricerca.socio;
  const [dato, setDato] = useState<PaginaAttivitaSoci | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [titolo, setTitolo] = useState("");
  const [giorno, setGiorno] = useState("");
  const [orario, setOrario] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [immagine, setImmagine] = useState("");
  const [iscrizione, setIscrizione] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vista, setVista] = useState<"calendario" | "lista">(soloSocio ? "calendario" : vistaSalvata);
  const [mese, setMese] = useState(() => oggiRoma().slice(0, 7));
  const [giornoScelto, setGiornoScelto] = useState(oggiRoma);
  const oggi = oggiRoma();
  const elenco = (dato?.attivita ?? []).filter((voce) => !ricerca.club || voce.clubId === ricerca.club);
  const evidenziata = elenco.find((voce) => voce.id === cercata) ?? null;

  useEffect(() => {
    if (!evidenziata) return;
    setMese(evidenziata.giorno.slice(0, 7));
    setGiornoScelto(evidenziata.giorno);
  }, [evidenziata]);

  function carica() {
    return listaAttivitaSoci()
      .then(setDato)
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a leggere le attività.")));
  }

  useEffect(() => {
    let live = true;
    listaAttivitaSoci()
      .then((value) => {
        if (live) setDato(value);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere le attività."));
      });
    return () => {
      live = false;
    };
  }, []);

  function scegliVista(next: "calendario" | "lista") {
    setVista(next);
    try {
      localStorage.setItem(CHIAVE_VISTA, next);
    } catch {
      /* la vista resta per questa sessione */
    }
  }

  async function crea() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await creaAttivitaSoci({ data: { titolo, giorno, orario, descrizione, immagine, iscrizione } });
      setTitolo("");
      setGiorno("");
      setOrario("");
      setDescrizione("");
      setImmagine("");
      setIscrizione(false);
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a salvare l'attività."));
    } finally {
      setBusy(false);
    }
  }

  async function iscriviti(id: number, azione: "iscriviti" | "disiscriviti") {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await iscrivitiAttivitaSoci({ data: { id, azione } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a salvare l'iscrizione."));
    } finally {
      setBusy(false);
    }
  }

  async function modifica(
    id: number,
    campi: { titolo: string; giorno: string; orario: string; descrizione: string; immagine: string; iscrizione: boolean },
  ) {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await aggiornaAttivitaSoci({ data: { id, ...campi } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a salvare l'attività."));
    } finally {
      setBusy(false);
    }
  }

  async function elimina(id: number) {
    if (busy) return;
    if (!window.confirm(t("Eliminare questa attività?"))) return;
    setBusy(true);
    setErrore(null);
    try {
      await eliminaAttivitaSoci({ data: { id } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a eliminare l'attività."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-mist">
        <ArrowLeft className="size-4" />
        {t("Home")}
      </Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Attività")}</h1>
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {!dato ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {dato?.puoCreare && !soloSocio ? (
        <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-4">
          <p className="text-sm font-medium">{t("Nuova attività")}</p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-mist">{t("Titolo")}</span>
            <input value={titolo} onChange={(event) => setTitolo(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-mist">{t("Data")}</span>
              <input type="date" value={giorno} onChange={(event) => setGiorno(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist">{t("Orario")}</span>
              <input type="time" value={orario} onChange={(event) => setOrario(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-mist">{t("Descrizione")}</span>
            <textarea value={descrizione} onChange={(event) => setDescrizione(event.target.value)} rows={4} className="w-full rounded-xl border border-line bg-abyss px-3 py-2 outline-none focus-visible:border-lagoon" />
          </label>
          <div className="mt-3">
            <p className="mb-2 text-sm text-mist">{t("Immagine, facoltativa")}</p>
            <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm">
              {t("Scegli file")}
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void prepareFile(file)
                    .then((pronto) => setImmagine(pronto.data))
                    .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Allega un'immagine.")));
                }}
              />
            </label>
            {immagine ? (
              <div className="mt-2 flex items-center gap-3">
                <img src={immagine} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button type="button" className="min-h-11 text-sm text-brass" onClick={() => setImmagine("")}>{t("Togli")}</button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={iscrizione}
            className="mt-4 flex min-h-11 w-full items-center justify-between rounded-full border border-line px-4 text-sm"
            onClick={() => setIscrizione((value) => !value)}
          >
            <span>{t("I soci possono iscriversi")}</span>
            <span className={`rounded-full px-3 py-1 ${iscrizione ? "bg-lagoon text-ink" : "border border-line"}`}>{iscrizione ? t("acceso") : t("spento")}</span>
          </button>
          <button type="button" disabled={busy || !titolo.trim() || !giorno} className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void crea()}>
            {t("Pubblica")}
          </button>
        </div>
      ) : null}
      {evidenziata ? (
        <div className="mt-4">
          <SchedaAttivita voce={evidenziata} busy={busy} solaLettura={soloSocio} onIscriviti={iscriviti} onModifica={modifica} onElimina={elimina} />
        </div>
      ) : null}
      {dato && elenco.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessuna attività.")}</p> : null}
      {dato && elenco.length > 0 ? (
        <div className="mt-4 flex rounded-full border border-line p-1" role="group" aria-label={t("Attività")}>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full text-sm ${vista === "calendario" ? "bg-lagoon font-medium text-ink" : ""}`}
            aria-pressed={vista === "calendario"}
            onClick={() => scegliVista("calendario")}
          >
            {t("Calendario")}
          </button>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full text-sm ${vista === "lista" ? "bg-lagoon font-medium text-ink" : ""}`}
            aria-pressed={vista === "lista"}
            onClick={() => scegliVista("lista")}
          >
            {t("Lista")}
          </button>
        </div>
      ) : null}
      {dato && vista === "calendario" ? (
        <>
          <CalendarioAttivita mese={mese} oggi={oggi} scelto={giornoScelto} giorni={elenco.map((voce) => voce.giorno)} onMese={setMese} onGiorno={setGiornoScelto} />
          {elenco.filter((voce) => voce.giorno === giornoScelto && voce.id !== cercata).length === 0 ? (
            evidenziata?.giorno === giornoScelto ? null : <p className="mt-3 text-sm text-mist">{t("Nessuna attività in questo giorno.")}</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {elenco.filter((voce) => voce.giorno === giornoScelto && voce.id !== cercata).map((voce) => (
                <SchedaAttivita key={voce.id} voce={voce} busy={busy} solaLettura={soloSocio} onIscriviti={iscriviti} onModifica={modifica} onElimina={elimina} />
              ))}
            </ul>
          )}
        </>
      ) : null}
      {dato && vista === "lista" ? (
        <ul className="mt-3 grid gap-3">
          {inOrdine(elenco, oggi).map((voce) => (
            <li key={voce.id} className="rounded-2xl border border-line bg-deep px-4 py-3">
              <p className="text-sm text-mist">{formatDay(voce.giorno)}{voce.orario ? ` · ${voce.orario}` : ""}</p>
              <p className="mt-1 text-sm font-medium">{voce.titolo}</p>
              <p className={`mt-1 text-sm ${voce.iscritto ? "text-lagoon" : "text-mist"}`}>{t(statoIscrizione(voce))}</p>
              <SchedaAttivita voce={voce} busy={busy} solaLettura={soloSocio} onIscriviti={iscriviti} onModifica={modifica} onElimina={elimina} compatta />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const CHIAVE_VISTA = "tritone-vista-attivita";

function vistaSalvata(): "calendario" | "lista" {
  try {
    return localStorage.getItem(CHIAVE_VISTA) === "lista" ? "lista" : "calendario";
  } catch {
    return "calendario";
  }
}

function statoIscrizione(voce: AttivitaSoci): string {
  if (!voce.iscrizione) return "Annuncio";
  if (voce.iscritto) return "Iscritto";
  return voce.possoIscrivermi ? "Non iscritto" : "Iscrizione aperta";
}

function inOrdine(voci: AttivitaSoci[], oggi: string): AttivitaSoci[] {
  return [...voci].sort((a, b) => {
    const aFutura = a.giorno >= oggi;
    const bFutura = b.giorno >= oggi;
    if (aFutura !== bFutura) return aFutura ? -1 : 1;
    if (aFutura) return a.giorno.localeCompare(b.giorno) || a.orario.localeCompare(b.orario) || a.id - b.id;
    return b.giorno.localeCompare(a.giorno) || b.orario.localeCompare(a.orario) || a.id - b.id;
  });
}

function AllegatoAttivita({ src, titolo, compatta }: { src: string; titolo: string; compatta: boolean }) {
  const t = useT();
  const [aperta, setAperta] = useState(false);
  return (
    <>
      <button
        type="button"
        className={compatta ? "mt-2 flex w-full items-center gap-3 text-left" : "mb-3 block w-full text-left"}
        onClick={() => setAperta(true)}
      >
        <img src={src} alt="" className={compatta ? "h-14 w-14 shrink-0 rounded-lg object-cover" : "max-h-48 w-full rounded-xl object-cover"} />
        <span className={`text-sm text-lagoon ${compatta ? "" : "mt-2 inline-flex min-h-11 items-center"}`}>{t("Apri allegato")}</span>
      </button>
      {aperta ? <FotoPiena src={src} alt={titolo} onClose={() => setAperta(false)} /> : null}
    </>
  );
}

function SchedaAttivita({
  voce,
  busy,
  compatta = false,
  solaLettura = false,
  onIscriviti,
  onModifica,
  onElimina,
}: {
  voce: AttivitaSoci;
  busy: boolean;
  compatta?: boolean;
  solaLettura?: boolean;
  onIscriviti: (id: number, azione: "iscriviti" | "disiscriviti") => void;
  onModifica: (id: number, campi: { titolo: string; giorno: string; orario: string; descrizione: string; immagine: string; iscrizione: boolean }) => Promise<void>;
  onElimina: (id: number) => void;
}) {
  const t = useT();
  const [aperta, setAperta] = useState(false);
  const [titolo, setTitolo] = useState(voce.titolo);
  const [giorno, setGiorno] = useState(voce.giorno);
  const [orario, setOrario] = useState(voce.orario);
  const [descrizione, setDescrizione] = useState(voce.descrizione);
  const [immagine, setImmagine] = useState(voce.immagine);
  const [iscrizione, setIscrizione] = useState(voce.iscrizione);

  useEffect(() => {
    setAperta(false);
    setTitolo(voce.titolo);
    setGiorno(voce.giorno);
    setOrario(voce.orario);
    setDescrizione(voce.descrizione);
    setImmagine(voce.immagine);
    setIscrizione(voce.iscrizione);
  }, [voce.id, voce.titolo, voce.giorno, voce.orario, voce.descrizione, voce.immagine, voce.iscrizione]);

  return (
    <div className={compatta ? "mt-2" : "rounded-2xl border border-line bg-deep px-4 py-3"}>
      {voce.immagine && (solaLettura || !voce.gestita) ? (
        <AllegatoAttivita src={voce.immagine} titolo={voce.titolo} compatta={compatta} />
      ) : compatta || !voce.immagine ? null : (
        <img src={voce.immagine} alt="" className="mb-3 max-h-48 w-full rounded-xl object-cover" />
      )}
      {compatta ? null : <p className="text-sm font-medium">{voce.titolo}</p>}
      {compatta ? null : (
        <p className="mt-1 text-xs text-mist">
          {formatDay(voce.giorno)}{voce.orario ? ` · ${voce.orario}` : ""} · {voce.club}
        </p>
      )}
      {compatta || !voce.descrizione ? null : <p className="mt-2 whitespace-pre-wrap text-sm">{voce.descrizione}</p>}
      {compatta || voce.iscrizione ? null : <p className="mt-2 text-xs uppercase tracking-wide text-brass">{t("Annuncio")}</p>}
      {voce.iscrizione && voce.possoIscrivermi ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60"
          onClick={() => onIscriviti(voce.id, voce.iscritto ? "disiscriviti" : "iscriviti")}
        >
          {voce.iscritto ? t("Disiscriviti") : t("Iscriviti")}
        </button>
      ) : null}
      {voce.gestita && !solaLettura ? (
        <div className="mt-3 border-t border-line pt-3">
          {voce.iscrizione ? (
            <>
              <p className="text-xs uppercase tracking-wide text-mist">{t("Partecipanti")}</p>
              {voce.partecipanti.length === 0 ? <p className="mt-1 text-sm text-mist">{t("Nessun iscritto.")}</p> : (
                <ul className="mt-1">
                  {voce.partecipanti.map((persona) => (
                    <li key={`${persona.cognome}-${persona.nome}`} className="text-sm">{persona.cognome} {persona.nome}</li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {aperta ? (
            <div className="mt-3">
              <label className="block text-sm">
                <span className="mb-1 block text-mist">{t("Titolo")}</span>
                <input value={titolo} onChange={(event) => setTitolo(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-mist">{t("Data")}</span>
                  <input type="date" value={giorno} onChange={(event) => setGiorno(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-mist">{t("Orario")}</span>
                  <input type="time" value={orario} onChange={(event) => setOrario(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
                </label>
              </div>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-mist">{t("Descrizione")}</span>
                <textarea value={descrizione} onChange={(event) => setDescrizione(event.target.value)} rows={3} className="w-full rounded-xl border border-line bg-abyss px-3 py-2 outline-none focus-visible:border-lagoon" />
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={iscrizione}
                className="mt-3 flex min-h-11 w-full items-center justify-between rounded-full border border-line px-4 text-sm"
                onClick={() => setIscrizione((value) => !value)}
              >
                <span>{t("I soci possono iscriversi")}</span>
                <span className={`rounded-full px-3 py-1 ${iscrizione ? "bg-lagoon text-ink" : "border border-line"}`}>{iscrizione ? t("acceso") : t("spento")}</span>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !titolo.trim() || !giorno}
                  className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60"
                  onClick={() => void onModifica(voce.id, { titolo, giorno, orario, descrizione, immagine, iscrizione })}
                >
                  {t("Salva modifica")}
                </button>
                <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setAperta(false)}>
                  {t("Annulla")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy} className="mt-2 min-h-11 text-sm text-lagoon disabled:opacity-60" onClick={() => setAperta(true)}>
              {t("Modifica")}
            </button>
          )}
          <button type="button" disabled={busy} className="mt-2 block min-h-11 text-sm text-brass disabled:opacity-60" onClick={() => onElimina(voce.id)}>
            {t("Elimina")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CalendarioAttivita({
  mese,
  oggi,
  scelto,
  giorni,
  onMese,
  onGiorno,
}: {
  mese: string;
  oggi: string;
  scelto: string;
  giorni: string[];
  onMese: (mese: string) => void;
  onGiorno: (giorno: string) => void;
}) {
  const t = useT();
  const [anno, numero] = mese.split("-").map(Number);
  const titolo = new Intl.DateTimeFormat(linguaAttuale() === "en" ? "en-GB" : "it-IT", { month: "long", year: "numeric" }).format(new Date(anno, (numero || 1) - 1, 1));
  const inizio = new Date(anno, (numero || 1) - 1, 1);
  const vuoti = (inizio.getDay() + 6) % 7;
  const quanti = new Date(anno, numero || 1, 0).getDate();
  const celle: (string | null)[] = Array.from({ length: vuoti }, () => null);
  for (let giorno = 1; giorno <= quanti; giorno += 1) celle.push(`${mese}-${String(giorno).padStart(2, "0")}`);
  const presenti = new Set(giorni);
  const nomi = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  function sposta(delta: number) {
    const data = new Date(anno, (numero || 1) - 1 + delta, 1);
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
          const segnato = presenti.has(data);
          return (
            <button
              key={data}
              type="button"
              onClick={() => onGiorno(data)}
              className={`min-h-10 rounded-lg border text-sm ${data === scelto ? "border-lagoon bg-lagoon/15" : "border-line"} ${data === oggi ? "text-lagoon" : ""}`}
            >
              {Number(data.slice(8))}
              {segnato ? <span className="mt-0.5 block text-[10px] leading-none text-brass">•</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
