import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import { useFondale } from "@/components/app-frame";
import { DecisioneSocio } from "@/components/area-soci";
import { DocumentiSocio } from "@/components/documenti-socio";
import { ClubLogo } from "@/components/club-logo";
import { deleteSubmission, getAnagrafica, getBrevettoFile, getDocumentoFile, listBrevetti, listDivingScelte, listDocumenti, salvaAnagrafica, saveSubmission, ultimaDataLogbook, verificaLogbookBrevetto, type Brevetto, type DivingScelta, type Documento, type VerificaLogbook } from "@/lib/fondale.functions";
import { cifra, decifra, chiaveMia, chiaveSulTelefono, salvaChiaveSulTelefono, cifraFile, decifraFile, normalizzaPrivata } from "@/lib/cifrario";
import { applicaAnagrafica, leggiAnagraficaLocale, salvaAnagraficaLocale } from "@/lib/anagrafica";
import { prepareFile, prepareFotoModulo } from "@/lib/prepare-file";
import { emptyData, campiMancanti, formByKey, haCampiChiusi, CAMPI_CHIUSI, chiaveSanitaria, medicalAlert, svuotaDecompressive, anniIscrizione, type Field, type FormDef } from "@/lib/forms";
import { ScadenzaField } from "@/components/scadenza-field";
import { formatDay, formatWhen } from "@/lib/format";
import { linguaAttuale, messaggioErrore, tScelta, useT, type Traduci } from "@/lib/i18n";

const MODULI_LETTURA = new Set([
  "registro-immersione",
  "scheda-cliente",
  "questionario-medico",
  "brevetto-esperienza",
  "informativa-consenso",
  "scheda-socio",
]);

const inputClass =
  "min-h-11 w-full border-0 border-b border-rule bg-transparent px-0 text-ink outline-none focus-visible:border-lagoon";

