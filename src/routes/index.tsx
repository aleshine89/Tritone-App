import { useEffect, useRef, useState } from "react";
import { CalendarClock, FileText, Fish, Gauge, ListChecks, Phone } from "lucide-react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { BancoScuola } from "@/components/banco-scuola";
import { Gestione } from "@/components/gestione";
import { DocumentiHome } from "@/components/documenti-home";
import { IMieiDiving } from "@/components/area-soci";
import { InstallApp } from "@/components/pwa";
import { getFotoProfilo, listDocumenti, listLogbook, listSubmissions, setFotoProfilo, type SubmissionListItem } from "@/lib/fondale.functions";
import { CHECKLIST, formByKey, isStaff } from "@/lib/forms";
import { scadenzaStato } from "@/lib/format";
import { prepareFotoProfilo } from "@/lib/prepare-file";
import { useT, messaggioErrore, type Traduci } from "@/lib/i18n";
import { wizardGiaVisto } from "@/components/wizard-sub";
import { SegnoPro } from "@/components/segno-pro";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppFrame>
      <HomeBody />
    </AppFrame>
  );
}

function HomeBody() {
  const t = useT();
  const frame = useFondale();
  const profile = frame.profile;
  const [rows, setRows] = useState<SubmissionListItem[] | null>(null);
  const [anno, setAnno] = useState<{ immersioni: number; minuti: number; media: number; massima: number } | null>(null);
  const [medico, setMedico] = useState<"?" | "manca" | "scaduto" | "ok">("?");
  const [apriWizard, setApriWizard] = useState(false);

  const cliente = Boolean(frame.comeCliente && (frame.owner || frame.platform || isStaff(profile?.role)));
  const soloSub = Boolean(profile && profile.role === "subacqueo" && !frame.owner && !frame.platform);

  useEffect(() => {
    if (soloSub && frame.wizardOk === false && !wizardGiaVisto()) setApriWizard(true);
  }, [soloSub, frame.wizardOk]);

  useEffect(() => {
    if (!profile || ((frame.platform || isStaff(profile.role)) && !cliente)) return;
    let live = true;
    listSubmissions({ data: { sort: "created", personali: true } })
      .then((items) => {
        if (live) setRows(items);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    listDocumenti()
      .then((docs) => {
        if (!live) return;
        const medici = docs.filter((item) => item.kind === "medico");
        if (!medici.length) setMedico("manca");
        else if (medici.some((item) => item.scadenza && scadenzaStato(item.scadenza, frame.oggi) !== "ok")) setMedico("scaduto");
        else setMedico("ok");
      })
      .catch(() => {
        if (live) setMedico("ok");
      });
    listLogbook()
      .then((entries) => {
        if (!live) return;
        const minuti = entries.reduce((sum, row) => sum + (Number(row.minuti) || 0), 0);
        const conProfondita = entries.filter((row) => Number(row.profondita) > 0);
        const media = conProfondita.length
          ? Math.round(conProfondita.reduce((sum, row) => sum + Number(row.profondita), 0) / conProfondita.length)
          : 0;
        const massima = entries.reduce((max, row) => Math.max(max, Number(row.profondita) || 0), 0);
        setAnno({ immersioni: entries.length, minuti, media, massima });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profile?.userId, profile?.role, frame.platform, cliente, frame.oggi]);

  if (!profile) return null;
  if (!cliente && frame.platform && (frame.vista !== "club" || !frame.club.id)) return <Gestione />;
  if (!cliente && frame.desk) return <BancoScuola />;
  if (apriWizard) return <Navigate to="/inizia" />;
  const mine = (rows ?? []).filter((row) => row.mine && row.status === "inviato");
  const needed = CHECKLIST[cliente ? "subacqueo" : profile.role];
  const gear = (rows ?? []).filter((row) => row.formKey === "registro-attrezzatura" && row.scadenza);
  const due = gear.filter((row) => {
    const state = scadenzaStato(row.scadenza, frame.oggi);
    return state === "scaduta" || state === "in-scadenza";
  });
  const nextKey = needed.find((key) => !mine.some((row) => row.formKey === key));
  const scadenza = due[0];
  const azione = prossimaAzione({
    medico,
    immersioni: anno?.immersioni ?? null,
    nextKey,
    scadenza,
  }, t);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-mist">{t("Subacqueo")}</p>
      {frame.abbonamento.ruolo === "sub" && !frame.abbonamento.proAperto ? (
        <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: undefined }} className="mt-3 block rounded-2xl border border-brass bg-brass/15 px-4 py-3 text-sm font-medium text-brass">
          {t("Passa a Pro — 14,90 €/anno")}
        </Link>
      ) : null}
      {soloSub && frame.wizardOk === false ? (
        <Link to="/inizia" className="mt-4 block rounded-2xl border border-brass px-4 py-3 text-sm font-medium">
          {t("Completa i tuoi documenti")}
        </Link>
      ) : null}

      <div className="mt-5 flex items-stretch gap-4 rounded-card border border-line bg-deep p-3">
        <FotoProfilo />
        <Link to="/logbook" search={{ nuova: anno && anno.immersioni === 0 ? 1 : undefined, condivisione: undefined }} className="flex min-w-0 flex-1 flex-col justify-center py-1">
          <span className="text-sm text-mist">{t("Ore in acqua")}</span>
          <span className="mt-1 font-display leading-none">
            <span className="text-5xl">{anno ? oreNumero(anno.minuti) : "—"}</span>
            {anno ? <span className="ml-1 text-2xl">h</span> : null}
          </span>
          <span className="my-3 block border-t border-line/80" />
          <span className="text-sm text-mist">{t("Media")}</span>
          <span className="mt-1 font-display text-4xl leading-none">{anno?.media ? `${anno.media} m` : "—"}</span>
        </Link>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <svg viewBox="0 0 36 36" className="size-16 shrink-0 -rotate-90 text-line" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-lagoon" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${anno ? Math.min(100, Math.round((anno.immersioni / 20) * 100)) : 0} 100`} />
        </svg>
        <div className="min-w-0">
          <p className="text-lg">{t("{n} di {totale}", { n: anno?.immersioni ?? 0, totale: 20 })}</p>
          <p className="mt-1 text-xs text-mist">{t("Traguardo consigliato: 20 immersioni l'anno. Non è un obbligo.")}</p>
          {anno?.massima ? <p className="mt-1 text-xs text-brass">{t("massima {m} m", { m: anno.massima })}</p> : null}
        </div>
      </div>

      <ModuliOggi righe={rows} />

      {azione ? <AzioneGrande azione={azione} /> : null}

      <div className="mt-5 grid gap-3">
        <Link to="/logbook" search={{ nuova: 1, condivisione: undefined }} className="flex min-h-12 items-center justify-center rounded-2xl bg-tide text-sm font-medium text-white">
          {t("Nuova immersione (Logbook)")}
        </Link>
        <Link to="/moduli" className="flex min-h-12 items-center justify-center rounded-2xl bg-tide text-sm font-medium text-white">
          {t("Invia un modulo")}
        </Link>
        <Link to="/cerca-diving" className="flex min-h-12 items-center justify-center rounded-2xl bg-tide text-sm font-medium text-white">
          {t("Cerca Diving")}
        </Link>
      </div>

      <IMieiDiving />

      <div className="mt-6 grid grid-cols-2 gap-3">
        {(
          [
            { voce: "pianifica", nome: "Pianifica", riga: "Programma immersioni", icona: CalendarClock },
            { voce: "specie", nome: "Specie", riga: "Catalogo specie marine", icona: Fish },
            { voce: "tools", nome: "Tools", riga: "Strumenti e calcolatori", icona: Gauge },
            { voce: "mod", nome: "MOD & CNS", riga: "Moduli e report", icona: FileText },
            { voce: "checklist", nome: "Checklist", riga: "Controlli pre-immersione", icona: ListChecks },
            { voce: "emergenze", nome: "Emergenze", riga: "Numeri da chiamare", icona: Phone },
          ] as const
        ).map((voce) => (
          <Link key={voce.voce} to="/personale" search={{ voce: voce.voce }} className="flex items-center gap-3 rounded-2xl border border-line bg-deep px-3 py-3">
            <voce.icona className="size-7 shrink-0 text-lagoon" strokeWidth={1.5} />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">
                {t(voce.nome)}
                {voce.voce === "checklist" && frame.abbonamento.proAperto ? <SegnoPro /> : null}
              </span>
              <span className="mt-0.5 block text-xs text-mist">{t(voce.riga)}</span>
            </span>
          </Link>
        ))}
      </div>

      <DocumentiHome />

      <p className="mt-8 text-xs leading-relaxed text-mist">{t("Modelli operativi allineati alla Legge 7 maggio 2026, n. 70 e alle prassi documentali di settore. Non sostituiscono certificati o polizze. I registri vanno conservati secondo normativa.")}</p>
      <InstallApp />
    </div>
  );
}

function giornoRoma(adesso = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
}

function giornoInvio(createdAt: string): string {
  const testo = createdAt.trim().replace(" ", "T");
  const conZona = /(?:Z|[+-]\d{2}:\d{2})$/.test(testo);
  const istante = new Date(conZona ? testo : `${testo}Z`);
  if (Number.isNaN(istante.getTime())) return createdAt.slice(0, 10);
  return giornoRoma(istante);
}

function ModuliOggi({ righe }: { righe: SubmissionListItem[] | null }) {
  const t = useT();
  const [aperta, setAperta] = useState(false);
  const oggi = giornoRoma();
  const inviati = (righe ?? []).filter((row) => row.mine && row.status === "inviato" && giornoInvio(row.createdAt) === oggi);

  return (
    <section className="mt-3">
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm" aria-expanded={aperta} onClick={() => setAperta((ora) => !ora)}>
        <span>{t("Moduli inviati oggi")}</span>
        <span className="text-mist">{inviati.length}</span>
      </button>
      {aperta ? (
        inviati.length ? (
          <ul className="mt-2 grid gap-2">
            {inviati.map((row) => (
              <li key={row.id}>
                <Link to="/scheda/$id" params={{ id: String(row.id) }} hash="lettura" className="block rounded-2xl border border-line bg-deep px-4 py-3">
                  <span className="block text-sm font-medium">{t(formByKey(row.formKey)?.title ?? "Modulo")}</span>
                  {row.clubNome ? <span className="mt-1 block text-xs text-mist">{row.clubNome}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-mist">{t("Nessun modulo inviato oggi.")}</p>
        )
      ) : null}
    </section>
  );
}

type Azione =
  | { kind: "medico"; titolo: string; dettaglio: string }
  | { kind: "log"; titolo: string; dettaglio: string }
  | { kind: "form"; titolo: string; dettaglio: string; formKey: string }
  | { kind: "scheda"; titolo: string; dettaglio: string; id: string };

function prossimaAzione(input: {
  medico: "?" | "manca" | "scaduto" | "ok";
  immersioni: number | null;
  nextKey: string | undefined;
  scadenza: SubmissionListItem | undefined;
}, t: Traduci): Azione | null {
  if (input.medico === "?") return null;
  if (input.medico === "manca") {
    return { kind: "medico", titolo: t("Manca il certificato medico"), dettaglio: t("Aggiungilo. Senza, la scuola non può farti entrare in acqua.") };
  }
  if (input.medico === "scaduto") {
    return { kind: "medico", titolo: t("Certificato medico scaduto"), dettaglio: t("Aggiornalo prima della prossima uscita.") };
  }
  if (input.scadenza) {
    return { kind: "scheda", titolo: input.scadenza.subjectName, dettaglio: t("Una scadenza da controllare."), id: String(input.scadenza.id) };
  }
  if (input.nextKey) {
    return {
      kind: "form",
      titolo: t("Manca {titolo}", { titolo: t(formByKey(input.nextKey)?.title ?? "un modulo") }),
      dettaglio: t("Tocca per compilarlo."),
      formKey: input.nextKey,
    };
  }
  if (input.immersioni === 0) {
    return { kind: "log", titolo: t("Nessuna immersione. Aggiungila"), dettaglio: t("Il logbook è ancora vuoto.") };
  }
  return null;
}

function oreNumero(minuti: number): string {
  const ore = Math.round(minuti / 6) / 10;
  return Number.isInteger(ore) ? String(ore) : ore.toFixed(1).replace(".", ",");
}

function oreInAcqua(minuti: number): string {
  return `${oreNumero(minuti)} h`;
}

function FotoProfilo() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getFotoProfilo()
      .then((foto) => {
        if (live) setSrc(foto);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErrore(null);
    try {
      const foto = await prepareFotoProfilo(file);
      await setFotoProfilo({ data: { foto } });
      setSrc(foto);
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Foto non salvata."));
    }
  }

  return (
    <button type="button" onClick={() => input.current?.click()} className="relative flex min-h-40 w-1/2 shrink-0 items-end overflow-hidden rounded-2xl bg-surface text-left">
      {src ? <img src={src} alt="" className="block h-auto w-full" /> : <span className="p-3 text-sm text-mist">{t("La tua foto")}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {errore ? <span className="absolute inset-x-0 bottom-0 bg-ink/80 p-2 text-xs text-danger">{errore}</span> : null}
    </button>
  );
}

function AzioneGrande({ azione }: { azione: Azione }) {
  const className = "mt-3 block text-sm text-mist";
  const testo = azione.titolo;
  if (azione.kind === "medico") {
    return (
      <Link to="/personale" search={{ voce: "medico" }} className={className}>
        {testo}
      </Link>
    );
  }
  if (azione.kind === "log") return null;
  if (azione.kind === "form") {
    return (
      <Link to="/nuova/$formKey" params={{ formKey: azione.formKey }} className={className}>
        {testo}
      </Link>
    );
  }
  return (
    <Link to="/scheda/$id" params={{ id: azione.id }} className={className}>
      {testo}
    </Link>
  );
}
