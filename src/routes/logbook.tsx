import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { AppFrame, useFondale } from "@/components/app-frame";
import { DiveAtlas, DiveMap } from "@/components/dive-map";
import { FotoPiena } from "@/components/foto-vista";
import { Lucchetto } from "@/components/lucchetto";
import { SegnoPro } from "@/components/segno-pro";
import { ScambioLogbook } from "@/components/logbook-uddf";
import { addLogPhoto, deleteLogPhoto, deleteLogVoice, deleteLogbook, getLogVoice, listLogPhotos, listLogbook, saveLogVoice, saveLogbook, accettaCondivisione, cercaCompagni, cercaDivingGuida, guideDelDiving, condividiImmersione, chiediConvalida, leggiCondivisione, listBrevetti, type CompagnoLogbook, type LogEntry } from "@/lib/fondale.functions";
import { ScadenzaField } from "@/components/scadenza-field";
import { formatDay } from "@/lib/format";
import { CHIAVE_PIANO_LOGBOOK } from "@/lib/planner";
import { messaggioErrore, useT } from "@/lib/i18n";
import { isStaff } from "@/lib/forms";
import { prepareFile } from "@/lib/prepare-file";
import { SpecieLogbook } from "@/components/specie-sezione";
import { salvaSpecieImmersione } from "@/lib/scubadex.functions";
import { leggiLogbook } from "@/lib/fit";
import type { UddfRiga } from "@/lib/uddf";

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
  decompressione: "" as "" | "si" | "no",
  profilo: [] as LogEntry["profilo"],
  oraFine: "",
  centro: "",
  guidaNome: "",
  guidaFirma: "",
  profonditaPrevista: "",
  autorespiratore: "",
  brevetto: "",
  viaggioGruppoId: null as number | null,
  convalidaGuida: "",
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
  const [fileScelte, setFileScelte] = useState<UddfRiga[] | null>(null);
  const [brevetti, setBrevetti] = useState<string[]>([]);
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
          decompressione: dive.decompressione,
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

  function applicaFile(riga: UddfRiga) {
    setDraft((current) => ({
      ...current,
      ora: riga.ora || current.ora,
      oraFine: fineDaMinuti(riga.ora || current.ora, riga.minuti) || current.oraFine,
      profondita: riga.profondita || current.profondita,
      minuti: riga.minuti || current.minuti,
      miscela: riga.miscela === "Nitrox" || riga.miscela === "Trimix" ? riga.miscela : current.miscela,
      ossigeno: riga.ossigeno || current.ossigeno,
      profilo: riga.profilo.length > 1 ? riga.profilo : current.profilo,
    }));
    setFileScelte(null);
    setError(null);
  }

  async function unisciFile(file: File) {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const esito = leggiLogbook(bytes);
      if (!esito.uddf && !esito.immersioni.length) throw new Error("Il file non è un .fit o un UDDF.");
      if (!esito.immersioni.length) throw new Error("In questo file non trovo un'immersione.");
      const delGiorno = esito.immersioni.filter((riga) => riga.data === draft.data);
      const scelte = delGiorno.length ? delGiorno : esito.immersioni;
      if (!delGiorno.length && esito.immersioni.length > 1) {
        setFileScelte(esito.immersioni);
        setError(t("In questo file non c'è un'immersione in questa data. Scegline una."));
        return;
      }
      if (scelte.length === 1) applicaFile(scelte[0]);
      else setFileScelte(scelte);
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a leggere il file."));
    }
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

  useEffect(() => {
    let live = true;
    void listBrevetti()
      .then((carte) => {
        if (!live) return;
        const voci = carte.map((carta) => [carta.livello || carta.titolo, carta.ente].filter(Boolean).join(" · ")).filter(Boolean);
        setBrevetti([...new Set(voci)]);
      })
      .catch(() => undefined);
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
    setFileScelte(null);
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
        const prepared = await prepareFile(file, "guarda");
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
    setFileScelte(null);
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
              decompressione: draft.decompressione,
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
      const daSalvare = { ...draft, oraFine: draft.oraFine || fineDaMinuti(draft.ora, draft.minuti) };
      const savedEntry = await saveLogbook({ data: daSalvare });
      if (speciePro && (draft.id === 0 || speciePronte)) {
        await salvaSpecieImmersione({ data: { entryId: savedEntry.id, ids: specieIds, giorno: draft.data } });
      }
      if (speciePro) {
        for (const id of drop) await deleteLogPhoto({ data: { id } });
        for (const shot of shots.filter((item) => item.id === 0)) {
          await addLogPhoto({ data: { entryId: savedEntry.id, file: { name: shot.name, type: shot.type, data: shot.data } } });
        }
        if (clip?.fresh) {
          await saveLogVoice({ data: { entryId: savedEntry.id, file: { type: clip.type, data: clip.data } } });
        } else if (!clip && hadVoice) {
          await deleteLogVoice({ data: { id: savedEntry.id } });
        }
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
  const gruppi = gruppiAnno(rows);
  const numeri = numeriLogbook(rows);
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
            {t("Importa logbook")}{frame.abbonamento.proAperto ? <SegnoPro /> : null}
          </button>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setScambio((current) => (current === "esporta" ? null : "esporta"))}>
            {t("Esporta logbook")}{frame.abbonamento.proAperto ? <SegnoPro /> : null}
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
              onCondividi={() => setCondividi(draft)}
              onChiudi={close}
              onValidata={(nome, firma) => {
                setDraft((current) => ({ ...current, guidaNome: nome, guidaFirma: firma, convalidaGuida: "" }));
                setItems((rows) => rows?.map((row) => (row.id === draft.id ? { ...row, guidaNome: nome, guidaFirma: firma, convalidaGuida: "" } : row)) ?? null);
                setSaved(t("Immersione validata"));
              }}
              onRichiesta={(nome) => {
                setDraft((current) => ({ ...current, convalidaGuida: nome }));
                setItems((rows) => rows?.map((row) => (row.id === draft.id ? { ...row, convalidaGuida: nome } : row)) ?? null);
                setSaved(t("Richiesta inviata. La guida firma dal suo Tritone."));
              }}
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
            {frame.profile ? <p className="mt-1 text-sm text-mist">{`${frame.profile.nome} ${frame.profile.cognome}`.trim()}</p> : null}
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
              <Field label={t("Profondità programmata (m)")}>
                <input inputMode="decimal" value={draft.profonditaPrevista} onChange={(event) => setDraft({ ...draft, profonditaPrevista: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Ora di inizio")}>
                <input type="time" value={draft.ora} onChange={(event) => setDraft({ ...draft, ora: event.target.value.slice(0, 5) })} className={inputClass} />
              </Field>
              <Field label={t("Ora di fine")}>
                <input type="time" value={draft.oraFine} onChange={(event) => setDraft({ ...draft, oraFine: event.target.value.slice(0, 5) })} className={inputClass} />
              </Field>
              <Field label={t("Tempo (minuti)")}>
                <input inputMode="numeric" value={draft.minuti} onChange={(event) => setDraft({ ...draft, minuti: event.target.value })} className={inputClass} />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-sm text-mist">{t("Decompressione")}</legend>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`min-h-11 flex-1 rounded-full px-4 text-sm ${draft.decompressione === "si" ? "bg-lagoon font-medium text-ink" : "border border-line"}`}
                    onClick={() => setDraft({ ...draft, decompressione: "si" })}
                  >
                    {t("Sì")}
                  </button>
                  <button
                    type="button"
                    className={`min-h-11 flex-1 rounded-full px-4 text-sm ${draft.decompressione === "no" ? "bg-lagoon font-medium text-ink" : "border border-line"}`}
                    onClick={() => setDraft({ ...draft, decompressione: "no" })}
                  >
                    {t("No")}
                  </button>
                </div>
              </fieldset>
              <Field label={t("Tipo di autorespiratore")}>
                <select value={draft.autorespiratore} onChange={(event) => setDraft({ ...draft, autorespiratore: event.target.value })} className={inputClass}>
                  <option value="">—</option>
                  <option value="Circuito aperto">{t("Circuito aperto")}</option>
                  <option value="Rebreather">Rebreather</option>
                  <option value="Aria di superficie">{t("Aria di superficie")}</option>
                </select>
              </Field>
              <Field label={t("Centro")}>
                <input value={draft.centro} onChange={(event) => setDraft({ ...draft, centro: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Tipo di brevetto")}>
                <input value={draft.brevetto} onChange={(event) => setDraft({ ...draft, brevetto: event.target.value })} className={inputClass} list="brevetti-log" />
                <datalist id="brevetti-log">
                  {brevetti.map((voce) => <option key={voce} value={voce} />)}
                </datalist>
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
              {draft.id ? (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-sm text-mist">{t("Aggiungi file del computer")}</p>
                  <p className="mb-2 text-xs text-mist">{t("Un file .fit o UDDF di questa immersione sistema ora di ingresso, ora di uscita e, se ci sono, profondità, durata e grafico. Il resto non si cancella.")}</p>
                  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm">
                    {t("Scegli file")}
                    <input
                      type="file"
                      accept=".fit,.xml,.uddf,application/xml,text/xml"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void unisciFile(file);
                      }}
                    />
                  </label>
                  {draft.profilo.length > 1 ? <div className="mt-3 h-16"><CurvaProfilo punti={draft.profilo} /></div> : null}
                  {fileScelte ? (
                    <ul className="mt-3 grid gap-2">
                      {fileScelte.map((riga, index) => (
                        <li key={`${riga.data}-${riga.ora}-${index}`}>
                          <button type="button" className="min-h-11 w-full rounded-xl border border-line px-3 text-left text-sm" onClick={() => applicaFile(riga)}>
                            {formatDay(riga.data)} {riga.ora} · {riga.localita || t("Senza località")} · {riga.profondita ? `${riga.profondita} m` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
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
                {speciePro ? (
                  <>
                    <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => photoRef.current?.click()}>
                      {t("Aggiungi foto")}<SegnoPro />
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
                  </>
                ) : (
                  <>
                    <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm text-mist" disabled>
                      {t("Aggiungi foto")}<SegnoPro />
                    </button>
                    <p className="mt-2 text-xs text-brass">{t("Disponibile con Pro")}</p>
                  </>
                )}
              </div>
              <div className="sm:col-span-2">
                <NotaVocaleField
                  key={draft.id}
                  pro={speciePro}
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

      <ul className="no-print mt-4 space-y-6">
        {gruppi.map((gruppo) => (
          <li key={gruppo.anno}>
            <p className="text-sm text-mist">
              <span className="text-xl text-foam">{gruppo.anno}</span>
              {" · "}
              {gruppo.righe.length === 1 ? t("1 immersione") : t("{n} immersioni", { n: gruppo.righe.length })}
            </p>
            <ul className="mt-2 grid gap-2">
              {gruppo.righe.map((row) => {
                const deco = eDeco(row);
                return (
                  <li key={row.id}>
                    <button type="button" className="flex min-h-20 w-full overflow-hidden rounded-2xl border border-line bg-deep text-left text-foam" onClick={() => edit(row)}>
                      <span className={`flex w-16 shrink-0 flex-col items-center justify-center text-sm font-medium leading-tight ${deco ? "border-r border-brass text-brass" : "bg-lagoon text-ink"}`}>
                        <span>#{numeri.get(row.id)}</span>
                        <span>{deco ? "DECO" : "REC"}</span>
                      </span>
                      <span className="relative flex min-w-0 flex-1 flex-col justify-center px-3">
                        {row.profilo.length > 1 ? <CurvaProfilo punti={row.profilo} /> : null}
                        <span className="relative truncate text-sm font-medium">{row.punto || nomeSito(row.localita, t)}</span>
                        <span className="relative text-sm text-mist">{formatDay(row.data)}{row.ora ? ` ${row.ora}` : ""}</span>
                        {row.guidaFirma ? <span className="relative text-xs text-lagoon">{t("Validata")}</span> : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end justify-center px-3 text-sm">
                        <span>{row.profondita ? `${row.profondita} m` : "—"}</span>
                        <span className="text-mist">{row.minuti ? `${row.minuti} min` : "—"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
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

function ValidaImmersione({ entry, onFatta, onRichiesta }: { entry: LogEntry; onFatta: (nome: string, firma: string) => void; onRichiesta: (nome: string) => void }) {
  const t = useT();
  const [aperta, setAperta] = useState(false);
  const [mano, setMano] = useState(false);
  const [q, setQ] = useState("");
  const [diving, setDiving] = useState<{ id: number; nome: string; sede: string } | null>(null);
  const [divingTrovati, setDivingTrovati] = useState<{ id: number; nome: string; sede: string }[] | null>(null);
  const [guide, setGuide] = useState<CompagnoLogbook[] | null>(null);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [scelta, setScelta] = useState<CompagnoLogbook | null>(null);
  const [firma, setFirma] = useState("");
  const [tratti, setTratti] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mano || diving) return;
    const testo = q.trim();
    if (testo.length < 2) {
      setDivingTrovati(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void cercaDivingGuida({ data: { q: testo } })
        .then((lista) => {
          if (live) setDivingTrovati(lista);
        })
        .catch(() => {
          if (live) setDivingTrovati([]);
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, mano, diving]);

  useEffect(() => {
    if (!diving) {
      setGuide(null);
      return;
    }
    let live = true;
    void guideDelDiving({ data: { clubId: diving.id } })
      .then((lista) => {
        if (live) setGuide(lista);
      })
      .catch(() => {
        if (live) setGuide([]);
      });
    return () => {
      live = false;
    };
  }, [diving]);

  if (entry.guidaFirma) return null;
  if (entry.convalidaGuida && !aperta) {
    return (
      <div>
        <p className="text-sm text-brass">{t("In attesa della firma di {nome}", { nome: entry.convalidaGuida })}</p>
        <button type="button" className="mt-2 min-h-11 text-sm text-lagoon" onClick={() => setAperta(true)}>{t("Chiedi a un'altra guida")}</button>
      </div>
    );
  }

  const guidaMano = `${cognome} ${nome}`.trim();

  async function chiedi() {
    if (!scelta) {
      setErrore(t("Scegli la guida."));
      return;
    }
    setBusy(true);
    setErrore(null);
    try {
      const esito = await chiediConvalida({ data: { entryId: entry.id, guidaUserId: scelta.userId } });
      onRichiesta(esito.guida);
      setAperta(false);
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Richiesta non inviata."));
    } finally {
      setBusy(false);
    }
  }

  async function conferma() {
    if (!guidaMano) {
      setErrore(t("Scrivi nome e cognome."));
      return;
    }
    if (tratti < 1 || !firma.startsWith("data:image/png;base64,")) {
      setErrore(t("Fai firmare la guida col dito"));
      return;
    }
    setBusy(true);
    setErrore(null);
    try {
      await saveLogbook({ data: { ...entry, guidaNome: guidaMano, guidaFirma: firma } });
      onFatta(guidaMano, firma);
      setAperta(false);
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non validata."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {aperta ? null : (
        <button type="button" className="min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink" onClick={() => setAperta(true)}>
          {t("Valida immersione")}
        </button>
      )}
      {aperta ? (
        <div className="rounded-2xl border border-line bg-deep px-4 py-4">
          <p className="text-sm font-medium">{t("Valida immersione")}</p>
          {mano ? (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-mist">{t("Cognome")}</span>
                  <input value={cognome} onChange={(event) => setCognome(event.target.value)} className={inputClass} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-mist">{t("Nome")}</span>
                  <input value={nome} onChange={(event) => setNome(event.target.value)} className={inputClass} />
                </label>
              </div>
              <button type="button" className="mt-3 min-h-11 text-sm text-lagoon" onClick={() => setMano(false)}>{t("È su Tritone")}</button>
              {guidaMano ? <TappetoFirmaLog onChange={(data, n) => { setFirma(data); setTratti(n); }} /> : null}
            </>
          ) : (
            <>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-mist">{t("Cerca il diving")}</span>
                <input value={diving ? diving.nome : q} onChange={(event) => { setDiving(null); setScelta(null); setGuide(null); setQ(event.target.value); }} className={inputClass} />
              </label>
              {diving ? (
                <>
                  {diving.sede ? <p className="mt-1 text-xs text-mist">{diving.sede}</p> : null}
                  <button type="button" className="mt-1 min-h-11 text-sm text-lagoon" onClick={() => { setDiving(null); setScelta(null); setQ(""); }}>{t("Cambia diving")}</button>
                  <p className="mt-3 text-sm text-mist">{t("Guide del diving")}</p>
                  {scelta ? <p className="mt-1 text-sm text-lagoon">{`${scelta.cognome} ${scelta.nome}`.trim()}</p> : null}
                  {guide && guide.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessuna guida in questo diving.")}</p> : null}
                  <ul className="mt-1">
                    {(guide ?? []).map((persona) => {
                      const etichetta = `${persona.cognome} ${persona.nome}`.trim();
                      const sceltaQuesta = scelta?.userId === persona.userId;
                      return (
                        <li key={persona.userId}>
                          <button type="button" className={`min-h-11 w-full text-left text-sm ${sceltaQuesta ? "text-lagoon" : ""}`} onClick={() => setScelta(persona)}>
                            {etichetta}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  {q.trim().length >= 2 && divingTrovati && divingTrovati.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessun diving con questo nome.")}</p> : null}
                  <ul className="mt-2">
                    {(divingTrovati ?? []).map((centro) => (
                      <li key={centro.id}>
                        <button type="button" className="min-h-11 w-full text-left text-sm" onClick={() => { setDiving(centro); setQ(""); setDivingTrovati(null); setScelta(null); }}>
                          {centro.nome}
                          {centro.sede ? <span className="block text-xs text-mist">{centro.sede}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-2 text-xs text-mist">{t("La guida riceve l'avviso e firma dal suo Tritone.")}</p>
              <button type="button" className="mt-1 min-h-11 text-sm text-lagoon" onClick={() => setMano(true)}>{t("Non è su Tritone")}</button>
            </>
          )}
          {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
          <button type="button" disabled={busy || (mano ? !guidaMano : !scelta)} className="mt-3 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void (mano ? conferma() : chiedi())}>
            {busy ? t("Salvo…") : mano ? t("Firma e valida") : t("Chiedi la firma")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TappetoFirmaLog({ onChange }: { onChange: (data: string, tratti: number) => void }) {
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
      <p className="mb-1 text-sm text-mist">{t("Fai firmare la guida col dito")}</p>
      <canvas ref={ref} className="h-36 w-full touch-none rounded-xl border border-line bg-abyss" onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} />
    </div>
  );
}

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
  onCondividi,
  onChiudi,
  onValidata,
  onRichiesta,
  onPreview,
  specie,
}: {
  draft: {
    id: number;
    viaggioGruppoId: number | null;
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
    decompressione: "" | "si" | "no";
    profilo: LogEntry["profilo"];
    oraFine: string;
    centro: string;
    guidaNome: string;
    guidaFirma: string;
    profonditaPrevista: string;
    autorespiratore: string;
    brevetto: string;
    lat: string;
    lng: string;
    foto: number;
    voce: number;
    convalidaGuida: string;
  };
  shots: { key: string; name: string; data: string }[];
  clip: { data: string } | null;
  preview: string | null;
  onModifica: () => void;
  onCondividi: () => void;
  onChiudi: () => void;
  onValidata: (nome: string, firma: string) => void;
  onRichiesta: (nome: string) => void;
  onPreview: (src: string | null) => void;
  specie: { entryId: number; pro: boolean; giorno: string; ids: string[]; onChange: (ids: string[]) => void };
}) {
  const t = useT();
  const frame = useFondale();
  const sito = nomeSito(draft.localita, t);
  const chi = frame.profile ? `${frame.profile.nome} ${frame.profile.cognome}`.trim() : "";
  const righe: { etichetta: string; valore: string }[] = [
    { etichetta: t("Subacqueo"), valore: chi || "—" },
    { etichetta: t("Tipo di brevetto"), valore: draft.brevetto || "—" },
    { etichetta: t("Data"), valore: `${formatDay(draft.data)}${draft.ora ? ` ${draft.ora}` : ""}` },
    { etichetta: t("Località"), valore: sito },
  ];
  if (draft.punto) righe.push({ etichetta: t("Punto"), valore: draft.punto });
  righe.push(
    { etichetta: t("Ora di inizio"), valore: draft.ora || "—" },
    { etichetta: t("Ora di fine"), valore: draft.oraFine || "—" },
    { etichetta: t("Profondità programmata (m)"), valore: draft.profonditaPrevista ? `${draft.profonditaPrevista} m` : "—" },
    { etichetta: t("Profondità max (m)"), valore: draft.profondita ? `${draft.profondita} m` : "—" },
    { etichetta: t("Tipo di autorespiratore"), valore: draft.autorespiratore ? t(draft.autorespiratore) : "—" },
    { etichetta: t("Miscela"), valore: draft.miscela === "Aria" ? t("Aria") : draft.miscela || "—" },
    { etichetta: t("Centro"), valore: draft.centro || "—" },
    { etichetta: t("Tempo (minuti)"), valore: draft.minuti ? `${draft.minuti} min` : "—" },
  );
  if (draft.guidaNome) righe.push({ etichetta: t("Guida"), valore: draft.guidaNome });
  if (draft.buddy) righe.push({ etichetta: t("Compagno"), valore: draft.buddy });
  if (draft.ossigeno) righe.push({ etichetta: t("Ossigeno %"), valore: draft.ossigeno });
  if (draft.temperatura) righe.push({ etichetta: t("Temperatura (°C)"), valore: draft.temperatura });
  if (draft.visibilita) righe.push({ etichetta: t("Visibilità (m)"), valore: draft.visibilita });
  righe.push({ etichetta: t("Decompressione"), valore: eDeco(draft) ? t("Sì") : t("No") });

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
      {draft.profilo.length > 1 ? (
        <div className="mt-4 h-24">
          <CurvaProfilo punti={draft.profilo} />
        </div>
      ) : null}
      {draft.guidaFirma ? (
        <div className="mt-4">
          <p className="mb-1 text-xs text-lagoon">{t("Validata da {nome}", { nome: draft.guidaNome || t("la guida") })}</p>
          <img src={draft.guidaFirma} alt={t("Firma della guida")} className="h-24 rounded-xl border border-line bg-abyss" />
        </div>
      ) : !draft.viaggioGruppoId ? (
        <div className="mt-4">
          <ValidaImmersione entry={{ ...draft, condivisaDa: "" }} onFatta={onValidata} onRichiesta={onRichiesta} />
        </div>
      ) : null}
      {draft.lat && draft.lng ? (
        <div className="mt-4">
          <p className="mb-1 text-xs text-mist">{t("Punto GPS")}</p>
          <DiveMap lat={draft.lat} lng={draft.lng} />
          <p className="mt-2 text-xs text-mist">{draft.lat}, {draft.lng}</p>
        </div>
      ) : null}
      {specie.pro && (draft.foto || shots.length) ? (
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
      {specie.pro && (draft.voce || clip) ? (
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
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onCondividi}>
          {t("Condividi con compagni")}
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onChiudi}>
          {t("Chiudi")}
        </button>
      </div>
    </section>
  );
}

function fineDaMinuti(ora: string, minuti: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) return "";
  const n = Number(minuti);
  if (!Number.isFinite(n) || n <= 0) return "";
  const [ore, minutiOra] = ora.split(":").map(Number);
  const totale = ore * 60 + minutiOra + Math.round(n);
  return `${String(Math.floor(totale / 60) % 24).padStart(2, "0")}:${String(totale % 60).padStart(2, "0")}`;
}

function eDeco(row: { decompressione: "" | "si" | "no"; profilo: LogEntry["profilo"] }): boolean {
  if (row.decompressione === "si") return true;
  if (row.decompressione === "no") return false;
  const punti = [...row.profilo].sort((a, b) => a.t - b.t);
  if (punti.length < 4) return false;
  const max = punti.reduce((alto, punto) => Math.max(alto, punto.d), 0);
  if (max < 10) return false;
  let vistoFondo = false;
  let inizio = punti[0];
  for (const punto of punti) {
    if (punto.d >= max - 1.5) vistoFondo = true;
    const fermo = Math.abs(punto.d - inizio.d) <= 1.2 && punto.d >= 6 && punto.d <= max - 3;
    if (!vistoFondo || !fermo) {
      inizio = punto;
      continue;
    }
    if (punto.t - inizio.t >= 60) return true;
  }
  return false;
}

function numeriLogbook(rows: LogEntry[]): Map<number, number> {
  const ordine = [...rows].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    if (a.ora !== b.ora) return a.ora < b.ora ? -1 : 1;
    return a.id - b.id;
  });
  return new Map(ordine.map((row, index) => [row.id, index + 1]));
}

function gruppiAnno(rows: LogEntry[]): { anno: string; righe: LogEntry[] }[] {
  const ordine: string[] = [];
  const mappa = new Map<string, LogEntry[]>();
  for (const row of rows) {
    const anno = /^\d{4}/.test(row.data) ? row.data.slice(0, 4) : "—";
    const lista = mappa.get(anno);
    if (lista) lista.push(row);
    else {
      mappa.set(anno, [row]);
      ordine.push(anno);
    }
  }
  return ordine.map((anno) => ({ anno, righe: mappa.get(anno) ?? [] }));
}

function CurvaProfilo({ punti }: { punti: LogEntry["profilo"] }) {
  const ordinati = [...punti].sort((a, b) => a.t - b.t);
  const minT = ordinati[0]?.t ?? 0;
  const maxT = ordinati[ordinati.length - 1]?.t ?? 1;
  const maxD = ordinati.reduce((alto, punto) => Math.max(alto, punto.d), 1);
  const traccia = ordinati
    .map((punto) => {
      const x = ((punto.t - minT) / (maxT - minT || 1)) * 100;
      const y = 4 + (punto.d / maxD) * 32;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-lagoon opacity-70" aria-hidden>
      <polyline points={traccia} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
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
  pro,
  onClip,
  onRecording,
}: {
  clip: VoiceClip | null;
  pro: boolean;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const opzioni: MediaRecorderOptions = { audioBitsPerSecond: 32_000 };
      if (mime) opzioni.mimeType = mime;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, opzioni);
      } catch {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      }
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
      {pro ? (
        <>
          <p className="mb-2 text-xs text-mist">{t("Si ascolta qui dentro, senza scaricarla sul telefono. Massimo 2 minuti.")}</p>
          {clip ? <Lettore src={clip.data} /> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {recording ? (
              <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={halt}>
                {t("Ferma · {tempo}", { tempo: clock(elapsed) })}
              </button>
            ) : (
              <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => void start()}>
                {clip ? t("Registra di nuovo") : t("Registra nota")}<SegnoPro />
              </button>
            )}
            {clip && !recording ? (
              <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm text-danger-soft" onClick={() => onClip(null)}>
                {t("Togli nota")}
              </button>
            ) : null}
          </div>
          {localError ? <p className="mt-2 text-xs text-brass">{localError}</p> : null}
        </>
      ) : (
        <>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm text-mist" disabled>
            {t("Registra nota")}<SegnoPro />
          </button>
          <p className="mt-2 text-xs text-brass">{t("Disponibile con Pro")}</p>
        </>
      )}
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
