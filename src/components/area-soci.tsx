import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, Waves } from "lucide-react";
import { ClubLogo } from "@/components/club-logo";
import { FotoPiena } from "@/components/foto-vista";
import { DocumentiSocio } from "@/components/documenti-socio";
import { toDataURL } from "qrcode";
import {
  aggiornaNotaSocio,
  decidiSocio,
  listaSoci,
  mieiDiving,
  rimuoviSocio,
  scaricaDocumentoSoci,
  statoSchedaSocio,
  tesseraScheda,
  type ListaSoci,
  type MioDiving,
  type StatoSchedaSocio,
  type TesseraSocioDato,
} from "@/lib/fondale.functions";
import { formatDay, oggiRoma } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";

type SceltaNumero = "nuovo" | "precedente";

export function PulsanteSoci() {
  const t = useT();
  const [inAttesa, setInAttesa] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    listaSoci()
      .then((value) => {
        if (live) setInAttesa(value.inAttesa.length);
      })
      .catch(() => {
        if (live) setInAttesa(null);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Link to="/soci" className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-deep px-4 text-base font-medium text-foam">
      <Users className="size-5 shrink-0 text-lagoon" aria-hidden />
      <span className="flex-1">{t("Soci")}</span>
      {inAttesa ? <span className="text-xs font-normal text-brass">{t("{n} in attesa", { n: inAttesa })}</span> : null}
    </Link>
  );
}

export function AreaSoci() {
  const t = useT();
  const [dato, setDato] = useState<ListaSoci | null>(null);
  const [anno, setAnno] = useState<number | null>(null);
  const [cerca, setCerca] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apertoId, setApertoId] = useState<number | null>(null);
  const [vista, setVista] = useState<"attivi" | "rifiutati">("attivi");

  function carica() {
    return listaSoci()
      .then((value) => {
        setDato(value);
        setAnno((current) => current ?? value.anno);
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a leggere i soci.")));
  }

  useEffect(() => {
    let live = true;
    listaSoci()
      .then((value) => {
        if (!live) return;
        setDato(value);
        setAnno(value.anno);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere i soci."));
      });
    return () => {
      live = false;
    };
  }, []);

  const anni = dato
    ? [...new Set([dato.anno, ...dato.soci.map((row) => row.anno), ...dato.rifiutati.map((row) => row.anno)])].sort((a, b) => b - a)
    : [];
  const scelto = anno ?? dato?.anno ?? 0;
  const q = cerca.trim().toLowerCase();
  function nelNome(nome: string, cognome: string) {
    if (!q) return true;
    return `${cognome} ${nome}`.toLowerCase().includes(q) || `${nome} ${cognome}`.toLowerCase().includes(q);
  }
  const visibili = (dato?.soci ?? []).filter((row) => row.anno === scelto && nelNome(row.nome, row.cognome));
  const rifiutatiVisibili = (dato?.rifiutati ?? []).filter((row) => row.anno === scelto && nelNome(row.nome, row.cognome));
  const aperto = vista === "attivi" ? (visibili.find((row) => row.id === apertoId) ?? null) : null;
  const apertoRifiuto = vista === "rifiutati" ? (rifiutatiVisibili.find((row) => row.id === apertoId) ?? null) : null;
  const daRinnovare = Boolean(dato && scelto < dato.anno);

  async function decidi(submissionId: number, azione: "accetta" | "rifiuta", nota: string, numeroScelta: SceltaNumero) {
    if (busy) return;
    if (azione === "rifiuta" && !window.confirm(t("Rifiutare questa Scheda socio?"))) return;
    setBusy(true);
    setErrore(null);
    try {
      await decidiSocio({ data: { submissionId, azione, nota, numeroScelta } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a chiudere la scheda."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {!dato ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {dato ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Link to="/comunicazioni-soci" className="inline-flex min-h-11 items-center rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
              {t("Comunicazioni e documenti")}
            </Link>
            <Link to="/attivita-soci" search={{ id: undefined, club: undefined, socio: false }} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium">
              {t("Attività")}
            </Link>
          </div>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">{t("Cerca per nome o cognome")}</span>
            <input value={cerca} onChange={(event) => setCerca(event.target.value)} placeholder={t("Nome o cognome")} className="min-h-12 w-full rounded-2xl border border-line bg-abyss px-4 text-base outline-none focus-visible:border-lagoon" />
          </label>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">{t("Anno")}</p>
            <div className="flex gap-2 overflow-x-auto">
              {anni.map((voce) => (
                <button
                  key={voce}
                  type="button"
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${scelto === voce ? "bg-lagoon font-medium text-ink" : "border border-line"}`}
                  onClick={() => setAnno(voce)}
                >
                  {voce}
                </button>
              ))}
            </div>
          </div>
          {dato.inAttesa.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {dato.inAttesa.map((row) => (
                <Richiesta key={row.id} row={row} busy={busy} onDecidi={decidi} />
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex rounded-full border border-line p-1" role="group" aria-label={t("Soci")}>
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-full text-sm ${vista === "attivi" ? "bg-lagoon font-medium text-ink" : ""}`}
              aria-pressed={vista === "attivi"}
              onClick={() => {
                setVista("attivi");
                setApertoId(null);
              }}
            >
              {t("Soci attivi")}
            </button>
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-full text-sm ${vista === "rifiutati" ? "bg-lagoon font-medium text-ink" : ""}`}
              aria-pressed={vista === "rifiutati"}
              onClick={() => {
                setVista("rifiutati");
                setApertoId(null);
              }}
            >
              {t("Soci rifiutati")}
            </button>
          </div>
          {vista === "attivi" && aperto && dato ? (
            <DettaglioSocio
              row={aperto}
              corrente={aperto.anno === dato.anno}
              daRinnovare={daRinnovare}
              busy={busy}
              onChiudi={() => setApertoId(null)}
              onNota={async (nota) => {
                setBusy(true);
                setErrore(null);
                try {
                  await aggiornaNotaSocio({ data: { id: aperto.id, nota } });
                  await carica();
                } catch (reason) {
                  setErrore(messaggioErrore(reason, "Nota non salvata."));
                } finally {
                  setBusy(false);
                }
              }}
              onRimuovi={async () => {
                if (!window.confirm(t("Togliere questo socio dall'anno in corso? Il numero non si riusa."))) return;
                setBusy(true);
                setErrore(null);
                try {
                  await rimuoviSocio({ data: { id: aperto.id } });
                  setApertoId(null);
                  await carica();
                } catch (reason) {
                  setErrore(messaggioErrore(reason, "Non riesco a togliere il socio."));
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <>
              {visibili.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessun socio in questo anno.")}</p> : (
              <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-deep">
                {visibili.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                    <span className="w-8 shrink-0 text-sm font-medium text-brass">{row.numero}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.cognome} {row.nome}</span>
                      <span className="block truncate text-xs text-mist">{row.brevetto || t("Brevetto non indicato")}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${daRinnovare ? "bg-brass/15 text-brass" : "bg-lagoon/15 text-lagoon"}`}>
                      {daRinnovare ? t("Da rinnovare") : t("Attivo")}
                    </span>
                    <button type="button" className="min-h-11 shrink-0 rounded-full border border-line px-3 text-sm" onClick={() => setApertoId(row.id)}>
                      {t("Apri")}
                    </button>
                  </li>
                ))}
              </ul>
              )}
            </>
          )}
          {vista === "rifiutati" && apertoRifiuto ? (
            <DettaglioRifiutato
              row={apertoRifiuto}
              busy={busy}
              onChiudi={() => setApertoId(null)}
              onNota={async (nota) => {
                setBusy(true);
                setErrore(null);
                try {
                  await aggiornaNotaSocio({ data: { id: apertoRifiuto.id, nota } });
                  await carica();
                } catch (reason) {
                  setErrore(messaggioErrore(reason, "Nota non salvata."));
                } finally {
                  setBusy(false);
                }
              }}
              onRipristina={async (nota, numero) => {
                setBusy(true);
                setErrore(null);
                try {
                  await decidiSocio({ data: { submissionId: apertoRifiuto.submissionId, azione: "accetta", nota, numeroScelta: numero } });
                  setApertoId(null);
                  setVista("attivi");
                  await carica();
                } catch (reason) {
                  setErrore(messaggioErrore(reason, "Non riesco a chiudere la scheda."));
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          {vista === "rifiutati" && !apertoRifiuto ? (
            rifiutatiVisibili.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessun socio rifiutato in questo anno.")}</p> : (
              <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-deep">
                {rifiutatiVisibili.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                    <span className="w-8 shrink-0 text-sm font-medium text-brass">{row.numero ?? "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.cognome} {row.nome}</span>
                      <span className="block truncate text-xs text-mist">
                        {row.brevetto || t("Brevetto non indicato")}
                        {row.rifiutatoIl ? ` · ${formatDay(row.rifiutatoIl)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-danger/15 px-2 py-1 text-[11px] font-medium text-danger">{t("Rifiutato")}</span>
                    <button type="button" className="min-h-11 shrink-0 rounded-full border border-line px-3 text-sm" onClick={() => setApertoId(row.id)}>
                      {t("Apri")}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SceltaNumeroSocio({
  precedente,
  valore,
  onChange,
}: {
  precedente: number | null;
  valore: SceltaNumero;
  onChange: (valore: SceltaNumero) => void;
}) {
  const t = useT();
  if (!precedente) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={`min-h-11 rounded-full px-4 text-sm ${valore === "nuovo" ? "bg-tide font-medium text-white" : "border border-line"}`} onClick={() => onChange("nuovo")}>
        {t("Nuovo numero")}
      </button>
      <button type="button" className={`min-h-11 rounded-full px-4 text-sm ${valore === "precedente" ? "bg-tide font-medium text-white" : "border border-line"}`} onClick={() => onChange("precedente")}>
        {t("Tieni il n. {numero}", { numero: precedente })}
      </button>
    </div>
  );
}

function Richiesta({
  row,
  busy,
  onDecidi,
}: {
  row: ListaSoci["inAttesa"][number];
  busy: boolean;
  onDecidi: (id: number, azione: "accetta" | "rifiuta", nota: string, numeroScelta: SceltaNumero) => Promise<void>;
}) {
  const t = useT();
  const [nota, setNota] = useState("");
  const [numero, setNumero] = useState<SceltaNumero>("nuovo");
  return (
    <li className="rounded-2xl border border-line bg-deep px-4 py-3">
      <p className="text-sm font-medium">{row.cognome} {row.nome}</p>
      <p className="mt-1 text-xs text-mist">{t("Scheda socio in attesa")} · {formatDay(row.giorno)} · {t("Anno {anno}", { anno: row.anno })}</p>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Nota sul socio")}</span>
        <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder={t("socio ordinario, sostenitore…")} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <SceltaNumeroSocio precedente={row.numeroPrecedente} valore={numero} onChange={setNumero} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void onDecidi(row.id, "accetta", nota, numero)}>
          {t("Accetta")}
        </button>
        <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" onClick={() => void onDecidi(row.id, "rifiuta", nota, "nuovo")}>
          {t("Rifiuta")}
        </button>
        <Link to="/scheda/$id" params={{ id: String(row.id) }} className="inline-flex min-h-11 items-center text-sm text-lagoon">
          {t("Apri scheda")}
        </Link>
      </div>
    </li>
  );
}

function DettaglioRifiutato({
  row,
  busy,
  onChiudi,
  onNota,
  onRipristina,
}: {
  row: ListaSoci["rifiutati"][number];
  busy: boolean;
  onChiudi: () => void;
  onNota: (nota: string) => Promise<void>;
  onRipristina: (nota: string, numero: SceltaNumero) => Promise<void>;
}) {
  const t = useT();
  const [nota, setNota] = useState(row.nota);
  const [numero, setNumero] = useState<SceltaNumero>("nuovo");
  useEffect(() => setNota(row.nota), [row.nota]);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-3">
      <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>
        {t("Indietro")}
      </button>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-brass">{row.numero == null ? "—" : t("N. {numero}", { numero: row.numero })}</p>
          <p className="mt-1 text-lg font-medium">{row.cognome} {row.nome}</p>
          <p className="mt-1 text-sm text-mist">{row.brevetto || t("Brevetto non indicato")}</p>
          <p className="mt-1 text-xs text-mist">{row.rifiutatoIl ? formatDay(row.rifiutatoIl) : ""}</p>
        </div>
        <span className="shrink-0 rounded-full bg-danger/15 px-2 py-1 text-[11px] font-medium text-danger">{t("Rifiutato")}</span>
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-mist">{t("Nota")}</span>
        <input value={nota} onChange={(event) => setNota(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <SceltaNumeroSocio precedente={row.numeroPrecedente} valore={numero} onChange={setNumero} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || nota.trim() === row.nota.trim()} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => void onNota(nota)}>
          {t("Salva nota")}
        </button>
        <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void onRipristina(nota, numero)}>
          {t("Riaccetta")}
        </button>
        <Link to="/scheda/$id" params={{ id: String(row.submissionId) }} className="inline-flex min-h-11 items-center text-sm text-lagoon">
          {t("Apri scheda")}
        </Link>
      </div>
    </div>
  );
}

function DettaglioSocio({
  row,
  corrente,
  daRinnovare,
  busy,
  onChiudi,
  onNota,
  onRimuovi,
}: {
  row: ListaSoci["soci"][number];
  corrente: boolean;
  daRinnovare: boolean;
  busy: boolean;
  onChiudi: () => void;
  onNota: (nota: string) => Promise<void>;
  onRimuovi: () => Promise<void>;
}) {
  const t = useT();
  const [nota, setNota] = useState(row.nota);
  useEffect(() => setNota(row.nota), [row.nota]);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-3">
      <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>
        {t("Indietro")}
      </button>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-brass">{t("N. {numero}", { numero: row.numero })}</p>
          <p className="mt-1 text-lg font-medium">{row.cognome} {row.nome}</p>
          <p className="mt-1 text-sm text-mist">{row.brevetto || t("Brevetto non indicato")}</p>
          <p className="mt-1 text-xs text-mist">{t("Accettato il {data}", { data: formatDay(row.accettatoIl) })} · {t("Anno {anno}", { anno: row.anno })}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${daRinnovare ? "bg-brass/15 text-brass" : "bg-lagoon/15 text-lagoon"}`}>
          {daRinnovare ? t("Da rinnovare") : t("Attivo")}
        </span>
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-mist">{t("Nota")}</span>
        <input value={nota} onChange={(event) => setNota(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || nota.trim() === row.nota.trim()} className="min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={() => void onNota(nota)}>
          {t("Salva nota")}
        </button>
        {corrente ? (
          <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm text-brass disabled:opacity-60" onClick={() => void onRimuovi()}>
            {t("Togli socio")}
          </button>
        ) : null}
        <Link to="/scheda/$id" params={{ id: String(row.submissionId) }} className="inline-flex min-h-11 items-center text-sm text-lagoon">
          {t("Apri scheda")}
        </Link>
      </div>
      <DocumentiSocio submissionId={row.submissionId} puoCaricare={false} />
    </div>
  );
}

function immagineAllegato(nome: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(nome);
}

export function AllegatoComunicazione({ id, nome }: { id: number; nome: string }) {
  const t = useT();
  const immagine = immagineAllegato(nome);
  const [data, setData] = useState<string | null>(null);
  const [piena, setPiena] = useState(false);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    if (!immagine) return;
    let live = true;
    scaricaDocumentoSoci({ data: { id } })
      .then((file) => {
        if (live) setData(file.data);
      })
      .catch(() => {
        if (live) setErrore(true);
      });
    return () => {
      live = false;
    };
  }, [id, immagine]);

  async function contenuto(): Promise<string> {
    if (data) return data;
    const file = await scaricaDocumentoSoci({ data: { id } });
    setData(file.data);
    return file.data;
  }

  function salva(href: string) {
    const link = document.createElement("a");
    link.href = href;
    link.download = nome;
    link.click();
  }

  return (
    <li>
      {immagine && data ? (
        <button type="button" className="block" onClick={() => setPiena(true)}>
          <img src={data} alt={nome} className="mt-1 max-h-48 rounded-xl object-contain" />
        </button>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 text-sm text-lagoon"
          onClick={() => {
            void contenuto()
              .then(() => setPiena(true))
              .catch(() => setErrore(true));
          }}
        >
          {t("Apri")}
        </button>
        <button
          type="button"
          className="min-h-11 text-sm text-lagoon"
          onClick={() => {
            void contenuto()
              .then(salva)
              .catch(() => setErrore(true));
          }}
        >
          {t("Scarica")} {nome}
        </button>
      </div>
      {errore ? <p className="text-xs text-brass">{t("Documento non disponibile.")}</p> : null}
      {piena && data ? <FotoPiena src={data} alt={nome} onClose={() => setPiena(false)} /> : null}
    </li>
  );
}

function TesseraSocio({
  intestatario,
  numero,
  club,
  clubId,
  hasLogo,
  anno,
  verifica,
}: {
  intestatario: string;
  numero: number;
  club: string;
  clubId: number;
  hasLogo: boolean;
  anno: number;
  verifica: string;
}) {
  const t = useT();
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!verifica) return;
    const indirizzo = `${window.location.origin}/tessera/${verifica}`;
    let live = true;
    toDataURL(indirizzo, { margin: 1, width: 280, errorCorrectionLevel: "M", color: { dark: "#07141a", light: "#ffffff" } })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setSrc("");
      });
    return () => {
      live = false;
    };
  }, [verifica]);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-deep">
      <div className="h-1.5 bg-lagoon" />
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-abyss text-lagoon">
            <Waves className="size-6" aria-hidden />
            <ClubLogo id={clubId} hasLogo={hasLogo} name={club} className="absolute inset-0 h-14 w-14 bg-white object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-brass">{t("Tessera socio")}</p>
            <p className="mt-1 text-sm text-mist">{club}</p>
          </div>
        </div>
        <p className="mt-4 text-2xl leading-tight">{intestatario}</p>
        <p className="mt-2 text-sm">{t("N. {numero}", { numero })} · {t("Anno {anno}", { anno })}</p>
        {src ? <img src={src} alt="" className="mx-auto mt-4 h-40 w-40 rounded-xl bg-white p-2" /> : null}
      </div>
    </article>
  );
}

function TesseraScheda({ submissionId }: { submissionId: number }) {
  const [tessera, setTessera] = useState<TesseraSocioDato | null>(null);

  useEffect(() => {
    let live = true;
    tesseraScheda({ data: { submissionId } })
      .then((value) => {
        if (live) setTessera(value);
      })
      .catch(() => {
        if (live) setTessera(null);
      });
    return () => {
      live = false;
    };
  }, [submissionId]);

  if (!tessera) return null;
  return <TesseraSocio intestatario={tessera.intestatario} numero={tessera.numero} club={tessera.club} clubId={tessera.clubId} hasLogo={tessera.hasLogo} anno={tessera.anno} verifica={tessera.verifica} />;
}

export function IMieiDiving() {
  const t = useT();
  const [righe, setRighe] = useState<MioDiving[] | null>(null);
  const [schermata, setSchermata] = useState<{ tipo: "tessera" | "documenti"; row: MioDiving } | null>(null);
  const annoOggi = Number(oggiRoma().slice(0, 4));

  useEffect(() => {
    let live = true;
    mieiDiving()
      .then((value) => {
        if (live) setRighe(value);
      })
      .catch(() => {
        if (live) setRighe([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (schermata?.tipo === "documenti") {
    const row = schermata.row;
    return (
      <section className="mt-8">
        <button type="button" className="min-h-11 text-sm text-lagoon" onClick={() => setSchermata(null)}>
          {t("Indietro")}
        </button>
        <h2 className="mt-2 text-3xl leading-none">{t("Documenti")}</h2>
        <p className="mt-1 text-sm text-mist">{row.nome}</p>
        <DocumentiSocio submissionId={row.submissionId} puoCaricare scadenzeChiare />
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{t("I miei diving")}</h2>
      {righe === null ? <p className="mt-2 text-sm text-mist">{t("Carico…")}</p> : null}
      {righe && righe.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Non sei socio di nessun diving.")}</p> : null}
      <ul className="mt-3 grid gap-5">
        {righe?.map((row) => {
          const daRinnovare = row.anno < annoOggi;
          return (
            <li key={row.submissionId}>
              <div className="rounded-2xl border border-line bg-deep px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium">{row.nome}</p>
                    <p className="mt-1 text-sm text-mist">{t("N. {numero}", { numero: row.numero })} · {t("Anno {anno}", { anno: row.anno })}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${daRinnovare ? "bg-brass/15 text-brass" : "bg-lagoon/15 text-lagoon"}`}>
                    {daRinnovare ? t("Da rinnovare") : t("Attivo")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => setSchermata({ tipo: "tessera", row })}>
                    {t("Tessera")}
                  </button>
                  <Link to="/attivita-soci" search={{ id: undefined, club: row.clubId, socio: true }} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
                    {t("Attività")}
                  </Link>
                  <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setSchermata({ tipo: "documenti", row })}>
                    {t("Documenti")}
                  </button>
                  <Link to="/scheda/$id" params={{ id: String(row.submissionId) }} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
                    {t("Apri scheda")}
                  </Link>
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm font-medium">{row.mezzoNautico ? t("Comunicazioni del Diving") : t("Comunicazioni della scuola")}</p>
                  {row.comunicazioni.length === 0 ? <p className="mt-1 text-sm text-mist">{t("Nessuna comunicazione, per ora.")}</p> : (
                    <ul className="mt-2 space-y-3">
                      {row.comunicazioni.map((voce) => (
                        <li key={voce.id}>
                          <p className="text-sm font-medium">{voce.titolo}</p>
                          <p className="text-xs text-mist">{formatDay(voce.quando)}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-mist">{voce.corpo}</p>
                          {voce.file.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {voce.file.map((allegato) => (
                                <AllegatoComunicazione key={allegato.id} id={allegato.id} nome={allegato.nome} />
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {schermata?.tipo === "tessera" ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-abyss px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <h2 className="text-2xl leading-none">{t("Tessera socio")}</h2>
            <button type="button" className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm" onClick={() => setSchermata(null)}>
              {t("Chiudi")}
            </button>
          </div>
          <div className="mx-auto mt-4 max-w-md">
            <TesseraSocio intestatario={schermata.row.intestatario} numero={schermata.row.numero} club={schermata.row.nome} clubId={schermata.row.clubId} hasLogo={schermata.row.hasLogo} anno={schermata.row.anno} verifica={schermata.row.verifica} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function DecisioneSocio({
  submissionId,
  banco,
  onNumero,
}: {
  submissionId: number;
  banco: boolean;
  onNumero: (numero: string) => void;
}) {
  const t = useT();
  const [stato, setStato] = useState<StatoSchedaSocio | null>(null);
  const [nota, setNota] = useState("");
  const [numero, setNumero] = useState<SceltaNumero>("nuovo");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    statoSchedaSocio({ data: { submissionId } })
      .then((value) => {
        if (!live) return;
        setStato(value);
        if (value.numero) onNumero(String(value.numero));
      })
      .catch(() => {
        if (live) setStato(null);
      });
    return () => {
      live = false;
    };
  }, [submissionId, onNumero]);

  if (!stato) return null;
  const tessera = stato.stato === "accettato" && stato.numero && !stato.rimosso ? <TesseraScheda submissionId={submissionId} /> : null;
  if (!banco) {
    if (stato.stato === "in-attesa") return <p className="mt-3 text-sm text-mist">{t("In attesa di accettazione dal diving.")} {stato.anno ? t("Anno {anno}", { anno: stato.anno }) : ""}</p>;
    if (stato.stato === "rifiutato") return <p className="mt-3 text-sm text-brass">{t("Il diving non ha accettato la scheda.")}</p>;
    if (stato.rimosso) return <p className="mt-3 text-sm text-mist">{t("Non sei più socio di questo diving per l'anno in corso.")}</p>;
    return (
      <>
        {tessera}
        <p className="mt-3 text-sm text-foam">{t("Socio n. {numero}", { numero: stato.numero ?? "" })}{stato.anno ? ` · ${t("Anno {anno}", { anno: stato.anno })}` : ""}</p>
      </>
    );
  }
  if (stato.stato === "accettato") {
    return (
      <>
        {tessera}
        <p className="mt-3 text-sm text-foam">
          {stato.rimosso ? t("Socio rimosso. Il numero {numero} non si riusa.", { numero: stato.numero ?? "" }) : t("Socio n. {numero}", { numero: stato.numero ?? "" })}
          {stato.anno ? ` · ${t("Anno {anno}", { anno: stato.anno })}` : ""}
          {stato.nota ? ` · ${stato.nota}` : ""}
        </p>
      </>
    );
  }
  const rifiutata = stato.stato === "rifiutato";
  return (
    <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-3">
      <p className="text-sm font-medium">{rifiutata ? t("Riaccetta la Scheda socio") : t("Accetta la Scheda socio")}</p>
      <p className="mt-1 text-sm text-mist">
        {stato.anno ? t("Va nell'archivio del {anno}.", { anno: stato.anno }) : t("Il numero progressivo si assegna solo adesso, per questo diving.")}
      </p>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Nota sul socio")}</span>
        <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder={t("socio ordinario, sostenitore…")} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <SceltaNumeroSocio precedente={stato.numeroPrecedente} valore={numero} onChange={setNumero} />
      {errore ? <p className="mt-2 text-sm text-brass">{errore}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            setErrore(null);
            void decidiSocio({ data: { submissionId, azione: "accetta", nota, numeroScelta: numero } })
              .then((esito) => {
                setStato({ stato: "accettato", numero: esito.numero, nota, anno: stato.anno, rimosso: false, numeroPrecedente: null });
                if (esito.numero) onNumero(String(esito.numero));
              })
              .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a chiudere la scheda.")))
              .finally(() => setBusy(false));
          }}
        >
          {rifiutata ? t("Riaccetta") : t("Accetta")}
        </button>
        {rifiutata ? null : (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
            onClick={() => {
              if (!window.confirm(t("Rifiutare questa Scheda socio?"))) return;
              setBusy(true);
              setErrore(null);
              void decidiSocio({ data: { submissionId, azione: "rifiuta", nota: "", numeroScelta: "nuovo" } })
                .then(() => setStato({ stato: "rifiutato", numero: null, nota: "", anno: stato.anno, rimosso: false, numeroPrecedente: stato.numeroPrecedente }))
                .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a chiudere la scheda.")))
                .finally(() => setBusy(false));
            }}
          >
            {t("Rifiuta")}
          </button>
        )}
      </div>
    </div>
  );
}
