import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { avviaPagamento, confermaStripe, leggiFattura, type FatturaDati } from "@/lib/pagamenti.functions";
import { IBAN, INTESTATARIO, PREZZO_DIVING_CENT, PREZZO_POSTO_CENT, PREZZO_SCUOLA_CENT, PREZZO_SUB_CENT, euro } from "@/lib/prezzi";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/piano")({
  validateSearch: (search: Record<string, unknown>) => ({
    esito: search.esito === "ok" || search.esito === "annullato" ? search.esito : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
    tipo: search.tipo === "posto" || search.tipo === "struttura" ? search.tipo : undefined,
  }),
  component: Page,
});

const vuoti: FatturaDati = { nome: "", cognome: "", ragione: "", cf: "", piva: "", indirizzo: "", sdi: "", pec: "" };

function Page() {
  return (
    <AppFrame>
      <Piano />
    </AppFrame>
  );
}

function Piano() {
  const t = useT();
  const frame = useFondale();
  const search = Route.useSearch();
  const [fattura, setFattura] = useState(false);
  const [dati, setDati] = useState<FatturaDati>(vuoti);
  const [metodo, setMetodo] = useState<"stripe" | "bonifico">("stripe");
  const [errore, setErrore] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sub = frame.abbonamento.ruolo === "sub" || (frame.profile?.role === "subacqueo" && !frame.owner);
  const struttura = search.tipo === "struttura" || (frame.owner && search.tipo !== "posto" && !sub);
  const posto = search.tipo === "posto";
  const tipo = posto ? "posto" : struttura ? (frame.club.mezzoNautico ? "diving" : "scuola") : "sub";
  const prezzo = tipo === "posto" ? PREZZO_POSTO_CENT : tipo === "diving" ? PREZZO_DIVING_CENT : tipo === "scuola" ? PREZZO_SCUOLA_CENT : PREZZO_SUB_CENT;

  useEffect(() => {
    void leggiFattura().then(setDati).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (search.esito !== "ok" || !search.session_id) return;
    setBusy(true);
    void confermaStripe({ data: { session: search.session_id } })
      .then(async () => {
        await frame.refresh();
        setOk(tipo === "sub" || tipo === "posto" ? t("Pagamento riuscito. Il piano è attivo.") : t("Pagamento ricevuto. Il piano lo attiva il gestore, con il codice."));
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Pagamento non confermato.")))
      .finally(() => setBusy(false));
  }, [search.esito, search.session_id]);

  function campo(chiave: keyof FatturaDati, etichetta: string) {
    return (
      <label className="block text-sm">
        <span className="mb-1 block text-mist">{t(etichetta)}</span>
        <input value={dati[chiave]} onChange={(event) => setDati({ ...dati, [chiave]: event.target.value })} className="min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none" />
      </label>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/profilo" className="text-sm text-lagoon">{t("Profilo")}</Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Pagamento")}</h1>
      <p className="mt-3 text-sm text-mist">
        {tipo === "sub"
          ? t("Subacqueo Pro, solo annuale: {prezzo}", { prezzo: euro(prezzo) })
          : tipo === "posto"
            ? t("Un posto Pro in più per lo staff: {prezzo}", { prezzo: euro(prezzo) })
            : t("Piano annuale della struttura: {prezzo}", { prezzo: euro(prezzo) })}
      </p>
      {search.esito === "annullato" ? <p className="mt-3 text-sm text-brass">{t("Pagamento annullato.")}</p> : null}
      {ok ? <p className="mt-3 text-sm text-foam">{ok}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" className={`min-h-11 flex-1 rounded-full px-4 text-sm ${!fattura && metodo !== "bonifico" ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => { if (metodo !== "bonifico") setFattura(false); }}>{t("Senza fattura")}</button>
        <button type="button" className={`min-h-11 flex-1 rounded-full px-4 text-sm ${fattura || metodo === "bonifico" ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => setFattura(true)}>{t("Con fattura")}</button>
      </div>
      {fattura || metodo === "bonifico" ? (
        <div className="mt-3 grid gap-3">
          {campo("nome", "Nome")}
          {campo("cognome", "Cognome")}
          {campo("ragione", "Ragione sociale o nome")}
          {campo("cf", "Codice fiscale")}
          {campo("piva", "Partita IVA")}
          {campo("indirizzo", "Indirizzo")}
          {campo("sdi", "Codice SDI")}
          {campo("pec", "PEC")}
        </div>
      ) : null}
      {tipo === "sub" ? null : (
        <div className="mt-4 flex gap-2">
          <button type="button" className={`min-h-11 flex-1 rounded-full px-4 text-sm ${metodo === "stripe" ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => setMetodo("stripe")}>Stripe</button>
          <button type="button" className={`min-h-11 flex-1 rounded-full px-4 text-sm ${metodo === "bonifico" ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => { setMetodo("bonifico"); setFattura(true); }}>{t("Bonifico")}</button>
        </div>
      )}
      {tipo !== "sub" && metodo === "bonifico" ? (
        <div className="mt-3 rounded-2xl border border-line bg-deep p-4 text-sm">
          <p>{t("IBAN: {iban}", { iban: IBAN })}</p>
          <p>{t("Intestatario: {nome}", { nome: INTESTATARIO })}</p>
          <p className="mt-2 text-mist">{t("Causale: Tritone – {tipo}", { tipo })}</p>
          <p className="mt-2">{t("Il piano non si accende da solo. Il gestore lo attiva quando il bonifico arriva, e ti manda il codice.")}</p>
        </div>
      ) : null}
      {errore ? <p className="mt-3 text-sm text-danger">{errore}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setErrore(null);
          const conFattura = fattura || (tipo !== "sub" && metodo === "bonifico");
          if (conFattura && (!dati.nome.trim() || !dati.cognome.trim() || !dati.ragione.trim() || !dati.cf.trim() || !dati.piva.trim() || !dati.indirizzo.trim())) {
            setErrore(t("Per la fattura servono nome, cognome, ragione sociale, codice fiscale, partita IVA e indirizzo."));
            setBusy(false);
            return;
          }
          void avviaPagamento({
            data: { tipo, metodo: tipo === "sub" ? "stripe" : metodo, fattura: conFattura, dati, origine: window.location.origin },
          })
            .then(async (esito) => {
              if (esito.url) {
                window.location.href = esito.url;
                return;
              }
              await frame.refresh();
              setOk(t("Bonifico segnato. Il piano lo attiva il gestore quando arriva, con il codice."));
            })
            .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Pagamento non avviato.")))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("Attendo…") : metodo === "bonifico" && tipo !== "sub" ? t("Ho effettuato il bonifico") : t("Paga {prezzo}", { prezzo: euro(prezzo) })}
      </button>
    </div>
  );
}
