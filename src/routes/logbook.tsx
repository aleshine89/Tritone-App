import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { AppFrame, useFondale } from "@/components/app-frame";
import { DiveAtlas, DiveMap } from "@/components/dive-map";
import { FotoPiena } from "@/components/foto-vista";
import { Lucchetto } from "@/components/lucchetto";
import { ScambioLogbook } from "@/components/logbook-uddf";
import { addLogPhoto, deleteLogPhoto, deleteLogVoice, deleteLogbook, getLogVoice, listLogPhotos, listLogbook, saveLogVoice, saveLogbook, accettaCondivisione, cercaCompagni, condividiImmersione, leggiCondivisione, type CompagnoLogbook, type LogEntry } from "@/lib/fondale.functions";
import { ScadenzaField } from "@/components/scadenza-field";
import { formatDay } from "@/lib/format";
import { CHIAVE_PIANO_LOGBOOK } from "@/lib/planner";
import { messaggioErrore, useT } from "@/lib/i18n";
import { isStaff } from "@/lib/forms";
import { prepareFile } from "@/lib/prepare-file";
import { SpecieLogbook } from "@/components/specie-sezione";
import { salvaSpecieImmersione } from "@/lib/scubadex.functions";

export const Route = createFileRoute("/logbook")({
  validateSearch: (search: Record<string, unknown>) => ({
    nuova: search.nuova === 1 || search.nuova === "1" ? 1 : undefined,
    condivisione: Number.isInteger(Number(search.condivisione)) && Number(search.condivisione) > 0 ? Number(search.condivisione) : undefined,
  }),
  component: Page,
});

function Page() {
  return (
    <AppFrame>
      <LogbookGate />
    </AppFrame>
  );
}

function LogbookGate() {
  const t = useT();
  const frame = useFondale();
  const nelDiving = Boolean(frame.profile) && !frame.comeCliente && frame.profile?.role !== "subacqueo" && (frame.owner || isStaff(frame.profile?.role) || frame.desk);
  if (!nelDiving) return <Logbook />;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl leading-none">{t("Logbook")}</h1>
      <p className="mt-3 text-sm text-mist">{t("È nel tuo account da subacqueo, non nella gestione del diving.")}</p>
      <button type="button" className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => frame.setComeCliente(true)}>
        {t("Subacqueo")}
      </button>
    </div>
  );
}

const empty = {
  id: 0,
  data: "",
  localita: "",
  punto: "",
  profondita: "",
  minuti: "",
  buddy: "",
  miscela: "Aria",
  ossigeno: "",
  temperatura: "",
  visibilita: "",
  note: "",
  lat: "",
  lng: "",
  ora: "",
  foto: 0,
  voce: 0,
  condivisaDa: "",
};

type Shot = { key: string; id: number; name: string; type: string; data: string };
type VoiceClip = { type: string; data: string; fresh: boolean };

function leggiPianoLogbook(): { profondita: string; minuti: string; miscela: "Aria" | "Nitrox" | "Trimix"; ossigeno: string; note: string } | null {
  try {
    const raw = sessionStorage.getItem(CHIAVE_PIANO_LOGBOOK);
    if (!raw) return null;
    const data = JSON.parse(raw) as { profondita?: unknown; minuti?: unknown; miscela?: unknown; ossigeno?: unknown; note?: unknown };
    const miscela = data.miscela === "Nitrox" || data.miscela === "Trimix" ? data.miscela : "Aria";
    window.setTimeout(() => sessionStorage.removeItem(CHIAVE_PIANO_LOGBOOK), 800);
    return {
      profondita: typeof data.profondita === "string" ? data.profondita.slice(0, 12) : "",
      minuti: typeof data.minuti === "string" ? data.minuti.slice(0, 12) : "",
      miscela,
      ossigeno: typeof data.ossigeno === "string" ? data.ossigeno.slice(0, 12) : "",
      note: typeof data.note === "string" ? data.note.slice(0, 2000) : "",
    };
  } catch {
    return null;
  }
}

