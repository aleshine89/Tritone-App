import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, BarChart3, Calendar, CalendarClock, ClipboardList, Inbox } from "lucide-react";
import { useFondale } from "@/components/app-frame";
import { PulsanteSoci } from "@/components/area-soci";
import { ScuolaChiusa } from "@/components/lucchetto";
import { listaPersoneScuola, listSubmissions, listUscite, contaModuliDaLeggere, statoDocumentiStaff, reportControlli, type PersonaScuola, type ReportControlli, type StatoStaffHome, type SubmissionListItem } from "@/lib/fondale.functions";
import { formatDay, oggiRoma, problemiDocumenti, scadenzaStato } from "@/lib/format";
import { scriviPdfReport } from "@/lib/foglio-pdf";
import { messaggioErrore, useT } from "@/lib/i18n";

export function BancoScuola() {
  const frame = useFondale();
  const t = useT();
  const [rows, setRows] = useState<SubmissionListItem[] | null>(null);
  const [staff, setStaff] = useState<PersonaScuola[] | null>(null);
  const [stati, setStati] = useState<StatoStaffHome[] | null>(null);
  const [daLeggereN, setDaLeggereN] = useState<number | null>(null);
  const [oggi, setOggi] = useState(oggiRoma);

  useEffect(() => {
    if (!frame.abbonamento.scuolaAperta) return;
    let live = true;
    const load = () => {
      Promise.all([
        listSubmissions({ data: { sort: "created" } }),
        listaPersoneScuola(),
        contaModuliDaLeggere(),
        statoDocumentiStaff(),
      ])
        .then(([schede, guides, daLeggere, documenti]) => {
          if (!live) return;
          setRows(schede);
          setStaff(guides);
          setDaLeggereN(daLeggere);
          setStati(documenti);
        })
        .catch(() => {
          if (!live) return;
          setRows([]);
          setStaff([]);
          setDaLeggereN(0);
          setStati([]);
        });
    };
    load();
    const clock = window.setInterval(() => setOggi(oggiRoma()), 15000);
    const documenti = window.setInterval(() => {
      statoDocumentiStaff()
        .then((next) => {
          if (live) setStati(next);
        })
        .catch(() => undefined);
    }, 20000);
    const onShow = () => {
      if (document.visibilityState === "visible") {
        setOggi(oggiRoma());
        load();
      }
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      window.clearInterval(clock);
      window.clearInterval(documenti);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [frame.profile?.userId, frame.abbonamento.scuolaAperta, frame.owner]);

  if (!frame.abbonamento.scuolaAperta) return <ScuolaChiusa />;

  const arrivati = (rows ?? []).filter((row) => row.status === "inviato");

  const scadenze = arrivati.filter((row) => {
    if (!row.scadenza) return false;
    const state = scadenzaStato(row.scadenza, frame.oggi);
    return state === "scaduta" || state === "in-scadenza";
  });

  return (
    <div className="mx-auto max-w-3xl">
      {frame.owner && !frame.club.hasChiave ? (
        <p className="mt-4 text-sm text-mist">{t("La chiave della scuola si crea in Profilo, nelle impostazioni. Senza, i moduli sanitari non si aprono.")}</p>
      ) : null}
      <UscitaAperta />
      <Link to="/uscite" search={{ id: undefined }} className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-tide text-base font-medium text-white">
        <Calendar className="size-5 shrink-0" aria-hidden />
        {t(frame.club.mezzoNautico ? "Registro del giorno" : "Registro attività")}
      </Link>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Link to="/grafici" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-3 text-sm font-medium text-foam">
          <BarChart3 className="size-5 shrink-0 text-lagoon" aria-hidden />
          {t("Statistiche")}
        </Link>
        <Link to="/archivio" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-3 text-sm font-medium text-foam">
          <Archive className="size-5 shrink-0 text-lagoon" aria-hidden />
          {t("Archivio moduli")}
        </Link>
      </div>
      <PulsanteSoci />
      <ReportControlli compatto />
      <ModuliDaLeggere n={daLeggereN} compatto />
      <section className="mt-4 rounded-2xl border border-line bg-deep px-3 py-3">
        <h2 className="flex items-center gap-3 text-sm font-medium text-foam">
          <CalendarClock className="size-5 shrink-0 text-lagoon" aria-hidden />
          {t("Documenti in scadenza")}
        </h2>
        {rows && scadenze.length === 0 ? <p className="mt-2 pl-8 text-sm text-foam">{t("Nessuna scadenza vicina.")}</p> : null}
        {scadenze.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {scadenze.map((row) => {
              const attrezzatura = row.formKey === "registro-attrezzatura";
              const stato = scadenzaStato(row.scadenza, frame.oggi);
              const nome = attrezzatura ? [row.authorName, row.subjectName].filter(Boolean).join(" · ") : row.subjectName;
              return (
                <li key={row.id}>
                  <Link to="/scheda/$id" params={{ id: String(row.id) }} className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-1">
                    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-foam">
                      <CalendarClock className="size-4 shrink-0 text-brass" aria-hidden />
                      <span>
                        {nome}
                        {attrezzatura ? <span className="mt-0.5 block text-xs text-brass">{stato === "scaduta" ? t("Attrezzatura scaduta") : t("Attrezzatura in scadenza")}</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-foam">{row.scadenza ? formatDay(row.scadenza) : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-medium">{t("Staff")}</h2>
        <ul className="mt-3 grid gap-3">
          {(staff ?? []).map((person) => {
            const chiama = person.telefono.replace(/[^\d+]/g, "");
            const scheda = stati?.find((item) => item.userId === person.userId);
            const problemi = scheda
              ? problemiDocumenti(
                  { medico: scheda.medico, assicurazione: scheda.assicurazione, brevetto: scheda.brevetto },
                  oggi,
                )
              : null;
            return (
              <li key={person.userId} className="rounded-2xl border border-line bg-deep px-4 py-3">
                <p className="text-sm font-medium">
                  <span>
                    {person.cognome} {person.nome}
                  </span>
                  {problemi ? (
                    <span className={`ml-1.5 ${problemi.length ? "" : "text-[#1b7f3a]"}`} aria-hidden>
                      {problemi.length ? "❌" : "✔️"}
                    </span>
                  ) : null}
                  {person.titolare ? <span className="ml-2 text-xs font-normal text-mist">{t("Titolare")}</span> : null}
                </p>
                {problemi && problemi.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {problemi.map((voce) => (
                      <li key={voce} className="text-xs text-brass">{t(voce)}</li>
                    ))}
                  </ul>
                ) : null}
                {chiama ? (
                  <a href={`tel:${chiama}`} className="mt-1 block text-sm text-lagoon">{person.telefono}</a>
                ) : null}
              </li>
            );
          })}
        </ul>
        {staff && staff.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessuno staff, per ora. Il codice si dà dal Profilo.")}</p> : null}
      </section>
    </div>
  );
}

function ReportControlli({ compatto = false }: { compatto?: boolean }) {
  const frame = useFondale();
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [scelta, setScelta] = useState<"" | "settimana" | "mese">("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  if (!frame.owner) return null;

  function applica(kind: "settimana" | "mese") {
    const fine = new Date();
    const inizio = new Date();
    if (kind === "settimana") inizio.setDate(fine.getDate() - 6);
    else inizio.setMonth(fine.getMonth() - 1);
    setDal(isoLocale(inizio));
    setAl(isoLocale(fine));
    setScelta(kind);
    setErrore(null);
  }

  function scarica() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || al < dal) {
      setErrore(t("Periodo non valido."));
      return;
    }
    setBusy(true);
    setErrore(null);
    void reportControlli({ data: { dal, al } })
      .then((report) => {
        const bytes = scriviPdfReport(pdfReport(report, t));
        const binario = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(binario).set(bytes);
        const file = new File([binario], `report-controlli-${dal}-${al}.pdf`, { type: "application/pdf" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "PDF non creato.")))
      .finally(() => setBusy(false));
  }

  return (
    <section className={compatto ? "mt-4" : "mt-3"}>
      <button type="button" className={`flex w-full items-center rounded-2xl border border-line bg-deep font-medium text-foam ${compatto ? "min-h-11 justify-start gap-3 px-3 text-sm" : "min-h-12 justify-center px-4 text-sm"}`} onClick={() => setAperto((value) => !value)}>
        {compatto ? <ClipboardList className="size-5 shrink-0 text-lagoon" aria-hidden /> : null}
        {t("Report controlli")}
      </button>
      {aperto ? (
        <div className="mt-3 rounded-2xl border border-line bg-deep px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`min-h-11 rounded-full px-3 text-sm ${scelta === "settimana" ? "bg-lagoon font-medium" : "border border-line"}`} onClick={() => applica("settimana")}>
              {t("Ultima settimana")}
            </button>
            <button type="button" className={`min-h-11 rounded-full px-3 text-sm ${scelta === "mese" ? "bg-lagoon font-medium" : "border border-line"}`} onClick={() => applica("mese")}>
              {t("Ultimo mese")}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              {t("Data inizio")}
              <input type="date" value={dal} onChange={(event) => { setDal(event.target.value); setScelta(""); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-deep px-2" />
            </label>
            <label className="text-sm">
              {t("Data fine")}
              <input type="date" value={al} onChange={(event) => { setAl(event.target.value); setScelta(""); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-deep px-2" />
            </label>
          </div>
          {errore ? <p className="mt-2 text-sm text-brass">{errore}</p> : null}
          <button type="button" disabled={busy} className="mt-3 min-h-11 w-full rounded-full bg-tide text-sm font-medium text-white disabled:opacity-60" onClick={scarica}>
            {busy ? t("Genero il PDF…") : t("Scarica PDF")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function isoLocale(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function pdfReport(report: ReportControlli, t: (testo: string, valori?: Record<string, string | number>) => string) {
  const periodo = report.dal === report.al ? formatDay(report.dal) : `${formatDay(report.dal)} – ${formatDay(report.al)}`;
  const cella = (value: string) => value.trim() || "—";
  return {
    titolo: t("Report controlli"),
    centro: report.centro,
    periodo: `${t("Periodo")}: ${periodo}`,
    generato: t("Generato il {data}", { data: formatDay(report.oggi) }),
    vuoto: t("Nessuna immersione nel periodo."),
    senzaSub: t("Nessun subacqueo segnato."),
    guida: t("Guida"),
    colonneSub: [t("Nome"), t("Brevetto"), t("N. brevetto"), t("Prof. max"), t("Autorespiratore"), t("Miscela"), t("Prof. raggiunta")],
    colonneStaff: [t("Nome"), t("Ruolo"), t("Brevetto"), t("Certificato medico"), t("Assicurazione")],
    immersioni: report.uscite.map((uscita) => {
      const sito = [uscita.localita, uscita.punto].filter(Boolean).join(", ") || t("non indicato");
      const fini = uscita.gruppi.flatMap((gruppo) => gruppo.persone.map((persona) => persona.orarioFine)).filter(Boolean);
      const fine = fini.length && fini.every((ora) => ora === fini[0]) ? fini[0] : fini.length ? t("per subacqueo") : t("non indicato");
      const inizio = uscita.orarioInizio || t("non indicato");
      return {
        titolo: `${formatDay(uscita.data)}   ${inizio} – ${fine}   ${sito}`,
        guide: uscita.gruppi.map((gruppo) => ({
          nome: gruppo.passaggio || !gruppo.guida ? t("Solo passaggio, senza guida in acqua") : gruppo.guida,
          righe: gruppo.persone.map((persona) => [
            cella(`${persona.cognome} ${persona.nome}`.trim()),
            cella(persona.allievo ? (persona.livello ? t("Allievo · {livello}", { livello: persona.livello }) : t("Allievo")) : [persona.didattica, persona.livello].filter(Boolean).join(" ")),
            cella(persona.allievo ? "" : persona.numero),
            cella(persona.profonditaBrevetto ? `${persona.profonditaBrevetto} m` : ""),
            cella(persona.autorespiratore),
            cella(persona.miscela),
            cella(persona.profondita ? `${persona.profondita} m` : ""),
          ]),
        })),
      };
    }),
    staffTitolo: t("Documenti staff"),
    staffVuoto: t("Nessuno staff, per ora. Il codice si dà dal Profilo."),
    staff: report.staff.map((persona) => [
      cella(`${persona.cognome} ${persona.nome}`.trim()),
      persona.titolare ? t("Titolare") : t("Staff"),
      statoReport(persona.brevetto, t),
      statoReport(persona.medico, t),
      statoReport(persona.assicurazione, t),
    ]),
  };
}

function statoReport(
  codice: "ok" | "assente" | "scaduto",
  t: (testo: string, valori?: Record<string, string | number>) => string,
): string {
  if (codice === "assente") return t("mancante");
  if (codice === "scaduto") return t("scaduto");
  return t("valido");
}

function ModuliDaLeggere({ n, compatto = false }: { n: number | null; compatto?: boolean }) {
  const t = useT();
  if (n === null) return null;
  if (n === 0) {
    return (
      <section className={`mt-4 flex items-center rounded-2xl border border-line bg-deep ${compatto ? "min-h-11 gap-3 px-3 py-2" : "px-4 py-4"}`}>
        {compatto ? <Inbox className="size-5 shrink-0 text-lagoon" aria-hidden /> : null}
        <p className={compatto ? "text-sm font-medium text-foam" : "text-sm text-mist"}>{t("Nessun modulo in attesa")}</p>
      </section>
    );
  }
  return (
    <Link to="/archivio" className={`mt-4 block rounded-2xl border border-brass bg-amber ${compatto ? "px-3 py-3" : "px-4 py-4"}`}>
      {compatto ? (
        <span className="flex items-center gap-3">
          <Inbox className="size-5 shrink-0 text-brass" aria-hidden />
          <span>
            <span className="block font-display text-3xl leading-none text-brass">{n}</span>
            <span className="mt-1 block text-sm font-medium text-brass">{n === 1 ? t("1 modulo da leggere") : t("{n} moduli da leggere", { n })}</span>
          </span>
        </span>
      ) : (
        <>
          <p className="font-display text-5xl leading-none text-brass">{n}</p>
          <p className="mt-2 text-sm text-brass">{n === 1 ? t("1 modulo da leggere") : t("{n} moduli da leggere", { n })}</p>
        </>
      )}
    </Link>
  );
}

function UscitaAperta() {
  const t = useT();
  const frame = useFondale();
  const [aperte, setAperte] = useState<{ id: number; data: string; localita: string; imbarcazione: string; fase: "prima" | "dopo" | "chiusa" }[]>([]);

  useEffect(() => {
    let live = true;
    listUscite()
      .then((items) => {
        if (live) setAperte(items.filter((item) => item.fase !== "chiusa"));
      })
      .catch(() => {
        if (live) setAperte([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const row = aperte[0];
  if (!row) return null;
  const stato = row.fase === "dopo" ? t("In acqua, da chiudere") : t("Verifica brevetti aperta");
  return (
    <Link to="/uscite" search={{ id: row.id }} className="mt-4 block rounded-card border border-brass bg-amber px-4 py-3">
      <p className="text-sm text-brass">
        {formatDay(row.data)} · {frame.club.mezzoNautico && row.imbarcazione ? `${row.imbarcazione} · ` : ""}{row.localita || t("Senza località")} · {t("Da chiudere")}
      </p>
      <p className="mt-1 text-xs text-brass">
        {stato}
        {aperte.length > 1 ? ` · ${t("e altre {n}", { n: aperte.length - 1 })}` : ""}
      </p>
    </Link>
  );
}
