import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { AnteprimaFile, AnteprimaLocale, FotoPiena, useAllegato } from "@/components/foto-vista";
import { ChecklistPanel, ToolsPanel } from "@/components/mio-panels";
import { Lucchetto } from "@/components/lucchetto";
import { CnsCalc } from "@/components/cns";
import { ModCalc } from "@/components/mod";
import { SpecieSezione } from "@/components/specie-sezione";
import { avvisaScadenze } from "@/lib/avvisi-scadenza";
import { ascoltaNotificheTelefono, notificheTelefonoAttive } from "@/lib/push-client";
import {
  deleteBrevetto,
  deleteDocumento,
  deleteKit,
  getBrevettoFile,
  getDocumentoFile,
  listBrevetti,
  listDocumenti,
  listKit,
  listScadenze,
  listTools,
  saveBrevetto,
  saveDocumento,
  saveKit,
  type Brevetto,
  type Documento,
  type DocumentoKind,
  type Pezzo,
} from "@/lib/fondale.functions";
import { ScadenzaField } from "@/components/scadenza-field";
import { formatDay, scadenzaStato } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";
import { prepareFile, fonteLetturaBrevetto } from "@/lib/prepare-file";
import { leggiDocumento } from "@/lib/leggi-documento";
import { LetturaInCorso } from "@/components/wizard-sub";
import { useRitaglioDocumento } from "@/components/ritaglio-documento";
import { cifraFile, decifraFile, importaChiaveMia, chiaveMia } from "@/lib/cifrario";

const VOCI_HOME = ["brevetti", "assicurazione", "medico", "specie", "attrezzatura", "checklist", "pianifica", "mod", "tools", "emergenze"] as const;
type VoceHome = (typeof VOCI_HOME)[number];

const Pianifica = lazy(() => import("@/components/pianifica").then((mod) => ({ default: mod.Pianifica })));

function voceHome(value: unknown): VoceHome | undefined {
  return VOCI_HOME.includes(value as VoceHome) ? (value as VoceHome) : undefined;
}

export const Route = createFileRoute("/personale")({
  validateSearch: (search: Record<string, unknown>) => ({ voce: voceHome(search.voce) }),
  component: Page,
});

function Page() {
  return (
    <AppFrame>
      <Area />
    </AppFrame>
  );
}

const emptyCard = {
  id: 0,
  titolo: "",
  ente: "",
  livello: "",
  numero: "",
  rilascio: "",
  scadenza: "",
  note: "",
  profondita: "",
  fileName: "",
  fileType: "",
  fileData: "",
  hasFile: false,
  clearFile: false,
};

const emptyPiece = {
  id: 0,
  nome: "",
  marca: "",
  matricola: "",
  collaudo: "",
  scadenza: "",
  note: "",
};

