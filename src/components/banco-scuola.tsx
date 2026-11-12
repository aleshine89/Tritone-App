import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Calendar, ClipboardList, Users } from "lucide-react";
import { useFondale } from "@/components/app-frame";
import { ScuolaChiusa } from "@/components/lucchetto";
import { listSubmissions, listUscite, contaModuliDaLeggere, reportControlli, listaSoci, type ReportControlli } from "@/lib/fondale.functions";
import { formatDay, scadenzaStato } from "@/lib/format";
import { entroUnMese } from "@/lib/prezzi";
import { scriviPdfReport } from "@/lib/foglio-pdf";
import { messaggioErrore, useT } from "@/lib/i18n";
import { ConvalideInAttesa } from "@/components/convalida-log";
import { accettaViaggio, listaViaggi, type ViaggioBreve } from "@/lib/viaggi.functions";

export function BancoScuola() {
  const frame = useFondale();
  const t = useT();
  const navigate = useNavigate();
  const [daLeggereN, setDaLeggereN] = useState<number | null>(null);
  const [scadenze, setScadenze] = useState(0);
  const [aperte, setAperte] = useState<{ id: number; data: string; localita: string; imbarcazione: string }[]>([]);
  const [arrivi, setArrivi] = useState<ViaggioBreve[]>([]);
  const [inAttesa, setInAttesa] = useState(0);
  const [scuolaAperta, setScuolaAperta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function carica() {
    return Promise.all([
      contaModuliDaLeggere(),
      listSubmissions({ data: { sort: "created" } }),
      listUscite(),
      listaViaggi(),
      listaSoci(),
    ]).then(([daLeggere, schede, uscite, viaggi, soci]) => {
      const inScadenza = schede.filter((row) => {
        if (row.status !== "inviato" || !row.scadenza) return false;
        const stato = scadenzaStato(row.scadenza, frame.oggi);
        return stato === "scaduta" || stato === "in-scadenza";
      });
      setDaLeggereN(daLeggere);
      setScadenze(inScadenza.length);
      setAperte(uscite.filter((item) => item.fase !== "chiusa").map((item) => ({ id: item.id, data: item.data, localita: item.localita, imbarcazione: item.imbarcazione })));
      setArrivi(viaggi.filter((item) => item.mio === "ospito" && item.stato === "inviato"));
      setInAttesa(soci.inAttesa.length);
    });
  }

  useEffect(() => {
    if (!frame.abbonamento.scuolaAperta) return;
    let live = true;
    carica().catch(() => {
      if (!live) return;
      setDaLeggereN(0);
    });
    return () => {
      live = false;
    };
  }, [frame.profile?.userId, frame.abbonamento.scuolaAperta, frame.oggi]);

  if (!frame.abbonamento.scuolaAperta) return <ScuolaChiusa />;

  const uscita = aperte[0];
  const viaggio = arrivi[0];
  const moduli = daLeggereN ?? 0;
  const registroNome = frame.club.mezzoNautico ? "Registro" : "Registro attività";
  const registroN = aperte.length - (uscita ? 1 : 0) + arrivi.length - (!uscita && viaggio ? 1 : 0);
  const moduliN = (!uscita && !viaggio && moduli > 0 ? 0 : moduli) + scadenze - (!uscita && !viaggio && moduli === 0 && scadenze > 0 ? 1 : 0);

  let kicker = "Da fare adesso";
  let titolo = "";
  let dettaglio = "";
  let azione = "Apri";
  let vai: () => void = () => {
    void navigate({ to: "/uscite", search: { id: undefined } });
  };
  if (uscita) {
    titolo = t("Chiudi il registro");
    dettaglio = `${formatDay(uscita.data)} · ${frame.club.mezzoNautico && uscita.imbarcazione ? `${uscita.imbarcazione} · ` : ""}${uscita.localita || t("Senza località")}`;
    vai = () => {
      void navigate({ to: "/uscite", search: { id: uscita.id } });
    };
  } else if (viaggio) {
    titolo = t("È arrivato un viaggio");
    dettaglio = `${viaggio.titolo} · ${viaggio.club}`;
    azione = "Accetta";
    vai = () => {
      if (busy) return;
      setBusy(true);
      setErrore(null);
      void accettaViaggio({ data: { id: viaggio.id } })
        .then(() => carica())
        .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco ad accettare.")))
        .finally(() => setBusy(false));
    };
  } else if (moduli > 0) {
    titolo = moduli === 1 ? t("1 modulo da leggere") : t("{n} moduli da leggere", { n: moduli });
    dettaglio = t("Sono nell'archivio.");
    azione = "Leggi";
    vai = () => navigate({ to: "/archivio" });
  } else if (scadenze > 0) {
    titolo = scadenze === 1 ? t("1 documento in scadenza") : t("{n} documenti in scadenza", { n: scadenze });
    dettaglio = t("Medico, assicurazione o attrezzatura.");
    vai = () => navigate({ to: "/archivio" });
  } else {
    kicker = "Oggi";
    titolo = t("Niente in sospeso");
    dettaglio = t("Puoi aprire l'uscita di oggi.");
    azione = "Apri l'uscita di oggi";
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ConvalideInAttesa />
      <section className="rounded-3xl border border-brass bg-deep px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-brass">{t(kicker)}</p>
        <h2 className="mt-2 text-2xl leading-none">{titolo}</h2>
        <p className="mt-2 text-sm text-mist">{dettaglio}</p>
        {errore ? <p className="mt-2 text-sm text-brass">{errore}</p> : null}
        <button type="button" disabled={busy} className="mt-4 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={vai}>
          {busy ? t("Accetto…") : t(azione)}
        </button>
      </section>
      <div className="mt-4 grid gap-3">
        <Link to="/uscite" search={{ id: undefined }} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-4">
          <Calendar className="size-5 shrink-0 text-lagoon" aria-hidden />
          <span className="flex-1 text-base font-medium">{t(registroNome)}</span>
          {registroN > 0 ? <span className="text-sm text-brass">{registroN}</span> : null}
        </Link>
        <Link to="/soci" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-4">
          <Users className="size-5 shrink-0 text-lagoon" aria-hidden />
          <span className="flex-1 text-base font-medium">{t("Persone")}</span>
          {inAttesa > 0 ? <span className="text-sm text-brass">{inAttesa}</span> : null}
        </Link>
        <Link to={moduli > 0 || scadenze > 0 ? "/archivio" : "/moduli"} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-4">
          <ClipboardList className="size-5 shrink-0 text-lagoon" aria-hidden />
          <span className="flex-1 text-base font-medium">{t("Moduli")}</span>
          {moduliN > 0 ? <span className="text-sm text-brass">{moduliN}</span> : null}
        </Link>
        <Link to="/grafici" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-deep px-4">
          <BarChart3 className="size-5 shrink-0 text-lagoon" aria-hidden />
          <span className="flex-1 text-base font-medium">{t("Statistiche")}</span>
        </Link>
      </div>
      {frame.owner ? (
        <section className="mt-4">
          <button type="button" className="flex min-h-14 w-full items-center rounded-2xl border border-line px-4 text-left text-base font-medium" onClick={() => setScuolaAperta((value) => !value)}>
            <span className="flex-1">{t("Scuola")}</span>
            {!frame.club.hasChiave || entroUnMese(frame.oggi, frame.club.attivoFino) ? <span className="text-sm text-brass">{t("Da vedere")}</span> : null}
          </button>
          {scuolaAperta ? (
            <div className="mt-3 grid gap-3">
              {entroUnMese(frame.oggi, frame.club.attivoFino) ? (
                <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: "struttura" }} className="block rounded-2xl border border-brass bg-brass/15 px-4 py-3 text-sm font-medium text-brass">
                  <span className="block">{t("Rinnova piano")}</span>
                  <span className="mt-1 block text-xs font-normal">{rigaPiano(frame.club, frame.oggi, t)}</span>
                </Link>
              ) : (
                <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: "struttura" }} className="block rounded-2xl border border-line bg-deep px-4 py-3 text-sm">
                  <span className="block">{t("Piano e rinnovo")}</span>
                  <span className="mt-1 block text-xs text-mist">{rigaPiano(frame.club, frame.oggi, t)}</span>
                </Link>
              )}
              <Link to="/profilo" search={{ scuola: true }} className="block rounded-2xl border border-line bg-deep px-4 py-3 text-sm">
                {t("Barche, codici e chiave")}
                {!frame.club.hasChiave ? <span className="mt-1 block text-xs text-brass">{t("Senza la chiave, i moduli sanitari non si aprono.")}</span> : null}
              </Link>
              <ReportControlli compatto />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function rigaPiano(
  club: { piano: "" | "trial" | "active" | "sospeso"; provaFino: string; attivoFino: string; mezzoNautico: boolean },
  oggi: string,
  t: (testo: string, valori?: Record<string, string | number>) => string,
): string {
  if (club.piano === "sospeso") return t("Piano sospeso");
  if (club.piano !== "trial" && club.piano !== "active") return t("Nessun piano attivo");
  const fino = (club.piano === "trial" ? club.provaFino : club.attivoFino).slice(0, 10);
  const scaduto = Boolean(fino) && fino < oggi;
  if (club.piano === "trial") {
    return fino ? t(scaduto ? "Prova scaduta il {data}" : "Prova, fino al {data}", { data: formatDay(fino) }) : t("Prova");
  }
  const diving = club.mezzoNautico;
  if (!fino) return t(diving ? "Diving, attivo" : "Scuola, attivo");
  if (scaduto) return t(diving ? "Diving scaduto il {data}" : "Scuola scaduta il {data}", { data: formatDay(fino) });
  return t(diving ? "Diving, fino al {data}" : "Scuola, fino al {data}", { data: formatDay(fino) });
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
