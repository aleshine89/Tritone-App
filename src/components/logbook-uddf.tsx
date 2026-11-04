import { useEffect, useState } from "react";
import { chiaviLogbook, esportaLogbook, importaLogbook, type LogEntry } from "@/lib/fondale.functions";
import { formatDay } from "@/lib/format";
import { messaggioErrore, useT, type Traduci } from "@/lib/i18n";
import { chiaveQuando, type UddfRiga } from "@/lib/uddf";
import { leggiLogbook } from "@/lib/fit";

export function ScambioLogbook({
  modo,
  righe,
  onChiudi,
  onImportate,
}: {
  modo: "importa" | "esporta";
  righe: LogEntry[];
  onChiudi: () => void;
  onImportate: () => Promise<void>;
}) {
  const t = useT();
  const [anteprima, setAnteprima] = useState<UddfRiga[]>([]);
  const [scelte, setScelte] = useState<Set<number>>(new Set());
  const [chiavi, setChiavi] = useState<Set<string>>(() => new Set(righe.map((row) => chiaveQuando(row.data, row.ora))));
  const [senzaData, setSenzaData] = useState(0);
  const [oltre, setOltre] = useState(0);
  const [tutto, setTutto] = useState(true);
  const [scelteExport, setScelteExport] = useState<Set<number>>(() => new Set(righe.map((row) => row.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== "importa") return;
    let live = true;
    chiaviLogbook()
      .then((rows) => {
        if (!live) return;
        setChiavi(new Set(rows.map((row) => chiaveQuando(row.data, row.ora))));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [modo]);

  useEffect(() => {
    setScelte((current) => {
      const next = new Set<number>();
      anteprima.forEach((riga, index) => {
        if (current.has(index) && marca(riga, index, anteprima, chiavi) === "ok") next.add(index);
      });
      return next;
    });
  }, [anteprima, chiavi]);

  async function leggiFile(file: File | undefined) {
    setError(null);
    setEsito(null);
    if (!file) return;
    if (file.size > 8_000_000) {
      setError(t("File troppo grande."));
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const letto = leggiLogbook(bytes);
    if (!letto.uddf) {
      setAnteprima([]);
      setError(t("Il file non è un UDDF né un .fit leggibile."));
      return;
    }
    if (!letto.immersioni.length) {
      setAnteprima([]);
      setError(t(letto.senzaData ? "Nessuna immersione con una data." : "Nessuna immersione nel file."));
      return;
    }
    setSenzaData(letto.senzaData);
    setOltre(letto.oltre);
    setAnteprima(letto.immersioni);
    setScelte(new Set(letto.immersioni.flatMap((riga, index) => (marca(riga, index, letto.immersioni, chiavi) === "ok" ? [index] : []))));
  }

  async function conferma() {
    const daSalvare = anteprima.filter((riga, index) => scelte.has(index) && marca(riga, index, anteprima, chiavi) === "ok");
    if (!daSalvare.length) {
      setError(t("Scegli almeno un'immersione."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await importaLogbook({ data: { immersioni: daSalvare } });
      await onImportate();
      const aggiornate = await chiaviLogbook();
      setChiavi(new Set(aggiornate.map((row) => chiaveQuando(row.data, row.ora))));
      const parti = [
        result.inserite ? t("Importate {n}.", { n: result.inserite }) : "",
        result.saltate ? t("{n} erano già nel logbook e non sono state copiate.", { n: result.saltate }) : "",
      ].filter(Boolean);
      setEsito(parti.join(" "));
      setAnteprima([]);
      setScelte(new Set());
    } catch (reason) {
      setError(messaggioErrore(reason, "Non salvate."));
    } finally {
      setBusy(false);
    }
  }

  async function scarica() {
    if (!tutto && scelteExport.size === 0) {
      setError(t("Scegli almeno un'immersione."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const file = await esportaLogbook({ data: { tutto, ids: tutto ? [] : [...scelteExport] } });
      const blob = new Blob([file.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.nome || "tritone-logbook.uddf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(messaggioErrore(reason, "Non salvato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="no-print mt-4 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl">{modo === "importa" ? t("Importa logbook") : t("Esporta logbook")}</h2>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onChiudi}>
          {t("Chiudi")}
        </button>
      </div>
      {modo === "importa" ? (
        <>
          <p className="mt-2 text-sm text-mist">{t("Anteprima. Salvi solo quelle che confermi. Le immersioni già scritte restano.")}</p>
          <p className="mt-1 text-sm text-mist">{t("Da un .fit si leggono solo le immersioni, non le altre attività.")}</p>
          <p className="mt-1 text-sm text-mist">{t("Stessa data e stessa ora di una già presente non viene copiata.")}</p>
          <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-lagoon px-4 text-sm font-medium">
            {t("Scegli un file UDDF o .fit")}
            <input
              type="file"
              accept=".uddf,.xml,.fit,text/xml,application/xml"
              className="hidden"
              onChange={(event) => {
                void leggiFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {senzaData ? <p className="mt-3 text-sm text-mist">{t("{n} senza data, non in elenco.", { n: senzaData })}</p> : null}
          {oltre ? <p className="mt-1 text-sm text-mist">{t("{n} immersioni in più non sono in questa anteprima.", { n: oltre })}</p> : null}
          {anteprima.length ? (
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {anteprima.map((riga, index) => {
                const stato = marca(riga, index, anteprima, chiavi);
                const testo = rigaVisibile(riga, t);
                return (
                  <li key={`${riga.data}-${riga.ora}-${index}`}>
                    <label className={`flex items-start gap-3 rounded-xl border border-line px-3 py-2 text-sm ${stato === "ok" ? "" : "opacity-60"}`}>
                      <input
                        type="checkbox"
                        className="mt-1 size-5"
                        checked={stato === "ok" && scelte.has(index)}
                        disabled={stato !== "ok" || busy}
                        onChange={() => {
                          setScelte((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          });
                        }}
                      />
                      <span>
                        <span className="block">{testo.quando}</span>
                        <span className="mt-1 block">{testo.dove}</span>
                        <span className="mt-1 block text-xs text-mist">{[testo.metri, testo.durata, testo.profilo].filter(Boolean).join(" · ")}</span>
                        {stato === "logbook" ? <span className="mt-1 block text-xs text-brass">{t("Già nel logbook")}</span> : null}
                        {stato === "doppia" ? <span className="mt-1 block text-xs text-brass">{t("Stessa data e ora")}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {anteprima.length ? (
            <button type="button" disabled={busy} className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void conferma()}>
              {busy ? t("Salvo…") : t("Salva le selezionate")}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-mist">{t("Solo le immersioni di questo account: data, sito, profondità, durata e profilo se c'è.")}</p>
          <p className="mt-1 text-sm text-mist">{t("Il file scaricato è UDDF.")}</p>
          {righe.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessuna immersione da esportare.")}</p> : null}
          {righe.length ? (
            <div className="mt-4 grid gap-2">
              <label className="flex items-center gap-3 text-sm">
                <input type="radio" name="export" className="size-5" checked={tutto} onChange={() => setTutto(true)} />
                {t("Tutto il logbook")}
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input type="radio" name="export" className="size-5" checked={!tutto} onChange={() => setTutto(false)} />
                {t("Solo le selezionate")}
              </label>
            </div>
          ) : null}
          {!tutto && righe.length >= 500 ? <p className="mt-2 text-xs text-mist">{t("Qui si scelgono le ultime 500. Tutto il logbook scarica anche le più vecchie.")}</p> : null}
          {!tutto && righe.length ? (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {righe.map((row) => (
                <li key={row.id}>
                  <label className="flex items-start gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={scelteExport.has(row.id)}
                      onChange={() => {
                        setScelteExport((current) => {
                          const next = new Set(current);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <span className="block">{formatDay(row.data)}{row.ora ? ` ${row.ora}` : ""}</span>
                      <span className="mt-1 block">{nomeSito(row.localita, t)}{row.punto ? ` · ${row.punto}` : ""}</span>
                      <span className="mt-1 block text-xs text-mist">
                        {[row.profondita ? `${row.profondita} m` : t("Profondità non indicata"), row.minuti ? `${row.minuti} min` : t("Durata non indicata")].join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {righe.length ? (
            <button type="button" disabled={busy} className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void scarica()}>
              {busy ? t("Preparo…") : t("Scarica il file")}
            </button>
          ) : null}
        </>
      )}
      {esito ? <p className="mt-3 text-sm text-foam">{esito}</p> : null}
      {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
    </section>
  );
}

function marca(riga: UddfRiga, index: number, tutte: UddfRiga[], chiavi: Set<string>): "ok" | "logbook" | "doppia" {
  const chiave = chiaveQuando(riga.data, riga.ora);
  if (chiavi.has(chiave)) return "logbook";
  for (let i = 0; i < index; i += 1) {
    if (chiaveQuando(tutte[i].data, tutte[i].ora) === chiave) return "doppia";
  }
  return "ok";
}

function nomeSito(nome: string, t: Traduci): string {
  return nome === "Sito non indicato" ? t(nome) : nome;
}

function rigaVisibile(riga: UddfRiga, t: Traduci): { quando: string; dove: string; metri: string; durata: string; profilo: string } {
  return {
    quando: `${formatDay(riga.data)}${riga.ora ? ` ${riga.ora}` : ""}`,
    dove: `${nomeSito(riga.localita, t)}${riga.punto ? ` · ${riga.punto}` : ""}`,
    metri: riga.profondita ? `${riga.profondita} m` : t("Profondità non indicata"),
    durata: riga.minuti ? `${riga.minuti} min` : t("Durata non indicata"),
    profilo: riga.profilo.length ? t("con profilo") : "",
  };
}