export function SchedaEditor({
  formKey,
  existing,
  soloLettura = false,
}: {
  formKey: string;
  existing?: {
    id: number;
    status: "bozza" | "inviato";
    payload: Record<string, string>;
    createdAt: string;
    authorName: string;
    mine: boolean;
    clubId: number | null;
    riservato?: boolean;
    aperture?: { nome: string; openedAt: string }[];
    modifiche?: { nome: string; modifiedAt: string }[];
  };
  soloLettura?: boolean;
}) {
  const form = formByKey(formKey);
  const frame = useFondale();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, string>>(() => {
    const base = existing?.payload ?? {};
    if (!existing && formKey === "scheda-socio" && !base.anno_iscrizione) {
      return { ...base, anno_iscrizione: anniIscrizione()[0]?.value ?? "" };
    }
    return base;
  });
  const [scuole, setScuole] = useState<DivingScelta[]>([]);
  const [scuolaId, setScuolaId] = useState<number | "">(existing?.clubId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mancanti, setMancanti] = useState<string[] | null>(null);
  const [confermaInvio, setConfermaInvio] = useState(false);
  const [inviatoA, setInviatoA] = useState<{ nome: string; id: number | null; hasLogo: boolean } | null>(null);
  const [passo, setPasso] = useState(0);
  const [cerca, setCerca] = useState("");
  const [modifica, setModifica] = useState(false);
  const [modifiche, setModifiche] = useState<{ nome: string; modifiedAt: string }[]>(existing?.modifiche ?? []);
  const foglio = useRef<HTMLElement>(null);
  const ultimaToccata = useRef(false);
  const sezioni = useMemo(() => (form ? sezioniDi(form.fields, data) : []), [form, data]);
  const t = useT();
  const segnaNumero = useCallback((numero: string) => {
    setData((current) => (current.numero_tessera === numero ? current : { ...current, numero_tessera: numero }));
  }, []);

  useEffect(() => {
    if (existing) {
      const payload = { ...existing.payload };
      if (!payload.data_immersione && payload.data_attivita) payload.data_immersione = payload.data_attivita;
      if (!payload.note && payload.note_attivita) payload.note = payload.note_attivita;
      if (payload.miscela === "Aria" && !payload.percentuale_o2) payload.percentuale_o2 = "21";
      setData(payload);
      return;
    }
    if (!form || !frame.profile) return;
    const areaSub = !frame.desk || frame.comeCliente;
    if (!areaSub) {
      const vuoto = emptyData(form, {});
      if ("tipo_documento" in vuoto) vuoto.tipo_documento = "";
      setData(vuoto);
      return;
    }
    let live = true;
    const base = applicaAnagrafica(
      emptyData(form, {
        cognome: frame.profile.cognome,
        nome: frame.profile.nome,
        telefono: frame.profile.telefono,
        email: frame.email ?? "",
        centro: frame.club.nome,
        oggi: frame.oggi,
      }),
      leggiAnagraficaLocale(),
    );
    setData(base);
    void getAnagrafica()
      .then(async (busta) => {
        if (!live || !busta) return;
        const extra = JSON.parse(await decifraFile(busta)) as Record<string, string>;
        if (!live) return;
        salvaAnagraficaLocale(extra);
        setData((current) => applicaAnagrafica(current, extra));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [existing?.id, formKey, frame.profile?.userId, frame.email, frame.desk, frame.comeCliente]);

  const sulCampoUltima =
    formKey === "brevetto-esperienza" &&
    !(frame.desk && !frame.comeCliente) &&
    (modifica ||
      sezioni.some(
        (sezione, index) =>
          passo === index + 1 && sezione.fields.some((field) => "key" in field && field.key === "ultima_immersione"),
      ));

  useEffect(() => {
    if (!sulCampoUltima || ultimaToccata.current) return;
    let live = true;
    ultimaDataLogbook()
      .then((row) => {
        if (!live || ultimaToccata.current) return;
        const giorno = row.data.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return;
        setData((current) => {
          if (ultimaToccata.current || (current.ultima_immersione ?? "").trim()) return current;
          return { ...current, ultima_immersione: giorno };
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sulCampoUltima]);

  useEffect(() => {
    const raw = sessionStorage.getItem("diving-hub-inviato");
    if (!raw) return;
    sessionStorage.removeItem("diving-hub-inviato");
    try {
      const parsed = JSON.parse(raw) as { nome?: string; id?: number | null; hasLogo?: boolean };
      if (parsed && typeof parsed.nome === "string") {
        setInviatoA({ nome: parsed.nome, id: typeof parsed.id === "number" ? parsed.id : null, hasLogo: Boolean(parsed.hasLogo) });
      }
    } catch {
      setInviatoA({ nome: raw, id: null, hasLogo: false });
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [passo]);

  useEffect(() => {
    let live = true;
    listDivingScelte()
      .then((items) => {
        if (!live) return;
        setScuole(items);
        let pre: number | null = null;
        try {
          const raw = sessionStorage.getItem("tritone-diving-scelto");
          const id = raw ? Number(raw) : NaN;
          if (Number.isInteger(id) && items.some((item) => item.id === id)) pre = id;
        } catch {
          pre = null;
        }
        setScuolaId((current) => {
          if (current !== "") return current;
          if (pre != null) return pre;
          return items.length === 1 ? items[0].id : current;
        });
        if (pre != null && scuolaId === "") {
          try {
            sessionStorage.removeItem("tritone-diving-scelto");
          } catch {
            /* la scelta resta solo per questo invio */
          }
        }
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setScuole([]);
        setError(messaggioErrore(reason, "Non riesco a leggere i diving affiliati."));
      });
    return () => {
      live = false;
    };
  }, []);

  if (!form || !frame.profile) {
    return <p className="text-mist">{t("Questo modulo non esiste.")}</p>;
  }
  if (form.key === "scheda-istruttore" && !frame.owner) {
    return <p className="text-mist">{t("Solo il titolare del diving registra le schede di istruttori e guide.")}</p>;
  }
  const arrivata = Boolean(existing && existing.status === "inviato" && MODULI_LETTURA.has(form.key));
  const latoScuola = frame.desk && !frame.comeCliente;
  function apriModifica(dati?: Record<string, string>) {
    if (dati) setData(dati);
    setModifica(true);
  }
  if (existing?.riservato) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t("Questionario medico")}</h1>
        <p className="mt-3 text-sm">{testoSintesi(existing.payload.sintesi, t)}</p>
        <p className="mt-2 text-sm text-mist">{t("Le singole risposte le legge solo il titolare del diving, sul suo telefono.")}</p>
        <Aperture lista={existing.aperture ?? []} />
        <ModificheLog lista={modifiche} />
      </div>
    );
  }
  if (form.key === "questionario-medico" && existing?.payload.cifrato && latoScuola && !modifica) {
    return (
      <SchedaSanitaria
        form={form}
        busta={existing.payload.cifrato}
        aperti={existing.payload}
        nome={`${existing.payload.cognome ?? ""} ${existing.payload.nome ?? ""}`.trim()}
        aperture={existing.aperture ?? []}
        modifiche={modifiche}
        onModifica={latoScuola ? apriModifica : undefined}
      />
    );
  }
  if (existing?.payload.cifrato && frame.owner && haCampiChiusi(form) && !modifica) {
    return (
      <SchedaSanitaria
        form={form}
        busta={existing.payload.cifrato}
        aperti={existing.payload}
        nome={`${existing.payload.cognome ?? ""} ${existing.payload.nome ?? ""}`.trim()}
        aperture={existing.aperture ?? []}
        modifiche={modifiche}
        onModifica={latoScuola ? apriModifica : undefined}
      />
    );
  }
  if (existing?.payload.documento === "presente" && !existing.payload.cifrato && !arrivata) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t(form.title)}</h1>
        <p className="mt-2 text-sm text-mist">
          {`${existing.payload.cognome ?? ""} ${existing.payload.nome ?? ""}`.trim() || existing.authorName}
        </p>
        <FoglioScheda form={form} dati={existing.payload} />
        <p className="mt-3 text-sm text-mist">{t("Codice fiscale, documento e firma li apre il titolare, sul telefono dove c'è la chiave.")}</p>
        <Aperture lista={existing.aperture ?? []} />
      </div>
    );
  }
  if (form.key === "questionario-medico" && existing?.payload.sintesi && !existing.payload.cifrato && !existing.payload.q_gravidanza) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t("Questionario medico")}</h1>
        <p className="mt-3 text-sm">{t("Le risposte sono chiuse. Le apre solo il titolare, sul telefono dove c'è la chiave.")}</p>
        <ModificheLog lista={modifiche} />
      </div>
    );
  }
  if ((arrivata || soloLettura) && !modifica && existing?.status === "inviato") {
    return (
      <div className="mx-auto max-w-3xl">
        {form.key === "scheda-socio" ? <DecisioneSocio submissionId={existing.id} banco={latoScuola} onNumero={segnaNumero} /> : null}
        {form.key === "scheda-socio" ? <DocumentiSocio submissionId={existing.id} puoCaricare={soloLettura ? false : existing.mine} /> : null}
        <LetturaScheda
          form={form}
          dati={data}
          modifiche={modifiche}
          aperture={existing.aperture ?? []}
          indietro={latoScuola ? "/archivio" : "/moduli"}
          onModifica={!soloLettura && latoScuola ? () => apriModifica() : undefined}
          logbookId={!soloLettura && latoScuola && form.key === "brevetto-esperienza" ? existing.id : undefined}
        />
      </div>
    );
  }

  const scelto = scuole.find((item) => item.id === scuolaId);

  const alert = form.key === "questionario-medico" && medicalAlert(data);
  const vuotiOra = [...(scuolaId === "" ? ["Diving di destinazione"] : []), ...campiMancanti(form, data)];

  function datiCorrenti() {
    const root = foglio.current;
    if (!root) return data;
    const next = { ...data };
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name], textarea[name], select[name]").forEach((el) => {
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        next[el.name] = el.checked ? "si" : "";
        return;
      }
      if (el instanceof HTMLInputElement && el.type === "radio") {
        if (el.checked) next[el.name] = el.value;
        return;
      }
      const value = el.value.trim();
      if (value) next[el.name] = value;
    });
    return next;
  }

  function chiediInvio() {
    const corrente = datiCorrenti();
    setData(corrente);
    const vuoti = [...(scuolaId === "" ? ["Diving di destinazione"] : []), ...campiMancanti(form!, corrente)];
    if (vuoti.length) {
      setMancanti(vuoti);
      setMessage(null);
      return;
    }
    setConfermaInvio(true);
  }

  async function persist(status: "bozza" | "inviato", opts?: { modifica?: boolean }) {
    const corrente = datiCorrenti();
    setData(corrente);
    const chiusiVuoti = Boolean(opts?.modifica && existing?.payload.cifrato);
    const solo = chiusiVuoti
      ? new Set(
          form!.fields.flatMap((field) =>
            "key" in field && (!(CAMPI_CHIUSI as readonly string[]).includes(field.key as (typeof CAMPI_CHIUSI)[number]) || (corrente[field.key] ?? "").trim())
              ? [field.key]
              : [],
          ),
        )
      : undefined;
    const vuoti = [...(scuolaId === "" ? ["Diving di destinazione"] : []), ...campiMancanti(form!, corrente, solo)];
    if (vuoti.length) {
      setMancanti(vuoti);
      setMessage(null);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let payload = corrente;
      if (form!.key === "questionario-medico") {
        const hasAnswers = Object.entries(corrente).some(([key, value]) => chiaveSanitaria(key) && value);
        if (!hasAnswers && existing?.payload.cifrato) {
          payload = { ...corrente, cifrato: existing.payload.cifrato, sintesi: existing.payload.sintesi ?? "" };
          for (const key of Object.keys(payload)) if (chiaveSanitaria(key)) delete payload[key];
        } else {
          const chiave = scelto?.chiavePubblica ?? "";
          if (!chiave) throw new Error("Il titolare non ha ancora attivato la chiave sul suo telefono.");
          const chiusi: Record<string, string> = {};
          for (const [key, value] of Object.entries(corrente)) {
            if (chiaveSanitaria(key)) chiusi[key] = value;
          }
          const sintesi = corrente.med_esito === "approvato"
            ? "approvato"
            : corrente.med_esito === "non-approvato"
              ? "non-approvato"
              : medicalAlert(chiusi)
                ? "positiva"
                : "nessuna";
          payload = { ...corrente, cifrato: await cifra(chiave, JSON.stringify(chiusi)), sintesi };
          for (const key of Object.keys(chiusi)) delete payload[key];
        }
      } else if (haCampiChiusi(form!)) {
        const chiusi: Record<string, string> = {};
        for (const [key, value] of Object.entries(corrente)) {
          if (((CAMPI_CHIUSI as readonly string[]).includes(key) || key === "firma") && value) chiusi[key] = value;
        }
        if (!Object.keys(chiusi).length && existing?.payload.cifrato) {
          payload = { ...corrente, cifrato: existing.payload.cifrato, documento: existing.payload.documento ?? "" };
          for (const key of CAMPI_CHIUSI) delete payload[key];
        } else {
          const chiave = scelto?.chiavePubblica ?? "";
          if (!chiave) throw new Error("Il titolare non ha ancora attivato la chiave. Codice fiscale e documento non si possono inviare.");
          const documento = chiusi.numero_documento || chiusi.codice_fiscale ? "presente" : "";
          payload = { ...corrente, cifrato: await cifra(chiave, JSON.stringify(chiusi)), documento };
          for (const key of Object.keys(chiusi)) delete payload[key];
        }
      }
      const saved = await saveSubmission({
        data: {
          id: existing?.id,
          formKey: form!.key,
          status,
          payload,
          clubId: Number(scuolaId),
        },
      });
      const areaSub = !frame.desk || frame.comeCliente;
      if (areaSub) {
        const ricordi = salvaAnagraficaLocale(corrente);
        if (chiaveMia()) {
          const chiusa = await cifraFile(JSON.stringify(ricordi));
          void salvaAnagrafica({ data: { busta: chiusa.busta } }).catch(() => undefined);
        }
      }
      await frame.refresh();
      const destinazione = {
        nome: scelto?.nome || t("il diving"),
        id: typeof scuolaId === "number" ? scuolaId : null,
        hasLogo: Boolean(scelto?.hasLogo),
      };
      if (opts?.modifica) {
        sessionStorage.removeItem("diving-hub-inviato");
        if (saved.modifica) setModifiche((lista) => [saved.modifica!, ...lista]);
        setModifica(false);
        return;
      }
      if (status === "inviato") sessionStorage.setItem("diving-hub-inviato", JSON.stringify(destinazione));
      if (!existing) {
        await navigate({ to: "/scheda/$id", params: { id: String(saved.id) }, replace: true });
        return;
      }
      if (status === "inviato") {
        sessionStorage.removeItem("diving-hub-inviato");
        setInviatoA(destinazione);
        return;
      }
      setMessage("Bozza salvata.");
    } catch (reason) {
      setError(messaggioErrore(reason, "Salvataggio non riuscito."));
    } finally {
      setBusy(false);
    }
  }

  if (inviatoA) {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 text-center">
        {inviatoA.id != null ? (
          <ClubLogo
            id={inviatoA.id}
            hasLogo={inviatoA.hasLogo}
            name={inviatoA.nome}
            className="h-24 w-24 rounded-3xl bg-white object-contain"
          />
        ) : null}
        <h1 className="mt-6 text-4xl leading-none">{t("Inviato a {nome}", { nome: inviatoA.nome })}</h1>
        <p className="mt-3 text-sm text-mist">{t("Lo staff ha la scheda. Puoi chiudere.")}</p>
        <Link to="/" className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-lagoon px-4 font-medium">
          {t("Torna alla Home")}
        </Link>
      </div>
    );
  }

  if (!form) return null;
  const scheda = form;

  const ultimo = passo >= sezioni.length;
  const titoloPasso = passo === 0 ? "Destinazione" : (sezioni[passo - 1]?.title ?? "Modulo");

  function avanti() {
    const corrente = datiCorrenti();
    setData(corrente);
    if (passo === 0 && scuolaId === "") {
      setMancanti(["Diving di destinazione"]);
      return;
    }
    if (passo > 0) {
      const sezione = sezioni[passo - 1];
      const keys = new Set(sezione?.fields.flatMap((field) => ("key" in field ? [field.key] : [])) ?? []);
      const vuoti = campiMancanti(scheda, corrente, keys);
      if (vuoti.length) {
        setMancanti(vuoti);
        return;
      }
    }
    setPasso((current) => Math.min(current + 1, sezioni.length));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link to="/moduli" className="inline-flex min-h-11 items-center gap-2 text-sm text-mist">
          <ArrowLeft className="size-4" />
          {t("Moduli")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm"
        >
          <Printer className="size-4" />
          {t("Stampa")}
        </button>
      </div>
      {latoScuola && existing && form.key === "brevetto-esperienza" ? <VerificaLogbook id={existing.id} /> : null}
      {existing && existing.status === "inviato" && form.key === "scheda-socio" ? (
        <DecisioneSocio submissionId={existing.id} banco={latoScuola} onNumero={segnaNumero} />
      ) : null}
      {existing && form.key === "scheda-socio" ? <DocumentiSocio submissionId={existing.id} puoCaricare={existing.mine} /> : null}
      <article ref={foglio} className="paper rounded-card border border-rule bg-paper text-ink shadow-lg">
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-lagoon">{t(form.kicker)}</p>
            <h1 className="mt-1 text-3xl text-ink">{t(form.title)}</h1>
            <p className="mt-1 text-sm text-ink-soft">{scelto?.nome || t("Scegli il diving destinatario")}</p>
          </div>
          <div className="grid h-16 w-16 shrink-0 rotate-6 place-items-center rounded-full border-2 border-danger text-center text-xs font-medium leading-tight text-danger">
            L. 70
            <br />
            2026
          </div>
        </header>
        <p className={`no-print border-b border-rule px-5 py-3 text-sm text-ink-soft ${modifica ? "hidden" : ""}`}>
          {t("Passo {n} di {totale}", { n: passo + 1, totale: sezioni.length + 1 })}
          {" · "}
          {t(titoloPasso)}
          {vuotiOra.length ? ` · ${vuotiOra.length === 1 ? t("manca 1 campo") : t("mancano {n} campi", { n: vuotiOra.length })}` : ""}
          {existing ? "" : ` · ${t("i dati già salvati sono compilati, puoi cambiarli")}`}
        </p>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className={`sm:col-span-2 ${passo === 0 && !modifica ? "" : "passo-nascosto hidden"}`}>
              <p className="text-sm text-ink">{t("Invia a")}</p>
              <input
                value={cerca}
                onChange={(event) => setCerca(event.target.value)}
                placeholder={t("Cerca scuola")}
                className="mt-2 min-h-11 w-full border-0 border-b border-rule bg-transparent text-ink outline-none focus-visible:border-lagoon"
              />
              <ul className="mt-2 space-y-2">
                {scuole
                  .filter((item) => {
                    const q = cerca.trim().toLowerCase();
                    if (!q) return true;
                    return item.nome.toLowerCase().includes(q) || item.sede.toLowerCase().includes(q);
                  })
                  .map((item) => {
                  const chosen = scuolaId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setScuolaId(item.id)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${chosen ? "border-lagoon bg-white" : "border-rule"}`}
                      >
                        <ClubLogo
                          id={item.id}
                          hasLogo={item.hasLogo}
                          name={item.nome}
                          className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{item.nome}</span>
                          {item.sede ? <span className="block truncate text-xs text-ink-soft">{item.sede}</span> : null}
                          {form.key === "questionario-medico" && !item.chiavePubblica ? (
                            <span className="block text-xs text-brass">{t("Non riceve ancora i questionari")}</span>
                          ) : null}
                          {form.key !== "questionario-medico" && haCampiChiusi(form) && !item.chiavePubblica ? (
                            <span className="block text-xs text-brass">{t("Non riceve ancora le schede con documento")}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {scuole.length === 0 ? <p className="mt-2 text-xs text-ink-soft">{t("Nessun diving affiliato, per ora.")}</p> : null}
              {scuole.length > 0 && cerca.trim() && !scuole.some((item) => {
                const q = cerca.trim().toLowerCase();
                return item.nome.toLowerCase().includes(q) || item.sede.toLowerCase().includes(q);
              }) ? (
                <p className="mt-2 text-xs text-ink-soft">{t("Nessuna scuola con questo nome.")}</p>
              ) : null}
              <p className="mt-2 text-xs text-ink-soft">{t("Il modulo arriva solo al diving che scegli. Lo staff delle altre scuole non lo vede.")}</p>
              <p className={`mt-3 text-sm font-medium ${vuotiOra.length ? "text-brass" : "text-ink"}`}>
                {vuotiOra.length === 0 ? t("Pronto da inviare.") : vuotiOra.length === 1 ? t("Manca 1 campo.") : t("Mancano {n} campi.", { n: vuotiOra.length })}
              </p>
            </div>
          {sezioni.map((sezione, index) => (
            <div
              key={sezione.title}
              className={modifica || passo === index + 1 ? "col-span-full grid gap-4 sm:grid-cols-2" : "passo-nascosto hidden"}
            >
              {sezione.hint ? <p className="col-span-full text-sm text-ink-soft">{t(sezione.hint)}</p> : null}
              {sezione.fields.map((field, fieldIndex) => (
                <div key={`${field.type}-${"key" in field ? field.key : fieldIndex}`} className="contents">
                {"key" in field && field.key === "didattica" && form.key === "registro-immersione" ? (
                  <SceltaBrevetti
                    data={data}
                    onPick={(card) => setData((current) => applicaBrevetto(card, current))}
                  />
                ) : null}
                {"key" in field && field.key === "foto_certificato" ? null : (
                <FieldBlock
                  field={field}
                  data={data}
                  onChange={(key, value) => {
                    if (key === "ultima_immersione") ultimaToccata.current = true;
                    setData((current) => {
                      const next = { ...current, [key]: value };
                      if (key === "miscela" && value === "Aria") next.percentuale_o2 = "21";
                      if (form.key === "registro-immersione" && key === "didattica" && value !== "Altro" && value !== "Altra") next.didattica_specifica = "";
                      if (form.key === "registro-immersione" && key === "tipo_attivita" && value !== "Tecnica") {
                        next.decompressiva = "";
                        svuotaDecompressive(next);
                      }
                      if (form.key === "registro-immersione" && key === "decompressiva" && value !== "si") svuotaDecompressive(next);
                      if (form.key === "registro-immersione" && key === "decompressiva" && value === "si" && !next.numero_decompressive) next.numero_decompressive = "1";
                      if (form.key === "registro-immersione" && key === "miscela" && value !== "Altra") next.miscela_specifica = "";
                      return next;
                    });
                  }}
                />
                )}
                {"key" in field && field.key === "autorespiratore" && data.tipo_attivita === "Tecnica" && data.decompressiva === "si" ? (
                  <BloccoDecompressive data={data} onChange={(key, value) => setData((current) => {
                    const next = { ...current, [key]: value };
                    if (key.startsWith("decompressiva_gas_") && value !== "Altra") next[`decompressiva_miscela_${key.slice("decompressiva_gas_".length)}`] = "";
                    return next;
                  })} />
                ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        {alert ? (
          <p className="mx-5 mb-4 text-sm leading-relaxed text-ink-soft">
            {t("C'è una risposta che richiede il medico (domande 3, 5 o 10, oppure un box). Non entrare in acqua finché il medico non ha approvato.")}
          </p>
        ) : null}
        <footer className="border-t border-rule px-5 py-4 text-xs leading-relaxed text-ink-soft">
          <p>{t(form.legal)}</p>
          {existing ? (
            <p className="mt-2">
              {t("Registrata il {quando} · {chi}", { quando: formatWhen(existing.createdAt), chi: existing.authorName })}
              {existing.status === "bozza" ? t(" · bozza") : ""}
            </p>
          ) : null}
          <Aperture lista={existing?.aperture ?? []} />
        </footer>
      </article>
      <div className="no-print mt-4 flex flex-col gap-2">
        {ultimo && !modifica && form.key === "questionario-medico" ? (
          <AllegaCertificato
            oggi={frame.oggi}
            allegato={data.foto_certificato ?? ""}
            nome={data.foto_certificato_nome ?? ""}
            onAllega={(foto, titolo) => setData((current) => ({ ...current, foto_certificato: foto, foto_certificato_nome: titolo }))}
          />
        ) : null}
        {modifica && form.key === "questionario-medico" ? (
          <AllegaCertificato
            oggi={frame.oggi}
            allegato={data.foto_certificato ?? ""}
            nome={data.foto_certificato_nome ?? ""}
            onAllega={(foto, titolo) => setData((current) => ({ ...current, foto_certificato: foto, foto_certificato_nome: titolo }))}
          />
        ) : null}
        {error ? <p className="text-sm text-brass">{error}</p> : null}
        {modifica ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void persist("inviato", { modifica: true })}
              className="min-h-11 rounded-full bg-lagoon px-4 font-medium text-foam disabled:opacity-60"
            >
              {busy ? t("Salvo…") : t("Salva modifiche")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (existing) setData(existing.payload);
                setModifica(false);
                setMancanti(null);
                setError(null);
              }}
              className="min-h-11 rounded-full border border-line px-4 text-sm"
            >
              {t("Annulla")}
            </button>
          </>
        ) : ultimo ? (
          <button
            type="button"
            disabled={busy}
            onClick={chiediInvio}
            className="min-h-11 rounded-full bg-lagoon px-4 font-medium text-foam disabled:opacity-60"
          >
            {busy ? t("Salvo…") : existing?.status === "inviato" ? t("Aggiorna scheda") : t("Invia allo staff")}
          </button>
        ) : (
          <button type="button" onClick={avanti} className="min-h-11 rounded-full bg-lagoon px-4 font-medium text-foam">
            {t("Avanti")}
          </button>
        )}
        {!modifica && passo > 0 ? (
          <button type="button" onClick={() => setPasso((current) => current - 1)} className="min-h-11 rounded-full border border-line px-4 text-sm">
            {t("Indietro")}
          </button>
        ) : null}
        {!modifica ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void persist("bozza")}
          className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
        >
          {t("Salva bozza")}
        </button>
        ) : null}
        {existing && !modifica ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm text-brass"
            onClick={() => {
              if (!window.confirm(t("Eliminare questa scheda dal registro?"))) return;
              setBusy(true);
              void deleteSubmission({ data: { id: existing.id } })
                .then(async () => {
                  await frame.refresh();
                  await navigate({ to: frame.desk && !frame.comeCliente ? "/archivio" : "/moduli" });
                })
                .catch((reason: unknown) => {
                  setError(messaggioErrore(reason, "Eliminazione non riuscita."));
                  setBusy(false);
                });
            }}
          >
            <Trash2 className="size-4" />
            {t("Elimina")}
          </button>
        ) : null}
      </div>
      {message ? <p className="no-print mt-3 text-sm text-brass">{t(message)}</p> : null}
      {existing?.status === "bozza" ? (
        <p className="no-print mt-2 text-sm text-mist">{t("Bozza: lo staff riceve l'avviso solo quando invii la scheda.")}</p>
      ) : null}
      {confermaInvio ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-end bg-ink/70 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-card border border-line bg-abyss p-5">
            <h2 className="text-2xl">{t("Confermi il diving?")}</h2>
            <p className="mt-2 text-sm text-mist">{t("La scheda viene inviata solo a questa scuola.")}</p>
            <p className="mt-3 text-xl">{scelto?.nome}</p>
            <button
              type="button"
              disabled={busy}
              className="mt-4 min-h-11 w-full rounded-full bg-lagoon text-sm font-medium disabled:opacity-60"
              onClick={() => {
                setConfermaInvio(false);
                void persist("inviato");
              }}
            >
              {t("Invia a {nome}", { nome: scelto?.nome ?? "" })}
            </button>
            <button type="button" className="mt-2 min-h-11 w-full rounded-full border border-line text-sm" onClick={() => setConfermaInvio(false)}>
              {t("Annulla")}
            </button>
          </div>
        </div>
      ) : null}
      {mancanti ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-end bg-ink/70 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-card border border-line bg-abyss p-5">
            <h2 className="text-2xl">{t("Manca qualcosa")}</h2>
            <p className="mt-2 text-sm text-mist">{t("Compila questi dati prima di continuare.")}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {mancanti.map((item) => (
                <li key={item}>{etichettaMancante(item, t)}</li>
              ))}
            </ul>
            <button type="button" className="mt-4 min-h-11 w-full rounded-full bg-lagoon text-sm font-medium" onClick={() => setMancanti(null)}>
              {t("Ho capito")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function testoSintesi(value: string | undefined, t: Traduci): string {
  if (!value || value === "nessuna") return t("Nessuna risposta positiva.");
  if (value === "approvato") return t("Approvato");
  if (value === "non-approvato") return t("Non approvato");
  if (value === "positiva") return t("Risposta positiva");
  return value;
}

function valoreCampo(field: Field, value: string, t: Traduci): string {
  if (field.type === "select") {
    const option = field.options.find((item) => item.value === value);
    if (option) return tScelta(option.label, t);
    return value;
  }
  if (field.type === "checks") {
    return value
      .split(", ")
      .map((part) => tScelta(part, t))
      .join(", ");
  }
  if (field.type === "text" || field.type === "textarea" || field.type === "number" || field.type === "email" || field.type === "tel" || field.type === "date" || field.type === "time") {
    return value;
  }
  if (value === "si") return t("Sì");
  if (value === "no") return t("No");
  if (value === "approvato") return t("Approvato");
  if (value === "non-approvato") return t("Non approvato");
  return value;
}

function valoreGrezzo(value: string, t: Traduci): string {
  if (value === "si") return t("Sì");
  if (value === "no") return t("No");
  if (value === "approvato") return t("Approvato");
  if (value === "non-approvato") return t("Non approvato");
  return value;
}

function etichettaMancante(item: string, t: Traduci): string {
  return item
    .split(" · ")
    .map((part) => t(part))
    .join(" · ");
}

function FoglioScheda({ form, dati, stampa }: { form: FormDef; dati: Record<string, string>; stampa?: boolean }) {
  const t = useT();
  const nascosti = new Set(["cifrato", "documento", "sintesi", "esempio", "brevetto_id", "profondita_massima", "numero_decompressive", "data_inizio", "data_fine"]);
  const noti = new Set(form.fields.filter((field) => "key" in field).map((field) => ("key" in field ? field.key : "")));
  return (
    <article className="paper mt-4 rounded-card border border-rule bg-paper p-5 text-ink">
      {stampa ? (
        <button type="button" className="no-print mb-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => window.print()}>
          {t("Stampa")}
        </button>
      ) : null}
      <dl className="space-y-3">
        {form.fields.map((field) => {
          if (!("key" in field) || !("label" in field)) return null;
          const value = dati[field.key];
          if (!value || (nascosti.has(field.key) && field.key !== "profondita_massima")) return null;
          if ("showWhen" in field && field.showWhen && (dati[field.showWhen.key] ?? "") !== field.showWhen.equals) return null;
          return (
            <div key={field.key}>
              <dt className="text-xs uppercase tracking-wide text-ink-soft">{t(field.label)}</dt>
              <dd className="mt-1 text-sm">
                {field.type === "periodo" ? testoPeriodo(dati, t) : value.startsWith("data:image") ? <img src={value} alt="" className={`firma-ink bg-white object-contain ${field.key === "foto_certificato" ? "max-h-96 w-full" : "h-24"}`} /> : valoreCampo(field, value, t)}
                {value.startsWith("data:image") && dati[`${field.key}_nome`] ? <span className="mt-1 block text-xs text-ink-soft">{dati[`${field.key}_nome`]}</span> : null}
              </dd>
            </div>
          );
        })}
        <DecompressiveLette dati={dati} />
        {Object.entries(dati).map(([key, value]) => {
          if (!value || noti.has(key) || nascosti.has(key) || key.endsWith("_nome") || key.startsWith("decompressiva_") || value.startsWith("data:image")) return null;
          return (
            <div key={key}>
              <dt className="text-xs uppercase tracking-wide text-ink-soft">{key}</dt>
              <dd className="mt-1 text-sm">{valoreGrezzo(value, t)}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

function SchedaSanitaria({
  form,
  busta,
  aperti,
  nome,
  aperture,
  modifiche,
  onModifica,
}: {
  form: FormDef;
  busta: string;
  aperti: Record<string, string>;
  nome: string;
  aperture: { nome: string; openedAt: string }[];
  modifiche: { nome: string; modifiedAt: string }[];
  onModifica?: (dati: Record<string, string>) => void;
}) {
  const [codice, setCodice] = useState("");
  const [dati, setDati] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function apri(privata: string) {
    const pulita = normalizzaPrivata(privata);
    const parsed = JSON.parse(await decifra(pulita, busta)) as Record<string, string>;
    salvaChiaveSulTelefono(pulita);
    setDati(parsed);
    setError(null);
  }

  function erroreApertura(testo: string) {
    if (testo.includes("pubblica") || testo.includes('"privata"')) {
      return "Questo è il codice dei file personali. La scheda si apre con la chiave della scuola: il primo titolare la copia da Profilo, sotto Chiave della scuola.";
    }
    return "Questo codice non apre la scheda. Serve la chiave della scuola per intero, senza tagli.";
  }

  useEffect(() => {
    const locale = chiaveSulTelefono();
    if (!locale) return;
    const msg = "Su questo telefono la chiave non apre la scheda. In Profilo, sotto Chiave della scuola, incolla il codice del primo titolare.";
    void apri(locale).catch(() => setError(messaggioErrore(new Error(msg), msg)));
  }, [busta]);

  const tutto = dati ? { ...aperti, ...dati } : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl leading-none">{t(form.title)}</h1>
        {onModifica && tutto ? (
          <button type="button" className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm" onClick={() => onModifica(tutto)}>
            {t("Modifica")}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-mist">{t("{nome} · si apre solo su questo telefono", { nome: nome || t("Scheda chiusa") })}</p>
      {tutto ? (
        <FoglioScheda form={form} dati={tutto} stampa />
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void apri(codice.trim()).catch(() => {
              const msg = erroreApertura(codice);
              setError(messaggioErrore(new Error(msg), msg));
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Chiave della scuola")}</span>
            <textarea value={codice} onChange={(event) => setCodice(event.target.value)} className="min-h-28 w-full rounded-xl border border-line bg-surface px-3 py-2" />
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium">
            {t("Apri la scheda")}
          </button>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-brass">{error}</p> : null}
      <Aperture lista={aperture} />
      <ModificheLog lista={modifiche} />
    </div>
  );
}

function ModificheLog({ lista }: { lista: { nome: string; modifiedAt: string }[] }) {
  const t = useT();
  if (!lista.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{t("Chi ha modificato la scheda")}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {lista.map((item) => (
          <li key={`${item.modifiedAt}-${item.nome}`}>
            {item.nome} · {formatWhen(item.modifiedAt)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LetturaScheda({
  form,
  dati,
  modifiche,
  aperture,
  indietro,
  onModifica,
  logbookId,
}: {
  form: FormDef;
  dati: Record<string, string>;
  modifiche: { nome: string; modifiedAt: string }[];
  aperture: { nome: string; openedAt: string }[];
  indietro: "/archivio" | "/moduli";
  onModifica?: () => void;
  logbookId?: number;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link to={indietro} className="inline-flex min-h-11 items-center gap-2 text-sm text-mist">
          <ArrowLeft className="size-4" />
          {t(indietro === "/archivio" ? "Archivio moduli" : "Moduli")}
        </Link>
        <div className="flex items-center gap-2">
          {onModifica ? (
            <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={onModifica}>
              {t("Modifica")}
            </button>
          ) : null}
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm">
            <Printer className="size-4" />
            {t("Stampa")}
          </button>
        </div>
      </div>
      <h1 className="text-3xl leading-none">{t(form.title)}</h1>
      {logbookId ? <VerificaLogbook id={logbookId} /> : null}
      <FoglioScheda form={form} dati={dati} />
      <Aperture lista={aperture} />
      <ModificheLog lista={modifiche} />
    </div>
  );
}

function VerificaLogbook({ id }: { id: number }) {
  const t = useT();
  const [dati, setDati] = useState<VerificaLogbook | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    verificaLogbookBrevetto({ data: { id } })
      .then((item) => {
        if (live) setDati(item);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere il logbook."));
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <section className="no-print mt-4 rounded-2xl border border-line bg-deep px-4 py-4">
      <h2 className="text-sm font-medium">{t("Logbook del subacqueo")}</h2>
      {errore ? <p className="mt-2 text-sm text-brass">{errore}</p> : null}
      {!dati && !errore ? <p className="mt-2 text-sm text-mist">{t("Leggo il logbook…")}</p> : null}
      {dati ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-mist">{t("Totale immersioni")}</dt>
              <dd className="mt-1 font-display text-2xl leading-none">{dati.totale}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t("Immersioni negli ultimi 12 mesi")}</dt>
              <dd className="mt-1 font-display text-2xl leading-none">{dati.ultimi12}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t("Profondità massima registrata")}</dt>
              <dd className="mt-1 font-display text-2xl leading-none">{dati.profonditaMax == null ? "—" : `${testoMetriScheda(dati.profonditaMax)} m`}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t("Data dell'ultima immersione")}</dt>
              <dd className="mt-1 font-display text-2xl leading-none">{dati.ultima ? formatDay(dati.ultima) : "—"}</dd>
            </div>
          </dl>
          {dati.avvisi.length ? (
            <div className="mt-3 rounded-xl border border-brass bg-amber px-3 py-2">
              {dati.avvisi.map((item, index) => (
                <p key={`${item.chiave}-${index}`} className="text-sm text-brass">
                  {messaggioAvviso(item, t)}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      <p className="mt-3 text-xs text-mist">{t("Controllo informativo: non blocca la scheda.")}</p>
    </section>
  );
}

function testoMetriScheda(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

function messaggioAvviso(item: { chiave: string; vars: Record<string, string | number> }, t: Traduci): string {
  const vars: Record<string, string | number> = { ...item.vars };
  for (const key of ["dichiarata", "logbook"] as const) {
    const value = vars[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) vars[key] = formatDay(value);
  }
  return t(item.chiave, vars);
}

function Aperture({ lista }: { lista: { nome: string; openedAt: string }[] }) {
  const t = useT();
  if (!lista.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{t("Chi ha aperto la scheda")}</p>
      <ul className="mt-1 space-y-1">
        {lista.map((item) => (
          <li key={`${item.openedAt}-${item.nome}`}>
            {item.nome} · {item.openedAt.replace("T", " ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FirmaCampo({
  label,
  required,
  hint,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useT();
  const drawing = useRef(false);
  const [aperta, setAperta] = useState(() => !value.startsWith("data:image"));
  const [tracciata, setTracciata] = useState(false);
  const firmata = value.startsWith("data:image") && !aperta;

  useEffect(() => {
    if (!aperta) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [aperta]);

  function prepara(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function punto(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function inizia(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const dove = punto(event);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !dove || !ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    prepara(ctx);
    ctx.beginPath();
    ctx.moveTo(dove.x, dove.y);
  }

  function muovi(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const dove = punto(event);
    const ctx = canvas?.getContext("2d");
    if (!dove || !ctx) return;
    prepara(ctx);
    ctx.lineTo(dove.x, dove.y);
    ctx.stroke();
  }

  function finisci() {
    if (!drawing.current) return;
    drawing.current = false;
    setTracciata(true);
  }

  function conferma() {
    const canvas = canvasRef.current;
    if (!canvas || !tracciata) return;
    const foglio = document.createElement("canvas");
    foglio.width = canvas.width;
    foglio.height = canvas.height;
    const ctx = foglio.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, foglio.width, foglio.height);
    ctx.drawImage(canvas, 0, 0);
    onChange(foglio.toDataURL("image/png"));
    setAperta(false);
  }

  function cancella() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawing.current = false;
    setTracciata(false);
    setAperta(true);
    onChange("");
  }

  function rifirma() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawing.current = false;
    setTracciata(false);
    setAperta(true);
  }

  return (
    <div className="sm:col-span-2">
      <span className="mb-1 block text-xs uppercase tracking-wide text-ink-soft">
        {label}
        {required ? " *" : ""}
      </span>
      {firmata ? <img src={value} alt="" className="firma-ink mt-2 h-28 w-full rounded-xl border border-rule bg-white object-contain" /> : null}
      {!firmata && value && !value.startsWith("data:image") ? <p className="mt-2 text-sm text-ink">{value}</p> : null}
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        aria-label={label}
        className={`firma-ink mt-2 h-36 w-full touch-none rounded-xl border border-rule bg-white ${aperta ? "" : "no-print hidden"}`}
        onPointerDown={inizia}
        onPointerMove={muovi}
        onPointerUp={finisci}
        onPointerLeave={finisci}
        onPointerCancel={finisci}
      />
      {aperta ? <p className="no-print mt-2 text-xs text-ink-soft">{t("Puoi staccare il dito e continuare a scrivere.")}</p> : null}
      <div className="no-print mt-2 flex flex-wrap gap-2">
        {aperta ? (
          <button
            type="button"
            disabled={!tracciata}
            onClick={conferma}
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            {t("Conferma firma")}
          </button>
        ) : (
          <button type="button" onClick={rifirma} className="min-h-11 rounded-full border border-rule px-4 text-sm text-ink">
            {t("Firma di nuovo")}
          </button>
        )}
        <button type="button" onClick={cancella} className="min-h-11 px-2 text-sm text-ink-soft">
          {t("Cancella firma")}
        </button>
      </div>
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </div>
  );
}

function testoPeriodo(dati: Record<string, string>, t: Traduci): string {
  const inizio = isoGiorno(dati.data_inizio) || isoGiorno(dati.data_immersione);
  const fine = isoGiorno(dati.data_fine) || inizio;
  if (!inizio) return "";
  if (!fine || fine === inizio) return formatDay(inizio);
  return t("Dal {inizio} al {fine}", { inizio: formatDay(inizio), fine: formatDay(fine) });
}

const GIORNI_CORTI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function oggiLocale(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoGiorno(value: string | undefined): string {
  const day = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function spostaMesePeriodo(mese: string, delta: number): string {
  const [anno, numero] = mese.split("-").map(Number);
  const data = new Date(anno, numero - 1 + delta, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function cellePeriodo(mese: string): (string | null)[] {
  const [anno, numero] = mese.split("-").map(Number);
  const primo = new Date(anno, numero - 1, 1);
  const vuoti = (primo.getDay() + 6) % 7;
  const giorni = new Date(anno, numero, 0).getDate();
  const celle: (string | null)[] = Array.from({ length: vuoti }, () => null);
  for (let giorno = 1; giorno <= giorni; giorno += 1) {
    celle.push(`${anno}-${String(numero).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`);
  }
  return celle;
}

function CalendarioPeriodo({
  label,
  required,
  data,
  onChange,
}: {
  label: string;
  required: boolean;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const t = useT();
  const inizio = isoGiorno(data.data_inizio) || isoGiorno(data.data_immersione);
  const fine = isoGiorno(data.data_fine) || inizio;
  const [mese, setMese] = useState(() => (inizio || oggiLocale()).slice(0, 7));
  const [anno, numero] = mese.split("-").map(Number);
  const titolo = new Intl.DateTimeFormat(linguaAttuale() === "en" ? "en-GB" : "it-IT", { month: "long", year: "numeric" }).format(new Date(anno, numero - 1, 1));
  const oggi = oggiLocale();
  const periodo = Boolean(inizio && fine && inizio !== fine);

  function scegli(giorno: string) {
    const a = isoGiorno(data.data_inizio);
    const b = isoGiorno(data.data_fine);
    if (a && b && a === b && giorno !== a) {
      const dal = giorno < a ? giorno : a;
      const al = giorno < a ? a : giorno;
      onChange("data_inizio", dal);
      onChange("data_fine", al);
      onChange("data_immersione", dal);
      return;
    }
    onChange("data_inizio", giorno);
    onChange("data_fine", giorno);
    onChange("data_immersione", giorno);
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-xs uppercase tracking-wide text-ink-soft">
        {label}
        {required ? " *" : ""}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{t("Tocca un giorno. Tocca un altro giorno per il periodo.")}</p>
      <div className="mt-3 rounded-2xl border border-rule bg-paper-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="grid size-11 place-items-center rounded-full text-xl text-ink" aria-label={t("Mese precedente")} onClick={() => setMese((current) => spostaMesePeriodo(current, -1))}>
            ‹
          </button>
          <p className="text-base capitalize text-ink">{titolo}</p>
          <button type="button" className="grid size-11 place-items-center rounded-full text-xl text-ink" aria-label={t("Mese successivo")} onClick={() => setMese((current) => spostaMesePeriodo(current, 1))}>
            ›
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-ink-soft">
          {GIORNI_CORTI.map((nome) => (
            <span key={nome}>{t(nome)}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cellePeriodo(mese).map((giorno, index) => {
            if (!giorno) return <span key={`vuoto-${index}`} />;
            const estremi = giorno === inizio || giorno === fine;
            const dentro = Boolean(inizio && fine && giorno > inizio && giorno < fine);
            return (
              <button
                key={giorno}
                type="button"
                onClick={() => scegli(giorno)}
                className={`min-h-12 rounded-xl border text-sm ${estremi ? "border-tide bg-tide font-medium text-white" : dentro ? "border-transparent bg-lagoon/25 text-ink" : "border-rule bg-paper text-ink"} ${giorno === oggi && !estremi ? "ring-1 ring-lagoon" : ""}`}
              >
                {Number(giorno.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
      {inizio ? (
        <p className="mt-2 text-sm font-medium text-ink">
          {periodo ? t("Dal {inizio} al {fine}", { inizio: formatDay(inizio), fine: formatDay(fine) }) : `${formatDay(inizio)} · ${t("Solo questo giorno")}`}
        </p>
      ) : null}
    </div>
  );
}

function FieldBlock({
  field,
  data,
  onChange,
}: {
  field: Field;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const t = useT();
  if (field.type === "section") {
    return (
      <div className="sm:col-span-2 mt-2 border-t border-rule pt-4 first:mt-0 first:border-0 first:pt-0">
        <h2 className="text-xl text-ink">{t(field.title)}</h2>
        {field.hint ? <p className="mt-1 text-sm text-ink-soft">{t(field.hint)}</p> : null}
      </div>
    );
  }
  if (field.type === "note") {
    return <p className="sm:col-span-2 text-sm leading-relaxed text-ink-soft">{t(field.text)}</p>;
  }
  if (field.type === "periodo") {
    return <CalendarioPeriodo label={t(field.label)} required={Boolean(field.required)} data={data} onChange={onChange} />;
  }
  const span = field.type === "textarea" || field.type === "check" || field.type === "yesno" || !("half" in field && field.half)
    ? "sm:col-span-2"
    : "";
  if (field.type === "yesno") {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm text-ink">{t(field.label)}</legend>
        <div className="flex gap-2">
          {[
            ["no", t("No")],
            ["si", t("Sì")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange(field.key, value)}
              className={`min-h-11 flex-1 rounded-full border text-sm ${data[field.key] === value ? "border-lagoon bg-lagoon font-medium text-ink" : "border-rule"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.type === "check") {
    return (
      <label className="sm:col-span-2 flex min-h-11 items-start gap-3 text-sm leading-snug">
        <input
          type="checkbox"
          className="mt-1"
          checked={data[field.key] === "si"}
          onChange={(event) => onChange(field.key, event.target.checked ? "si" : "")}
        />
        <span>{t(field.label)}</span>
      </label>
    );
  }
  if (field.type === "checks") {
    const selected = new Set((data[field.key] ?? "").split(", ").filter(Boolean));
    const groups = [...new Set(field.options.map((item) => item.group))];
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm text-ink">{t(field.label)}</legend>
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-xs uppercase tracking-wide text-ink-soft">{t(group)}</p>
              <div className="mt-1 grid gap-1">
                {field.options.filter((item) => item.group === group).map((item) => (
                  <label key={item.value} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(item.label)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(item.label)) next.delete(item.label);
                        else next.add(item.label);
                        const ordered = field.options.map((option) => option.label).filter((label) => next.has(label));
                        onChange(field.key, ordered.join(", "));
                      }}
                    />
                    <span>{tScelta(item.label, t)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.type === "photo") {
    return (
      <FotoBrevetto
        label={t(field.label)}
        hint={field.hint ? t(field.hint) : undefined}
        daBrevetti={field.daBrevetti === true}
        value={data[field.key] ?? ""}
        nome={data[`${field.key}_nome`] ?? ""}
        onChange={(value, nome) => {
          onChange(field.key, value);
          onChange(`${field.key}_nome`, nome);
        }}
      />
    );
  }
  if (field.type === "sign") {
    return <FirmaCampo label={t(field.label)} required={field.required} hint={field.hint ? t(field.hint) : undefined} value={data[field.key] ?? ""} onChange={(value) => onChange(field.key, value)} />;
  }
  const common = (
    <>
      <span className="mb-1 block text-xs uppercase tracking-wide text-ink-soft">
        {t(field.label)}
        {field.required ? " *" : ""}
      </span>
    </>
  );
  if (field.type === "textarea") {
    return (
      <label className="sm:col-span-2 block text-sm">
        {common}
        <textarea
          name={field.key}
          rows={3}
          value={data[field.key] ?? ""}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
          onChange={(event) => onChange(field.key, event.target.value)}
          onInput={(event) => onChange(field.key, event.currentTarget.value)}
          className={`${inputClass} py-2`}
        />
        {field.hint ? <span className="mt-1 block text-xs text-ink-soft">{t(field.hint)}</span> : null}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className={`block text-sm ${span}`}>
        {common}
        <select
          name={field.key}
          value={data[field.key] ?? ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={inputClass}
        >
          <option value="">{t("Seleziona")}</option>
          {data[field.key] && !field.options.some((option) => option.value === data[field.key]) ? (
            <option value={data[field.key]}>{data[field.key]}</option>
          ) : null}
          {(field.key === "anno_iscrizione" ? anniIscrizione() : field.options).map((option) => (
            <option key={option.value} value={option.value}>
              {tScelta(option.label, t)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "date") {
    return (
      <div className={`block text-sm ${span}`}>
        {common}
        <ScadenzaField tone="paper" value={data[field.key] ?? ""} onChange={(value) => onChange(field.key, value)} />
      </div>
    );
  }
  if ("locked" in field && field.locked) {
    return (
      <label className={`block text-sm ${span}`}>
        {common}
        <input
          name={field.key}
          readOnly
          value={data[field.key] ?? ""}
          placeholder={field.hint ? t(field.hint) : undefined}
          className={`${inputClass} cursor-default`}
        />
        {field.hint ? <span className="mt-1 block text-xs text-ink-soft">{t(field.hint)}</span> : null}
      </label>
    );
  }
  return (
    <label className={`block text-sm ${span}`}>
      {common}
      <input
        name={field.key}
        type={field.type === "number" ? "number" : field.type}
        value={data[field.key] ?? ""}
        autoComplete={field.type === "tel" ? "tel" : field.type === "email" ? "email" : "on"}
        placeholder={"placeholder" in field && field.placeholder ? t(field.placeholder) : undefined}
        onChange={(event) => onChange(field.key, event.target.value)}
        onInput={(event) => onChange(field.key, event.currentTarget.value)}
        className={inputClass}
      />
      {"hint" in field && field.hint ? <span className="mt-1 block text-xs text-ink-soft">{t(field.hint)}</span> : null}
    </label>
  );
}

function AllegaCertificato({
  oggi,
  allegato,
  nome,
  onAllega,
}: {
  oggi: string;
  allegato: string;
  nome: string;
  onAllega: (foto: string, titolo: string) => void;
}) {
  const t = useT();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [pronto, setPronto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listDocumenti()
      .then((items) => {
        if (!live) return;
        const validi = items.filter((item) => {
          if (item.kind !== "medico" || !item.hasFile || !item.fileType.startsWith("image/")) return false;
          const giorno = item.scadenza.slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(giorno) && giorno >= oggi;
        });
        validi.sort((a, b) => (a.scadenza < b.scadenza ? 1 : a.scadenza > b.scadenza ? -1 : b.id - a.id));
        setDoc(validi[0] ?? null);
        setPronto(true);
      })
      .catch(() => {
        if (!live) return;
        setDoc(null);
        setPronto(true);
      });
    return () => {
      live = false;
    };
  }, [oggi]);

  if (!pronto || !doc) return null;

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 w-full rounded-full border border-line px-4 text-sm disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setNote(null);
          void getDocumentoFile({ data: { id: doc.id } })
            .then(async (stored) => {
              const aperto = stored.data.startsWith("{") ? await decifraFile(stored.data) : stored.data;
              if (!aperto.startsWith("data:image/")) throw new Error("Quel documento non è una foto.");
              const blob = await (await fetch(aperto)).blob();
              const prepared = await prepareFotoModulo(new File([blob], stored.name || "certificato.jpg", { type: blob.type || "image/jpeg" }));
              onAllega(prepared.data, doc.titolo || "Certificato medico");
            })
            .catch((reason: unknown) => setNote(messaggioErrore(reason, "Certificato non allegato.")))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("Preparo…") : t("Allega certificato medico")}
      </button>
      {allegato.startsWith("data:image") ? (
        <figure className="mt-3">
          <img src={allegato} alt="" className="max-h-48 rounded-xl bg-white object-contain" />
          {nome ? <figcaption className="mt-1 text-xs text-mist">{nome}</figcaption> : null}
        </figure>
      ) : null}
      {note ? <p className="mt-2 text-sm text-brass">{note}</p> : null}
    </div>
  );
}

function FotoBrevetto({
  label,
  hint,
  daBrevetti,
  value,
  nome,
  onChange,
}: {
  label: string;
  hint?: string;
  daBrevetti: boolean;
  value: string;
  nome: string;
  onChange: (value: string, nome: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<Brevetto[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!daBrevetti) return;
    let live = true;
    listBrevetti()
      .then((items) => {
        if (live) setCards(items);
      })
      .catch(() => {
        if (live) setCards([]);
      });
    return () => {
      live = false;
    };
  }, [daBrevetti]);

  async function usaFile(file: File) {
    setBusy(true);
    setNote(null);
    try {
      const prepared = await prepareFile(file);
      if (!prepared.data.startsWith("data:image/")) throw new Error("Allega una foto, non un PDF.");
      onChange(prepared.data, "Foto caricata");
    } catch (reason) {
      setNote(messaggioErrore(reason, "Foto non caricata."));
    } finally {
      setBusy(false);
    }
  }

  async function usaBrevetto(card: Brevetto) {
    setBusy(true);
    setNote(null);
    try {
      if (!card.hasFile) throw new Error("Questo brevetto non ha una foto. Caricane una, oppure scegline un altro.");
      const stored = await getBrevettoFile({ data: { id: card.id } });
      const aperto = stored.data.startsWith("{") ? await decifraFile(stored.data) : stored.data;
      if (!aperto.startsWith("data:image/")) throw new Error("Quel documento non è una foto. Carica la foto del brevetto.");
      const blob = await (await fetch(aperto)).blob();
      const prepared = await prepareFile(new File([blob], stored.name || "brevetto.jpg", { type: blob.type || "image/jpeg" }));
      const titolo = [card.ente, card.titolo || card.livello, card.numero].filter(Boolean).join(" · ");
      onChange(prepared.data, titolo || "Brevetto salvato");
    } catch (reason) {
      setNote(messaggioErrore(reason, "Non riesco a prendere quel brevetto."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-sm text-ink">{label}</p>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => fileRef.current?.click()}>
          {busy ? t("Preparo…") : t("Carica una foto")}
        </button>
        {value ? (
          <button type="button" className="min-h-11 rounded-full border border-rule px-4 text-sm" onClick={() => onChange("", "")}>
            {t("Togli foto")}
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void usaFile(file);
        }}
      />
      {value ? (
        <figure className="mt-3">
          <img src={value} alt="" className="max-h-48 rounded-xl bg-white object-contain" />
          {nome ? <figcaption className="mt-1 text-xs text-ink-soft">{nome}</figcaption> : null}
        </figure>
      ) : null}
      {daBrevetti ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">{t("Oppure dai brevetti già caricati")}</p>
          {cards === null ? <p className="mt-2 text-sm text-ink-soft">{t("Carico i brevetti…")}</p> : null}
          {cards && cards.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{t("Non hai ancora brevetti salvati nell'area subacqueo.")}</p> : null}
          <ul className="mt-2 grid gap-2">
            {(cards ?? []).map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void usaBrevetto(card)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-rule px-3 py-2 text-left text-sm disabled:opacity-60"
                >
                  <span>
                    <span className="block font-medium">{card.titolo || card.livello || t("Brevetto")}</span>
                    <span className="block text-xs text-ink-soft">{[card.ente, card.numero].filter(Boolean).join(" · ") || t("Senza numero")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">{card.hasFile ? t("Usa questa foto") : t("Senza foto")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm text-brass">{note}</p> : null}
    </div>
  );
}

function DecompressiveLette({ dati }: { dati: Record<string, string> }) {
  const t = useT();
  if (dati.tipo_attivita !== "Tecnica" || dati.decompressiva !== "si") return null;
  const raw = Number(dati.numero_decompressive);
  if (!Number.isInteger(raw) || raw < 1) return null;
  const n = Math.min(8, raw);
  return (
    <>
      <div>
        <dt className="text-xs uppercase tracking-wide text-ink-soft">{t("Numero di decompressive")}</dt>
        <dd className="mt-1 text-sm">{n}</dd>
      </div>
      {Array.from({ length: n }, (_, index) => {
        const i = index + 1;
        const gas = dati[`decompressiva_gas_${i}`] ?? "";
        if (!gas) return null;
        const mix = dati[`decompressiva_miscela_${i}`] ?? "";
        return (
          <div key={i}>
            <dt className="text-xs uppercase tracking-wide text-ink-soft">{t("Gas della decompressiva {n}", { n: i })}</dt>
            <dd className="mt-1 text-sm">{gas === "Altra" && mix ? mix : t(gas)}</dd>
          </div>
        );
      })}
    </>
  );
}

const DIDATTICHE_SCHEDA = ["PADI", "SSI", "CMAS", "SNSI"];

function applicaBrevetto(card: Brevetto, current: Record<string, string>): Record<string, string> {
  const next = { ...current };
  const ente = card.ente.trim();
  const nota = DIDATTICHE_SCHEDA.find((nome) => nome.localeCompare(ente, "it", { sensitivity: "accent" }) === 0);
  if (nota) {
    next.didattica = nota;
    next.didattica_specifica = "";
  } else if (ente) {
    next.didattica = "Altro";
    next.didattica_specifica = ente;
  }
  const livello = card.livello.trim() || card.titolo.trim();
  if (livello) next.livello = livello;
  if (card.numero.trim()) next.numero_brevetto = card.numero.trim();
  next.brevetto_id = String(card.id);
  next.profondita_massima = card.profondita.trim();
  return next;
}

function SceltaBrevetti({
  data,
  onPick,
}: {
  data: Record<string, string>;
  onPick: (card: Brevetto) => void;
}) {
  const t = useT();
  const [cards, setCards] = useState<Brevetto[] | null>(null);
  useEffect(() => {
    let live = true;
    listBrevetti()
      .then((items) => {
        if (live) setCards(items);
      })
      .catch(() => {
        if (live) setCards([]);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!cards || cards.length === 0) return null;
  return (
    <div className="sm:col-span-2">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{t("Brevetti già caricati")}</p>
      <ul className="mt-2 grid gap-2">
        {cards.map((card) => {
          const titolo = card.titolo.trim() || card.livello.trim() || t("Brevetto");
          const dettaglio = [card.ente, card.livello, card.numero].filter(Boolean).join(" · ");
          const scelto = card.numero.trim() !== "" && card.numero.trim() === (data.numero_brevetto ?? "").trim();
          return (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => onPick(card)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm ${scelto ? "border-lagoon bg-lagoon/15" : "border-rule"}`}
              >
                <span>
                  <span className="block font-medium">{titolo}</span>
                  {dettaglio ? <span className="block text-xs text-ink-soft">{dettaglio}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-ink-soft">{scelto ? t("Selezionato") : t("Usa questo")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BloccoDecompressive({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const t = useT();
  const raw = Number(data.numero_decompressive);
  const n = Number.isInteger(raw) && raw > 0 ? Math.min(8, raw) : 1;
  return (
    <div className="sm:col-span-2 mt-2 border-t border-rule pt-4">
      <h2 className="text-xl text-ink">{t("Decompressive")}</h2>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-ink">{t("Numero di decompressive")}</span>
        <input
          inputMode="numeric"
          value={data.numero_decompressive ?? ""}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            if (!digits) {
              onChange("numero_decompressive", "");
              return;
            }
            onChange("numero_decompressive", String(Math.min(8, Math.max(1, Number(digits)))));
          }}
          className={inputClass}
        />
      </label>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-full border border-rule px-4 text-sm"
        onClick={() => onChange("numero_decompressive", String(Math.min(8, n + 1)))}
      >
        {t("Aggiungi decompressiva")}
      </button>
      <div className="mt-3 grid gap-4">
        {Array.from({ length: n }, (_, index) => {
          const i = index + 1;
          const gas = data[`decompressiva_gas_${i}`] ?? "";
          return (
            <div key={i} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-ink">{t("Gas della decompressiva {n}", { n: i })}</span>
                <select value={gas} onChange={(event) => onChange(`decompressiva_gas_${i}`, event.target.value)} className={inputClass}>
                  <option value="">{t("Seleziona")}</option>
                  <option value="EAN50">{t("EAN50")}</option>
                  <option value="Ossigeno">{t("Ossigeno")}</option>
                  <option value="Altra">{t("Altra")}</option>
                </select>
              </label>
              {gas === "Altra" ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-ink">{t("Miscela della decompressiva {n}", { n: i })}</span>
                  <input value={data[`decompressiva_miscela_${i}`] ?? ""} onChange={(event) => onChange(`decompressiva_miscela_${i}`, event.target.value)} className={inputClass} />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sezioniDi(fields: Field[], data: Record<string, string>): { title: string; hint?: string; fields: Field[] }[] {
  const steps: { title: string; hint?: string; fields: Field[] }[] = [];
  let current: { title: string; hint?: string; fields: Field[] } | null = null;
  let aperta = true;
  for (const field of fields) {
    if (field.type === "section") {
      aperta = !field.showWhen || (data[field.showWhen.key] ?? "") === field.showWhen.equals;
      if (!aperta) continue;
      if (field.inline && current) {
        current.fields.push(field);
        continue;
      }
      current = { title: field.title, hint: field.hint, fields: [] };
      steps.push(current);
      continue;
    }
    if (!aperta) continue;
    if ("showWhen" in field && field.showWhen && (data[field.showWhen.key] ?? "") !== field.showWhen.equals) continue;
    if (!current) {
      current = { title: "Dati", fields: [] };
      steps.push(current);
    }
    current.fields.push(field);
  }
  return steps.filter((step) => step.fields.length > 0);
}

export function formReady(form: FormDef | null): form is FormDef {
  return Boolean(form);
}
