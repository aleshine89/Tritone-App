import { useEffect, useRef, useState } from "react";
import {
  accettaViaggio,
  aggiungiPersonaViaggio,
  assegnaGuidaOspite,
  chiudiGruppoViaggio,
  creaGruppoViaggio,
  creaListaAperta,
  creaViaggio,
  elencoDivingViaggio,
  eliminaViaggio,
  inviaViaggio,
  leggiModuloViaggio,
  leggiViaggio,
  mettiNelGruppo,
  pdfLibrettiMano,
  pdfModuliVuoti,
  proponiScansioneViaggio,
  salvaModuloViaggio,
  togliPersonaViaggio,
  type GruppoViaggio,
  type PersonaViaggio,
  type ViaggioBreve,
  type ViaggioPagina,
} from "@/lib/viaggi.functions";
import { formatDay } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";
import { prepareFile } from "@/lib/prepare-file";
import { SchedaEditor } from "@/components/scheda-editor";

const MODULI = [
  ["registro-immersione", "Scheda subacqueo"],
  ["brevetto-esperienza", "Brevetto ed esperienza"],
  ["questionario-medico", "Questionario medico"],
  ["informativa-consenso", "Informativa e consenso"],
] as const;

const DOMANDE = [
  "Problemi a polmoni, respiro, cuore o sangue.",
  "Ho più di 45 anni.",
  "Fatico nell'esercizio moderato.",
  "Problemi a occhi, orecchie o seni.",
  "Operazione negli ultimi 12 mesi.",
  "Perdita di conoscenza, emicrania, epilessia o neurologia.",
  "Terapia psicologica, panico o dipendenza.",
  "Schiena, ernia, ulcera o diabete.",
  "Stomaco, intestino o diarrea recente.",
  "Medicinali su prescrizione.",
];

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon";