function Logbook() {
  const t = useT();
  const frame = useFondale();
  const [items, setItems] = useState<LogEntry[] | null>(null);
  const [draft, setDraft] = useState(empty);
  const [shots, setShots] = useState<Shot[]>([]);
  const [drop, setDrop] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [cartolina, setCartolina] = useState<{ localita: string; punto: string; profondita: string; minuti: string; foto: string | null } | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [seen, setSeen] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [hadVoice, setHadVoice] = useState(false);
  const [recording, setRecording] = useState(false);
  const [scambio, setScambio] = useState<null | "importa" | "esporta">(null);
  const [condividi, setCondividi] = useState<LogEntry | null>(null);
  const [shareId, setShareId] = useState<number | null>(null);
  const [shareNome, setShareNome] = useState("");
  const [specieIds, setSpecieIds] = useState<string[]>([]);
  const [speciePronte, setSpeciePronte] = useState(true);
  const photoRef = useRef<HTMLInputElement>(null);
  const voiceReq = useRef(0);
  const openedNew = useRef(false);
  const openedShare = useRef(0);
  const search = Route.useSearch();
  const navigate = useNavigate();

  function beginNew(last?: LogEntry) {
    const piano = leggiPianoLogbook();
    setDraft({
      ...empty,
      data: frame.oggi,
      localita: last?.localita ?? "",
      punto: last?.punto ?? "",
      miscela: piano?.miscela ?? (last?.miscela === "Nitrox" || last?.miscela === "Trimix" ? last.miscela : "Aria"),
      ossigeno: piano?.ossigeno ?? last?.ossigeno ?? "",
      profondita: piano?.profondita ?? "",
      minuti: piano?.minuti ?? "",
      note: piano?.note ?? "",
    });
    setShots([]);
    setDrop([]);
    setPreview(null);
    setClip(null);
    setHadVoice(false);
    setModifica(true);
    setOpen(true);
    setError(null);
    setSaved(null);
    setSpecieIds([]);
    setSpeciePronte(true);
  }

  useEffect(() => {
    if (search.nuova !== 1 || items === null || openedNew.current) return;
    openedNew.current = true;
    beginNew(items[0]);
  }, [search.nuova, items]);

  useEffect(() => {
    const id = search.condivisione;
    if (!id || openedShare.current === id) return;
    openedShare.current = id;
    void leggiCondivisione({ data: { id } })
      .then((dive) => {
        setShareId(id);
        setShareNome(dive.da);
        setDraft({
          ...empty,
          data: dive.data,
          localita: dive.localita,
          punto: dive.punto,
          profondita: dive.profondita,
          minuti: dive.minuti,
          buddy: dive.buddy,
          miscela: dive.miscela,
          ossigeno: dive.ossigeno,
          temperatura: dive.temperatura,
          visibilita: dive.visibilita,
          note: dive.note,
          lat: dive.lat,
          lng: dive.lng,
          ora: dive.ora,
          condivisaDa: dive.da,
        });
        setShots([]);
        setDrop([]);
        setPreview(null);
        setClip(null);
        setHadVoice(false);
        setModifica(true);
        setOpen(true);
        setError(null);
        setSpecieIds([]);
        setSpeciePronte(true);
      })
      .catch((reason: unknown) => setError(messaggioErrore(reason, "Questa immersione non è più in attesa.")));
  }, [search.condivisione]);

  function point(lat: string, lng: string) {
    setDraft((current) => ({ ...current, lat, lng }));
  }

  function fromPhone() {
    if (!navigator.geolocation) {
      setError(t("Questo telefono non dà la posizione. Tocca la mappa per metterla."));
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => point(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6)),
      () => setError(t("Posizione non disponibile. Attiva il permesso del telefono, oppure tocca la mappa.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (!open || (draft.id && !modifica)) return;
    const entryId = draft.id;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => {
          if (current.id !== entryId || (current.lat && current.lng)) return current;
          return {
            ...current,
            lat: position.coords.latitude.toFixed(6),
            lng: position.coords.longitude.toFixed(6),
          };
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }, [open, draft.id, modifica]);

  async function load() {
    setItems(await listLogbook());
  }

  useEffect(() => {
    let live = true;
    listLogbook()
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(messaggioErrore(reason, "Logbook non aperto. Controlla la rete e riapri la pagina."));
        setItems([]);
      });
    return () => {
      live = false;
    };
  }, [frame.profile?.userId]);

  function edit(entry: LogEntry) {
    setDraft(entry);
    setModifica(false);
    setOpen(true);
    setError(null);
    setDrop([]);
    setPreview(null);
    setShots([]);
    setClip(null);
    setHadVoice(false);
    setSpecieIds([]);
    setSpeciePronte(false);
    const req = ++voiceReq.current;
    void listLogPhotos({ data: { id: entry.id } })
      .then((rows) => {
        setShots(rows.map((row) => ({ key: `s-${row.id}`, id: row.id, name: row.name, type: "image/jpeg", data: row.data })));
      })
      .catch((reason: unknown) => {
        setError(messaggioErrore(reason, "Foto non aperta. Tocca di nuovo l'immersione."));
      });
    void getLogVoice({ data: { id: entry.id } })
      .then((voice) => {
        if (req !== voiceReq.current || !voice) return;
        setClip({ type: voice.type, data: voice.data, fresh: false });
        setHadVoice(true);
      })
      .catch((reason: unknown) => {
        setError(messaggioErrore(reason, "Nota vocale non aperta. Tocca di nuovo l'immersione."));
      });
  }

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    try {
      const next: Shot[] = [];
      for (const file of Array.from(list)) {
        const prepared = await prepareFile(file);
        if (!prepared.type.startsWith("image/")) throw new Error("Qui si aggiungono solo foto.");
        next.push({ key: crypto.randomUUID(), id: 0, ...prepared });
      }
      setShots((current) => {
        const merged = [...current, ...next];
        if (merged.length > 12) setError(t("Puoi aggiungere fino a 12 foto per immersione."));
        return merged.slice(0, 12);
      });
    } catch (reason) {
      setError(messaggioErrore(reason, "Foto non aggiunta. Scegline una JPG e tocca di nuovo."));
    }
  }

  function close() {
    setDraft(empty);
    setShots([]);
    setDrop([]);
    setPreview(null);
    setClip(null);
    setHadVoice(false);
    setRecording(false);
    setModifica(false);
    setShareId(null);
    setShareNome("");
    setSpecieIds([]);
    setSpeciePronte(true);
    voiceReq.current += 1;
    setOpen(false);
    setError(null);
  }

  const cambiaSpecie = useCallback((ids: string[]) => {
    setSpecieIds(ids);
    setSpeciePronte(true);
  }, []);
  const speciePro = frame.abbonamento.proAperto || frame.abbonamento.ruolo === "staff" || frame.abbonamento.ruolo === "titolare";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!draft.data) throw new Error("Manca la data. Sceglila e tocca Salva.");
      if (shareId) {
        const accepted = await accettaCondivisione({
          data: {
            id: shareId,
            immersione: {
              data: draft.data,
              localita: draft.localita,
              punto: draft.punto,
              profondita: draft.profondita,
              minuti: draft.minuti,
              buddy: draft.buddy,
              miscela: draft.miscela,
              ossigeno: draft.ossigeno,
              temperatura: draft.temperatura,
              visibilita: draft.visibilita,
              note: draft.note,
              lat: draft.lat,
              lng: draft.lng,
              ora: draft.ora,
            },
          },
        });
        if (speciePro && specieIds.length) {
          await salvaSpecieImmersione({ data: { entryId: accepted.id, ids: specieIds, giorno: draft.data } });
        }
        await load();
        await frame.refresh();
        close();
        setSaved(t("Salvata"));
        void navigate({ to: "/logbook", search: { nuova: undefined, condivisione: undefined } });
        return;
      }
      const savedEntry = await saveLogbook({ data: draft });
      if (speciePro && (draft.id === 0 || speciePronte)) {
        await salvaSpecieImmersione({ data: { entryId: savedEntry.id, ids: specieIds, giorno: draft.data } });
      }
      for (const id of drop) await deleteLogPhoto({ data: { id } });
      for (const shot of shots.filter((item) => item.id === 0)) {
        await addLogPhoto({ data: { entryId: savedEntry.id, file: { name: shot.name, type: shot.type, data: shot.data } } });
      }
      if (clip?.fresh) {
        await saveLogVoice({ data: { entryId: savedEntry.id, file: { type: clip.type, data: clip.data } } });
      } else if (!clip && hadVoice) {
        await deleteLogVoice({ data: { id: savedEntry.id } });
      }
      await load();
      setCartolina({
        localita: draft.localita,
        punto: draft.punto,
        profondita: draft.profondita,
        minuti: draft.minuti,
        foto: shots[0]?.data ?? null,
      });
      close();
      setSaved(t("Salvata"));
    } catch (reason) {
      setError(messaggioErrore(reason, "Non salvata. Controlla data e località, poi tocca Salva."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLogbook({ data: { id: draft.id } });
      await load();
      close();
    } catch (reason) {
      setError(messaggioErrore(reason, "Non tolta. Tocca Elimina di nuovo."));
    } finally {
      setBusy(false);
    }
  }

  const rows = items ?? [];
  const minutes = rows.reduce((sum, row) => sum + (Number(row.minuti) || 0), 0);
  const deepest = rows.reduce((max, row) => Math.max(max, Number(row.profondita) || 0), 0);
  const spots = rows.filter((row) => row.lat && row.lng).map((row) => ({ lat: row.lat, lng: row.lng, label: row.localita }));
  const first = rows[0];

  useEffect(() => {
    if (!first?.foto) {
      setCover(null);
      return;
    }
    let live = true;
    listLogPhotos({ data: { id: first.id } })
      .then((photos) => {
        if (live) setCover(photos[0]?.data ?? null);
      })
      .catch(() => {
        if (live) setCover(null);
      });
    return () => {
      live = false;
    };
  }, [first?.id, first?.foto]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-none">{t("Logbook")}</h1>
          <p className="mt-2 text-sm text-mist">
            {items === null ? "…" : t("{n} immersioni · {minuti} minuti", { n: rows.length, minuti: minutes })}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm"
          >
            <Printer className="size-4" />
            {t("Stampa")}
          </button>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setScambio((current) => (current === "importa" ? null : "importa"))}>
            {t("Importa logbook")}
          </button>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setScambio((current) => (current === "esporta" ? null : "esporta"))}>
            {t("Esporta logbook")}
          </button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2">
        <Stat label={t("Immersioni")} value={items === null ? "…" : String(rows.length)} />
        <Stat label={t("Minuti")} value={items === null ? "…" : String(minutes)} />
        <Stat label={t("Max metri")} value={items === null ? "…" : deepest ? String(deepest) : "—"} />
      </dl>

      {scambio && !frame.abbonamento.proAperto ? <div className="no-print mt-4"><Lucchetto chiusura={frame.abbonamento.chiusura} /></div> : null}
      {scambio && frame.abbonamento.proAperto ? (
        <ScambioLogbook
          modo={scambio}
          righe={rows}
          onChiudi={() => setScambio(null)}
          onImportate={load}
        />
      ) : null}

      <div
        className={open && draft.id ? "no-print fixed inset-0 z-40 flex items-end justify-center bg-ink/75 p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:items-center" : "no-print mt-6"}
        role={open && draft.id ? "dialog" : undefined}
        aria-modal={open && draft.id ? true : undefined}
        aria-labelledby={open && draft.id ? "logbook-finestra" : undefined}
        onClick={() => {
          if (open && draft.id && !modifica) close();
        }}
      >
        {open && draft.id && !modifica ? (
          <div className="max-h-[calc(100vh-8rem)] w-full max-w-3xl overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <VistaImmersione
              draft={draft}
              shots={shots}
              clip={clip}
              onModifica={() => setModifica(true)}
              onChiudi={close}
              onPreview={setPreview}
              preview={preview}
              specie={{ entryId: draft.id, pro: speciePro, giorno: draft.data, ids: specieIds, onChange: cambiaSpecie }}
            />
          </div>
        ) : open ? (
          <form
            className={`rounded-card border border-line bg-surface p-4 ${draft.id ? "max-h-[calc(100vh-8rem)] w-full max-w-3xl overflow-y-auto" : ""}`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2 id={draft.id ? "logbook-finestra" : undefined} className="text-2xl">{shareId ? t("Modifica immersione") : draft.id ? t("Modifica immersione") : t("Nuova immersione")}</h2>
            {shareNome ? <p className="mt-1 text-xs text-lagoon">{t("condivisa da {nome}", { nome: shareNome })}</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t("Data")}>
                <ScadenzaField value={draft.data} onChange={(data) => setDraft({ ...draft, data })} />
              </Field>
              <Field label={t("Località")}>
                <input required value={draft.localita} onChange={(event) => setDraft({ ...draft, localita: event.target.value })} className={inputClass} placeholder={t("Passetto, Conero")} />
              </Field>
              <Field label={t("Punto")}>
                <input value={draft.punto} onChange={(event) => setDraft({ ...draft, punto: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Compagno")}>
                <input value={draft.buddy} onChange={(event) => setDraft({ ...draft, buddy: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Profondità max (m)")}>
                <input inputMode="decimal" value={draft.profondita} onChange={(event) => setDraft({ ...draft, profondita: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Tempo (minuti)")}>
                <input inputMode="numeric" value={draft.minuti} onChange={(event) => setDraft({ ...draft, minuti: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Miscela")}>
                <select value={draft.miscela} onChange={(event) => setDraft({ ...draft, miscela: event.target.value })} className={inputClass}>
                  <option value="Aria">{t("Aria")}</option>
                  <option value="Nitrox">Nitrox</option>
                  <option value="Trimix">Trimix</option>
                </select>
              </Field>
              <Field label={t("Ossigeno %")}>
                <input inputMode="decimal" value={draft.ossigeno} onChange={(event) => setDraft({ ...draft, ossigeno: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Temperatura (°C)")}>
                <input inputMode="decimal" value={draft.temperatura} onChange={(event) => setDraft({ ...draft, temperatura: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Visibilità (m)")}>
                <input inputMode="decimal" value={draft.visibilita} onChange={(event) => setDraft({ ...draft, visibilita: event.target.value })} className={inputClass} />
              </Field>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-mist">{t("Note")}</span>
                <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={`${inputClass} min-h-24 py-2`} />
              </label>
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm text-mist">{t("Punto GPS")}</p>
                <p className="mb-2 text-xs text-mist">{t("La mappa si apre sul punto del telefono. Puoi spostarlo toccando o trascinando.")}</p>
                <DiveMap lat={draft.lat} lng={draft.lng} onPick={point} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={fromPhone}>
                    {t("Posizione del telefono")}
                  </button>
                  {draft.lat ? (
                    <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => point("", "")}>
                      {t("Togli punto")}
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-mist">{draft.lat && draft.lng ? `${draft.lat}, ${draft.lng}` : t("Cerco la posizione del telefono…")}</p>
              </div>
              <SpecieLogbook entryId={draft.id} pro={speciePro} giorno={draft.data} ids={specieIds} onChange={cambiaSpecie} />
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm text-mist">{t("Foto dell'immersione")}</p>
                <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => photoRef.current?.click()}>
                  {t("Aggiungi foto")}
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                />
                {shots.length ? (
                  <ul className="mt-3 grid grid-cols-3 gap-2">
                    {shots.map((shot) => (
                      <li key={shot.key} className="overflow-hidden rounded-xl border border-line">
                        <button type="button" className="block w-full" onClick={() => setPreview(shot.data)}>
                          <img src={shot.data} alt={shot.name} className="aspect-square w-full object-cover" />
                        </button>
                        <button type="button" className="min-h-11 w-full text-xs text-danger-soft" onClick={() => {
                          setShots((current) => current.filter((item) => item.key !== shot.key));
                          if (shot.id) setDrop((current) => [...current, shot.id]);
                        }}>
                          {t("Togli")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mist">{t("Nessuna foto ancora. Puoi scattarle o prenderle dalla galleria.")}</p>
                )}
                {preview ? <FotoPiena src={preview} alt={t("Foto dell'immersione")} onClose={() => setPreview(null)} /> : null}
              </div>
              <div className="sm:col-span-2">
                <NotaVocaleField
                  key={draft.id}
                  clip={clip}
                  onClip={(next) => {
                    voiceReq.current += 1;
                    setClip(next);
                    if (next) setHadVoice(true);
                  }}
                  onRecording={setRecording}
                />
              </div>
            </div>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
                {busy ? t("Salvo…") : t("Salva nel logbook")}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full border border-line px-4 text-sm"
                onClick={() => close()}
              >
                {t("Chiudi")}
              </button>
              {draft.id ? (
                <button type="button" disabled={busy} className="min-h-11 rounded-full border border-danger px-4 text-sm text-danger-soft" onClick={() => void remove()}>
                  {t("Elimina")}
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
            onClick={() => beginNew(items?.[0])}
          >
            {t("Nuova immersione")}
          </button>
        )}
      </div>

      {spots.length ? (
        <div className="no-print mt-6">
          <p className="mb-2 text-sm text-mist">{t("I tuoi punti")}</p>
          <DiveAtlas points={spots} />
        </div>
      ) : null}

      {saved && !open ? <p className="mt-4 text-sm text-foam">{t("Salvata")}</p> : null}
      {error && !open ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {items === null ? <p className="mt-6 text-sm text-mist">{t("Apro il logbook…")}</p> : null}
      {items && items.length === 0 ? <p className="mt-6 text-sm text-mist">{t("Nessuna immersione ancora. La prima la scrivi tu.")}</p> : null}

      <ul className="no-print mt-4">
        {rows.map((row, index) => (
          <li key={row.id} className={index === 0 ? "" : "border-b border-line"}>
            {index === 0 && cover ? (
              <button type="button" className="relative mb-2 block h-72 w-full overflow-hidden rounded-card text-left" onClick={() => edit(row)}>
                <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block text-5xl leading-none">{row.profondita ? `${row.profondita} m` : row.localita}</span>
                  <span className="mt-1 block text-lg">{nomeSito(row.localita, t)}{row.punto ? ` · ${row.punto}` : ""}</span>
                  <span className="mt-1 block text-xs text-foam">{formatDay(row.data)}{row.ora ? ` ${row.ora}` : ""}{row.minuti ? ` · ${row.minuti} min` : ""}</span>
                  {row.condivisaDa ? <span className="mt-1 block text-xs text-lagoon">{t("condivisa da {nome}", { nome: row.condivisaDa })}</span> : null}
                </span>
              </button>
            ) : (
            <button type="button" className={index === 0 ? "mb-2 block w-full overflow-hidden rounded-card border border-line bg-surface text-left" : "block w-full py-3 text-left"} onClick={() => edit(row)}>
              <span className={index === 0 ? "block p-4" : "block"}>
                <p className="text-xs text-mist">{formatDay(row.data)}{row.ora ? ` ${row.ora}` : ""}</p>
                <p className={index === 0 ? "mt-1 text-2xl" : "mt-1 text-sm"}>{nomeSito(row.localita, t)}{row.punto ? ` · ${row.punto}` : ""}</p>
                {row.condivisaDa ? <p className="mt-1 text-xs text-lagoon">{t("condivisa da {nome}", { nome: row.condivisaDa })}</p> : null}
                <p className="mt-1 text-xs text-brass">
                {[
                  row.profondita ? `${row.profondita} m` : "",
                  row.minuti ? `${row.minuti} min` : "",
                  row.miscela ? t(row.miscela) : "",
                  row.buddy,
                  row.foto ? (row.foto === 1 ? t("1 foto") : t("{n} foto", { n: row.foto })) : "",
                  row.voce ? t("nota vocale") : "",
                ].filter(Boolean).join(" · ")}
              </p>
              </span>
            </button>
            )}
            <button type="button" className="mb-2 min-h-11 text-sm text-lagoon" onClick={() => setCondividi(row)}>
              {t("Condividi con compagni")}
            </button>
            {row.lat && row.lng || row.foto || row.voce ? (
              <div className="no-print pb-3">
                <button type="button" className="min-h-11 text-sm text-brass" onClick={() => setSeen((current) => (current === row.id ? null : row.id))}>
                  {seen === row.id ? t("Nascondi") : t(vediLabel(row))}
                </button>
                {seen === row.id && row.lat && row.lng ? (
                  <div className="mt-1">
                    <DiveMap lat={row.lat} lng={row.lng} />
                  </div>
                ) : null}
                {seen === row.id && row.foto ? <DiveShots entryId={row.id} /> : null}
                {seen === row.id && row.voce ? <DiveVoice entryId={row.id} /> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <table className="print-only print-table mt-4 w-full text-sm">
        <caption className="mb-2 text-left text-lg">Logbook · {frame.profile ? `${frame.profile.nome} ${frame.profile.cognome}` : ""}</caption>
        <thead>
          <tr>
            <th className="border-b py-1 text-left">{t("Data")}</th>
            <th className="border-b py-1 text-left">{t("Luogo")}</th>
            <th className="border-b py-1 text-left">m</th>
            <th className="border-b py-1 text-left">min</th>
            <th className="border-b py-1 text-left">{t("Buddy")}</th>
            <th className="border-b py-1 text-left">GPS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border-b py-1">{formatDay(row.data)}{row.ora ? ` ${row.ora}` : ""}</td>
              <td className="border-b py-1">{nomeSito(row.localita, t)}{row.punto ? ` · ${row.punto}` : ""}</td>
              <td className="border-b py-1">{row.profondita}</td>
              <td className="border-b py-1">{row.minuti}</td>
              <td className="border-b py-1">{row.buddy}</td>
              <td className="border-b py-1">{row.lat && row.lng ? `${row.lat}, ${row.lng}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cartolina ? (
        <button type="button" className="fixed inset-0 z-50 flex flex-col justify-end overflow-hidden bg-ink text-left" onClick={() => setCartolina(null)}>
          {cartolina.foto ? <img src={cartolina.foto} alt="" className="smile-in absolute inset-0 h-full w-full object-cover" /> : null}
          <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
          <span className="smile-up relative px-6 pb-16">
            <span className="block text-7xl leading-none">{cartolina.profondita ? `${cartolina.profondita}` : cartolina.localita}{cartolina.profondita ? <span className="text-3xl"> m</span> : null}</span>
            <span className="mt-3 block text-3xl leading-tight">{nomeSito(cartolina.localita, t)}{cartolina.punto ? ` · ${cartolina.punto}` : ""}</span>
            {cartolina.minuti ? <span className="mt-2 block text-lg text-foam">{cartolina.minuti} min</span> : null}
            <span className="mt-8 block text-sm text-mist">{t("Tocca per chiudere")}</span>
          </span>
        </button>
      ) : null}
      {condividi ? (
        <CondividiCompagni
          onChiudi={() => setCondividi(null)}
          onInviata={(testo) => {
            setCondividi(null);
            setSaved(testo);
          }}
          entryId={condividi.id}
        />
      ) : null}
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass";

function CondividiCompagni({
  entryId,
  onChiudi,
  onInviata,
}: {
  entryId: number;
  onChiudi: () => void;
  onInviata: (testo: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [righe, setRighe] = useState<CompagnoLogbook[] | null>(null);
  const [scelti, setScelti] = useState<CompagnoLogbook[]>([]);
  const [anteprima, setAnteprima] = useState<CompagnoLogbook | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const testo = q.trim();
    if (testo.length < 2) {
      setRighe(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void cercaCompagni({ data: { q: testo } })
        .then((lista) => {
          if (live) setRighe(lista);
        })
        .catch((reason: unknown) => {
          if (live) setErrore(messaggioErrore(reason, "Nessun utente con questo nome."));
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  function scelto(userId: string) {
    return scelti.some((item) => item.userId === userId);
  }

  function conferma(persona: CompagnoLogbook) {
    setScelti((lista) => (lista.some((item) => item.userId === persona.userId) ? lista.filter((item) => item.userId !== persona.userId) : [...lista, persona].slice(0, 12)));
    setAnteprima(null);
  }

  function invia() {
    if (!scelti.length) {
      setErrore(t("Seleziona almeno un compagno."));
      return;
    }
    setBusy(true);
    setErrore(null);
    void condividiImmersione({ data: { entryId, userIds: scelti.map((item) => item.userId) } })
      .then((esito) => {
        onInviata(esito.inviati === 1 ? t("Inviata a 1 compagno.") : t("Inviata a {n} compagni.", { n: esito.inviati }));
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non inviata.")))
      .finally(() => setBusy(false));
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-abyss px-4 py-6">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl">{t("Condividi con compagni")}</h2>
          <button type="button" className="min-h-11 text-sm text-mist" onClick={onChiudi}>{t("Chiudi")}</button>
        </div>
        <label className="mt-4 block text-sm">
          {t("Cerca per nome")}
          <input value={q} onChange={(event) => setQ(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
        {q.trim().length >= 2 && righe && righe.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessun utente con questo nome.")}</p> : null}
        <ul className="mt-4 grid gap-3">
          {(righe ?? []).map((persona) => {
            const attivo = scelto(persona.userId);
            const nome = `${persona.cognome} ${persona.nome}`.trim();
            return (
              <li key={persona.userId}>
                <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${attivo ? "border-lagoon bg-lagoon/15" : "border-line bg-deep"}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setAnteprima(persona)}>
                    <FotoCompagno foto={persona.foto} nome={nome} />
                    <span className="text-lg leading-tight">{nome}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={attivo}
                    className={`grid size-7 shrink-0 place-items-center rounded-full border-2 border-lagoon ${attivo ? "bg-lagoon" : ""}`}
                    onClick={() => conferma(persona)}
                  >
                    {attivo ? <span className="size-2.5 rounded-full bg-deep" /> : null}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={busy || scelti.length === 0} className="mt-6 min-h-12 w-full rounded-full bg-tide text-sm font-medium text-white disabled:opacity-60" onClick={invia}>
          {busy ? t("Invio…") : t("Invia")}
        </button>
      </div>
      {anteprima ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/80 px-6">
          <FotoCompagno foto={anteprima.foto} nome={`${anteprima.cognome} ${anteprima.nome}`.trim()} grande />
          <p className="mt-4 text-center text-3xl">{`${anteprima.cognome} ${anteprima.nome}`.trim()}</p>
          <div className="mt-6 flex gap-3">
            <button type="button" className="min-h-11 rounded-full bg-tide px-5 text-sm font-medium text-white" onClick={() => conferma(anteprima)}>
              {scelto(anteprima.userId) ? t("Togli") : t("Conferma")}
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line px-5 text-sm" onClick={() => setAnteprima(null)}>
              {t("Chiudi")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FotoCompagno({ foto, nome, grande = false }: { foto: string; nome: string; grande?: boolean }) {
  const classe = grande ? "size-40 text-4xl" : "size-12 text-lg";
  if (foto) return <img src={foto} alt="" className={`${classe} shrink-0 rounded-full object-cover`} />;
  return <span className={`${classe} grid shrink-0 place-items-center rounded-full bg-surface font-medium`}>{nome.slice(0, 1) || "?"}</span>;
}

function nomeSito(nome: string, t: (it: string, vars?: Record<string, string | number>) => string): string {
  return nome === "Sito non indicato" ? t(nome) : nome;
}

function VistaImmersione({
  draft,
  shots,
  clip,
  preview,
  onModifica,
  onChiudi,
  onPreview,
  specie,
}: {
  draft: {
    data: string;
    ora: string;
    localita: string;
    punto: string;
    profondita: string;
    minuti: string;
    buddy: string;
    miscela: string;
    ossigeno: string;
    temperatura: string;
    visibilita: string;
    note: string;
    lat: string;
    lng: string;
    foto: number;
    voce: number;
  };
  shots: { key: string; name: string; data: string }[];
  clip: { data: string } | null;
  preview: string | null;
  onModifica: () => void;
  onChiudi: () => void;
  onPreview: (src: string | null) => void;
  specie: { entryId: number; pro: boolean; giorno: string; ids: string[]; onChange: (ids: string[]) => void };
}) {
  const t = useT();
  const sito = nomeSito(draft.localita, t);
  const righe: { etichetta: string; valore: string }[] = [
    { etichetta: t("Data"), valore: `${formatDay(draft.data)}${draft.ora ? ` ${draft.ora}` : ""}` },
    { etichetta: t("Località"), valore: sito },
  ];
  if (draft.punto) righe.push({ etichetta: t("Punto"), valore: draft.punto });
  righe.push(
    { etichetta: t("Profondità max (m)"), valore: draft.profondita ? `${draft.profondita} m` : t("Profondità non indicata") },
    { etichetta: t("Tempo (minuti)"), valore: draft.minuti ? `${draft.minuti} min` : t("Durata non indicata") },
  );
  if (draft.buddy) righe.push({ etichetta: t("Compagno"), valore: draft.buddy });
  if (draft.miscela) righe.push({ etichetta: t("Miscela"), valore: draft.miscela === "Aria" ? t("Aria") : draft.miscela });
  if (draft.ossigeno) righe.push({ etichetta: t("Ossigeno %"), valore: draft.ossigeno });
  if (draft.temperatura) righe.push({ etichetta: t("Temperatura (°C)"), valore: draft.temperatura });
  if (draft.visibilita) righe.push({ etichetta: t("Visibilità (m)"), valore: draft.visibilita });

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 id="logbook-finestra" className="text-2xl">{sito}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {righe.map((riga) => (
          <div key={riga.etichetta}>
            <dt className="text-xs text-mist">{riga.etichetta}</dt>
            <dd className="mt-1 text-sm">{riga.valore}</dd>
          </div>
        ))}
        {draft.note ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-mist">{t("Note")}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm">{draft.note}</dd>
          </div>
        ) : null}
      </dl>
      {draft.lat && draft.lng ? (
        <div className="mt-4">
          <p className="mb-1 text-xs text-mist">{t("Punto GPS")}</p>
          <DiveMap lat={draft.lat} lng={draft.lng} />
          <p className="mt-2 text-xs text-mist">{draft.lat}, {draft.lng}</p>
        </div>
      ) : null}
      {draft.foto || shots.length ? (
        <div className="mt-4">
          <p className="mb-1 text-xs text-mist">{t("Foto dell'immersione")}</p>
          {shots.length ? (
            <ul className="grid grid-cols-3 gap-2">
              {shots.map((shot) => (
                <li key={shot.key}>
                  <button type="button" className="block w-full overflow-hidden rounded-xl border border-line" onClick={() => onPreview(shot.data)}>
                    <img src={shot.data} alt={shot.name || t("Foto dell'immersione")} className="aspect-square w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-mist">{t("Apro le foto…")}</p>
          )}
          {preview ? <FotoPiena src={preview} alt={t("Foto dell'immersione")} onClose={() => onPreview(null)} /> : null}
        </div>
      ) : null}
      {draft.voce || clip ? (
        <div className="mt-4">
          <p className="mb-1 text-xs text-mist">{t("Nota vocale")}</p>
          {clip ? <Lettore src={clip.data} /> : <p className="text-xs text-mist">{t("Apro la nota…")}</p>}
        </div>
      ) : null}
      <div className="mt-4">
        <SpecieLogbook entryId={specie.entryId} pro={specie.pro} giorno={specie.giorno} ids={specie.ids} onChange={specie.onChange} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={onModifica}>
          {t("Modifica")}
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onChiudi}>
          {t("Chiudi")}
        </button>
      </div>
    </section>
  );
}

function vediLabel(row: LogEntry): string {
  const bits = [
    row.lat && row.lng ? "mappa" : "",
    row.foto ? "foto" : "",
    row.voce ? "nota" : "",
  ].filter(Boolean);
  if (bits.length === 1) {
    if (bits[0] === "mappa") return "Vedi sulla mappa";
    if (bits[0] === "foto") return "Vedi le foto";
    return "Ascolta la nota";
  }
  const last = bits[bits.length - 1];
  return `Vedi ${bits.slice(0, -1).join(", ")} e ${last}`;
}

function blobToData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("nota"));
    reader.readAsDataURL(blob);
  });
}

async function clipFromBlob(blob: Blob): Promise<VoiceClip> {
  if (!blob.size) throw new Error("corta");
  const data = await blobToData(blob);
  if (!data.startsWith("data:audio/") || data.length > 2_800_000) throw new Error("lunga");
  return { type: (blob.type || "audio/webm").split(";")[0], data, fresh: true };
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Lettore({ src }: { src: string }) {
  const t = useT();
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(() => () => ref.current?.pause(), []);

  return (
    <div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => {
          setOn(false);
          setAt(0);
        }}
        onTimeUpdate={() => setAt(ref.current?.currentTime ?? 0)}
      />
      <button
        type="button"
        className="min-h-11 rounded-full border border-brass px-4 text-sm text-brass"
        onClick={() => {
          const audio = ref.current;
          if (!audio) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
      >
        {on ? t("Pausa · {tempo}", { tempo: clock(at * 1000) }) : at > 0 ? t("Ascolta · {tempo}", { tempo: clock(at * 1000) }) : t("Ascolta")}
      </button>
    </div>
  );
}

function NotaVocaleField({
  clip,
  onClip,
  onRecording,
}: {
  clip: VoiceClip | null;
  onClip: (next: VoiceClip | null) => void;
  onRecording: (on: boolean) => void;
}) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef(0);
  const liveRef = useRef(true);

  function releaseMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function halt() {
    window.clearInterval(timerRef.current);
    const recorder = recRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else releaseMic();
  }

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      window.clearInterval(timerRef.current);
      const recorder = recRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseMic();
      onRecording(false);
    };
  }, [onRecording]);

  async function start() {
    setLocalError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setLocalError(t("Questo telefono non registra da qui. Apri l'app con Safari o Chrome."));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
        chunksRef.current = [];
        releaseMic();
        setRecording(false);
        onRecording(false);
        if (!liveRef.current) return;
        void clipFromBlob(blob)
          .then(onClip)
          .catch(() => setLocalError(t("Nota troppo corta o troppo lunga. Massimo 2 minuti.")));
      };
      recorder.start();
      recRef.current = recorder;
      setElapsed(0);
      setRecording(true);
      onRecording(true);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - started;
        setElapsed(ms);
        if (ms >= 120_000) halt();
      }, 250);
    } catch {
      releaseMic();
      setRecording(false);
      onRecording(false);
      setLocalError(t("Microfono non disponibile. Controlla il permesso del telefono."));
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm text-mist">{t("Nota vocale")}</p>
      <p className="mb-2 text-xs text-mist">{t("Si ascolta qui dentro, senza scaricarla sul telefono. Massimo 2 minuti.")}</p>
      {clip ? <Lettore src={clip.data} /> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {recording ? (
          <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={halt}>
            {t("Ferma · {tempo}", { tempo: clock(elapsed) })}
          </button>
        ) : (
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => void start()}>
            {clip ? t("Registra di nuovo") : t("Registra nota")}
          </button>
        )}
        {clip && !recording ? (
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm text-danger-soft" onClick={() => onClip(null)}>
            {t("Togli nota")}
          </button>
        ) : null}
      </div>
      {localError ? <p className="mt-2 text-xs text-brass">{localError}</p> : null}
    </div>
  );
}

function DiveVoice({ entryId }: { entryId: number }) {
  const t = useT();
  const [src, setSrc] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getLogVoice({ data: { id: entryId } })
      .then((voice) => {
        if (live) setSrc(voice?.data ?? null);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [entryId]);

  if (src === undefined) return <p className="mt-2 text-xs text-mist">{t("Apro la nota…")}</p>;
  if (!src) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-mist">{t("Nota vocale")}</p>
      <div className="mt-1">
        <Lettore src={src} />
      </div>
    </div>
  );
}

function DiveShots({ entryId }: { entryId: number }) {
  const t = useT();
  const [photos, setPhotos] = useState<{ id: number; data: string }[] | null>(null);
  const [big, setBig] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listLogPhotos({ data: { id: entryId } })
      .then((rows) => {
        if (live) setPhotos(rows);
      })
      .catch(() => {
        if (live) setPhotos([]);
      });
    return () => {
      live = false;
    };
  }, [entryId]);

  if (photos === null) return <p className="mt-2 text-xs text-mist">{t("Apro le foto…")}</p>;
  if (!photos.length) return null;
  return (
    <div className="mt-2">
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button type="button" className="block w-full overflow-hidden rounded-xl border border-line" onClick={() => setBig(photo.data)}>
              <img src={photo.data} alt={t("Foto dell'immersione")} className="aspect-square w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {big ? <FotoPiena src={big} alt={t("Foto dell'immersione")} onClose={() => setBig(null)} /> : null}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="mt-1 text-2xl tabular-nums">{value}</dd>
    </div>
  );
}
