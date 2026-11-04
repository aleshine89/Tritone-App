import { useEffect, useState } from "react";
import { FotoPiena } from "@/components/foto-vista";
import { useRitaglioDocumento } from "@/components/ritaglio-documento";
import { decifraFile } from "@/lib/cifrario";
import {
  getDocumentoFile,
  listDocumenti,
  listaDocumentiSocio,
  salvaDocumentoSocio,
  scaricaDocumentoSocio,
  togliDocumentoSocio,
  type Documento,
  type DocumentoSocioVoce,
} from "@/lib/fondale.functions";
import { formatDay, oggiRoma, scadenzaStato } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";
import { prepareFile } from "@/lib/prepare-file";

type Kind = "medico" | "assicurazione";

export function DocumentiSocio({ submissionId, puoCaricare, scadenzeChiare = false }: { submissionId: number; puoCaricare: boolean; scadenzeChiare?: boolean }) {
  const t = useT();
  const ritaglio = useRitaglioDocumento();
  const [oggi, setOggi] = useState(oggiRoma);
  const [medico, setMedico] = useState<DocumentoSocioVoce | null>(null);
  const [assicurazione, setAssicurazione] = useState<DocumentoSocioVoce | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  function carica() {
    return listaDocumentiSocio({ data: { submissionId } }).then((value) => {
      setMedico(value.medico);
      setAssicurazione(value.assicurazione);
      setPronto(true);
    });
  }

  useEffect(() => {
    let live = true;
    listaDocumentiSocio({ data: { submissionId } })
      .then((value) => {
        if (!live) return;
        setMedico(value.medico);
        setAssicurazione(value.assicurazione);
        setPronto(true);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setErrore(messaggioErrore(reason, "Non riesco a leggere i documenti."));
        setPronto(true);
      });
    const clock = window.setInterval(() => setOggi(oggiRoma()), 15000);
    return () => {
      live = false;
      window.clearInterval(clock);
    };
  }, [submissionId]);

  return (
    <section className="mt-4 grid gap-3">
      {errore ? <p className="text-sm text-brass">{errore}</p> : null}
      {!pronto ? <p className="text-sm text-mist">{t("Carico…")}</p> : null}
      <Blocco
        kind="medico"
        titolo="Certificato medico"
        voce={medico}
        oggi={oggi}
        pronto={pronto}
        puoCaricare={puoCaricare}
        scadenzeChiare={scadenzeChiare}
        submissionId={submissionId}
        ritaglio={ritaglio.chiedi}
        onErrore={setErrore}
        onSalvato={() => void carica().catch((reason: unknown) => setErrore(messaggioErrore(reason, "Documento non salvato.")))}
      />
      <Blocco
        kind="assicurazione"
        titolo="Assicurazione"
        voce={assicurazione}
        oggi={oggi}
        pronto={pronto}
        puoCaricare={puoCaricare}
        scadenzeChiare={scadenzeChiare}
        submissionId={submissionId}
        ritaglio={ritaglio.chiedi}
        onErrore={setErrore}
        onSalvato={() => void carica().catch((reason: unknown) => setErrore(messaggioErrore(reason, "Documento non salvato.")))}
      />
      {ritaglio.pannello}
    </section>
  );
}

