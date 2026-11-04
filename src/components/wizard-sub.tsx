import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFondale } from "@/components/app-frame";
import { ScadenzaField } from "@/components/scadenza-field";
import { salvaAnagraficaLocale, leggiAnagraficaLocale } from "@/lib/anagrafica";
import { cifraFile, chiaveMia } from "@/lib/cifrario";
import { completaWizard, listBrevetti, listDocumenti, salvaAnagrafica, saveBrevetto, saveDocumento, updateProfile } from "@/lib/fondale.functions";
import { leggiDocumento } from "@/lib/leggi-documento";
import { prepareFile, fonteLetturaBrevetto } from "@/lib/prepare-file";
import { useRitaglioDocumento } from "@/components/ritaglio-documento";
import { messaggioErrore, useT } from "@/lib/i18n";

const VISTO = "tritone-wizard-visto";
const PASSI = ["Dati anagrafici", "Certificato medico", "Assicurazione", "Brevetti", "Riepilogo"] as const;

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon";

export function segnaWizardVisto() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VISTO, "1");
}

export function wizardGiaVisto(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return sessionStorage.getItem(VISTO) === "1";
}

export function WizardSub() {
  const t = useT();
  const frame = useFondale();
  const navigate = useNavigate();
  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState(frame.profile?.nome ?? "");
  const [cognome, setCognome] = useState(frame.profile?.cognome ?? "");
  const [nascita, setNascita] = useState("");
  const [telefono, setTelefono] = useState(frame.profile?.telefono ?? "");
  const [emergenzaNome, setEmergenzaNome] = useState("");
  const [emergenzaTel, setEmergenzaTel] = useState("");
  const [scadenzaMed, setScadenzaMed] = useState("");
  const [fileMed, setFileMed] = useState<{ name: string; type: string; data: string } | null>(null);
  const [extraMed, setExtraMed] = useState({ rilascio: "", numero: "", soggetto: "", note: "" });
  const [scadenzaAss, setScadenzaAss] = useState("");
  const [fileAss, setFileAss] = useState<{ name: string; type: string; data: string } | null>(null);
  const [extraAss, setExtraAss] = useState({ rilascio: "", numero: "", soggetto: "", note: "" });
  const [didattica, setDidattica] = useState("");
  const [livello, setLivello] = useState("");
  const [numero, setNumero] = useState("");
  const [profondita, setProfondita] = useState("");
  const [rilascioBre, setRilascioBre] = useState("");
  const [nomeBre, setNomeBre] = useState("");
  const [cognomeBre, setCognomeBre] = useState("");
  const [fileBre, setFileBre] = useState<{ name: string; type: string; data: string } | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [leggendo, setLeggendo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gia, setGia] = useState({ medico: false, assicurazione: false, brevetto: false });
  const ritaglio = useRitaglioDocumento();

  useEffect(() => {
    segnaWizardVisto();
    const ana = leggiAnagraficaLocale();
    if (ana.data_nascita) setNascita(ana.data_nascita);
    if (ana.emergenza_nome) setEmergenzaNome(ana.emergenza_nome);
    if (ana.emergenza_telefono) setEmergenzaTel(ana.emergenza_telefono);
    let live = true;
    Promise.all([listDocumenti(), listBrevetti()])
      .then(([docs, cards]) => {
        if (!live) return;
        setGia({
          medico: docs.some((item) => item.kind === "medico"),
          assicurazione: docs.some((item) => item.kind === "assicurazione"),
          brevetto: cards.length > 0,
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function salvaAnagraficaStep() {
    const ricordi = salvaAnagraficaLocale({
      nome,
      cognome,
      telefono,
      email: frame.email ?? "",
      data_nascita: nascita,
      emergenza_nome: emergenzaNome,
      emergenza_telefono: emergenzaTel,
    });
    if (nome.trim() && cognome.trim()) {
      await updateProfile({ data: { nome: nome.trim(), cognome: cognome.trim(), telefono: telefono.trim() } });
    }
    if (chiaveMia()) {
      const chiusa = await cifraFile(JSON.stringify(ricordi));
      await salvaAnagrafica({ data: { busta: chiusa.busta } });
    }
  }

  async function salvaMedico() {
    if (!scadenzaMed && !fileMed) return;
    const file = fileMed ? { name: fileMed.name, type: fileMed.type, data: await chiudi(fileMed.data) } : undefined;
    await saveDocumento({
      data: {
        id: null,
        kind: "medico",
        titolo: "Certificato medico",
        soggetto: extraMed.soggetto,
        numero: extraMed.numero,
        rilascio: extraMed.rilascio,
        scadenza: scadenzaMed,
        note: extraMed.note,
        fileAction: file ? "replace" : "keep",
        file,
      },
    });
    setGia((current) => ({ ...current, medico: true }));
    setFileMed(null);
    setScadenzaMed("");
    setExtraMed({ rilascio: "", numero: "", soggetto: "", note: "" });
  }

  async function salvaAssicurazione() {
    if (!scadenzaAss && !fileAss) return;
    const file = fileAss ? { name: fileAss.name, type: fileAss.type, data: await chiudi(fileAss.data) } : undefined;
    await saveDocumento({
      data: {
        id: null,
        kind: "assicurazione",
        titolo: "Assicurazione",
        soggetto: extraAss.soggetto,
        numero: extraAss.numero,
        rilascio: extraAss.rilascio,
        scadenza: scadenzaAss,
        note: extraAss.note,
        fileAction: file ? "replace" : "keep",
        file,
      },
    });
    setGia((current) => ({ ...current, assicurazione: true }));
    setFileAss(null);
    setScadenzaAss("");
    setExtraAss({ rilascio: "", numero: "", soggetto: "", note: "" });
  }

  async function salvaBrevettoStep() {
    if (!didattica && !livello && !numero && !profondita && !rilascioBre && !fileBre) return;
    const file = fileBre ? { name: fileBre.name, type: fileBre.type, data: await chiudi(fileBre.data) } : undefined;
    await saveBrevetto({
      data: {
        id: null,
        titolo: livello.trim() || didattica.trim() || "Brevetto",
        ente: didattica,
        livello,
        numero,
        rilascio: rilascioBre,
        scadenza: "",
        note: [nomeBre, cognomeBre].filter(Boolean).join(" "),
        profondita,
        fileAction: file ? "replace" : "keep",
        file,
      },
    });
    setGia((current) => ({ ...current, brevetto: true }));
    setFileBre(null);
    setDidattica("");
    setLivello("");
    setNumero("");
    setProfondita("");
    setRilascioBre("");
    setNomeBre("");
    setCognomeBre("");
  }

  async function salvaPasso() {
    if (passo === 0) await salvaAnagraficaStep();
    if (passo === 1) await salvaMedico();
    if (passo === 2) await salvaAssicurazione();
    if (passo === 3) await salvaBrevettoStep();
  }

  async function avanti() {
    setBusy(true);
    setErrore(null);
    setNota(null);
    try {
      await salvaPasso();
      setPasso((current) => Math.min(current + 1, PASSI.length - 1));
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Salvataggio non riuscito."));
    } finally {
      setBusy(false);
    }
  }

  async function conferma() {
    setBusy(true);
    setErrore(null);
    try {
      const next = await completaWizard();
      void next;
      await frame.refresh();
      await navigate({ to: "/" });
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Salvataggio non riuscito."));
    } finally {
      setBusy(false);
    }
  }

  async function leggiFile(
    file: File | undefined,
    kind: "brevetto" | "medico" | "assicurazione",
    applica: (letti: Awaited<ReturnType<typeof leggiDocumento>>, prepared: { name: string; type: string; data: string }) => void,
  ) {
    if (!file) return;
    const scelto = await ritaglio.chiedi(file);
    if (!scelto) return;
    setErrore(null);
    setNota(null);
    setLeggendo(true);
    try {
      const prepared = await prepareFile(scelto);
      const fonte = kind === "brevetto" ? await fonteLetturaBrevetto(scelto, prepared.data) : prepared.data;
      const letti = await leggiDocumento(fonte, prepared.name, kind);
      applica(letti, prepared);
      setNota(letti.letto ? t("Ho letto alcuni dati. Controllali prima di continuare.") : t("Non ho letto i dati dal file. Compilali a mano."));
    } catch (reason) {
      setErrore(messaggioErrore(reason, "File non valido."));
    } finally {
      setLeggendo(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {ritaglio.pannello}
      <p className="text-xs uppercase tracking-wide text-mist">{t("Passo {n} di {totale}", { n: passo + 1, totale: PASSI.length })}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-lagoon" style={{ width: `${((passo + 1) / PASSI.length) * 100}%` }} />
      </div>
      <h1 className="mt-4 text-3xl leading-none">{t(PASSI[passo])}</h1>
      {passo === 0 ? (
        <div className="mt-4 grid gap-3">
          <label className="text-sm">{t("Nome")}<input value={nome} onChange={(event) => setNome(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Cognome")}<input value={cognome} onChange={(event) => setCognome(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Data di nascita")}<span className="mt-1 block"><ScadenzaField value={nascita} onChange={setNascita} /></span></label>
          <label className="text-sm">{t("Telefono")}<input value={telefono} onChange={(event) => setTelefono(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Email")}<input value={frame.email ?? ""} readOnly className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Contatto di emergenza")}<input value={emergenzaNome} onChange={(event) => setEmergenzaNome(event.target.value)} className={`mt-1 ${inputClass}`} placeholder={t("Nome")} /></label>
          <label className="text-sm">{t("Telefono di emergenza")}<input value={emergenzaTel} onChange={(event) => setEmergenzaTel(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
        </div>
      ) : null}
      {passo === 1 ? (
        <BloccoFile
          scadenza={scadenzaMed}
          onScadenza={setScadenzaMed}
          file={fileMed}
          gia={gia.medico}
          leggendo={leggendo}
          onFile={(file) => void leggiFile(file, "medico", (letti, prepared) => {
            setFileMed(prepared);
            if (letti.scadenza) setScadenzaMed(letti.scadenza);
            setExtraMed({
              rilascio: letti.rilascio,
              numero: letti.numero,
              soggetto: letti.soggetto,
              note: [letti.nome, letti.cognome].filter(Boolean).join(" "),
            });
          })}
        />
      ) : null}
      {passo === 2 ? (
        <BloccoFile
          scadenza={scadenzaAss}
          onScadenza={setScadenzaAss}
          file={fileAss}
          gia={gia.assicurazione}
          leggendo={leggendo}
          onFile={(file) => void leggiFile(file, "assicurazione", (letti, prepared) => {
            setFileAss(prepared);
            if (letti.scadenza) setScadenzaAss(letti.scadenza);
            setExtraAss({
              rilascio: letti.rilascio,
              numero: letti.numero,
              soggetto: letti.soggetto,
              note: [letti.nome, letti.cognome].filter(Boolean).join(" "),
            });
          })}
        />
      ) : null}
      {passo === 3 ? (
        <div className="mt-4 grid gap-3">
          {gia.brevetto ? <p className="text-sm text-mist">{t("Hai già un brevetto salvato. Puoi aggiungerne un altro o saltare.")}</p> : null}
          <SceltaFile leggendo={leggendo} onFile={(file) => void leggiFile(file, "brevetto", (letti, prepared) => {
              setFileBre(prepared);
              if (letti.didattica) setDidattica(letti.didattica);
              if (letti.livello) setLivello(letti.livello);
              if (letti.numero) setNumero(letti.numero);
              if (letti.profondita) setProfondita(letti.profondita);
              if (letti.rilascio) setRilascioBre(letti.rilascio);
              if (letti.nome) setNomeBre(letti.nome);
              if (letti.cognome) setCognomeBre(letti.cognome);
              if (letti.nome && !nome.trim()) setNome(letti.nome);
              if (letti.cognome && !cognome.trim()) setCognome(letti.cognome);
            })} />
          {fileBre ? <p className="text-xs text-mist">{fileBre.name}</p> : null}
          <label className="text-sm">{t("Didattica")}<input value={didattica} onChange={(event) => setDidattica(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="PADI, SSI, CMAS…" /></label>
          <label className="text-sm">{t("Livello")}<input value={livello} onChange={(event) => setLivello(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Numero")}<input value={numero} onChange={(event) => setNumero(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-sm">{t("Profondità massima")}<input value={profondita} onChange={(event) => setProfondita(event.target.value)} className={`mt-1 ${inputClass}`} placeholder={t("metri")} /></label>
          <label className="text-sm">{t("Rilascio")}<span className="mt-1 block"><ScadenzaField value={rilascioBre} onChange={setRilascioBre} /></span></label>
        </div>
      ) : null}
      {passo === 4 ? (
        <ul className="mt-4 space-y-2 text-sm">
          <li>{nome} {cognome}{nascita ? ` · ${nascita}` : ""}</li>
          <li>{telefono || t("Telefono non indicato")} · {frame.email ?? ""}</li>
          <li>{emergenzaNome || t("Emergenza non indicata")}{emergenzaTel ? ` · ${emergenzaTel}` : ""}</li>
          <li>{t("Certificato medico")}: {gia.medico || scadenzaMed || fileMed ? t("presente") : t("da completare")}</li>
          <li>{t("Assicurazione")}: {gia.assicurazione || scadenzaAss || fileAss ? t("presente") : t("da completare")}</li>
          <li>{t("Brevetti")}: {gia.brevetto || didattica || livello || fileBre ? t("presente") : t("da completare")}</li>
        </ul>
      ) : null}
      {leggendo ? <LetturaInCorso /> : nota ? <p className="mt-3 text-sm text-mist">{nota}</p> : null}
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      <div className="mt-6 flex flex-col gap-2">
        {passo < 4 ? (
          <>
            <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void avanti()}>
              {busy ? t("Salvo…") : t("Avanti")}
            </button>
            <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => void avanti()}>
              {t("Salta")}
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void conferma()}>
            {busy ? t("Salvo…") : t("Conferma")}
          </button>
        )}
        {passo > 0 ? (
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setPasso((current) => current - 1)}>
            {t("Indietro")}
          </button>
        ) : null}
        <button type="button" className="min-h-11 text-sm text-mist" onClick={() => void navigate({ to: "/" })}>
          {t("Più tardi")}
        </button>
      </div>
    </div>
  );
}

function BloccoFile({
  scadenza,
  onScadenza,
  file,
  gia,
  leggendo,
  onFile,
}: {
  scadenza: string;
  onScadenza: (value: string) => void;
  file: { name: string } | null;
  gia: boolean;
  leggendo: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 grid gap-3">
      {gia ? <p className="text-sm text-mist">{t("Ne hai già uno salvato. Puoi aggiungerne un altro o saltare.")}</p> : null}
      <SceltaFile leggendo={leggendo} onFile={onFile} />
      {file ? <p className="text-xs text-mist">{file.name}</p> : null}
      <label className="text-sm">
        {t("Scadenza")}
        <span className="mt-1 block"><ScadenzaField value={scadenza} onChange={onScadenza} /></span>
      </label>
    </div>
  );
}

async function chiudi(dataUrl: string) {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const closed = await cifraFile(dataUrl);
  return closed.busta;
}

const fileBtn = "inline-flex min-h-11 items-center justify-center rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60";

export function LetturaInCorso() {
  const t = useT();
  return (
    <p className="mt-3 flex items-center gap-2 text-sm" role="status">
      <span className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-lagoon border-t-transparent" />
      {t("Sto leggendo i dati dal documento… attendi qualche secondo")}
    </p>
  );
}

function SceltaFile({ leggendo, onFile }: { leggendo: boolean; onFile: (file: File | undefined) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button type="button" disabled={leggendo} className={fileBtn} onClick={() => ref.current?.click()}>
        {t("Scansiona file")}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