export function giorniViaggio(dal: string, al: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${dal}T12:00:00Z`);
  const fine = new Date(`${al}T12:00:00Z`);
  while (cursor <= fine && out.length < 31) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function viaggiVisibili(viaggi: ViaggioBreve[]): ViaggioBreve[] {
  return viaggi.filter((item) => item.mio !== "ospito");
}

export function ViaggiDelGiorno({
  viaggi,
  giorno,
  onApri,
}: {
  viaggi: ViaggioBreve[];
  giorno: string;
  onApri: (id: number) => void;
}) {
  const t = useT();
  const qui = viaggiVisibili(viaggi).filter((item) => item.dal <= giorno && item.al >= giorno);
  if (!qui.length) return null;
  return (
    <ul className="mt-3 grid gap-2">
      {qui.map((item) => (
        <li key={item.id}>
          <button type="button" className="min-h-11 w-full rounded-2xl border border-brass bg-deep px-4 py-3 text-left" onClick={() => onApri(item.id)}>
            <p className="text-xs uppercase tracking-wide text-brass">{t("Viaggio")}</p>
            <p className="mt-1 text-sm font-medium">{item.titolo}</p>
            <p className="mt-1 text-xs text-mist">{formatDay(item.dal)} – {formatDay(item.al)} · {item.ospite}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NuovoViaggio({ onCreato, onAnnulla }: { onCreato: (id: number) => void; onAnnulla: () => void }) {
  const t = useT();
  const [titolo, setTitolo] = useState("");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [clubId, setClubId] = useState("");
  const [nome, setNome] = useState("");
  const [diving, setDiving] = useState<{ id: number; nome: string }[]>([]);
  const [elencoPronto, setElencoPronto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    elencoDivingViaggio()
      .then((rows) => {
        if (live) setDiving(rows);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere i diving su Tritone."));
      })
      .finally(() => {
        if (live) setElencoPronto(true);
      });
    return () => {
      live = false;
    };
  }, []);

  async function crea() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      const creato = await creaViaggio({
        data: { titolo, dal, al: al || dal, ospiteClubId: clubId ? Number(clubId) : null, ospiteNome: clubId ? "" : nome },
      });
      onCreato(creato.id);
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a salvare il viaggio."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-brass bg-deep px-4 py-4">
      <p className="text-sm font-medium">{t("Nuovo viaggio")}</p>
      <p className="mt-1 text-xs text-mist">{t("Il diving che ospita non lo vede come attività sua. Se è su Tritone, lo trova nel Registro.")}</p>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Nome del viaggio")}</span>
        <input value={titolo} onChange={(event) => setTitolo(event.target.value)} className={inputClass} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Dal")}</span>
          <input type="date" value={dal} onChange={(event) => setDal(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Al")}</span>
          <input type="date" value={al} onChange={(event) => setAl(event.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Diving su Tritone")}</span>
        <select value={clubId} onChange={(event) => setClubId(event.target.value)} className={inputClass}>
          <option value="">{t("Non è su Tritone")}</option>
          {diving.map((item) => (
            <option key={item.id} value={item.id}>{item.nome}</option>
          ))}
        </select>
        {elencoPronto && diving.length === 0 ? <p className="mt-1 text-xs text-mist">{t("Nessun altro diving risulta su Tritone.")}</p> : null}
      </label>
      {clubId ? null : (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-mist">{t("Nome del diving che ospita")}</span>
          <input value={nome} onChange={(event) => setNome(event.target.value)} className={inputClass} />
        </label>
      )}
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !titolo.trim() || !dal} className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void crea()}>
          {busy ? t("Salvo…") : t("Apri il viaggio")}
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onAnnulla}>{t("Annulla")}</button>
      </div>
    </div>
  );
}

export function SchedaViaggio({ id, soloInvio = false, onChiudi }: { id: number; soloInvio?: boolean; onChiudi: () => void }) {
  const t = useT();
  const [pagina, setPagina] = useState<ViaggioPagina | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socio, setSocio] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [giorno, setGiorno] = useState("");
  const [guida, setGuida] = useState("");
  const [modulo, setModulo] = useState<{ persona: PersonaViaggio; chiave: string } | null>(null);
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [personaScelta, setPersonaScelta] = useState<number | null>(null);
  const [come, setCome] = useState<"socio" | "app" | "mano" | null>(null);

  function carica() {
    return leggiViaggio({ data: { id } }).then(setPagina);
  }

  useEffect(() => {
    let live = true;
    leggiViaggio({ data: { id } })
      .then((value) => {
        if (live) setPagina(value);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere il viaggio."));
      });
    return () => {
      live = false;
    };
  }, [id]);

  async function azione(lavoro: () => Promise<unknown>, testoErrore: string) {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await lavoro();
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, testoErrore));
    } finally {
      setBusy(false);
    }
  }

  async function invia() {
    if (busy || !pagina) return;
    setBusy(true);
    setErrore(null);
    try {
      const esito = await inviaViaggio({ data: { id: pagina.id } });
      scaricaPdf(esito.pdf, `fascicolo-${pagina.titolo}.pdf`);
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a inviare il viaggio."));
    } finally {
      setBusy(false);
    }
  }

  async function moduliVuoti() {
    setErrore(null);
    try {
      const esito = await pdfModuliVuoti({ data: { viaggioId: pagina?.id ?? 0 } });
      const files = esito.documenti.map((doc) => filePdf(doc.pdf, doc.nome));
      if (navigator.share && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: t("Moduli del viaggio") });
        return;
      }
      for (const file of files) scaricaFile(file);
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setErrore(messaggioErrore(reason, "Non riesco a preparare i moduli."));
    }
  }

  if (!pagina) {
    return (
      <div className="mt-4">
        <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>{soloInvio ? t("Home") : t("Torna alle attività")}</button>
        <p className="mt-3 text-sm text-mist">{errore ?? t("Carico…")}</p>
      </div>
    );
  }

  const giorni = giorniViaggio(pagina.dal, pagina.al);
  const personeVisibili = soloInvio
    ? pagina.persone.filter((persona) => persona.id === pagina.miaPersonaId)
    : pagina.sonoScuola || pagina.sonoOspite
      ? pagina.persone
      : pagina.persone.filter((persona) => persona.id === pagina.miaPersonaId);
  const pronti = pagina.persone.filter((persona) => persona.moduli.every((moduloVoce) => moduloVoce.fatto)).length;
  const mia = personeVisibili[0] ?? null;

  const soloModuli = soloInvio || (!pagina.sonoScuola && !pagina.sonoOspite && !pagina.sonoGuida);
  if (soloModuli) {
    return (
      <div className="mt-2">
        {mia ? (
          <PercorsoModuli pagina={pagina} persona={mia} errore={errore} etichettaChiudi={soloInvio ? t("Home") : t("Torna alle attività")} onChiudi={onChiudi} onSalvato={() => void carica()} />
        ) : (
          <>
            <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>{soloInvio ? t("Home") : t("Torna alle attività")}</button>
            <p className="mt-4 text-sm text-mist">{errore ?? t("Non sei in questo viaggio.")}</p>
          </>
        )}
      </div>
    );
  }

  const passi = [
    pagina.sonoScuola || pagina.sonoOspite ? { id: 1 as const, etichetta: "Persone" } : null,
    pagina.sonoScuola || pagina.sonoOspite ? { id: 2 as const, etichetta: "Moduli" } : null,
    { id: 3 as const, etichetta: "In acqua" },
    pagina.sonoScuola ? { id: 4 as const, etichetta: "Invio" } : null,
  ].filter((item): item is { id: 1 | 2 | 3 | 4; etichetta: string } => item !== null);
  const passoAttivo = passi.some((item) => item.id === passo) ? passo : passi[0].id;
  const personaAperta = personeVisibili.find((persona) => persona.id === personaScelta) ?? null;
  const tuttoPronto = pagina.persone.length > 0 && pronti === pagina.persone.length && pagina.gruppi.length > 0;

  return (
    <div className="mt-4">
      <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>{t("Torna alle attività")}</button>
      <div className="mt-2 rounded-3xl border border-brass bg-deep px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-brass">{t("Viaggio")}</p>
        <h2 className="mt-1 text-2xl leading-none">{pagina.titolo}</h2>
        <StrisciaGiorni dal={pagina.dal} al={pagina.al} />
        <p className="mt-3 text-sm">{pagina.ospiteNome}{pagina.clubNome ? ` · ${pagina.clubNome}` : ""}</p>
        <p className="mt-1 text-xs text-mist">{etichettaStato(pagina.stato, Boolean(pagina.ospiteClubId), t)}</p>
        <BarraPronti pronti={pronti} totale={pagina.persone.length} />
        {pagina.sonoScuola && pagina.stato !== "accettato" ? (
          <button
            type="button"
            disabled={busy}
            className="mt-4 min-h-11 text-sm text-brass"
            onClick={() => {
              if (busy) return;
              if (!window.confirm(t("Eliminare questo viaggio? Le persone e i moduli spariscono. Se era già inviato, sparisce anche dal diving."))) return;
              setBusy(true);
              setErrore(null);
              void eliminaViaggio({ data: { id: pagina.id } })
                .then(() => onChiudi())
                .catch((reason: unknown) => {
                  setErrore(messaggioErrore(reason, "Non riesco a eliminare il viaggio."));
                  setBusy(false);
                });
            }}
          >
            {t("Elimina il viaggio")}
          </button>
        ) : null}
      </div>
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {pagina.sonoOspite && pagina.stato === "inviato" ? (
        <div className="mt-3 rounded-3xl border border-brass bg-deep px-4 py-4">
          <p className="text-sm">{t("Non è ancora un'uscita. Accetta per crearla.")}</p>
          <button type="button" disabled={busy} className="mt-3 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void azione(() => accettaViaggio({ data: { id: pagina.id } }), "Non riesco ad accettare.")}>
            {t("Accetta e crea le uscite")}
          </button>
        </div>
      ) : null}
      <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist">
        {passi.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={passoAttivo === item.id} className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${passoAttivo === item.id ? "bg-brass font-medium text-ink" : "border border-line"}`} onClick={() => { setPasso(item.id); setModulo(null); }}>
            {t(item.etichetta)}
          </button>
        ))}
      </div>

      {passoAttivo === 1 ? (
        <section className="mt-4">
          {pagina.sonoScuola && pagina.stato !== "bozza" ? <p className="text-sm text-mist">{t("Puoi ancora aggiungere o togliere una persona. I quattro moduli servono lo stesso. Il giorno di immersione, se c'è già, non si cancella.")}</p> : null}
          {pagina.sonoScuola ? (
            <>
              <div className="mt-3 flex gap-2">
                {([["socio", "Socio"], ["app", "Ha l'app"], ["mano", "Senza app"]] as const).map(([id, etichetta]) => (
                  <button key={id} type="button" className={`min-h-11 flex-1 rounded-full px-2 text-sm ${come === id ? "bg-brass font-medium text-ink" : "border border-line"}`} onClick={() => setCome((value) => (value === id ? null : id))}>
                    {t(etichetta)}
                  </button>
                ))}
              </div>
              {come === "socio" ? (
                <div className="mt-3 rounded-2xl border border-line px-4 py-3">
                  <select value={socio} onChange={(event) => setSocio(event.target.value)} className={inputClass}>
                    <option value="">{t("Scegli")}</option>
                    {pagina.soci.map((item) => <option key={item.userId} value={item.userId}>{item.cognome} {item.nome}</option>)}
                  </select>
                  <button type="button" disabled={busy || !socio} className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void azione(async () => { await aggiungiPersonaViaggio({ data: { viaggioId: pagina.id, userId: socio, nome: "", cognome: "", email: "" } }); setSocio(""); setCome(null); }, "Non riesco ad aggiungere la persona.")}>{t("Aggiungi il socio")}</button>
                </div>
              ) : null}
              {come === "app" ? (
                <div className="mt-3 rounded-2xl border border-line px-4 py-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-mist">{t("Email, se ha l'app ma non è socio")}</span>
                    <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} inputMode="email" />
                  </label>
                  <button type="button" disabled={busy || !email.trim()} className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void azione(async () => { await aggiungiPersonaViaggio({ data: { viaggioId: pagina.id, userId: "", nome, cognome, email } }); setEmail(""); setCome(null); }, "Non riesco a invitare.")}>{t("Invita")}</button>
                </div>
              ) : null}
              {come === "mano" ? (
                <div className="mt-3 rounded-2xl border border-line px-4 py-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={cognome} onChange={(event) => setCognome(event.target.value)} placeholder={t("Cognome")} className={inputClass} />
                    <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder={t("Nome")} className={inputClass} />
                  </div>
                  <button type="button" disabled={busy || !cognome.trim() || !nome.trim()} className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void azione(async () => { await aggiungiPersonaViaggio({ data: { viaggioId: pagina.id, userId: "", nome, cognome, email: "" } }); setNome(""); setCognome(""); setCome(null); }, "Non riesco ad aggiungere la persona.")}>{t("Aggiungi a mano")}</button>
                  <button type="button" className="mt-3 block min-h-11 text-sm text-lagoon" onClick={() => void moduliVuoti()}>{t("Moduli vuoti da mandare")}</button>
                  <p className="mt-1 text-xs text-mist">{t("Quattro PDF separati: scheda, brevetto, questionario medico e consenso. Ognuno è il documento intero, da compilare e firmare.")}</p>
                </div>
              ) : null}
            </>
          ) : null}
          <ul className="mt-3 grid gap-2">
            {personeVisibili.map((persona) => (
              <li key={persona.id}>
                <RigaPersona
                  persona={persona}
                  busy={busy}
                  onApri={() => { setPersonaScelta(persona.id); setPasso(2); setModulo(null); }}
                  onTogli={pagina.sonoScuola ? () => void azione(() => togliPersonaViaggio({ data: { id: persona.id } }), "Non riesco a togliere la persona.") : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {passoAttivo === 2 ? (
        <section className="mt-4">
          {personaAperta ? (
            <>
              <button type="button" className="min-h-11 text-sm text-lagoon" onClick={() => { setPersonaScelta(null); setModulo(null); }}>{t("Tutte le persone")}</button>
              <p className="mt-2 text-lg">{`${personaAperta.cognome} ${personaAperta.nome}`.trim() || personaAperta.email || t("Senza nome")}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {personaAperta.moduli.map((voce) => (
                  <li key={voce.chiave}>
                    <button type="button" className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-left ${modulo?.chiave === voce.chiave && modulo.persona.id === personaAperta.id ? "border-brass bg-deep" : "border-line bg-deep"}`} onClick={() => setModulo({ persona: personaAperta, chiave: voce.chiave })}>
                      <span className={`text-xs uppercase tracking-wide ${voce.fatto ? "text-lagoon" : "text-brass"}`}>{voce.fatto ? t("Pronto") : t("Da compilare")}</span>
                      <span className="mt-1 block text-sm font-medium">{t(titoloModulo(voce.chiave))}</span>
                      {voce.origine === "scansione" ? <span className="mt-1 block text-xs text-mist">{t("Da scansione, controllato dal club")}</span> : null}
                      {voce.origine === "club" ? <span className="mt-1 block text-xs text-mist">{t("Compilato dal club")}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm text-mist">{t("Scegli la persona")}</p>
              <ul className="mt-3 grid gap-2">
                {personeVisibili.map((persona) => (
                  <li key={persona.id}>
                    <RigaPersona persona={persona} busy={busy} onApri={() => setPersonaScelta(persona.id)} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {modulo ? (
            <ModuloViaggio
              persona={modulo.persona}
              chiave={modulo.chiave}
              clubNome={pagina.clubNome}
              dal={pagina.dal}
              al={pagina.al}
              modificabile={(pagina.stato === "bozza" || !modulo.persona.moduli.find((voce) => voce.chiave === modulo.chiave)?.fatto) && (modulo.persona.id === pagina.miaPersonaId || (pagina.sonoScuola && !modulo.persona.userId))}
              mio={modulo.persona.id === pagina.miaPersonaId}
              onChiudi={() => setModulo(null)}
              onSalvato={() => { setModulo(null); void carica(); }}
            />
          ) : null}
        </section>
      ) : null}

      {passoAttivo === 3 ? (
        <section className="mt-4">
          <p className="text-sm text-mist">{t("La tua guida: sei posti. Il settimo va nella lista aperta, e la guida la sceglie il diving che ospita.")}</p>
          {pagina.sonoScuola ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={giorno} onChange={(event) => setGiorno(event.target.value)} className={inputClass}>
                <option value="">{t("Giorno")}</option>
                {giorni.map((data) => <option key={data} value={data}>{formatDay(data)}</option>)}
              </select>
              <select value={guida} onChange={(event) => setGuida(event.target.value)} className={inputClass}>
                <option value="">{t("Guida")}</option>
                {pagina.guide.map((item) => (
                  <option key={item.userId} value={item.userId} disabled={!item.idonea}>{item.cognome} {item.nome}{item.idonea ? "" : ` — ${item.motivo}`}</option>
                ))}
              </select>
              <button type="button" disabled={busy || !giorno || !guida} className="min-h-11 rounded-full border border-brass px-4 text-sm text-brass disabled:opacity-60 sm:col-span-2" onClick={() => void azione(async () => { await creaGruppoViaggio({ data: { viaggioId: pagina.id, giorno, guidaUserId: guida } }); }, "Non riesco a creare il gruppo.")}>{t("Crea il gruppo")}</button>
              <button type="button" disabled={busy || !giorno} className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60 sm:col-span-2" onClick={() => void azione(async () => { await creaListaAperta({ data: { viaggioId: pagina.id, giorno } }); }, "Non riesco ad aprire la lista.")}>{t("Chiedi una guida al diving")}</button>
            </div>
          ) : null}
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {giorni.map((data) => {
              const delGiorno = pagina.gruppi.filter((gruppo) => gruppo.giorno === data);
              return (
                <section key={data} className="w-[min(100%,18rem)] shrink-0">
                  <h3 className="text-sm text-brass">{formatDay(data)}</h3>
                  {delGiorno.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessun gruppo")}</p> : (
                    <ul className="mt-2 grid gap-2">
                      {delGiorno.map((gruppo) => <Gruppo key={gruppo.id} gruppo={gruppo} pagina={pagina} busy={busy} onAzione={azione} />)}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {passoAttivo === 4 ? (
        <section className="mt-4 rounded-3xl border border-brass bg-deep px-4 py-5">
          {pagina.possoGestire && tuttoPronto ? (
            <>
              <p className="text-sm">{t("{n} persone pronte su {totale}.", { n: pronti, totale: pagina.persone.length })}</p>
              <button type="button" disabled={busy} className="mt-4 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void invia()}>
                {pagina.ospiteClubId ? t("Invia al diving") : t("Prepara fascicolo")}
              </button>
              {pagina.ospiteClubId ? null : <p className="mt-2 text-xs text-mist">{t("Il diving non è su Tritone. Il PDF si scarica, e le foto dei brevetti restano su ogni persona.")}</p>}
            </>
          ) : null}
          {pagina.possoGestire && !tuttoPronto ? (
            <>
              <p className="text-sm text-mist">{pagina.persone.length === 0 || pronti < pagina.persone.length ? t("Mancano {n} persone", { n: Math.max(0, pagina.persone.length - pronti) }) : t("Metti le persone in acqua.")}</p>
              <button type="button" className="mt-4 min-h-11 rounded-full border border-brass px-4 text-sm text-brass" onClick={() => setPasso(pagina.persone.length === 0 || pronti < pagina.persone.length ? 1 : 3)}>
                {pagina.persone.length === 0 || pronti < pagina.persone.length ? t("Persone") : t("In acqua")}
              </button>
            </>
          ) : null}
          {!pagina.possoGestire ? (
            <>
              <p className="text-lg">{etichettaStato(pagina.stato, Boolean(pagina.ospiteClubId), t)}</p>
              <p className="mt-2 text-sm text-mist">{t("Il fascicolo è partito.")}</p>
              {pagina.sonoScuola && !pagina.ospiteClubId ? (
                <>
                  <button type="button" disabled={busy} className="mt-4 min-h-11 rounded-full border border-brass px-4 text-sm text-brass disabled:opacity-60" onClick={() => void invia()}>{t("Prepara fascicolo")}</button>
                  <p className="mt-2 text-xs text-mist">{t("Scarica di nuovo il fascicolo, con le persone di adesso.")}</p>
                </>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PercorsoModuli({
  pagina,
  persona,
  errore,
  etichettaChiudi,
  onChiudi,
  onSalvato,
}: {
  pagina: ViaggioPagina;
  persona: PersonaViaggio;
  errore: string | null;
  etichettaChiudi: string;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const t = useT();
  const prima = persona.moduli.findIndex((voce) => !voce.fatto);
  const [indice, setIndice] = useState(prima >= 0 ? prima : 0);
  const [aperto, setAperto] = useState(false);
  const voce = persona.moduli[Math.min(indice, persona.moduli.length - 1)];
  const fatti = persona.moduli.filter((item) => item.fatto).length;
  const largo = Math.round((fatti / Math.max(1, persona.moduli.length)) * 100);
  if (!voce) return null;
  return (
    <div>
      <button type="button" className="min-h-11 text-sm text-lagoon" onClick={onChiudi}>{etichettaChiudi}</button>
      <p className="mt-2 text-xs uppercase tracking-wide text-brass">{t("Invia moduli viaggio")}</p>
      <h1 className="mt-1 text-3xl leading-none">{pagina.titolo}</h1>
      <p className="mt-2 text-sm text-mist">{formatDay(pagina.dal)} – {formatDay(pagina.al)}</p>
      <p className="mt-1 text-sm">{pagina.clubNome}</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-brass">{t("{n} di 4", { n: Math.min(indice, persona.moduli.length - 1) + 1 })}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-abyss">
        <div className="h-full rounded-full bg-brass" style={{ width: `${largo}%` }} />
      </div>
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {aperto ? (
        <ModuloViaggio
          persona={persona}
          chiave={voce.chiave}
          clubNome={pagina.clubNome}
          dal={pagina.dal}
          al={pagina.al}
          modificabile={pagina.stato === "bozza" || !voce.fatto}
          mio
          onChiudi={() => setAperto(false)}
          onSalvato={() => {
            setAperto(false);
            onSalvato();
            const prossimo = persona.moduli.findIndex((item, i) => i > indice && !item.fatto);
            if (prossimo >= 0) setIndice(prossimo);
          }}
        />
      ) : (
        <div className="mt-4 rounded-3xl border border-line bg-deep px-4 py-5">
          <p className={`text-xs uppercase tracking-wide ${voce.fatto ? "text-lagoon" : "text-brass"}`}>{voce.fatto ? t("Pronto") : t("Da compilare")}</p>
          <h2 className="mt-1 text-2xl leading-none">{t(titoloModulo(voce.chiave))}</h2>
          <button type="button" className="mt-4 min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => setAperto(true)}>
            {voce.fatto ? t("Rivedi") : t("Compila")}
          </button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={indice <= 0} className="min-h-11 flex-1 rounded-full border border-line text-sm disabled:opacity-40" onClick={() => { setAperto(false); setIndice((value) => Math.max(0, value - 1)); }}>{t("Indietro")}</button>
        <button type="button" disabled={indice >= persona.moduli.length - 1} className="min-h-11 flex-1 rounded-full border border-brass text-sm text-brass disabled:opacity-40" onClick={() => { setAperto(false); setIndice((value) => Math.min(persona.moduli.length - 1, value + 1)); }}>{t("Avanti")}</button>
      </div>
    </div>
  );
}

const MESI_CORTI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function StrisciaGiorni({ dal, al }: { dal: string; al: string }) {
  const t = useT();
  return (
    <div className="mt-3 flex gap-1 overflow-x-auto">
      {giorniViaggio(dal, al).map((giorno) => (
        <span key={giorno} className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-brass/50 bg-abyss px-1 py-2">
          <span className="text-[10px] uppercase text-brass">{t(MESI_CORTI[Number(giorno.slice(5, 7))] ?? "")}</span>
          <span className="text-lg leading-none">{Number(giorno.slice(8))}</span>
        </span>
      ))}
    </div>
  );
}

function BarraPronti({ pronti, totale }: { pronti: number; totale: number }) {
  const t = useT();
  const largo = totale ? Math.round((pronti / totale) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-abyss">
        <div className="h-full rounded-full bg-brass" style={{ width: `${largo}%` }} />
      </div>
      <p className="mt-1 text-xs text-mist">{t("{n} persone pronte su {totale}.", { n: pronti, totale })}</p>
    </div>
  );
}

function RigaPersona({ persona, busy, onApri, onTogli }: { persona: PersonaViaggio; busy: boolean; onApri: () => void; onTogli?: () => void }) {
  const t = useT();
  const nome = `${persona.cognome} ${persona.nome}`.trim() || persona.email || t("Senza nome");
  const lettere = ((persona.cognome || persona.nome || "?").slice(0, 1) + (persona.nome || "").slice(0, 1)).toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-deep px-3 py-2">
      <button type="button" onClick={onApri} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brass text-sm font-medium text-ink">{lettere}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{nome}</span>
        </span>
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {persona.moduli.map((voce) => (
            <span key={voce.chiave} className={`size-3 rounded-full ${voce.fatto ? "bg-lagoon" : "border border-brass"}`} />
          ))}
        </span>
      </button>
      {onTogli ? <button type="button" disabled={busy} className="min-h-11 shrink-0 px-2 text-sm text-brass" onClick={onTogli}>{t("Togli")}</button> : null}
    </div>
  );
}

function Gruppo({
  gruppo,
  pagina,
  busy,
  onAzione,
}: {
  gruppo: GruppoViaggio;
  pagina: ViaggioPagina;
  busy: boolean;
  onAzione: (lavoro: () => Promise<unknown>, testo: string) => Promise<void>;
}) {
  const t = useT();
  const [oraInizio, setOraInizio] = useState(gruppo.oraInizio);
  const [oraFine, setOraFine] = useState(gruppo.oraFine);
  const [prevista, setPrevista] = useState(gruppo.profonditaPrevista);
  const [profondita, setProfondita] = useState(gruppo.profondita);
  const [autorespiratore, setAutorespiratore] = useState(gruppo.autorespiratore || "ARA monobombola");
  const [miscela, setMiscela] = useState(gruppo.miscela || "Aria");
  const [firma, setFirma] = useState("");
  const [tratti, setTratti] = useState(0);
  const [guidaScelta, setGuidaScelta] = useState("");
  const mia = gruppo.guidaUserId === pagina.userId;
  const nomi = gruppo.persone.map((id) => pagina.persone.find((persona) => persona.id === id)).filter((persona): persona is PersonaViaggio => Boolean(persona));
  const senzaApp = nomi.some((persona) => !persona.userId);

  async function libretti() {
    const esito = await pdfLibrettiMano({ data: { gruppoId: gruppo.id } });
    scaricaPdf(esito.pdf, `libretti-${gruppo.giorno}.pdf`);
  }

  return (
    <li className="rounded-2xl border border-brass/70 bg-deep px-4 py-3">
      <p className="text-sm font-medium">{formatDay(gruppo.giorno)} · {gruppo.aperto ? t("Lista aperta") : gruppo.guidaNome}</p>
      {gruppo.aperto ? (
        <p className="mt-1 text-sm text-brass">{gruppo.persone.length === 1 ? t("1 persona, senza limite") : t("{n} persone, senza limite", { n: gruppo.persone.length })}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-brass">{t("{n} di 6", { n: gruppo.persone.length })}</p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`size-3.5 rounded-full ${i < gruppo.persone.length ? "bg-brass" : "border border-brass/40"}`} />
            ))}
          </div>
        </>
      )}
      {pagina.sonoScuola && !gruppo.firmato && !gruppo.chiuso ? (
        <ul className="mt-2">
          {pagina.persone.map((persona) => {
            const dentro = gruppo.persone.includes(persona.id);
            const pieno = !gruppo.aperto && !dentro && gruppo.persone.length >= 6;
            return (
              <li key={persona.id}>
                <button
                  type="button"
                  disabled={busy || pieno}
                  className="min-h-11 text-left text-sm disabled:opacity-50"
                  onClick={() => void onAzione(() => mettiNelGruppo({ data: { gruppoId: gruppo.id, personaId: persona.id, togli: dentro } }), "Non riesco a aggiornare il gruppo.")}
                >
                  {dentro ? "●" : "○"} {persona.cognome} {persona.nome}
                </button>
              </li>
            );
          })}
        </ul>
      ) : gruppo.aperto && pagina.sonoOspite && pagina.stato !== "bozza" ? null : (
        <ul className="mt-2">
          {nomi.map((persona) => <li key={persona.id} className="text-sm">{persona.cognome} {persona.nome}</li>)}
        </ul>
      )}
      {gruppo.aperto && pagina.sonoOspite && pagina.stato !== "bozza" ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-sm">{t("Assegna una tua guida. Quel gruppo ha sei posti.")}</p>
          <select value={guidaScelta} onChange={(event) => setGuidaScelta(event.target.value)} className={`${inputClass} mt-2`}>
            <option value="">{t("Guida")}</option>
            {pagina.guide.filter((item) => item.idonea).map((item) => (
              <option key={item.userId} value={item.userId}>{item.cognome} {item.nome}</option>
            ))}
          </select>
          <ul className="mt-2">
            {nomi.map((persona) => (
              <li key={persona.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{persona.cognome} {persona.nome}</span>
                <button
                  type="button"
                  disabled={busy || !guidaScelta}
                  className="min-h-11 shrink-0 text-sm text-brass disabled:opacity-50"
                  onClick={() => void onAzione(() => assegnaGuidaOspite({ data: { listaId: gruppo.id, personaId: persona.id, guidaUserId: guidaScelta } }), "Non riesco ad assegnare la guida.")}
                >
                  {t("Assegna")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {gruppo.firmato ? <p className="mt-2 text-sm text-lagoon">{t("Firmato dalla guida")}</p> : null}
      {mia && !gruppo.firmato && pagina.stato !== "bozza" ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-sm">{t("Firma una volta per tutto il gruppo. La stessa firma va nel libretto di ciascuno.")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block text-mist">{t("Ora di inizio")}</span><input type="time" value={oraInizio} onChange={(event) => setOraInizio(event.target.value)} className={inputClass} /></label>
            <label className="text-sm"><span className="mb-1 block text-mist">{t("Ora di fine")}</span><input type="time" value={oraFine} onChange={(event) => setOraFine(event.target.value)} className={inputClass} /></label>
            <label className="text-sm"><span className="mb-1 block text-mist">{t("Profondità prevista")}</span><input value={prevista} onChange={(event) => setPrevista(event.target.value)} className={inputClass} inputMode="decimal" /></label>
            <label className="text-sm"><span className="mb-1 block text-mist">{t("Profondità raggiunta")}</span><input value={profondita} onChange={(event) => setProfondita(event.target.value)} className={inputClass} inputMode="decimal" /></label>
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t("Autorespiratore")}</span>
              <select value={autorespiratore} onChange={(event) => setAutorespiratore(event.target.value)} className={inputClass}>
                {["ARA monobombola", "ARA bibombola", "Rebreather", "Snorkeling", "Apnea"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t("Miscela")}</span>
              <select value={miscela} onChange={(event) => setMiscela(event.target.value)} className={inputClass}>
                {["Aria", "Nitrox", "Trimix"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <TappetoFirma onChange={(data, n) => { setFirma(data); setTratti(n); }} />
          <button
            type="button"
            disabled={busy || tratti < 1 || !oraInizio || !oraFine}
            className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60"
            onClick={() => void onAzione(() => chiudiGruppoViaggio({ data: { gruppoId: gruppo.id, firma, oraInizio, oraFine, profondita, profonditaPrevista: prevista, autorespiratore, miscela } }), "Non riesco a firmare.")}
          >
            {t("Firma il gruppo")}
          </button>
        </div>
      ) : null}
      {gruppo.firmato && senzaApp && (pagina.sonoScuola || mia) ? (
        <button type="button" className="mt-3 min-h-11 text-sm text-lagoon" onClick={() => void libretti().catch(() => undefined)}>{t("PDF per chi non ha l'app")}</button>
      ) : null}
    </li>
  );
}

function ModuloViaggio({
  persona,
  chiave,
  clubNome,
  dal,
  al,
  modificabile,
  mio,
  onChiudi,
  onSalvato,
}: {
  persona: PersonaViaggio;
  chiave: string;
  clubNome: string;
  dal: string;
  al: string;
  modificabile: boolean;
  mio: boolean;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const t = useT();
  const [campi, setCampi] = useState<Record<string, string>>({});
  const [foto, setFoto] = useState("");
  const [origine, setOrigine] = useState(mio ? "utente" : "club");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const solaLettura = !modificabile;
  const conApp = Boolean(persona.userId);

  useEffect(() => {
    if (conApp) return;
    let live = true;
    leggiModuloViaggio({ data: { personaId: persona.id, chiave } })
      .then((value) => {
        if (!live) return;
        setCampi(value.campi);
        setFoto(value.foto);
        if (value.origine) setOrigine(value.origine);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere il modulo."));
      });
    return () => {
      live = false;
    };
  }, [persona.id, chiave, conApp]);

  if (conApp) {
    return (
      <div className="mt-4">
        <SchedaEditor
          key={`${persona.id}-${chiave}`}
          formKey={chiave}
          soloLettura={solaLettura}
          viaggio={{ personaId: persona.id, clubNome, dal, al, onInviato: onSalvato, onChiudi }}
        />
      </div>
    );
  }

  function set(campo: string, value: string) {
    setCampi((current) => ({ ...current, [campo]: value }));
  }

  async function scansiona(file: File) {
    setBusy(true);
    setErrore(null);
    try {
      const pronto = await prepareFile(file);
      const proposto = await proponiScansioneViaggio({ data: { personaId: persona.id, chiave, foto: pronto.data } });
      setCampi(proposto.campi);
      setFoto(pronto.data);
      setOrigine("scansione");
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non ho letto la foto."));
    } finally {
      setBusy(false);
    }
  }

  async function salva() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await salvaModuloViaggio({
        data: {
          personaId: persona.id,
          chiave,
          origine: origine === "scansione" ? "scansione" : mio ? "utente" : "club",
          campi,
          foto: origine === "scansione" ? foto : "",
        },
      });
      onSalvato();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a salvare il modulo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg">{t(titoloModulo(chiave))}</h3>
        <button type="button" className="min-h-11 text-sm text-mist" onClick={onChiudi}>{t("Chiudi")}</button>
      </div>
      <p className="mt-1 text-sm text-mist">{`${persona.cognome} ${persona.nome}`.trim()}</p>
      {origine === "scansione" ? <p className="mt-2 text-sm text-brass">{t("Da scansione, controllato dal club")}</p> : null}
      {origine === "club" ? <p className="mt-2 text-sm text-mist">{t("Compilato dal club")}</p> : null}
      {foto ? <img src={foto} alt={t("Da scansione, controllato dal club")} className="mt-3 max-h-64 rounded-xl" /> : null}
      {solaLettura ? <CampiLetti chiave={chiave} campi={campi} /> : <CampiModulo chiave={chiave} campi={campi} onChange={set} />}
      {!solaLettura && !persona.userId ? (
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm">
          {busy ? t("Leggo la foto…") : t("Carica la foto firmata")}
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void scansiona(file); }} />
        </label>
      ) : null}
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {solaLettura ? null : (
        <button type="button" disabled={busy} className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void salva()}>
          {t("Conferma il modulo")}
        </button>
      )}
    </div>
  );
}

function CampiLetti({ chiave, campi }: { chiave: string; campi: Record<string, string> }) {
  const t = useT();
  const righe = Object.entries(campi).filter(([, value]) => value);
  if (!righe.length) return <p className="mt-3 text-sm text-mist">{t("Modulo vuoto.")}</p>;
  return (
    <dl className="mt-3 grid gap-2">
      {righe.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs text-mist">{t(etichettaCampo(chiave, key))}</dt>
          <dd className="text-sm">{value.startsWith("data:image/") ? <img src={value} alt="" className="mt-1 max-h-64 rounded-xl bg-white object-contain" /> : value === "si" ? t("Sì") : value === "no" ? t("No") : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CampiModulo({ chiave, campi, onChange }: { chiave: string; campi: Record<string, string>; onChange: (campo: string, value: string) => void }) {
  const t = useT();
  if (chiave === "questionario-medico") {
    return (
      <div className="mt-3 grid gap-3">
        {DOMANDE.map((testo, index) => (
          <SiNo key={testo} label={`${index + 1}. ${t(testo)}`} value={campi[`q${index + 1}`] ?? ""} onChange={(value) => onChange(`q${index + 1}`, value)} />
        ))}
        <SiNo label={t("Dichiaro che le risposte sono veritiere")} value={campi.dichiarazione_veritiera ?? ""} onChange={(value) => onChange("dichiarazione_veritiera", value)} />
        <label className="text-sm"><span className="mb-1 block text-mist">{t("Data")}</span><input type="date" value={campi.data_compilazione ?? ""} onChange={(event) => onChange("data_compilazione", event.target.value)} className={inputClass} /></label>
        <label className="text-sm"><span className="mb-1 block text-mist">{t("Firma, nome e cognome")}</span><input value={campi.firma ?? ""} onChange={(event) => onChange("firma", event.target.value)} className={inputClass} /></label>
      </div>
    );
  }
  if (chiave === "informativa-consenso") {
    return (
      <div className="mt-3 grid gap-3">
        <p className="text-sm text-mist">{t("L'immersione ha rischi propri. Ci si immerge nei limiti del brevetto e con la guida. Il consenso vale solo per questi moduli e per questo viaggio.")}</p>
        <SiNo label={t("Ho letto i rischi e posso rinunciare")} value={campi.ho_letto_rischi ?? ""} onChange={(value) => onChange("ho_letto_rischi", value)} />
        <SiNo label={t("Acconsento a consegnare questi moduli al mio club, solo per questo viaggio")} value={campi.consenso_invio ?? ""} onChange={(value) => onChange("consenso_invio", value)} />
        <label className="text-sm"><span className="mb-1 block text-mist">{t("Data")}</span><input type="date" value={campi.data_compilazione ?? ""} onChange={(event) => onChange("data_compilazione", event.target.value)} className={inputClass} /></label>
        <label className="text-sm"><span className="mb-1 block text-mist">{t("Firma, nome e cognome")}</span><input value={campi.firma ?? ""} onChange={(event) => onChange("firma", event.target.value)} className={inputClass} /></label>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-mist">{t("Didattica")}</span>
        <input value={campi.didattica ?? ""} onChange={(event) => onChange("didattica", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-mist">{t("Livello")}</span>
        <input value={campi.livello ?? ""} onChange={(event) => onChange("livello", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-mist">{t("Numero brevetto")}</span>
        <input value={campi.numero_brevetto ?? ""} onChange={(event) => onChange("numero_brevetto", event.target.value)} className={inputClass} />
      </label>
      {chiave === "brevetto-esperienza" ? (
        <label className="text-sm">
          <span className="mb-1 block text-mist">{t("Ultima immersione")}</span>
          <input type="date" value={campi.ultima_immersione ?? ""} onChange={(event) => onChange("ultima_immersione", event.target.value)} className={inputClass} />
        </label>
      ) : null}
      <label className="text-sm">
        <span className="mb-1 block text-mist">{t("Firma, nome e cognome")}</span>
        <input value={campi.firma ?? ""} onChange={(event) => onChange("firma", event.target.value)} className={inputClass} />
      </label>
    </div>
  );
}

function SiNo({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useT();
  return (
    <div>
      <p className="text-sm">{label}</p>
      <div className="mt-1 flex gap-2">
        {(["si", "no"] as const).map((item) => (
          <button key={item} type="button" className={`min-h-11 flex-1 rounded-full text-sm ${value === item ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => onChange(item)}>
            {item === "si" ? t("Sì") : t("No")}
          </button>
        ))}
      </div>
    </div>
  );
}

function TappetoFirma({ onChange }: { onChange: (data: string, tratti: number) => void }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const tratti = useRef(0);
  const attivo = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * 2));
    canvas.height = Math.max(1, Math.floor(rect.height * 2));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#f3efe4";
  }, []);

  function punto(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function giu(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    attivo.current = true;
    const dove = punto(event);
    ctx.beginPath();
    ctx.moveTo(dove.x, dove.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function muovi(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!attivo.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !ref.current) return;
    const dove = punto(event);
    ctx.lineTo(dove.x, dove.y);
    ctx.stroke();
    tratti.current += 1;
  }

  function su() {
    if (!attivo.current || !ref.current) return;
    attivo.current = false;
    onChange(ref.current.toDataURL("image/png"), tratti.current);
  }

  return (
    <div className="mt-3">
      <p className="mb-1 text-sm text-mist">{t("Firma col dito")}</p>
      <canvas ref={ref} className="h-36 w-full touch-none rounded-xl border border-line bg-abyss" onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} />
    </div>
  );
}

function titoloModulo(chiave: string): string {
  return MODULI.find((item) => item[0] === chiave)?.[1] ?? chiave;
}

function etichettaOrigine(origine: string, t: (testo: string) => string): string {
  if (origine === "mano") return t("Non ha l'app");
  if (origine === "invito") return t("Invitato");
  return t("Socio");
}

function etichettaStato(stato: string, suTritone: boolean, t: (testo: string) => string): string {
  if (stato === "accettato") return t("Accettato. Le uscite sono nel registro di chi ospita.");
  if (stato === "inviato") return suTritone ? t("Inviato al diving.") : t("Fascicolo pronto da mandare.");
  return t("Bozza");
}

function etichettaCampo(chiave: string, campo: string): string {
  if (/^q\d+$/.test(campo)) return DOMANDE[Number(campo.slice(1)) - 1] ?? campo;
  if (campo === "didattica") return "Didattica";
  if (campo === "livello") return "Livello";
  if (campo === "numero_brevetto") return "Numero brevetto";
  if (campo === "ultima_immersione") return "Ultima immersione";
  if (campo === "firma") return "Firma";
  if (campo === "data_compilazione") return "Data";
  if (campo === "dichiarazione_veritiera") return "Dichiarazione";
  if (campo === "ho_letto_rischi") return "Rischi";
  if (campo === "consenso_invio") return "Consenso";
  return chiave ? campo : campo;
}

function filePdf(pdf: string, nome: string): File {
  const bytes = Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0));
  return new File([bytes], nome.replace(/[^\w.-]+/g, "-").slice(0, 80), { type: "application/pdf" });
}

function scaricaPdf(pdf: string, nome: string) {
  scaricaFile(filePdf(pdf, nome));
}

function scaricaFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