function Blocco({
  kind,
  titolo,
  voce,
  oggi,
  pronto,
  puoCaricare,
  scadenzeChiare,
  submissionId,
  ritaglio,
  onErrore,
  onSalvato,
}: {
  kind: Kind;
  titolo: string;
  voce: DocumentoSocioVoce | null;
  oggi: string;
  pronto: boolean;
  puoCaricare: boolean;
  scadenzeChiare: boolean;
  submissionId: number;
  ritaglio: (file: File) => Promise<File | null>;
  onErrore: (testo: string | null) => void;
  onSalvato: () => void;
}) {
  const t = useT();
  const [scadenza, setScadenza] = useState("");
  const [personali, setPersonali] = useState<Documento[] | null>(null);
  const [scegli, setScegli] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aperto, setAperto] = useState<{ src: string; nome: string } | null>(null);
  const stato = voce?.scadenza ? scadenzaStato(voce.scadenza, oggi) : "mancante";

  async function salva(file: { name: string; type: string; data: string }, meta: { titolo: string; scadenza: string }) {
    await salvaDocumentoSocio({
      data: {
        submissionId,
        kind,
        titolo: meta.titolo,
        scadenza: meta.scadenza,
        file,
      },
    });
    onSalvato();
  }

  async function daFile(ingresso: File) {
    const scelto = await ritaglio(ingresso);
    if (!scelto) return;
    setBusy(true);
    onErrore(null);
    try {
      const pronto = await prepareFile(scelto);
      await salva(pronto, { titolo: t(titolo), scadenza });
      setScadenza("");
    } catch (reason) {
      onErrore(messaggioErrore(reason, "Documento non salvato."));
    } finally {
      setBusy(false);
    }
  }

  async function daPersonale(doc: Documento) {
    setBusy(true);
    onErrore(null);
    try {
      const stored = await getDocumentoFile({ data: { id: doc.id } });
      const apertoFile = stored.data.startsWith("{") ? await decifraFile(stored.data) : stored.data;
      const blob = await (await fetch(apertoFile)).blob();
      const file = new File([blob], stored.name || doc.fileName || "documento", { type: stored.type || blob.type });
      const pronto = await prepareFile(file);
      await salva(pronto, { titolo: doc.titolo || t(titolo), scadenza: doc.scadenza });
      setScegli(false);
    } catch (reason) {
      onErrore(messaggioErrore(reason, "Documento non salvato."));
    } finally {
      setBusy(false);
    }
  }

  function apriElenco() {
    setScegli((value) => !value);
    if (personali) return;
    void listDocumenti()
      .then((items) => setPersonali(items.filter((item) => item.kind === kind && item.hasFile)))
      .catch((reason: unknown) => onErrore(messaggioErrore(reason, "Non riesco a leggere i documenti.")));
  }

  async function contenuto() {
    if (!voce) throw new Error("Documento non disponibile.");
    return scaricaDocumentoSocio({ data: { id: voce.id } });
  }

  return (
    <div className="rounded-2xl border border-line bg-deep px-4 py-3">
      <p className="text-sm font-medium">{t(titolo)}</p>
      {voce ? (
        <div className="mt-2">
          <p className="truncate text-sm text-mist">{voce.titolo || voce.nome}</p>
          {voce.scadenza && scadenzeChiare ? (
            <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${stato === "scaduta" ? "bg-danger/15 text-danger" : stato === "in-scadenza" ? "bg-brass/20 text-brass" : "bg-lagoon/15 text-lagoon"}`}>
              {t("Scadenza")} {formatDay(voce.scadenza)}
              {stato === "scaduta" ? ` · ${t("Scaduto")}` : stato === "in-scadenza" ? ` · ${t("In scadenza")}` : ""}
            </p>
          ) : null}
          {voce.scadenza && !scadenzeChiare ? (
            <p className={`mt-1 text-sm ${stato === "scaduta" ? "font-medium text-danger" : stato === "in-scadenza" ? "font-medium text-brass" : "text-mist"}`}>
              {t("Scadenza")} {formatDay(voce.scadenza)}
              {stato === "scaduta" ? ` · ${t("Scaduto")}` : stato === "in-scadenza" ? ` · ${t("In scadenza")}` : ""}
            </p>
          ) : null}
          {!voce.scadenza && scadenzeChiare ? <p className="mt-2 inline-flex rounded-full bg-brass/15 px-3 py-1 text-sm font-medium text-brass">{t("Scadenza non indicata")}</p> : null}
          <div className="mt-1 flex flex-wrap gap-3">
            <button
              type="button"
              className="min-h-11 text-sm text-lagoon"
              onClick={() => {
                void contenuto()
                  .then((file) => setAperto({ src: file.data, nome: file.nome }))
                  .catch((reason: unknown) => onErrore(messaggioErrore(reason, "Documento non disponibile.")));
              }}
            >
              {t("Apri")}
            </button>
            <button
              type="button"
              className="min-h-11 text-sm text-lagoon"
              onClick={() => {
                void contenuto()
                  .then((file) => {
                    const link = document.createElement("a");
                    link.href = file.data;
                    link.download = file.nome;
                    link.click();
                  })
                  .catch((reason: unknown) => onErrore(messaggioErrore(reason, "Documento non disponibile.")));
              }}
            >
              {t("Scarica")}
            </button>
            {puoCaricare ? (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 text-sm text-brass disabled:opacity-60"
                onClick={() => {
                  if (!window.confirm(t("Togliere questo documento?"))) return;
                  setBusy(true);
                  onErrore(null);
                  void togliDocumentoSocio({ data: { submissionId, kind } })
                    .then(() => onSalvato())
                    .catch((reason: unknown) => onErrore(messaggioErrore(reason, "Documento non salvato.")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("Togli")}
              </button>
            ) : null}
          </div>
        </div>
      ) : pronto && !puoCaricare ? (
        <p className="mt-1 text-sm text-mist">{t("Nessun file allegato.")}</p>
      ) : null}
      {puoCaricare ? (
        <div className="mt-3">
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Scadenza, se la conosci")}</span>
            <input type="date" value={scadenza} onChange={(event) => setScadenza(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
              {busy ? t("Salvo…") : t("Carica un file")}
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,.pdf"
                disabled={busy}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void daFile(file);
                }}
              />
            </label>
            <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" onClick={apriElenco}>
              {t("Scegli dall'area personale")}
            </button>
          </div>
          {scegli ? (
            <ul className="mt-2">
              {personali === null ? <li className="text-sm text-mist">{t("Carico…")}</li> : null}
              {personali && personali.length === 0 ? <li className="text-sm text-mist">{t("Nessun documento in area personale.")}</li> : null}
              {personali?.map((doc) => (
                <li key={doc.id}>
                  <button type="button" disabled={busy} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm disabled:opacity-60" onClick={() => void daPersonale(doc)}>
                    <span className="truncate">{doc.titolo}</span>
                    <span className="shrink-0 text-mist">{doc.scadenza ? formatDay(doc.scadenza) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {aperto ? <FotoPiena src={aperto.src} alt={aperto.nome} onClose={() => setAperto(null)} /> : null}
    </div>
  );
}
