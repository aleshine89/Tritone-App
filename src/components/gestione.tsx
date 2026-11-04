import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useFondale } from "@/components/app-frame";
import { AccountGestore } from "@/components/account-gestore";
import { ClubLogo } from "@/components/club-logo";
import { inviaCodiceAffiliazione, listAffiliazioni, listChiusure, listRichiesteMezzo, listScuole, openOwnDiving, scaricaCopiaGestore, setScuolaStato, eliminaScuola, tieniScuola, confermaMezzoNautico, elencoAbbonamenti, confrontaModuliUtente, ripristinaModuliUtente, type Affiliazione, type ChiusuraScuola, type RichiestaMezzo, type ScuolaAffiliata, type AccountGestore as AccountRiga, type ModuloMancante } from "@/lib/fondale.functions";
import { formByKey } from "@/lib/forms";
import { formatDay } from "@/lib/format";
import { messaggioErrore, useT, type Traduci } from "@/lib/i18n";
import type { NotaAnagrafica } from "@/lib/anagrafica";

export function Gestione() {
  const t = useT();
  const frame = useFondale();
  const [rows, setRows] = useState<ScuolaAffiliata[] | null>(null);
  const [richieste, setRichieste] = useState<Affiliazione[] | null>(null);
  const [chiusure, setChiusure] = useState<ChiusuraScuola[] | null>(null);
  const [mezzi, setMezzi] = useState<RichiestaMezzo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [sede, setSede] = useState("");
  const [opening, setOpening] = useState(false);
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [copiaNota, setCopiaNota] = useState<string | null>(null);
  const [schermo, setSchermo] = useState<"scuole" | "account">("scuole");

  async function load() {
    const [scuole, domande, chiusureAperte, richiesteMezzo] = await Promise.all([listScuole(), listAffiliazioni(), listChiusure(), listRichiesteMezzo()]);
    setRows(scuole);
    setRichieste(domande);
    setChiusure(chiusureAperte);
    setMezzi(richiesteMezzo);
  }

  useEffect(() => {
    let live = true;
    Promise.all([listScuole(), listAffiliazioni(), listChiusure(), listRichiesteMezzo()])
      .then(([items, domande, chiusureAperte, richiesteMezzo]) => {
        if (!live) return;
        setRows(items);
        setRichieste(domande);
        setChiusure(chiusureAperte);
        setMezzi(richiesteMezzo);
      })
      .catch((reason: unknown) => {
        if (live) setError(messaggioErrore(reason, "Non riesco a leggere le scuole."));
      });
    return () => {
      live = false;
    };
  }, []);

  const attive = (rows ?? []).filter((row) => row.stato === "attiva").length;
  const mine = frame.club.id;
  const ago = q.trim().toLowerCase();
  const visibili = (rows ?? []).filter((row) => {
    if (!ago) return true;
    return `${row.nome} ${row.sede} ${row.email}`.toLowerCase().includes(ago);
  });

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs text-mist">{t("Gestore")}</p>
      <h1 className="mt-2 text-3xl leading-none">{t("Scuole affiliate")}</h1>
      <p className="mt-2 text-sm text-mist">
        {rows ? t("{attive} attive su {totale}", { attive, totale: rows.length }) : t("Carico le scuole…")}. {t("Vedi le scuole, non i loro moduli. Ogni diving ha un titolare.")}
      </p>
      <button
        type="button"
        disabled={copiando}
        className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
        onClick={() => {
          setCopiando(true);
          setCopiaNota(null);
          setError(null);
          void scaricaCopiaGestore()
            .then((data) => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "tritone-copia.json";
              link.click();
              URL.revokeObjectURL(url);
              const { account, moduli, moduliInviati } = data.conteggi;
              setCopiaNota(t("{account} account, {moduli} moduli ({inviati} inviati). Senza password.", { account, moduli, inviati: moduliInviati }));
            })
            .catch((reason: unknown) => setError(messaggioErrore(reason, "Copia non scaricata.")))
            .finally(() => setCopiando(false));
        }}
      >
        {copiando ? t("Preparo la copia…") : t("Scarica copia")}
      </button>
      <RipristinoModuli />
      {copiaNota ? <p className="mt-2 text-sm text-mist">{copiaNota}</p> : null}
      {error ? <p className="mt-4 text-sm text-brass">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" className={`min-h-11 rounded-full px-4 text-sm ${schermo === "scuole" ? "bg-lagoon font-medium" : "border border-line"}`} onClick={() => setSchermo("scuole")}>
          {t("Scuole")}
        </button>
        <button type="button" className={`min-h-11 rounded-full px-4 text-sm ${schermo === "account" ? "bg-lagoon font-medium" : "border border-line"}`} onClick={() => setSchermo("account")}>
          {t("Account")}
        </button>
        <Link to="/accettazioni" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
          {t("Accettazioni legali")}
        </Link>
      </div>
      {schermo === "account" ? (
        <div className="mt-6">
          <AccountGestore />
        </div>
      ) : null}
      {schermo === "scuole" ? (
      <>
      {(richieste ?? []).length > 0 ? (
        <section className="mt-6">
          <h2 className="text-2xl">{t("Richieste di affiliazione")}</h2>
          <ul className="mt-3 space-y-3">
            {(richieste ?? []).map((row) => (
              <li key={row.id} className="rounded-card border border-line bg-surface p-4">
                <p className="text-xs text-brass">{row.stato === "codice-inviato" ? t("Codice pronto") : t("Nuova richiesta")}</p>
                <p className="mt-1 text-xl">{row.divingNome}</p>
                <p className="mt-2 text-sm">
                  {row.cognome} {row.nome}
                </p>
                <p className="mt-1 text-sm text-mist">
                  {row.telefono} · {row.email}
                </p>
                <NotaRichiesta nota={row.anagraficaNota} />
                <p className="mt-2 text-sm text-mist">
                  {row.sede}
                  {row.codiceFiscale ? ` · ${row.codiceFiscale}` : ""}
                </p>
                {row.mezzoNautico != null ? <p className="mt-2 text-sm">{row.mezzoNautico ? t("Diving con mezzo nautico") : t("Scuola/Club senza mezzo nautico")}</p> : null}
                {row.codice ? <p className="mt-3 break-all text-2xl">{row.codice}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
                    onClick={() => {
                      setBusyId(row.id);
                      setError(null);
                      void inviaCodiceAffiliazione({ data: { id: row.id } })
                        .then((item) => {
                          setRichieste((current) => current?.map((entry) => (entry.id === item.id ? item : entry)) ?? [item]);
                        })
                        .catch((reason: unknown) => setError(messaggioErrore(reason, "Codice non creato.")))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    {busyId === row.id ? t("Preparo…") : row.codice ? t("Codice già pronto") : t("Invia codice")}
                  </button>
                  {row.codice ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-full border border-line px-4 text-sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(row.codice ?? "").then(() => {
                          setCopiedId(row.id);
                          window.setTimeout(() => setCopiedId(null), 1600);
                        });
                      }}
                    >
                      {copiedId === row.id ? t("Copiato") : t("Copia codice")}
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-mist">{t("Mandalo al richiedente. Lo inserisce nel profilo e diventa titolare. Dal {data}.", { data: formatDay(row.creato) })}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(mezzi ?? []).length > 0 ? (
        <section className="mt-6">
          <h2 className="text-2xl">{t("Passaggio a mezzo nautico")}</h2>
          <ul className="mt-3 space-y-3">
            {(mezzi ?? []).map((row) => (
              <li key={row.id} className="rounded-card border border-line bg-surface p-4">
                <p className="text-xl">{row.nome}</p>
                {row.sede ? <p className="mt-1 text-sm text-mist">{row.sede}</p> : null}
                <p className="mt-2 text-sm text-mist">{t("Scuola/Club senza mezzo nautico. Solo il gestore può sbloccare barche, guide e foglio barca.")}</p>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
                  onClick={() => {
                    setBusyId(row.id);
                    setError(null);
                    void confermaMezzoNautico({ data: { id: row.id } })
                      .then(() => load())
                      .catch((reason: unknown) => setError(messaggioErrore(reason, "Non sbloccato.")))
                      .finally(() => setBusyId(null));
                  }}
                >
                  {busyId === row.id ? t("Sblocco…") : t("Sblocca il mezzo nautico")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(chiusure ?? []).length > 0 ? (
        <section className="mt-6">
          <h2 className="text-2xl">{t("Richieste di chiusura")}</h2>
          <ul className="mt-3 space-y-3">
            {(chiusure ?? []).map((row) => (
              <li key={row.id} className="rounded-card border border-line bg-surface p-4">
                <p className="text-xs text-brass">{t("Il titolare vuole chiudere la scuola")}</p>
                <p className="mt-1 text-xl">{row.scuola}</p>
                <p className="mt-2 text-sm">
                  {row.cognome} {row.nome}
                </p>
                <p className="mt-1 text-sm text-mist">
                  {[row.telefono, row.email].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.clubId}
                    className="min-h-11 rounded-full border border-danger px-4 text-sm text-danger disabled:opacity-60"
                    onClick={() => {
                      if (!window.confirm(t("Eliminare {scuola}? Si cancella solo il diving. {nome} resta subacqueo.", { scuola: row.scuola, nome: `${row.nome} ${row.cognome}` }))) return;
                      setBusyId(row.clubId);
                      setError(null);
                      void eliminaScuola({ data: { id: row.clubId } })
                        .then(async () => {
                          if (row.clubId === mine) {
                            frame.setVista("gestione");
                            await frame.refresh();
                          }
                          await load();
                        })
                        .catch((reason: unknown) => setError(messaggioErrore(reason, "Non eliminata.")))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    {busyId === row.clubId ? t("Elimino…") : t("Elimina scuola")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.clubId}
                    className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
                    onClick={() => {
                      setBusyId(row.clubId);
                      setError(null);
                      void tieniScuola({ data: { id: row.clubId } })
                        .then(() => load())
                        .catch((reason: unknown) => setError(messaggioErrore(reason, "Non salvato.")))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    {t("Lascia il diving")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-mist">{t("Solo se non ha staff. Dal {data}.", { data: formatDay(row.creato) })}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine ? null : (
        <form
          className="mt-6 space-y-3 rounded-card border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setOpening(true);
            setError(null);
            void openOwnDiving({ data: { nome, sede } })
              .then(async () => {
                await frame.refresh();
                frame.setVista("club");
              })
              .catch((reason: unknown) => {
                setError(messaggioErrore(reason, "Non riesco ad aprire il diving."));
              })
              .finally(() => setOpening(false));
          }}
        >
          <h2 className="text-2xl">{t("Apri il tuo diving")}</h2>
          <p className="text-sm text-mist">{t("Resti gestore. In più hai una scuola tua, con i suoi moduli dei subacquei.")}</p>
          <label className="block text-sm">
            {t("Nome del diving")}
            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-abyss px-3"
              required
            />
          </label>
          <label className="block text-sm">
            {t("Sede")}
            <input
              value={sede}
              onChange={(event) => setSede(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-abyss px-3"
            />
          </label>
          <button type="submit" disabled={opening} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
            {opening ? t("Apro…") : t("Apri e entra")}
          </button>
        </form>
      )}

      <label className="mt-6 block text-sm">
        <span className="mb-1 block text-mist">{t("Cerca una scuola")}</span>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
        />
      </label>

      <ul className="mt-4 space-y-3">
        {visibili.map((row) => (
          <li key={row.id} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ClubLogo id={row.id} hasLogo={row.hasLogo} name={row.nome} className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain" />
                <div className="min-w-0">
                  <p className="text-xl">{row.nome}</p>
                  <p className="mt-1 text-sm text-mist">
                    {[row.sede, row.email, row.telefono].filter(Boolean).join(" · ") || t("Sede non indicata")}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 text-xs text-mist">
                <span className={`size-2.5 rounded-full ${row.stato === "attiva" ? "bg-lagoon" : "bg-brass"}`} aria-hidden="true" />
                {row.stato === "attiva" ? t("Attiva") : t("Sospesa")}
              </span>
            </div>
            <p className="mt-3 text-sm text-mist">
              {row.allievi === 1 ? t("{n} subacqueo", { n: row.allievi }) : t("{n} subacquei", { n: row.allievi })}
              {" · "}
              {t("{n} staff", { n: row.staff })}
              {" · "}
              {t("{n} schede inviate", { n: row.schede })}
              {row.creato ? ` · ${t("dal {data}", { data: formatDay(row.creato) })}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.id === mine ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
                  onClick={() => frame.setVista("club")}
                >
                  {t("Entra come diving")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busyId === row.id}
                className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
                onClick={() => {
                  setBusyId(row.id);
                  setError(null);
                  void setScuolaStato({ data: { id: row.id, stato: row.stato === "attiva" ? "sospesa" : "attiva" } })
                    .then(load)
                    .catch((reason: unknown) => {
                      setError(messaggioErrore(reason, "Non aggiornata."));
                    })
                    .finally(() => setBusyId(null));
                }}
              >
                {busyId === row.id ? t("Salvo…") : row.stato === "attiva" ? t("Sospendi") : t("Riattiva")}
              </button>
              {row.senzaTitolare && row.staff === 0 ? (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="min-h-11 rounded-full border border-danger px-4 text-sm text-danger disabled:opacity-60"
                  onClick={() => {
                    if (!window.confirm(t("Eliminare {scuola}? Si cancella solo il diving.", { scuola: row.nome }))) return;
                    setBusyId(row.id);
                    setError(null);
                    void eliminaScuola({ data: { id: row.id } })
                      .then(async () => {
                        if (row.id === mine) {
                          frame.setVista("gestione");
                          await frame.refresh();
                        }
                        await load();
                      })
                      .catch((reason: unknown) => setError(messaggioErrore(reason, "Non eliminata.")))
                      .finally(() => setBusyId(null));
                  }}
                >
                  {busyId === row.id ? t("Elimino…") : t("Elimina")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {rows && visibili.length === 0 ? (
        <p className="mt-6 text-sm text-mist">{rows.length === 0 ? t("Nessuna scuola ancora. Quando una scuola crea il suo account, compare qui.") : t("Nessuna scuola con questo nome.")}</p>
      ) : null}
      </>
      ) : null}
    </div>
  );
}

function valoreAnagrafica(voce: { chiave: string; valore: string }, t: Traduci): string {
  if (voce.chiave === "data_nascita") return formatDay(voce.valore);
  if (voce.chiave === "sesso" && voce.valore === "X") return t("Altro / non indicato");
  if (voce.chiave === "tipo_documento") return t(voce.valore);
  return voce.valore;
}

function RipristinoModuli() {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [account, setAccount] = useState<AccountRiga[] | null>(null);
  const [cerca, setCerca] = useState("");
  const [scelto, setScelto] = useState<AccountRiga | null>(null);
  const [file, setFile] = useState("");
  const [candidati, setCandidati] = useState<Record<string, unknown>[]>([]);
  const [mancanti, setMancanti] = useState<ModuloMancante[] | null>(null);
  const [scelti, setScelti] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  function apri() {
    setAperto((value) => !value);
    setErrore(null);
    if (account) return;
    void elencoAbbonamenti()
      .then((data) => setAccount(data.account))
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a leggere gli account.")));
  }

  function confronta(persona: AccountRiga, righe: Record<string, unknown>[], origineId: string) {
    setBusy(true);
    setErrore(null);
    setNota(null);
    setMancanti(null);
    void confrontaModuliUtente({ data: { userId: persona.id, origineId, moduli: righe } })
      .then((lista) => {
        setMancanti(lista);
        setScelti(lista.map((item) => item.chiave));
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Confronto non riuscito.")))
      .finally(() => setBusy(false));
  }

  function leggiFile(persona: AccountRiga, testo: string, nomeFile: string) {
    let copia: { account?: { id?: string; email?: string; nome?: string; cognome?: string }[]; moduli?: unknown } | null = null;
    try {
      copia = JSON.parse(testo) as { account?: { id?: string; email?: string; nome?: string; cognome?: string }[]; moduli?: unknown };
    } catch {
      copia = null;
    }
    if (!copia || !Array.isArray(copia.moduli)) {
      setErrore(t("Questo non è il file della copia."));
      setCandidati([]);
      setMancanti(null);
      return;
    }
    const origineId = origineExport(copia.account ?? [], persona);
    const righe = (copia.moduli as unknown[]).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (origineId && String(row.user_id ?? "") !== origineId) return [];
      return [row];
    });
    setFile(nomeFile);
    setCandidati(righe);
    setErrore(origineId ? null : t("Nel file non ci sono moduli di questo account."));
    if (!origineId) {
      setMancanti(null);
      return;
    }
    confronta(persona, righe, origineId);
  }

  function ripristina() {
    if (!scelto || !mancanti) return;
    const sceltiSet = new Set(scelti);
    const moduli = mancanti.flatMap((item) => {
      if (!sceltiSet.has(item.chiave)) return [];
      const row = candidati[Number(item.chiave)];
      return row ? [row] : [];
    });
    if (!moduli.length) {
      setErrore(t("Seleziona almeno un modulo."));
      return;
    }
    setBusy(true);
    setErrore(null);
    setNota(null);
    void ripristinaModuliUtente({ data: { userId: scelto.id, moduli } })
      .then((esito) => {
        setNota(esito.ripristinati === 1 ? t("Ripristinato 1 modulo.") : t("Ripristinati {n} moduli.", { n: esito.ripristinati }));
        setMancanti((lista) => (lista ?? []).filter((item) => !sceltiSet.has(item.chiave)));
        setScelti([]);
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Ripristino non riuscito.")))
      .finally(() => setBusy(false));
  }

  const filtro = cerca.trim().toLowerCase();
  const trovati = (account ?? []).filter((row) => {
    if (!filtro) return false;
    return `${row.nome} ${row.cognome} ${row.email}`.toLowerCase().includes(filtro) || `${row.cognome} ${row.nome}`.toLowerCase().includes(filtro);
  }).slice(0, 8);
  const tutti = mancanti != null && mancanti.length > 0 && scelti.length === mancanti.length;

  return (
    <section className="mt-3">
      <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={apri}>
        {t("Ripristina moduli utente")}
      </button>
      {aperto ? (
        <div className="mt-3 rounded-2xl border border-line bg-deep px-4 py-4">
          <label className="block text-sm">
            {t("Cerca per nome, cognome o email")}
            <input value={cerca} onChange={(event) => setCerca(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-deep px-3" />
          </label>
          {filtro && account && trovati.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessun account trovato.")}</p> : null}
          {trovati.length > 0 ? (
            <ul className="mt-2">
              {trovati.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`flex min-h-11 w-full items-center text-left text-sm ${scelto?.id === row.id ? "font-medium text-foam" : ""}`}
                    onClick={() => {
                      setScelto(row);
                      setFile("");
                      setCandidati([]);
                      setMancanti(null);
                      setScelti([]);
                      setNota(null);
                      setErrore(null);
                    }}
                  >
                    {row.cognome} {row.nome} <span className="ml-2 text-mist">{row.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {scelto ? <p className="mt-3 text-sm font-medium">{scelto.cognome} {scelto.nome}</p> : null}
          {scelto ? (
            <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-tide px-4 text-sm font-medium text-white">
              {t("Carica il file JSON della copia")}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const sceltoFile = event.target.files?.[0];
                  event.target.value = "";
                  if (!sceltoFile || !scelto) return;
                  void sceltoFile.text().then((testo) => leggiFile(scelto, testo, sceltoFile.name));
                }}
              />
            </label>
          ) : null}
          {file ? <p className="mt-2 text-xs text-mist">{file}</p> : null}
          {busy ? <p className="mt-3 text-sm text-mist">{mancanti ? t("Ripristino…") : t("Confronto…")}</p> : null}
          {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
          {nota ? <p className="mt-3 text-sm text-foam">{nota}</p> : null}
          {mancanti && mancanti.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessun modulo mancante.")}</p> : null}
          {mancanti && mancanti.length > 0 ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">{t("Moduli mancanti")}</h2>
                <button
                  type="button"
                  className="text-sm text-lagoon"
                  onClick={() => setScelti(tutti ? [] : mancanti.map((item) => item.chiave))}
                >
                  {t("Seleziona tutti")}
                </button>
              </div>
              <ul className="mt-2">
                {mancanti.map((item) => (
                  <li key={item.chiave} className="border-b border-line/70 py-2">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={scelti.includes(item.chiave)}
                        onChange={() => setScelti((lista) => (lista.includes(item.chiave) ? lista.filter((chiave) => chiave !== item.chiave) : [...lista, item.chiave]))}
                      />
                      <span>
                        <span className="block font-medium">{t(formByKey(item.formKey)?.title ?? item.formKey)}</span>
                        <span className="mt-0.5 block text-xs text-mist">
                          {[item.data ? formatDay(item.data) : "", item.autore, item.soggetto].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white disabled:opacity-60" onClick={ripristina}>
                {t("Ripristina selezionati")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function origineExport(account: { id?: string; email?: string; nome?: string; cognome?: string }[], persona: AccountRiga): string {
  if (account.some((row) => row.id === persona.id)) return persona.id;
  const email = persona.email.trim().toLowerCase();
  const perMail = email ? account.filter((row) => (row.email ?? "").trim().toLowerCase() === email) : [];
  if (perMail.length === 1 && perMail[0]?.id) return perMail[0].id;
  const nome = `${persona.cognome} ${persona.nome}`.trim().toLowerCase();
  const perNome = nome ? account.filter((row) => `${row.cognome ?? ""} ${row.nome ?? ""}`.trim().toLowerCase() === nome) : [];
  if (perNome.length === 1 && perNome[0]?.id) return perNome[0].id;
  return "";
}

export function NotaRichiesta({ nota }: { nota: NotaAnagrafica | null }) {
  const t = useT();
  if (!nota) return null;
  if (nota.completa) {
    return (
      <div className="mt-3 text-sm">
        <p className="text-xs text-brass">{t("Anagrafica completa")}</p>
        <ul className="mt-1 space-y-1">
          {nota.dati.map((voce) => (
            <li key={voce.chiave}>
              <span className="text-mist">{t(voce.etichetta)}: </span>
              {valoreAnagrafica(voce, t)}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p className="mt-3 text-sm">
      <span className="text-brass">{t("Anagrafica incompleta")}</span>
      {nota.mancanti.length ? (
        <span className="text-mist"> · {t("Manca: {campo}", { campo: nota.mancanti.map((campo) => t(campo)).join(", ") })}</span>
      ) : null}
    </p>
  );
}