function Area() {
  const t = useT();
  const frame = useFondale();
  const search = Route.useSearch();
  const [cards, setCards] = useState<Brevetto[] | null>(null);
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [pieces, setPieces] = useState<Pezzo[] | null>(null);
  const [card, setCard] = useState(emptyCard);
  const [piece, setPiece] = useState(emptyPiece);
  const [cardOpen, setCardOpen] = useState(false);
  const [pieceOpen, setPieceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [leggendo, setLeggendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vistaId, setVistaId] = useState<number | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "missing">("default");
  const [phoneOn, setPhoneOn] = useState(false);
  const [voce, setVoce] = useState<Voce | null>(search.voce ?? null);
  const [toolCount, setToolCount] = useState<number | undefined>();
  const [checkCount, setCheckCount] = useState<number | undefined>();
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanCardRef = useRef<HTMLInputElement>(null);
  const ritaglio = useRitaglioDocumento();

  async function load() {
    const [nextCards, nextPieces, nextDocs] = await Promise.all([listBrevetti(), listKit(), listDocumenti()]);
    setCards(nextCards);
    setPieces(nextPieces);
    setDocs(nextDocs);
  }

  useEffect(() => {
    const sync = () => {
      if (typeof Notification === "undefined") setPermission("missing");
      else setPermission(Notification.permission);
      setPhoneOn(notificheTelefonoAttive());
    };
    sync();
    return ascoltaNotificheTelefono(sync);
  }, []);

  useEffect(() => {
    if (search.voce) setVoce(search.voce);
  }, [search.voce]);

  useEffect(() => {
    let live = true;
    Promise.all([listBrevetti(), listKit(), listDocumenti(), listTools()])
      .then(([nextCards, nextPieces, nextDocs, nextTools]) => {
        if (!live) return;
        setCards(nextCards);
        setPieces(nextPieces);
        setDocs(nextDocs);
        setToolCount(nextTools.length);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(messaggioErrore(reason, "Area non disponibile."));
        setCards([]);
        setPieces([]);
        setDocs([]);
      });
    return () => {
      live = false;
    };
  }, [frame.profile?.userId]);

  async function onPicked(file: File | undefined) {
    if (!file) return;
    const scelto = await ritaglio.chiedi(file);
    if (!scelto) return;
    setLeggendo(true);
    setSaved(null);
    setError(null);
    try {
      const prepared = await prepareFile(scelto);
      const letti = await leggiDocumento(await fonteLetturaBrevetto(scelto, prepared.data), prepared.name, "brevetto");
      setCard((current) => ({
        ...current,
        titolo: letti.livello || current.titolo,
        ente: letti.didattica || current.ente,
        livello: letti.livello || current.livello,
        numero: letti.numero || current.numero,
        profondita: letti.profondita || current.profondita,
        rilascio: letti.rilascio || current.rilascio,
        note: [letti.nome, letti.cognome].filter(Boolean).join(" ") || current.note,
        fileName: prepared.name,
        fileType: prepared.type,
        fileData: prepared.data,
        hasFile: true,
        clearFile: false,
      }));
      setSaved(letti.letto ? t("Ho letto alcuni dati. Controllali prima di salvare.") : t("Non ho letto i dati dal file. Compilali a mano."));
    } catch (reason) {
      setError(messaggioErrore(reason, "File non valido."));
    } finally {
      setLeggendo(false);
    }
  }

  async function onScanCard(file: File | undefined) {
    if (!file) return;
    const scelto = await ritaglio.chiedi(file);
    if (!scelto) return;
    setLeggendo(true);
    setError(null);
    setSaved(null);
    try {
      const prepared = await prepareFile(scelto);
      const letti = await leggiDocumento(await fonteLetturaBrevetto(scelto, prepared.data), prepared.name, "brevetto");
      setCard({
        ...emptyCard,
        titolo: letti.livello || "",
        ente: letti.didattica,
        livello: letti.livello,
        numero: letti.numero,
        profondita: letti.profondita,
        rilascio: letti.rilascio,
        note: [letti.nome, letti.cognome].filter(Boolean).join(" "),
        fileName: prepared.name,
        fileType: prepared.type,
        fileData: prepared.data,
        hasFile: true,
      });
      setCardOpen(true);
      setSaved(letti.letto ? t("Ho letto alcuni dati. Controllali prima di salvare.") : t("Non ho letto i dati dal file. Compilali a mano."));
    } catch (reason) {
      setError(messaggioErrore(reason, "File non valido."));
    } finally {
      setLeggendo(false);
    }
  }

  async function saveCard() {
    setBusy(true);
    setError(null);
    try {
      await saveBrevetto({
        data: {
          ...card,
          fileAction: card.clearFile ? "clear" : card.fileData ? "replace" : "keep",
          file: card.fileData ? { name: card.fileName, type: card.fileType, data: await chiudi(card.fileData) } : undefined,
        },
      });
      await load();
      setCard(emptyCard);
      setCardOpen(false);
      setSaved(t("Salvata"));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void avvisaScadenze(await listScadenze(), frame.oggi);
      }
    } catch (reason) {
      setError(messaggioErrore(reason, "Brevetto non salvato. Controlla i campi e tocca Salva."));
    } finally {
      setBusy(false);
    }
  }

  async function removeCard() {
    if (!card.id) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBrevetto({ data: { id: card.id } });
      await load();
      setCard(emptyCard);
      setCardOpen(false);
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a togliere il brevetto."));
    } finally {
      setBusy(false);
    }
  }

  async function savePiece() {
    setBusy(true);
    setError(null);
    try {
      await saveKit({ data: piece });
      await load();
      setPiece(emptyPiece);
      setPieceOpen(false);
      setSaved(t("Salvata"));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        avvisaScadenze(await listScadenze(), frame.oggi);
      }
    } catch (reason) {
      setError(messaggioErrore(reason, "Manutenzione non salvata. Controlla i campi e tocca Salva."));
    } finally {
      setBusy(false);
    }
  }

  async function removePiece() {
    if (!piece.id) return;
    setBusy(true);
    setError(null);
    try {
      await deleteKit({ data: { id: piece.id } });
      await load();
      setPiece(emptyPiece);
      setPieceOpen(false);
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a togliere il pezzo."));
    } finally {
      setBusy(false);
    }
  }

  async function saveDoc(draft: DocDraft) {
    setBusy(true);
    setError(null);
    try {
      await saveDocumento({
        data: {
          ...draft,
          fileAction: draft.clearFile ? "clear" : draft.fileData ? "replace" : "keep",
          file: draft.fileData ? { name: draft.fileName, type: draft.fileType, data: await chiudi(draft.fileData) } : undefined,
        },
      });
      await load();
      setSaved(t("Salvata"));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void avvisaScadenze(await listScadenze(), frame.oggi);
      }
    } catch (reason) {
      setError(messaggioErrore(reason, "Documento non salvato. Controlla i campi e tocca Salva."));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deleteDocumento({ data: { id } });
      await load();
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a togliere il documento."));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  const visto = cards?.find((item) => item.id === vistaId) ?? null;

  if (!voce) return <Navigate to="/" />;

  const conChiave = voce === "brevetti" || voce === "medico" || voce === "assicurazione" || voce === "tools";

  return (
    <div className="mx-auto max-w-3xl">
      {ritaglio.pannello}
      {conChiave && !chiaveMia() ? <ChiaveFile /> : null}
      {permission === "denied" ? (
        <p className="mt-2 text-xs text-mist">{t("Sono bloccati. Sbloccali dalle impostazioni del telefono, alla voce Tritone.")}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {leggendo ? <LetturaInCorso /> : saved && !error ? <p className="mt-3 text-sm text-foam">{saved}</p> : null}

      {voce === "brevetti" ? (
      <section className="mt-8">
        <h2 className="text-2xl">{t("Brevetti")}</h2>
        {cardOpen ? (
          <form
            className="mt-3 rounded-card border border-line bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCard();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Livello / Nome brevetto")}>
                <input
                  required
                  value={card.titolo || card.livello}
                  onChange={(event) => {
                    const nome = event.target.value;
                    setCard({ ...card, titolo: nome, livello: nome });
                  }}
                  className={inputClass}
                  placeholder={t("Open Water, Advanced, Dive Master…")}
                />
              </Field>
              <Field label={t("Ente")}>
                <input value={card.ente} onChange={(event) => setCard({ ...card, ente: event.target.value })} className={inputClass} placeholder="SNSI" />
              </Field>
              <Field label={t("Numero")}>
                <input value={card.numero} onChange={(event) => setCard({ ...card, numero: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Profondità massima")}>
                <input inputMode="decimal" value={card.profondita} onChange={(event) => setCard({ ...card, profondita: event.target.value })} className={inputClass} placeholder={t("metri")} />
              </Field>
              <Field label={t("Rilascio")}>
                <ScadenzaField value={card.rilascio} onChange={(rilascio) => setCard({ ...card, rilascio })} />
              </Field>
              <Field label={t("Scadenza")}>
                <ScadenzaField value={card.scadenza} onChange={(scadenza) => setCard({ ...card, scadenza })} />
              </Field>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-mist">{t("Note")}</span>
                <textarea value={card.note} onChange={(event) => setCard({ ...card, note: event.target.value })} className={`${inputClass} min-h-20 py-2`} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={leggendo} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => photoRef.current?.click()}>
                {t("Foto dal telefono")}
              </button>
              <button type="button" disabled={leggendo} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => fileRef.current?.click()}>
                {t("Scansiona file")}
              </button>
              {card.hasFile && !card.clearFile ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line px-4 text-sm"
                  onClick={() => setCard({ ...card, fileData: "", fileName: "", fileType: "", hasFile: false, clearFile: true })}
                >
                  {t("Togli documento")}
                </button>
              ) : null}
            </div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void onPicked(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(event) => {
                void onPicked(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {card.fileData && !card.clearFile ? <AnteprimaLocale data={card.fileData} type={card.fileType} alt={card.titolo || t("Brevetto")} /> : null}
            {card.id && card.hasFile && !card.fileData && !card.clearFile ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-line">
                <AnteprimaFile id={card.id} enabled load={loadBrevettoFile} alt={card.titolo || t("Brevetto")} />
              </div>
            ) : null}
            {card.fileName && !card.clearFile ? <p className="mt-2 text-xs text-mist">{card.fileName}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
                {busy ? t("Salvo…") : t("Salva brevetto")}
              </button>
              <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => { setCard(emptyCard); setCardOpen(false); }}>
                {t("Chiudi")}
              </button>
              {card.id ? (
                <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm text-danger-soft" onClick={() => void removeCard()}>
                  {t("Elimina")}
                </button>
              ) : null}
            </div>
          </form>
        ) : visto ? (
          <BrevettoVista
            item={visto}
            oggi={frame.oggi}
            onBack={() => setVistaId(null)}
            onEdit={() => {
              setCard({ ...emptyCard, ...visto, fileData: "", clearFile: false });
              setVistaId(null);
              setCardOpen(true);
            }}
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => { setCard(emptyCard); setCardOpen(true); setError(null); }}>
              {t("Aggiungi brevetto")}
            </button>
            <button type="button" disabled={leggendo} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => scanCardRef.current?.click()}>
              {t("Scansiona file")}
            </button>
            <input
              ref={scanCardRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void onScanCard(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        )}
        {cardOpen || visto ? null : cards === null ? <p className="mt-4 text-sm text-mist">{t("Carico i brevetti…")}</p> : null}
        {cardOpen || visto ? null : cards && cards.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessun brevetto ancora.")}</p> : null}
        {cardOpen || visto ? null : (
        <ul className="mt-3 grid gap-2">
          {cards?.map((item) => (
            <li key={item.id}>
              <BrevettoRiga item={item} oggi={frame.oggi} onOpen={() => setVistaId(item.id)} />
            </li>
          ))}
        </ul>
        )}
      </section>
      ) : null}

      {voce === "medico" ? (
      <DocBlock
        kind="medico"
        title={t("Certificato medico")}
        hint={t("Foto dal telefono o PDF. La scadenza arriva sul telefono.")}
        addLabel={t("Aggiungi certificato")}
        saveLabel={t("Salva certificato")}
        nameLabel={t("Tipo")}
        namePlaceholder={t("Agonistico, non agonistico…")}
        whoLabel={t("Medico o struttura")}
        numberLabel={t("Numero")}
        fromLabel={t("Rilascio")}
        items={docs?.filter((item) => item.kind === "medico") ?? null}
        oggi={frame.oggi}
        busy={busy}
        onSave={(draft) => saveDoc(draft)}
        onDelete={(id) => removeDoc(id)}
      />
      ) : null}
      {voce === "assicurazione" ? (
      <DocBlock
        kind="assicurazione"
        title={t("Assicurazione")}
        hint={t("Polizza infortuni o RC. Anche qui foto o file, con avviso di scadenza.")}
        addLabel={t("Aggiungi polizza")}
        saveLabel={t("Salva polizza")}
        nameLabel={t("Polizza")}
        namePlaceholder={t("Infortuni, RC sub…")}
        whoLabel={t("Compagnia")}
        numberLabel={t("Numero polizza")}
        fromLabel={t("Decorrenza")}
        items={docs?.filter((item) => item.kind === "assicurazione") ?? null}
        oggi={frame.oggi}
        busy={busy}
        onSave={(draft) => saveDoc(draft)}
        onDelete={(id) => removeDoc(id)}
      />
      ) : null}

      {voce === "attrezzatura" ? (
      <section className="mt-8">
        <h2 className="text-2xl">{t("Manutenzioni attrezzatura")}</h2>
        <p className="mt-2 text-sm text-mist">{t("Per ogni pezzo: data di collaudo e scadenza. Non è il registro del centro.")}</p>
        {pieceOpen ? (
          <form
            className="mt-3 rounded-card border border-line bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void savePiece();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Pezzo")}>
                <input required value={piece.nome} onChange={(event) => setPiece({ ...piece, nome: event.target.value })} className={inputClass} placeholder={t("GAV, erogatore, computer…")} />
              </Field>
              <Field label={t("Marca")}>
                <input value={piece.marca} onChange={(event) => setPiece({ ...piece, marca: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Matricola")}>
                <input value={piece.matricola} onChange={(event) => setPiece({ ...piece, matricola: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Data collaudo")}>
                <ScadenzaField value={piece.collaudo} onChange={(collaudo) => setPiece({ ...piece, collaudo })} />
              </Field>
              <Field label={t("Scadenza collaudo")}>
                <ScadenzaField value={piece.scadenza} onChange={(scadenza) => setPiece({ ...piece, scadenza })} />
              </Field>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-mist">{t("Note")}</span>
                <textarea value={piece.note} onChange={(event) => setPiece({ ...piece, note: event.target.value })} className={`${inputClass} min-h-20 py-2`} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
                {busy ? t("Salvo…") : t("Salva pezzo")}
              </button>
              <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => { setPiece(emptyPiece); setPieceOpen(false); }}>
                {t("Chiudi")}
              </button>
              {piece.id ? (
                <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm text-danger-soft" onClick={() => void removePiece()}>
                  {t("Elimina")}
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <button type="button" className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => { setPiece(emptyPiece); setPieceOpen(true); setError(null); }}>
            {t("Aggiungi pezzo")}
          </button>
        )}
        {pieces === null ? <p className="mt-4 text-sm text-mist">{t("Carico l'attrezzatura…")}</p> : null}
        {pieces && pieces.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessun pezzo ancora.")}</p> : null}
        <ul className="mt-3 grid gap-2">
          {pieces?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="block min-h-16 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left"
                onClick={() => {
                  setPiece(item);
                  setPieceOpen(true);
                }}
              >
                <p className="text-sm">{item.nome}</p>
                <p className="mt-1 text-xs text-mist">{[item.marca, item.matricola].filter(Boolean).join(" · ") || t("Senza marca")}</p>
                <p className="mt-1 text-xs text-brass">
                  <Stato scadenza={item.scadenza} oggi={frame.oggi} />
                  {item.collaudo ? ` · ${t("collaudo {data}", { data: formatDay(item.collaudo) })}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>
      ) : null}
      {voce === "tools" ? <ToolsPanel onCount={setToolCount} /> : null}
      {voce === "emergenze" ? <Emergenze /> : null}
      {voce === "pianifica" ? (
        frame.abbonamento.ruolo === "sub" || frame.abbonamento.proAperto ? (
          <Suspense fallback={null}>
            <Pianifica onRefuse={() => setVoce(null)} />
          </Suspense>
        ) : (
          <Lucchetto chiusura={frame.abbonamento.chiusura} />
        )
      ) : null}
      {voce === "checklist" ? (
        frame.abbonamento.proAperto ? (
          <ChecklistPanel onCount={setCheckCount} />
        ) : (
          <ChiusoPro />
        )
      ) : null}
      {voce === "mod" ? (
        frame.profile?.role === "subacqueo" || frame.comeCliente ? (
          <div className="mt-4 grid gap-3">
            <ModCalc separato />
            <CnsCalc riquadro />
          </div>
        ) : (
          <ModCalc />
        )
      ) : null}
      {voce === "specie" ? <SpecieSezione pro={specieAperta(frame.abbonamento)} /> : null}
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-lagoon";

type Voce = "brevetti" | "medico" | "assicurazione" | "attrezzatura" | "tools" | "checklist" | "pianifica" | "mod" | "specie" | "emergenze";

function specieAperta(abb: { proAperto: boolean; ruolo: string }) {
  return abb.proAperto || abb.ruolo === "staff" || abb.ruolo === "titolare";
}

function ChiusoPro() {
  const t = useT();
  return (
    <section className="mt-8">
      <p className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm">
        <Lock className="size-4 text-brass" aria-hidden />
        {t("Disponibile con Pro")}
      </p>
    </section>
  );
}
function Emergenze() {
  const t = useT();
  const numeri = [
    { nome: "Capitaneria di Porto", numero: "1530", tel: "tel:1530" },
    { nome: "Emergenza", numero: "112", tel: "tel:112" },
    { nome: "DAN Europe", numero: "+39 06 4211 5685", tel: "tel:+390642115685" },
  ];

  const protocolli = [
    {
      titolo: "Sospetta malattia da decompressione (DCS / DCI)",
      testo: `I sintomi possono comparire da pochi minuti fino a diverse ore dopo l’emersione (dolore articolare, formicolii, debolezza, alterazioni neurologiche, stanchezza marcata, rash).

Azioni immediate:
• Valuta ABC e inizia BLS/CPR se necessario.
• Chiama il 112 specificando “incidente subacqueo / sospetta malattia da decompressione”. Subito dopo contatta il DAN Europe (+39 06 4211 5685).
• Posiziona la persona in decubito orizzontale (o laterale di sicurezza in caso di vomito o riduzione dello stato di coscienza).
• Somministra ossigeno normobarico al 100% il prima possibile e continua senza interruzioni fino all’arrivo del personale sanitario.
• Se la persona è cosciente, orientata e non vomita, consenti l’assunzione di acqua a piccoli sorsi (circa 1 litro in un’ora).
• Evita movimenti inutili e qualsiasi tentativo di ricompressione in acqua.
• Annota ora dell’emersione, profilo dell’immersione e sintomi.`,
    },
    {
      titolo: "Embolia gassosa arteriosa (AGE)",
      testo: `L’AGE è un’emergenza tempo-dipendente. I sintomi compaiono di solito entro pochi minuti dalla risalita (alterazione della coscienza, deficit neurologici focali, convulsioni, dolore toracico, dispnea, collasso).

Azioni immediate:
• Valuta ABC e inizia BLS/CPR se la persona non respira o non ha polso.
• Chiama immediatamente il 112 specificando “incidente subacqueo / sospetta embolia gassosa”. Subito dopo contatta il DAN Europe (+39 06 4211 5685).
• Posiziona la persona in decubito orizzontale (o laterale di sicurezza in caso di vomito o riduzione dello stato di coscienza). Evita la posizione Trendelenburg.
• Somministra ossigeno normobarico al 100% il prima possibile (maschera con reservoir o demand valve) e continua senza interruzioni fino all’arrivo del personale sanitario.
• Se la persona è cosciente, orientata e non vomita, consenti l’assunzione di acqua a piccoli sorsi.
• Non ritardare ossigeno o allarme per manovre non essenziali. Non tentare ricompressione in acqua.
• Annota ora precisa dell’emersione, profilo dell’immersione e evoluzione dei sintomi.

Priorità assoluta: ossigeno continuo e trasporto rapido verso struttura con camera iperbarica.`,
    },
    {
      titolo: "Trauma da fauna marina",
      testo: `Organismi urticanti (meduse e simili):
• Allontana dalla zona e risciacqua abbondantemente con acqua di mare (mai acqua dolce).
• Rimuovi i tentacoli residui con pinzette o guanti senza strofinare la pelle.
• Se disponibile e tollerata, applica acqua calda a 40-45 °C sulla zona per il controllo del dolore.
• In caso di reazioni sistemiche (difficoltà respiratoria, edema importante, shock) chiama immediatamente il 112.

Lesioni da spine (razze, scorfani e simili):
• Non rimuovere spine o frammenti conficcati in profondità.
• Controlla eventuali emorragie con compressione diretta.
• Immergi la zona in acqua calda a 40-45 °C per il dolore, se possibile e tollerata.
• Stabilizza, copri e recati in pronto soccorso per detersione, profilassi e valutazione (alto rischio di infezione).`,
    },
    {
      titolo: "Compagno disperso",
      testo: `Azioni immediate:
• Fermati subito e mantieni assetto neutro.
• Esegui una ricerca visiva a 360° (sopra, sotto e intorno), cercando anche le bolle, per massimo 1 minuto.
• Se non localizzato, inizia una risalita controllata continuando a cercare, effettua la safety stop e lancia il pallone di segnalazione.
• In superficie effettua un’ulteriore ricerca visiva per alcuni minuti.
• Se il compagno non compare, avvisa immediatamente la barca o contatta Capitaneria di Porto / 112.`,
    },
  ];

  return (
    <section className="mt-6">
      <h2 className="text-2xl">{t("Emergenze")}</h2>
      <p className="mt-3 text-sm">{t("In pericolo di vita chiama prima il 112.")}</p>
      <ul className="mt-4 grid gap-3">
        {numeri.map((voce) => (
          <li key={voce.tel}>
            <a href={voce.tel} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-deep px-4 py-3">
              <span className="text-sm font-medium">{t(voce.nome)}</span>
              <span className="shrink-0 text-sm text-lagoon">{voce.numero}</span>
            </a>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-lg font-medium">{t("Protocolli di primo soccorso")}</h3>
      <p className="mt-1 text-xs text-mist">{t("Indicazioni di primo soccorso basate su DAN. Non sostituiscono il soccorso medico.")}</p>
      <div className="mt-4 grid gap-3">
        {protocolli.map((p) => (
          <details key={p.titolo} className="rounded-2xl border border-line bg-deep">
            <summary className="min-h-16 cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {t(p.titolo)}
            </summary>
            <div className="whitespace-pre-line border-t border-line px-4 py-3 text-sm leading-relaxed">
              {p.testo}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block text-sm">
      <span className="mb-1 block text-mist">{label}</span>
      {children}
    </div>
  );
}

function Stato({ scadenza, oggi }: { scadenza: string; oggi: string }) {
  const t = useT();
  const state = scadenzaStato(scadenza, oggi);
  if (state === "mancante") return <span>{t("Senza scadenza")}</span>;
  if (state === "scaduta") return <span>{t("Scaduto il {data}", { data: formatDay(scadenza) })}</span>;
  if (state === "in-scadenza") return <span>{t("Scade il {data}", { data: formatDay(scadenza) })}</span>;
  return <span>{t("In regola fino al {data}", { data: formatDay(scadenza) })}</span>;
}

type DocDraft = {
  id: number;
  kind: DocumentoKind;
  titolo: string;
  soggetto: string;
  numero: string;
  rilascio: string;
  scadenza: string;
  note: string;
  fileName: string;
  fileType: string;
  fileData: string;
  hasFile: boolean;
  clearFile: boolean;
};

function emptyDoc(kind: DocumentoKind): DocDraft {
  return {
    id: 0,
    kind,
    titolo: "",
    soggetto: "",
    numero: "",
    rilascio: "",
    scadenza: "",
    note: "",
    fileName: "",
    fileType: "",
    fileData: "",
    hasFile: false,
    clearFile: false,
  };
}

function DocBlock({
  kind,
  title,
  hint,
  addLabel,
  saveLabel,
  nameLabel,
  namePlaceholder,
  whoLabel,
  numberLabel,
  fromLabel,
  items,
  oggi,
  busy,
  onSave,
  onDelete,
}: {
  kind: DocumentoKind;
  title: string;
  hint: string;
  addLabel: string;
  saveLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  whoLabel: string;
  numberLabel: string;
  fromLabel: string;
  items: Documento[] | null;
  oggi: string;
  busy: boolean;
  onSave: (draft: DocDraft) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [vistaId, setVistaId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DocDraft>(() => emptyDoc(kind));
  const [fileError, setFileError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [leggendoDoc, setLeggendoDoc] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const ritaglioDoc = useRitaglioDocumento();
  const visto = items?.find((item) => item.id === vistaId) ?? null;

  async function onPicked(file: File | undefined) {
    if (!file) return;
    const scelto = await ritaglioDoc.chiedi(file);
    if (!scelto) return;
    setLeggendoDoc(true);
    setScanNote(null);
    setFileError(null);
    try {
      const prepared = await prepareFile(scelto);
      const letti = await leggiDocumento(prepared.data, prepared.name, kind);
      const persona = [letti.nome, letti.cognome].filter(Boolean).join(" ");
      setDraft((current) => ({
        ...current,
        titolo: current.titolo || (letti.letto ? (kind === "medico" ? "Certificato medico" : letti.soggetto || "Assicurazione") : ""),
        soggetto: letti.soggetto || current.soggetto,
        numero: letti.numero || current.numero,
        rilascio: letti.rilascio || current.rilascio,
        scadenza: letti.scadenza || current.scadenza,
        note: persona || current.note,
        fileName: prepared.name,
        fileType: prepared.type,
        fileData: prepared.data,
        hasFile: true,
        clearFile: false,
      }));
      setScanNote(letti.letto ? t("Ho letto alcuni dati. Controllali prima di salvare.") : t("Non ho letto i dati dal file. Compilali a mano."));
    } catch (reason) {
      setFileError(messaggioErrore(reason, "File non valido."));
    } finally {
      setLeggendoDoc(false);
    }
  }

  async function onScan(file: File | undefined) {
    if (!file) return;
    const scelto = await ritaglioDoc.chiedi(file);
    if (!scelto) return;
    setFileError(null);
    setScanNote(null);
    setLeggendoDoc(true);
    try {
      const prepared = await prepareFile(scelto);
      const letti = await leggiDocumento(prepared.data, prepared.name, kind);
      const persona = [letti.nome, letti.cognome].filter(Boolean).join(" ");
      setDraft({
        ...emptyDoc(kind),
        titolo: letti.letto ? (kind === "medico" ? "Certificato medico" : letti.soggetto || "Assicurazione") : "",
        soggetto: letti.soggetto,
        numero: letti.numero,
        rilascio: letti.rilascio,
        scadenza: letti.scadenza,
        note: persona,
        fileName: prepared.name,
        fileType: prepared.type,
        fileData: prepared.data,
        hasFile: true,
        clearFile: false,
      });
      setOpen(true);
      setScanNote(letti.letto ? t("Ho letto alcuni dati. Controllali prima di salvare.") : t("Non ho letto i dati dal file. Compilali a mano."));
    } catch (reason) {
      setFileError(messaggioErrore(reason, "File non valido."));
    } finally {
      setLeggendoDoc(false);
    }
  }

  return (
    <section className="mt-10">
      {ritaglioDoc.pannello}
      <h2 className="text-2xl">{title}</h2>
      <p className="mt-2 text-sm text-mist">{hint}</p>
      {leggendoDoc ? <LetturaInCorso /> : scanNote ? <p className="mt-2 text-sm text-mist">{scanNote}</p> : null}
      {open ? (
        <form
          className="mt-3 rounded-card border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(draft)
              .then(() => {
                setDraft(emptyDoc(kind));
                setOpen(false);
              })
              .catch(() => undefined);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={nameLabel}>
              <input required value={draft.titolo} onChange={(event) => setDraft({ ...draft, titolo: event.target.value })} className={inputClass} placeholder={namePlaceholder} />
            </Field>
            <Field label={whoLabel}>
              <input value={draft.soggetto} onChange={(event) => setDraft({ ...draft, soggetto: event.target.value })} className={inputClass} />
            </Field>
            <Field label={numberLabel}>
              <input value={draft.numero} onChange={(event) => setDraft({ ...draft, numero: event.target.value })} className={inputClass} />
            </Field>
            <Field label={fromLabel}>
              <ScadenzaField value={draft.rilascio} onChange={(rilascio) => setDraft({ ...draft, rilascio })} />
            </Field>
            <Field label={t("Scadenza")}>
              <ScadenzaField value={draft.scadenza} onChange={(scadenza) => setDraft({ ...draft, scadenza })} />
            </Field>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-mist">{t("Note")}</span>
              <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={`${inputClass} min-h-20 py-2`} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={leggendoDoc} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => photoRef.current?.click()}>
              {t("Foto dal telefono")}
            </button>
            <button type="button" disabled={leggendoDoc} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => fileRef.current?.click()}>
              {t("Scansiona file")}
            </button>
            {draft.hasFile && !draft.clearFile ? (
              <button
                type="button"
                className="min-h-11 rounded-full border border-line px-4 text-sm"
                onClick={() => setDraft({ ...draft, fileData: "", fileName: "", fileType: "", hasFile: false, clearFile: true })}
              >
                {t("Togli documento")}
              </button>
            ) : null}
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void onPicked(event.target.files?.[0])
                .then(() => setFileError(null))
                .catch((reason: unknown) => {
                  setFileError(messaggioErrore(reason, "File non valido."));
                });
              event.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              void onPicked(event.target.files?.[0])
                .then(() => setFileError(null))
                .catch((reason: unknown) => {
                  setFileError(messaggioErrore(reason, "File non valido."));
                });
              event.target.value = "";
            }}
          />
          {fileError ? <p className="mt-2 text-sm text-brass">{fileError}</p> : null}
          {draft.fileData && !draft.clearFile ? <AnteprimaLocale data={draft.fileData} type={draft.fileType} alt={draft.titolo || title} /> : null}
          {draft.id && draft.hasFile && !draft.fileData && !draft.clearFile ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-line">
              <AnteprimaFile id={draft.id} enabled load={loadDocumentoFile} alt={draft.titolo || title} />
            </div>
          ) : null}
          {draft.fileName && !draft.clearFile ? <p className="mt-2 text-xs text-mist">{draft.fileName}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
              {busy ? t("Salvo…") : saveLabel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-line px-4 text-sm"
              onClick={() => {
                setDraft(emptyDoc(kind));
                setOpen(false);
              }}
            >
              {t("Chiudi")}
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-full border border-line px-4 text-sm text-danger-soft"
                onClick={() => {
                  void onDelete(draft.id)
                    .then(() => {
                      setDraft(emptyDoc(kind));
                      setOpen(false);
                    })
                    .catch(() => undefined);
                }}
              >
                {t("Elimina")}
              </button>
            ) : null}
          </div>
        </form>
      ) : visto ? (
        <DocVista
          item={visto}
          oggi={oggi}
          onBack={() => setVistaId(null)}
          onEdit={() => {
            setDraft({ ...emptyDoc(kind), ...visto, fileData: "", clearFile: false });
            setVistaId(null);
            setOpen(true);
          }}
        />
      ) : (
        <>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
            onClick={() => {
              setDraft(emptyDoc(kind));
              setScanNote(null);
              setOpen(true);
            }}
          >
            {addLabel}
          </button>
          <button type="button" disabled={leggendoDoc} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => scanRef.current?.click()}>
            {t("Scansiona file")}
          </button>
        </div>
        <input
          ref={scanRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void onScan(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {fileError ? <p className="mt-2 text-sm text-brass">{fileError}</p> : null}
        </>
      )}
      {open || visto ? null : items === null ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {open || visto ? null : items && items.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Niente ancora.")}</p> : null}
      {open || visto ? null : (
      <ul className="mt-3 grid gap-2">
        {items?.map((item) => (
          <li key={item.id}>
            <DocRiga
              item={item}
              oggi={oggi}
              onOpen={() => setVistaId(item.id)}
            />
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}

function BrevettoRiga({ item, oggi, onOpen }: { item: Brevetto; oggi: string; onOpen: () => void }) {
  const t = useT();
  const { file } = useAllegato(item.id, item.hasFile, loadBrevettoFile);
  return (
    <button type="button" className="flex min-h-24 w-full gap-3 rounded-2xl border border-line bg-surface p-3 text-left" onClick={onOpen}>
      <span className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-deep">
        {file?.type.startsWith("image/") ? <img src={file.data} alt="" className="h-full w-full object-cover" /> : item.hasFile ? <span className="px-1 text-center text-[10px] text-mist">{file ? "PDF" : "…"}</span> : <span className="text-[10px] text-mist">{t("Niente foto")}</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-sm">{item.titolo || item.livello}</span>
        <span className="mt-1 block text-xs text-mist">{[item.ente, item.numero].filter(Boolean).join(" · ") || t("Senza altri dati")}</span>
        <span className="mt-1 block text-xs text-brass">
          <Stato scadenza={item.scadenza} oggi={oggi} />
          {item.rilascio ? ` · ${t("rilasciato {data}", { data: formatDay(item.rilascio) })}` : ""}
        </span>
      </span>
    </button>
  );
}

function BrevettoVista({ item, oggi, onBack, onEdit }: { item: Brevetto; oggi: string; onBack: () => void; onEdit: () => void }) {
  const t = useT();
  const { file, failed } = useAllegato(item.id, item.hasFile, loadBrevettoFile);
  const [piena, setPiena] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" className="min-h-11 text-sm text-brass" onClick={onBack}>{t("Torna all'elenco")}</button>
      {item.hasFile ? (
        file ? (
          <button type="button" className="mt-3 block w-full overflow-hidden rounded-2xl border border-line bg-deep" onClick={() => setPiena(true)}>
            {file.type.startsWith("image/") ? (
              <img src={file.data} alt={item.titolo} className="max-h-[70vh] w-full object-contain" />
            ) : (
              <span className="grid min-h-40 place-items-center px-4 text-sm">{t("PDF · tocca per leggerlo")}</span>
            )}
          </button>
        ) : (
          <p className="mt-3 text-sm text-mist">{failed ? t("Su questo telefono non c'è la chiave dei file. Incollala qui sopra.") : t("Apro la foto…")}</p>
        )
      ) : (
        <p className="mt-3 text-sm text-mist">{t("Nessuna foto allegata.")}</p>
      )}
      <h3 className="mt-4 text-2xl">{item.titolo || item.livello}</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <Info label={t("Ente")} value={item.ente} />
        <Info label={t("Numero")} value={item.numero} />
        <Info label={t("Profondità massima")} value={item.profondita ? `${item.profondita} m` : ""} />
        <Info label={t("Rilascio")} value={item.rilascio ? formatDay(item.rilascio) : ""} />
        <Info label={t("Scadenza")} value={item.scadenza ? "" : t("Senza scadenza")} />
        {item.scadenza ? (
          <div>
            <dt className="text-mist">{t("Stato")}</dt>
            <dd><Stato scadenza={item.scadenza} oggi={oggi} /></dd>
          </div>
        ) : null}
        <Info label={t("Note")} value={item.note} />
      </dl>
      <button type="button" className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm" onClick={onEdit}>{t("Modifica")}</button>
      {piena && file ? <FotoPiena src={file.data} alt={item.titolo} onClose={() => setPiena(false)} /> : null}
    </div>
  );
}

function DocRiga({ item, oggi, onOpen }: { item: Documento; oggi: string; onOpen: () => void }) {
  const t = useT();
  const { file } = useAllegato(item.id, item.hasFile, loadDocumentoFile);
  return (
    <button type="button" className="flex min-h-24 w-full gap-3 rounded-2xl border border-line bg-surface p-3 text-left" onClick={onOpen}>
      <span className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-deep">
        {file?.type.startsWith("image/") ? <img src={file.data} alt="" className="h-full w-full object-cover" /> : item.hasFile ? <span className="px-1 text-center text-[10px] text-mist">{file ? "PDF" : "…"}</span> : <span className="text-[10px] text-mist">{t("Niente foto")}</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-sm">{item.titolo}</span>
        <span className="mt-1 block text-xs text-mist">{[item.soggetto, item.numero].filter(Boolean).join(" · ") || t("Senza altri dati")}</span>
        <span className="mt-1 block text-xs text-brass">
          <Stato scadenza={item.scadenza} oggi={oggi} />
          {item.rilascio ? ` · ${formatDay(item.rilascio)}` : ""}
        </span>
      </span>
    </button>
  );
}

function DocVista({ item, oggi, onBack, onEdit }: { item: Documento; oggi: string; onBack: () => void; onEdit: () => void }) {
  const t = useT();
  const { file, failed } = useAllegato(item.id, item.hasFile, loadDocumentoFile);
  const [piena, setPiena] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" className="min-h-11 text-sm text-brass" onClick={onBack}>{t("Torna all'elenco")}</button>
      {item.hasFile ? (
        file ? (
          <button type="button" className="mt-3 block w-full overflow-hidden rounded-2xl border border-line bg-deep" onClick={() => setPiena(true)}>
            {file.type.startsWith("image/") ? (
              <img src={file.data} alt={item.titolo} className="max-h-[70vh] w-full object-contain" />
            ) : (
              <span className="grid min-h-40 place-items-center px-4 text-sm">{t("PDF · tocca per leggerlo")}</span>
            )}
          </button>
        ) : (
          <p className="mt-3 text-sm text-mist">{failed ? t("Su questo telefono non c'è la chiave dei file. Incollala qui sopra.") : t("Apro la foto…")}</p>
        )
      ) : (
        <p className="mt-3 text-sm text-mist">{t("Nessuna foto allegata.")}</p>
      )}
      <h3 className="mt-4 text-2xl">{item.titolo}</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <Info label={t("Riferimento")} value={item.soggetto} />
        <Info label={t("Numero")} value={item.numero} />
        <Info label={t("Data")} value={item.rilascio ? formatDay(item.rilascio) : ""} />
        {item.scadenza ? (
          <div>
            <dt className="text-mist">{t("Stato")}</dt>
            <dd><Stato scadenza={item.scadenza} oggi={oggi} /></dd>
          </div>
        ) : (
          <Info label={t("Scadenza")} value={t("Senza scadenza")} />
        )}
        <Info label={t("Note")} value={item.note} />
      </dl>
      <button type="button" className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm" onClick={onEdit}>{t("Modifica")}</button>
      {piena && file ? <FotoPiena src={file.data} alt={item.titolo} onClose={() => setPiena(false)} /> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-mist">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function loadBrevettoFile(id: number) {
  return getBrevettoFile({ data: { id } }).then(apriFile);
}

function loadDocumentoFile(id: number) {
  return getDocumentoFile({ data: { id } }).then(apriFile);
}

async function chiudi(dataUrl: string) {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const closed = await cifraFile(dataUrl);
  return closed.busta;
}

async function apriFile(file: { name: string; type: string; data: string }) {
  if (!file.data.startsWith("{")) return file;
  return { ...file, data: await decifraFile(file.data) };
}

function ChiaveFile() {
  const t = useT();
  const [presa, setPresa] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-2 rounded-card border border-line px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          importaChiaveMia(presa.trim());
          setNote(t("Codice salvato su questo telefono."));
          window.location.reload();
        } catch {
          setNote(t("Codice non valido."));
        }
      }}
    >
      <p className="text-sm text-mist">{t("Su questo telefono manca il codice dei file. Incolla quello che hai salvato, oppure copialo da Profilo, Impostazioni, sul telefono vecchio.")}</p>
      <textarea value={presa} onChange={(event) => setPresa(event.target.value)} placeholder={t("Codice di un altro telefono")} className="min-h-20 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" />
      <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
        {t("Salva il codice su questo telefono")}
      </button>
      {note ? <p className="text-xs text-brass">{note}</p> : null}
    </form>
  );
}
