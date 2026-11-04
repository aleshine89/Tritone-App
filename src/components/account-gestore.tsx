import { useEffect, useState } from "react";
import { elencoAbbonamenti, impostaAccountAbbonamento, impostaMezzoNautico, impostaPianoDiving, scaricaDatiAccount, type AccountGestore, type DivingPiano } from "@/lib/fondale.functions";
import { ROLE_LABEL } from "@/lib/forms";
import { messaggioErrore, useT, type Traduci } from "@/lib/i18n";

function ruoloVisibile(ruolo: string, t: Traduci): string {
  if (ruolo === "subacqueo" || ruolo === "istruttore" || ruolo === "scuola" || ruolo === "piattaforma") return t(ROLE_LABEL[ruolo]);
  return ruolo;
}

export function AccountGestore() {
  const t = useT();
  const [account, setAccount] = useState<AccountGestore[] | null>(null);
  const [diving, setDiving] = useState<DivingPiano[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [scarico, setScarico] = useState(false);

  function carica() {
    return elencoAbbonamenti().then((data) => {
      setAccount(data.account);
      setDiving(data.diving);
    });
  }

  useEffect(() => {
    let live = true;
    elencoAbbonamenti()
      .then((data) => {
        if (!live) return;
        setAccount(data.account);
        setDiving(data.diving);
      })
      .catch((reason: unknown) => {
        if (live) setError(messaggioErrore(reason, "Non riesco a leggere gli account."));
      });
    return () => {
      live = false;
    };
  }, []);

  const senza = (account ?? []).filter((row) => !row.ruolo);
  const filtro = nome.trim().toLowerCase();
  const persone = (account ?? []).filter((row) => {
    if (!filtro) return true;
    const diretto = `${row.nome} ${row.cognome}`.toLowerCase();
    const inverso = `${row.cognome} ${row.nome}`.toLowerCase();
    return diretto.includes(filtro) || inverso.includes(filtro);
  });
  const conMezzo = (diving ?? []).filter((row) => row.mezzoNautico);
  const senzaMezzo = (diving ?? []).filter((row) => !row.mezzoNautico);

  function salvaMezzo(row: DivingPiano, attivo: boolean) {
    setBusyId(`m-${row.id}`);
    setError(null);
    void impostaMezzoNautico({ data: { id: row.id, attivo } })
      .then(() => carica())
      .catch((reason: unknown) => setError(messaggioErrore(reason, "Non salvato.")))
      .finally(() => setBusyId(null));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl leading-none">{t("Account")}</h1>
      <button
        type="button"
        disabled={scarico}
        className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
        onClick={() => {
          setScarico(true);
          setError(null);
          void scaricaDatiAccount()
            .then((righe) => {
              const csv = csvAccount(righe);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "account-tritone.csv";
              link.click();
              URL.revokeObjectURL(url);
            })
            .catch((reason: unknown) => setError(messaggioErrore(reason, "Elenco non scaricato.")))
            .finally(() => setScarico(false));
        }}
      >
        {scarico ? t("Preparo il file…") : t("Scarica tutti i dati")}
      </button>
      <p className="mt-2 text-sm text-mist">
        {account ? t("{n} account", { n: account.length }) : t("Carico gli account…")}. {senza.length ? t("{n} senza ruolo.", { n: senza.length }) : t("Tutti hanno un ruolo.")} {t("Nessuna cancellazione.")}
      </p>
      {error ? <p className="mt-4 text-sm text-brass">{error}</p> : null}

      <ListaCentri
        titolo="Diving con mezzo nautico"
        righe={conMezzo}
        busyId={busyId}
        onSave={(row, piano, provaFino) => {
          setBusyId(`d-${row.id}`);
          setError(null);
          void impostaPianoDiving({ data: { id: row.id, piano, provaFino } })
            .then(() => carica())
            .catch((reason: unknown) => setError(messaggioErrore(reason, "Non salvato.")))
            .finally(() => setBusyId(null));
        }}
        onMezzo={salvaMezzo}
      />
      <ListaCentri
        titolo="Scuole/Club senza mezzo nautico"
        righe={senzaMezzo}
        busyId={busyId}
        onSave={(row, piano, provaFino) => {
          setBusyId(`d-${row.id}`);
          setError(null);
          void impostaPianoDiving({ data: { id: row.id, piano, provaFino } })
            .then(() => carica())
            .catch((reason: unknown) => setError(messaggioErrore(reason, "Non salvato.")))
            .finally(() => setBusyId(null));
        }}
        onMezzo={salvaMezzo}
      />

      <section className="mt-8">
        <h2 className="text-2xl">{t("Persone")}</h2>
        <p className="mt-1 text-sm text-mist">{t("Subacquei, staff e titolari.")}</p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-mist">{t("Cerca per nome")}</span>
          <input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder={t("Nome o cognome")}
            className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3"
          />
        </label>
        <ul className="mt-3 space-y-3">
          {persone.map((row) => (
            <PersonaRiga
              key={row.id}
              row={row}
              diving={diving ?? []}
              busy={busyId === row.id}
              onSave={(value) => {
                setBusyId(row.id);
                setError(null);
                void impostaAccountAbbonamento({ data: value })
                  .then(() => carica())
                  .catch((reason: unknown) => setError(messaggioErrore(reason, "Non salvato.")))
                  .finally(() => setBusyId(null));
              }}
            />
          ))}
        </ul>
        {account && filtro && persone.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessun account con questo nome.")}</p> : null}
      </section>
    </div>
  );
}

function csvAccount(righe: { nome: string; cognome: string; email: string; ruolo: string; registrato: string; stato: string }[]): string {
  const cella = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const righeCsv = righe.map((row) => [row.nome, row.cognome, row.email, row.ruolo, row.registrato, row.stato].map(cella).join(","));
  return `\uFEFF${["nome", "cognome", "email", "ruolo", "data_registrazione", "stato"].join(",")}\n${righeCsv.join("\n")}\n`;
}

function ListaCentri({
  titolo,
  righe,
  busyId,
  onSave,
  onMezzo,
}: {
  titolo: string;
  righe: DivingPiano[];
  busyId: string | null;
  onSave: (row: DivingPiano, piano: string, provaFino: string) => void;
  onMezzo: (row: DivingPiano, attivo: boolean) => void;
}) {
  const t = useT();
  return (
    <section className="mt-6">
      <h2 className="text-2xl">{t(titolo)}</h2>
      {righe.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessuno, per ora.")}</p> : null}
      <ul className="mt-3 space-y-3">
        {righe.map((row) => (
          <DivingRiga
            key={row.id}
            row={row}
            busy={busyId === `d-${row.id}` || busyId === `m-${row.id}`}
            onSave={(piano, provaFino) => onSave(row, piano, provaFino)}
            onMezzo={(attivo) => onMezzo(row, attivo)}
          />
        ))}
      </ul>
    </section>
  );
}

function DivingRiga({
  row,
  busy,
  onSave,
  onMezzo,
}: {
  row: DivingPiano;
  busy: boolean;
  onSave: (piano: string, provaFino: string) => void;
  onMezzo: (attivo: boolean) => void;
}) {
  const t = useT();
  const [piano, setPiano] = useState(row.piano || "trial");
  const [provaFino, setProvaFino] = useState(row.provaFino);
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <p className="text-lg">{row.nome}</p>
      <p className="mt-1 text-xs text-mist">{t("Stato scuola: {stato}. Il piano è un'altra cosa.", { stato: t(row.stato === "attiva" ? "attiva" : row.stato === "sospesa" ? "sospesa" : row.stato) })}</p>
      <button
        type="button"
        role="switch"
        aria-checked={row.mezzoNautico}
        disabled={busy}
        className="mt-3 flex min-h-11 w-full items-center justify-between rounded-full border border-line px-4 text-sm disabled:opacity-60"
        onClick={() => onMezzo(!row.mezzoNautico)}
      >
        <span>{t("Mezzo nautico")}</span>
        <span className={`rounded-full px-3 py-1 ${row.mezzoNautico ? "bg-lagoon" : "border border-line"}`}>{row.mezzoNautico ? t("acceso") : t("spento")}</span>
      </button>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={piano} onChange={(event) => setPiano(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3">
          <option value="trial">{t("trial")}</option>
          <option value="active">{t("active")}</option>
          <option value="sospeso">{t("sospeso")}</option>
        </select>
        <input type="date" value={provaFino} onChange={(event) => setProvaFino(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3" />
      </div>
      <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => onSave(piano, provaFino)}>
        {busy ? t("Salvo…") : t("Salva diving")}
      </button>
    </li>
  );
}

function PersonaRiga({
  row,
  diving,
  busy,
  onSave,
}: {
  row: AccountGestore;
  diving: DivingPiano[];
  busy: boolean;
  onSave: (value: { id: string; ruolo: string; piano: string; provaFino: string; scuolaId: number }) => void;
}) {
  const t = useT();
  const [ruolo, setRuolo] = useState(row.ruolo);
  const [piano, setPiano] = useState(row.piano || "free");
  const [provaFino, setProvaFino] = useState(row.provaFino);
  const [scuolaId, setScuolaId] = useState(row.scuolaId ? String(row.scuolaId) : "");
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <p className="text-lg">{[row.cognome, row.nome].filter(Boolean).join(" ") || row.email}</p>
      <p className="mt-1 text-sm text-mist">{row.email}</p>
      {!row.ruolo ? <p className="mt-1 text-sm text-brass">{t("Senza ruolo. Non è stato indovinato.")}</p> : null}
      {row.senzaProfilo ? <p className="mt-1 text-sm text-brass">{t("Senza profilo. Non lo creo da qui.")}</p> : null}
      <p className="mt-1 text-xs text-mist">{t("Ruolo nell'app: {ruolo}. Scuola: {scuola}.", { ruolo: row.ruoloApp ? ruoloVisibile(row.ruoloApp, t) : "—", scuola: row.scuola || t("nessuna") })}</p>
      {row.ruoloApp === "piattaforma" ? (
        <p className="mt-3 text-sm text-mist">{t("Gestore esente. Nessuna scadenza, nessun piano.")}</p>
      ) : row.senzaProfilo ? null : (
        <>
          <div className="mt-3 grid gap-2">
            <select
              value={ruolo}
              onChange={(event) => {
                const next = event.target.value;
                setRuolo(next);
                if (next === "staff") setPiano("");
              }}
              className="min-h-11 rounded-xl border border-line bg-abyss px-3"
            >
              <option value="">{t("Scegli")}</option>
              <option value="sub">{t("sub")}</option>
              <option value="staff">{t("staff")}</option>
              <option value="titolare">{t("titolare")}</option>
            </select>
            {ruolo === "sub" ? (
              <select value={piano} onChange={(event) => setPiano(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3">
                <option value="trial">{t("trial")}</option>
                <option value="free">{t("free")}</option>
                <option value="pro">{t("pro")}</option>
              </select>
            ) : null}
            {ruolo === "sub" ? (
              <input type="date" value={provaFino} onChange={(event) => setProvaFino(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3" />
            ) : null}
            {ruolo === "staff" || ruolo === "titolare" ? (
              <select value={scuolaId} onChange={(event) => setScuolaId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3">
                <option value="">{t("Scuola")}</option>
                {diving.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy || !ruolo}
            className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
            onClick={() =>
              onSave({
                id: row.id,
                ruolo,
                piano: ruolo === "sub" ? piano : "",
                provaFino: ruolo === "staff" ? "" : provaFino,
                scuolaId: Number(scuolaId) || 0,
              })
            }
          >
            {busy ? t("Salvo…") : t("Salva account")}
          </button>
        </>
      )}
    </li>
  );
}
