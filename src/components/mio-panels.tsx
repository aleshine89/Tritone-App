import { useEffect, useRef, useState } from "react";
import { AnteprimaFile } from "@/components/foto-vista";
import { SegnoPro } from "@/components/segno-pro";
import {
  clearChecklist,
  deleteChecklist,
  deleteTool,
  getToolFile,
  listChecklist,
  listTools,
  saveChecklist,
  saveTool,
  toggleChecklist,
  type CheckVoce,
  type ToolFile,
} from "@/lib/fondale.functions";
import { messaggioErrore, useT } from "@/lib/i18n";
import { prepareFile } from "@/lib/prepare-file";

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass";

export function ToolsPanel({ onCount }: { onCount: (count: number) => void }) {
  const t = useT();
  const [items, setItems] = useState<ToolFile[] | null>(null);
  const [titolo, setTitolo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const rows = await listTools();
    setItems(rows);
    onCount(rows.length);
  }

  useEffect(() => {
    let live = true;
    listTools()
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        onCount(rows.length);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(messaggioErrore(reason, "Tools non disponibile."));
        setItems([]);
      });
    return () => {
      live = false;
    };
  }, [onCount]);

  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareFile(file);
      await saveTool({ data: { titolo, file: prepared } });
      setTitolo("");
      await load();
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a salvare il file."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deleteTool({ data: { id } });
      await load();
    } catch (reason) {
      setError(messaggioErrore(reason, "Non riesco a togliere il file."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-2xl">{t("Tools")}</h2>
      <p className="mt-2 text-sm text-mist">{t("Foto e documenti tuoi. Li vedi solo tu. Tocca l'anteprima per aprirla a schermo intero, senza scaricarla.")}</p>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Nome, se vuoi")}</span>
        <input value={titolo} onChange={(event) => setTitolo(event.target.value)} className={inputClass} placeholder={t("Mappa del sito, libretto…")} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => photoRef.current?.click()}>
          {t("Foto dal telefono")}
        </button>
        <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => fileRef.current?.click()}>
          {t("Aggiungi file")}
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void add(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => { void add(event.target.files?.[0]); event.target.value = ""; }} />
      {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
      {items === null ? <p className="mt-4 text-sm text-mist">{t("Carico i file…")}</p> : null}
      {items && items.length === 0 ? <p className="mt-4 text-sm text-mist">{t("Nessun file ancora.")}</p> : null}
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {items?.map((item) => (
          <li key={item.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <AnteprimaFile id={item.id} enabled load={loadToolFile} alt={item.titolo} className="aspect-square w-full object-cover" />
            <p className="px-3 pt-2 text-sm">{item.titolo}</p>
            <p className="px-3 text-xs text-mist">{item.fileType === "application/pdf" ? "PDF" : t("Foto")}</p>
            <button type="button" disabled={busy} className="min-h-11 px-3 text-sm text-danger-soft" onClick={() => void remove(item.id)}>
              {t("Togli")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function loadToolFile(id: number) {
  return getToolFile({ data: { id } });
}

export function ChecklistPanel({ onCount }: { onCount: (count: number) => void }) {
  const t = useT();
  const [items, setItems] = useState<CheckVoce[] | null>(null);
  const [label, setLabel] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await listChecklist();
    setItems(rows);
    onCount(rows.length);
  }

  useEffect(() => {
    let live = true;
    listChecklist()
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        onCount(rows.length);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(messaggioErrore(reason, "Checklist non disponibile."));
        setItems([]);
      });
    return () => {
      live = false;
    };
  }, [onCount]);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await load();
    } catch (reason) {
      setError(messaggioErrore(reason, "Non salvato."));
    } finally {
      setBusy(false);
    }
  }

  const done = items?.filter((item) => item.done).length ?? 0;

  return (
    <section className="mt-8">
      <h2 className="text-2xl">{t("Checklist")}<SegnoPro /></h2>
      <p className="mt-2 text-sm text-mist">
        {t("Tutta l'attrezzatura, da spuntare prima di entrare in acqua. Puoi rinominare, togliere e aggiungere voci.")}
      </p>
      {items ? <p className="mt-3 text-sm text-brass">{t("{fatte} di {totale} pronte", { fatte: done, totale: items.length })}</p> : null}
      {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
      {items === null ? <p className="mt-4 text-sm text-mist">{t("Carico la checklist…")}</p> : null}
      <ul className="mt-3 grid gap-2">
        {items?.map((item) => (
          <li key={item.id} className="rounded-2xl border border-line bg-surface px-3 py-2">
            {editId === item.id ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await saveChecklist({ data: { id: item.id, label: editLabel } });
                    setEditId(null);
                  });
                }}
              >
                <input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} className={inputClass} />
                <button type="submit" disabled={busy} className="min-h-11 shrink-0 rounded-full bg-lagoon px-3 text-sm">{t("Salva")}</button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="min-h-11 flex-1 px-1 text-left text-sm"
                  onClick={() => void run(() => toggleChecklist({ data: { id: item.id } }))}
                >
                  <span className={item.done ? "text-mist line-through" : ""}>{item.done ? t("Fatto") : t("Da prendere")} · {t(item.label)}</span>
                </button>
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs text-mist"
                  onClick={() => {
                    setEditId(item.id);
                    setEditLabel(item.label);
                  }}
                >
                  {t("Modifica")}
                </button>
                <button type="button" className="min-h-11 px-2 text-xs text-danger-soft" onClick={() => void run(() => deleteChecklist({ data: { id: item.id } }))}>
                  {t("Togli")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await saveChecklist({ data: { label } });
            setLabel("");
          });
        }}
      >
        <input value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} placeholder={t("Nuova voce")} />
        <button type="submit" disabled={busy} className="min-h-11 shrink-0 rounded-full bg-lagoon px-4 text-sm font-medium">{t("Aggiungi")}</button>
      </form>
      <button type="button" disabled={busy} className="mt-3 min-h-11 text-sm text-mist" onClick={() => void run(() => clearChecklist())}>
        {t("Togli tutte le spunte")}
      </button>
    </section>
  );
}
