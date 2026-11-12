import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { NotaRichiesta } from "@/components/gestione";
import { listNotices, markAllNoticesRead, markNoticeRead, accettaCondivisione, rifiutaCondivisione, firmaConvalida, type Notice } from "@/lib/fondale.functions";
import { isStaff } from "@/lib/forms";
import { formatWhen } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/notifiche")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Notices />
    </AppFrame>
  );
}

function vistaDi(frame: ReturnType<typeof useFondale>): "gestore" | "scuola" | "sub" {
  const comeCliente = (frame.owner || isStaff(frame.profile?.role) || frame.platform) && frame.comeCliente;
  const gestore = frame.platform && !comeCliente && frame.vista !== "club";
  const scuola = !comeCliente && frame.desk && !gestore;
  return gestore ? "gestore" : scuola ? "scuola" : "sub";
}

function Notices() {
  const t = useT();
  const frame = useFondale();
  const navigate = useNavigate();
  const vista = vistaDi(frame);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listNotices({ data: { vista } })
      .then((result) => {
        if (!live) return;
        setAllowed(result.allowed);
        setItems(result.items);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [vista, frame.profile?.userId]);

  async function markAll() {
    if (busy || !items?.some((item) => !item.read)) return;
    const snapshot = items;
    setBusy(true);
    setError(null);
    setItems(items.map((item) => ({ ...item, read: true })));
    try {
      await markAllNoticesRead({ data: { vista } });
      await frame.refresh();
    } catch (reason) {
      setItems(snapshot);
      setError(messaggioErrore(reason, "Non riesco a segnarli come letti."));
    } finally {
      setBusy(false);
    }
  }

  async function openNotice(item: Notice) {
    if (!item.read) {
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true } : row)) ?? current);
      try {
        await markNoticeRead({ data: { id: item.id } });
        await frame.refresh();
      } catch (reason) {
        setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: false } : row)) ?? current);
        setError(messaggioErrore(reason, "Non riesco a segnarlo come letto."));
        return;
      }
    }
    if (item.title === "Invia moduli viaggio" && item.shareId) {
      await navigate({ to: "/attivita-soci", search: { id: undefined, club: undefined, socio: false, viaggio: item.shareId, invio: true } });
      return;
    }
    if (item.kind === "scheda" && item.submissionId > 0) {
      await navigate({ to: "/scheda/$id", params: { id: String(item.submissionId) } });
      return;
    }
    if (item.kind === "abbandono" || item.kind === "affiliazione" || item.title === "Richiesta mezzo nautico") {
      await navigate({ to: "/" });
      return;
    }
    if (item.kind === "esito" && item.title === "Codice pronto") {
      await navigate({ to: "/profilo", search: { scuola: false } });
      return;
    }
    if (item.title === "Comunicazione ai soci") {
      await navigate({ to: "/" });
    }
  }

  async function rispondi(item: Notice, azione: "salva" | "modifica" | "rifiuta") {
    if (!item.shareId || shareBusy) return;
    if (azione === "modifica") {
      await navigate({ to: "/logbook", search: { nuova: undefined, condivisione: item.shareId } });
      return;
    }
    setShareBusy(item.shareId);
    setError(null);
    try {
      if (azione === "salva") await accettaCondivisione({ data: { id: item.shareId } });
      else await rifiutaCondivisione({ data: { id: item.shareId } });
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true, shareStato: azione === "salva" ? "salvata" : "rifiutata" } : row)) ?? current);
      await frame.refresh();
    } catch (reason) {
      setError(messaggioErrore(reason, azione === "salva" ? "Immersione non salvata." : "Non rifiutata."));
    } finally {
      setShareBusy(null);
    }
  }

  const intro =
    vista === "gestore"
      ? "Richieste di apertura diving, con anagrafica completa o i campi mancanti. Senza moduli, brevetti o certificati medici. Ogni nuova iscrizione: nome, cognome e tipo di account."
      : vista === "scuola"
        ? "I moduli nuovi di questo diving. Le notifiche sul telefono si attivano dal Profilo."
        : "L'esito della tua richiesta di apertura.";
  const vuoto = vista === "gestore" ? "Nessuna richiesta e nessuna iscrizione." : vista === "scuola" ? "Nessuna registrazione nuova." : "Nessuna richiesta.";

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">{t("Avvisi")}</h1>
        <p className="mt-3 text-sm text-mist">{t("Questi avvisi non sono i tuoi.")}</p>
      </div>
    );
  }

  const pending = items?.some((item) => !item.read) ?? false;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{t("Avvisi")}</h1>
          <p className="mt-2 text-sm text-mist">{t(intro)}</p>
        </div>
        <button
          type="button"
          disabled={busy || !pending}
          className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-50"
          onClick={() => void markAll()}
        >
          {busy ? t("Segno…") : pending ? t("Segna letti") : t("Già letti")}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
      <Link to="/profilo" search={{ scuola: false }} className="mt-4 inline-flex min-h-11 items-center text-sm text-lagoon">
        {t("Notifiche sul telefono")}
      </Link>
      {items === null ? <p className="mt-6 text-sm text-mist">{t("Controllo gli avvisi…")}</p> : null}
      {items && items.length === 0 ? <p className="mt-6 text-sm text-mist">{t(vuoto)}</p> : null}
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {items?.map((item) => (
          <li key={item.id} className="py-3">
            {item.kind === "convalida" ? (
              <FirmaConvalida
                item={item}
                busy={shareBusy === item.convalidaId}
                onFatta={async (firma) => {
                  if (!item.convalidaId || shareBusy) return;
                  setShareBusy(item.convalidaId);
                  setError(null);
                  try {
                    await firmaConvalida({ data: { id: item.convalidaId, firma } });
                    if (!item.read) await markNoticeRead({ data: { id: item.id } });
                    setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true, shareStato: "firmata" } : row)) ?? current);
                    await frame.refresh();
                  } catch (reason) {
                    setError(messaggioErrore(reason, "Non validata."));
                  } finally {
                    setShareBusy(null);
                  }
                }}
              />
            ) : item.kind === "condivisione" ? (
              <div>
                <p className="text-xs text-mist">{formatWhen(item.createdAt)}{item.read ? "" : ` · ${t("nuovo")}`}</p>
                <p className="mt-1 text-sm">{t("Immersione condivisa")}</p>
                <p className="mt-1 text-sm">{t("Hai ricevuto un'immersione da {nome}. Vuoi salvarla nel tuo Logbook?", { nome: item.persona })}</p>
                {item.shareStato === "inviata" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={shareBusy === item.shareId} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => void rispondi(item, "salva")}>{t("Salva")}</button>
                    <button type="button" disabled={shareBusy === item.shareId} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" onClick={() => void rispondi(item, "modifica")}>{t("Modifica")}</button>
                    <button type="button" disabled={shareBusy === item.shareId} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" onClick={() => void rispondi(item, "rifiuta")}>{t("Rifiuta")}</button>
                  </div>
                ) : item.shareStato === "salvata" ? <p className="mt-2 text-sm text-lagoon">{t("Salvata")}</p> : item.shareStato === "rifiutata" ? <p className="mt-2 text-sm text-mist">{t("Rifiutata")}</p> : null}
              </div>
            ) : (
            <button type="button" className="block w-full text-left" onClick={() => void openNotice(item)}>
              <p className="text-xs text-mist">{formatWhen(item.createdAt)}{item.read ? "" : ` · ${t("nuovo")}`}</p>
              <p className="mt-1 text-sm">{item.title ? t(item.title) : ""}</p>
              {item.kind === "affiliazione" ? (
                <p className="mt-1 text-sm">{item.persona}{item.divingNome ? ` · ${item.divingNome}` : ""}</p>
              ) : item.kind === "iscrizione" || item.kind === "abbandono" ? (
                <p className="mt-1 text-sm">{t(item.body)}</p>
              ) : (
                <>
                  {item.divingNome ? <p className="mt-1 text-sm">{item.divingNome}</p> : null}
                  <p className="mt-1 text-sm text-mist">{item.body ? t(item.body) : ""}</p>
                </>
              )}
            </button>
            )}
            {item.kind === "affiliazione" ? (
              item.nota ? <NotaRichiesta nota={item.nota} /> : <p className="mt-1 text-sm text-mist">{t("Anagrafica non indicata.")}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FirmaConvalida({ item, busy, onFatta }: { item: Notice; busy: boolean; onFatta: (firma: string) => Promise<void> }) {
  const t = useT();
  const [firma, setFirma] = useState("");
  const [tratti, setTratti] = useState(0);
  const attesa = item.shareStato === "inviata" || item.shareStato === "";
  return (
    <div>
      <p className="text-xs text-mist">{formatWhen(item.createdAt)}{item.read ? "" : ` · ${t("nuovo")}`}</p>
      <p className="mt-1 text-sm">{t("Convalida immersione")}</p>
      <p className="mt-1 text-sm">{item.body}</p>
      {item.shareStato === "firmata" ? <p className="mt-2 text-sm text-lagoon">{t("Validata")}</p> : item.shareStato === "sostituita" ? <p className="mt-2 text-sm text-mist">{t("Questa richiesta non è più in attesa.")}</p> : attesa ? (
        <>
          <TappetoAvviso onChange={(data, n) => { setFirma(data); setTratti(n); }} />
          <button
            type="button"
            disabled={busy || tratti < 1}
            className="mt-3 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60"
            onClick={() => void onFatta(firma)}
          >
            {busy ? t("Salvo…") : t("Conferma")}
          </button>
        </>
      ) : null}
    </div>
  );
}

function TappetoAvviso({ onChange }: { onChange: (data: string, tratti: number) => void }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const tratti = useRef(0);
  const attivo = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * 2));
    canvas.height = Math.max(1, Math.floor(rect.height * 2));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#f3efe4";
  }, []);

  function punto(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function giu(event: PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    attivo.current = true;
    const dove = punto(event);
    ctx.beginPath();
    ctx.moveTo(dove.x, dove.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function muovi(event: PointerEvent<HTMLCanvasElement>) {
    if (!attivo.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const dove = punto(event);
    ctx.lineTo(dove.x, dove.y);
    ctx.stroke();
    tratti.current += 1;
  }

  function su() {
    if (!attivo.current || !ref.current) return;
    attivo.current = false;
    onChange(ref.current.toDataURL("image/png"), tratti.current);
  }

  return (
    <div className="mt-3">
      <p className="mb-1 text-sm text-mist">{t("Firma col dito")}</p>
      <canvas ref={ref} className="h-36 w-full touch-none rounded-xl border border-line bg-abyss" onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} />
    </div>
  );
}
