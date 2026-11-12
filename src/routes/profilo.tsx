import { useEffect, useState, type ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, clearFondaleCache, useFondale } from "@/components/app-frame";
import { Copyright } from "@/components/copyright";
import { ClubLogo, rememberLogo } from "@/components/club-logo";
import { FotoPiena } from "@/components/foto-vista";
import { ScaricoDocumento } from "@/components/scarico-doc";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { attivaStaff, aggiungiImbarcazione, aggiungiSecondoTitolare, becomeInstructor, chiediAffiliazione, chiediMezzoNautico, contiIscritti, elencoIscritti, eliminaAccount, esciDalTitolare, esciDalloStaff, getAnagrafica, getTitolare, listImbarcazioni, listStaff, listaBusteScuola, miaAffiliazione, mieiStaff, passaScuola, riscattaAffiliazione, salvaAnagrafica, salvaChiaveScuola, salvaTitolare, scaricaMieiDati, secondoTitolare, seedExamples, setClubLogo, sospendiModuli, togliImbarcazione, togliSecondoTitolare, updateClub, updateCodiceGestore, updateProfile, type Affiliazione, type Allievo, type StaffMio } from "@/lib/fondale.functions";
import { creaCoppia, cifra, chiaveDaCopiare, chiaveMia, chiaveSulTelefono, codiceFilePerCopia, confermaChiaveCopiata, cifraFile, decifra, decifraFile, importaChiaveMia, normalizzaPrivata, salvaChiaveSulTelefono, tieniChiaveDaCopiare, togliChiaveDalTelefono } from "@/lib/cifrario";
import { istantaneaPersonale, leggiAnagraficaLocale, salvaAnagraficaLocale } from "@/lib/anagrafica";
import { ScadenzaField } from "@/components/scadenza-field";
import { TestoInformativa } from "@/components/informativa";
import { impostaPopupCuriosita, popupCuriositaAccesi } from "@/lib/curiosita";
import { impostaTemaChiaro, temaChiaro } from "@/lib/tema";
import { attivaNotificheTelefono, ascoltaNotificheTelefono, disattivaNotificheTelefono, notificheTelefonoAttive } from "@/lib/push-client";
import { prepareLogo } from "@/lib/prepare-file";
import { LinguaAccount } from "@/components/lingua-account";
import { messaggioErrore, useT } from "@/lib/i18n";
import { toDataURL } from "qrcode";
import { FINE_PROVA } from "@/lib/abbonamento";
import { SCARICO_DATA, SCARICO_TITOLO, SCARICO_VERSIONE } from "@/lib/scarico-pianificatore";

export const Route = createFileRoute("/profilo")({
  validateSearch: (search: Record<string, unknown>) => ({
    scuola: search.scuola === true || search.scuola === "1" || search.scuola === 1,
  }),
  component: Page,
});

function Page() {
  return (
    <AppFrame>
      <ProfilePage />
    </AppFrame>
  );
}

function ProfilePage() {
  const t = useT();
  const frame = useFondale();
  const search = Route.useSearch();
  const profile = frame.profile;
  const [nome, setNome] = useState(profile?.nome ?? "");
  const [cognome, setCognome] = useState(profile?.cognome ?? "");
  const [telefono, setTelefono] = useState(profile?.telefono ?? "");
  const [ana, setAna] = useState<Record<string, string>>({});
  const [clubNome, setClubNome] = useState(frame.club.nome);
  const [sede, setSede] = useState(frame.club.sede);
  const [cf, setCf] = useState(frame.club.codiceFiscale);
  const [email, setEmail] = useState(frame.club.email);
  const [telClub, setTelClub] = useState(frame.club.telefono);
  const [cittaClub, setCittaClub] = useState(frame.club.citta ?? "");
  const [provinciaClub, setProvinciaClub] = useState(frame.club.provincia ?? "");
  const [sitoClub, setSitoClub] = useState(frame.club.sito ?? "");
  const [codice, setCodice] = useState(frame.club.codiceStaff ?? "");
  const [codiceGestore, setCodiceGestore] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = typeof window !== "undefined" && hasGateSessionMarker();
  const owner = frame.owner;

  useEffect(() => {
    setClubNome(frame.club.nome);
    setSede(frame.club.sede);
    setCf(frame.club.codiceFiscale);
    setEmail(frame.club.email);
    setTelClub(frame.club.telefono);
    setCittaClub(frame.club.citta ?? "");
    setProvinciaClub(frame.club.provincia ?? "");
    setSitoClub(frame.club.sito ?? "");
    setCodice(frame.club.codiceStaff ?? "");
  }, [frame.club.id]);

  useEffect(() => {
    const locale = leggiAnagraficaLocale();
    setAna(locale);
    if (locale.nome) setNome((current) => current || locale.nome);
    if (locale.cognome) setCognome((current) => current || locale.cognome);
    if (locale.telefono) setTelefono((current) => current || locale.telefono);
    let live = true;
    void getAnagrafica()
      .then(async (busta) => {
        if (!live || !busta) return;
        const extra = JSON.parse(await decifraFile(busta)) as Record<string, string>;
        if (!live) return;
        const merged = salvaAnagraficaLocale(extra);
        setAna(merged);
        if (merged.nome) setNome((current) => current || merged.nome);
        if (merged.cognome) setCognome((current) => current || merged.cognome);
        if (merged.telefono) setTelefono((current) => current || merged.telefono);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profile?.userId]);

  if (!profile) return null;

  const sezioneScuola = owner ? (
    frame.abbonamento.scuolaAperta ? (
      <>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                updateClub({
                  data: {
                    nome: clubNome,
                    sede,
                    codiceFiscale: cf,
                    email,
                    telefono: telClub,
                    codiceStaff: codice,
                    citta: cittaClub,
                    provincia: provinciaClub,
                    sito: sitoClub,
                  },
                }),
              "Dati della scuola aggiornati.",
            );
          }}
        >
          <p className="text-sm text-mist">{t("Logo, codice da dare allo staff e guide.")}</p>
          <LogoField />
          <Input label="Nome" value={clubNome} onChange={setClubNome} />
          <Input label="Sede" value={sede} onChange={setSede} />
          <Pair>
            <Input label="Città" value={cittaClub} onChange={setCittaClub} />
            <Input label="Provincia o regione" value={provinciaClub} onChange={setProvinciaClub} hint="Compare in Cerca Diving." />
          </Pair>
          <Input label="Sito web" value={sitoClub} onChange={setSitoClub} />
          <Pair>
            <Input label="Codice fiscale" value={cf} onChange={setCf} />
            <Input label="Telefono" value={telClub} onChange={setTelClub} />
          </Pair>
          <Input label="Email" value={email} onChange={setEmail} />
          <Input label="Codice staff" value={codice} onChange={setCodice} hint="L'unico codice da dare a istruttori e guide." />
          <p className="text-sm text-mist">{t("Account Pro staff: {usati}/{tetto}", { usati: frame.club.postiStaff, tetto: frame.club.postiTetto })}</p>
          <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: "posto" }} className="inline-flex min-h-11 items-center text-sm text-brass">
            {t("Aggiungi posto Pro — 8 €")}
          </Link>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-full border border-line px-5 text-sm disabled:opacity-60">
              {t("Salva scuola")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
              onClick={() => {
                const text = codice.trim();
                if (!text) return;
                void navigator.clipboard.writeText(text);
                setNote("Codice copiato.");
              }}
            >
              {t("Copia codice")}
            </button>
          </div>
        </form>
        {frame.club.mezzoNautico ? <Imbarcazioni /> : null}
        {frame.club.mezzoNautico ? <StaffScuola /> : null}
        {!frame.club.mezzoNautico ? <PassaggioMezzo richiesto={frame.club.mezzoRichiesto} onDone={() => frame.refresh()} /> : null}
        <SecondoTitolare />
        <ChiaveScuola hasChiave={frame.club.hasChiave} onDone={() => frame.refresh()} />
        <PassaggioScuola accetta={frame.club.accettaModuli} onDone={() => frame.refresh()} />
      </>
    ) : (
      <p className="mt-4 text-sm text-mist">
        {t("L'area della scuola, le anagrafiche dei moduli ricevuti e la gestione si aprono solo se il diving è in prova valida oppure attivo. Il profilo resta consultabile.")}
      </p>
    )
  ) : null;

  if (search.scuola) {
    return (
      <div className="mx-auto max-w-xl">
        <Link to="/" className="text-sm text-lagoon">{t("Home")}</Link>
        <h1 className="mt-2 text-3xl leading-none">{t("Scuola")}</h1>
        {sezioneScuola}
        {note ? <p className="mt-4 text-sm text-brass">{t(note)}</p> : null}
      </div>
    );
  }

  async function run(task: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setNote(null);
    try {
      await task();
      await frame.refresh();
      setNote(ok);
    } catch (reason) {
      setNote(messaggioErrore(reason, "Non salvato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mt-2 text-3xl leading-none">{t("Profilo")}</h1>
      <details className="porta" open>
        <summary>{t("Invita un amico")}</summary>
        <InvitaAmico />
      </details>
      {frame.abbonamento.ruolo === "sub" ? (
        <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: undefined }} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brass px-4 text-sm font-medium text-ink">
          {frame.profile?.pianoAbb === "pro" ? t("Rinnova Pro") : t("Attiva Pro")}
        </Link>
      ) : null}
      <LinguaAccount />
      {frame.abbonamento.riga ? <p className="mt-3 text-sm text-brass">{t(frame.abbonamento.riga)}</p> : null}
      <details className="porta">
        <summary>{t("I tuoi dati")}</summary>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await updateProfile({ data: { nome, cognome, telefono } });
            const ricordi = salvaAnagraficaLocale({
              ...ana,
              nome,
              cognome,
              telefono,
              email: frame.email ?? ana.email ?? "",
            });
            if (chiaveMia()) {
              const chiusa = await cifraFile(JSON.stringify(ricordi));
              await salvaAnagrafica({ data: { busta: chiusa.busta } });
            }
          }, "Profilo aggiornato.");
        }}
      >
        <Pair>
          <Input label="Nome" value={nome} onChange={setNome} />
          <Input label="Cognome" value={cognome} onChange={setCognome} />
        </Pair>
        <Input label="Telefono" value={telefono} onChange={setTelefono} />
        <Pair>
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Data di nascita")}</span>
            <ScadenzaField value={ana.data_nascita ?? ""} onChange={(data_nascita) => setAna((current) => ({ ...current, data_nascita }))} />
          </label>
          <Input label="Luogo di nascita" value={ana.luogo_nascita ?? ""} onChange={(luogo_nascita) => setAna((current) => ({ ...current, luogo_nascita }))} />
        </Pair>
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Sesso")}</span>
          <select
            value={ana.sesso ?? ""}
            onChange={(event) => setAna((current) => ({ ...current, sesso: event.target.value }))}
            className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
          >
            <option value="">—</option>
            <option value="F">F</option>
            <option value="M">M</option>
            <option value="X">{t("Altro / non indicato")}</option>
          </select>
        </label>
        <Input label="Codice fiscale" value={ana.codice_fiscale ?? ""} onChange={(codice_fiscale) => setAna((current) => ({ ...current, codice_fiscale }))} />
        <Input label="Indirizzo" value={ana.indirizzo ?? ""} onChange={(indirizzo) => setAna((current) => ({ ...current, indirizzo }))} />
        <Pair>
          <Input label="CAP" value={ana.cap ?? ""} onChange={(cap) => setAna((current) => ({ ...current, cap }))} />
          <Input label="Città" value={ana.citta ?? ""} onChange={(citta) => setAna((current) => ({ ...current, citta }))} />
        </Pair>
        <Input label="Provincia" value={ana.provincia ?? ""} onChange={(provincia) => setAna((current) => ({ ...current, provincia }))} />
        <Pair>
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Documento")}</span>
            <select
              value={ana.tipo_documento ?? ""}
              onChange={(event) => setAna((current) => ({ ...current, tipo_documento: event.target.value }))}
              className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
            >
              <option value="">—</option>
              <option value="Carta di identità">{t("Carta di identità")}</option>
              <option value="Passaporto">{t("Passaporto")}</option>
              <option value="Patente">{t("Patente")}</option>
            </select>
          </label>
          <Input label="Numero documento" value={ana.numero_documento ?? ""} onChange={(numero_documento) => setAna((current) => ({ ...current, numero_documento }))} />
        </Pair>
        <Input label="Emergenza, nome" value={ana.emergenza_nome ?? ""} onChange={(emergenza_nome) => setAna((current) => ({ ...current, emergenza_nome }))} />
        <Pair>
          <Input label="Emergenza, telefono" value={ana.emergenza_telefono ?? ""} onChange={(emergenza_telefono) => setAna((current) => ({ ...current, emergenza_telefono }))} />
          <Input label="Emergenza, rapporto" value={ana.emergenza_rapporto ?? ""} onChange={(emergenza_rapporto) => setAna((current) => ({ ...current, emergenza_rapporto }))} />
        </Pair>
        <p className="text-xs text-mist">{t("Questi dati si compilano da soli nei moduli. Lì puoi cambiarli: al salvataggio restano aggiornati.")}</p>
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium disabled:opacity-60">
          {t("Salva anagrafica")}
        </button>
      </form>
      {profile?.role === "subacqueo" && !frame.owner && !frame.platform && frame.wizardOk === false ? (
        <Link to="/inizia" className="mt-4 inline-flex min-h-11 items-center text-sm text-lagoon">
          {t("Completa i tuoi dati")}
        </Link>
      ) : null}
      </details>
      {note ? <p className="mt-4 text-sm text-brass">{t(note)}</p> : null}

      <details className="porta">
        <summary>{t("Impostazioni")}</summary>
        <TemaChiaro />
        <NotificheProfilo />
        <PopupCuriosita />
        <DocumentiLegali diving={Boolean(frame.owner || profile?.role === "scuola")} />
        <CodiceCrittografia />

        {frame.platform || owner ? null : (
          <>
            <CodiceStaff onDone={() => frame.refresh()} />
          </>
        )}
        {profile?.role === "subacqueo" || owner ? (
            <AffiliaDiving
              nome={nome}
              cognome={cognome}
              telefono={telefono}
              email={frame.email ?? ""}
              anagrafica={ana}
              giaTitolare={Boolean(owner)}
              nomeAttivita={frame.club.nome}
              mezzoNautico={frame.club.mezzoNautico}
              onDone={async () => {
                frame.setComeCliente(false);
                await frame.refresh();
              }}
            />
        ) : null}

      {frame.platform ? (
        <details className="mt-10 border-t border-line pt-6">
          <summary className="min-h-11 cursor-pointer text-2xl">{t("Gestione")}</summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => updateCodiceGestore({ data: { codice: codiceGestore } }), "Codice gestore aggiornato.");
            }}
          >
            <p className="text-sm text-mist">{t("Serve solo a te, per entrare come gestore da un account nuovo. Le scuole non lo vedono.")}</p>
            <Input label="Nuovo codice" value={codiceGestore} onChange={setCodiceGestore} hint="Almeno 8 caratteri." />
            <button type="submit" disabled={busy} className="min-h-11 rounded-full border border-line px-5 text-sm disabled:opacity-60">
              {t("Salva codice")}
            </button>
          </form>
          <TitolareTrattamento />
        </details>
      ) : null}

      <DatiPersonali />

      {frame.hasInstructor && !frame.owner && !frame.platform ? (
        <button
          type="button"
          className="mt-10 min-h-11 rounded-full border border-line px-4 text-sm"
          onClick={() => {
            if (!window.confirm(t("Sei sicuro? Perderai l'accesso al registro e ai moduli di questo diving. Il tuo account resterà attivo come subacqueo."))) return;
            void run(() => esciDalloStaff(), "Sei uscito dal diving.");
          }}
        >
          {t("Abbandona Diving")}
        </button>
      ) : null}

      {frame.owner && !frame.platform ? (
        <button
          type="button"
          className="mt-10 min-h-11 rounded-full border border-line px-4 text-sm"
          onClick={() => {
            if (!window.confirm(t("Sei sicuro? Perderai l'accesso al registro e ai moduli di questo diving. Il tuo account resterà attivo come subacqueo."))) return;
            void run(() => esciDalTitolare(), "Sei uscito dal diving.");
          }}
        >
          {t("Abbandona Diving")}
        </button>
      ) : null}
      {note ? <p className="mt-3 text-sm text-brass">{t(note)}</p> : null}

      {authEnabled && !gate ? (
        <button
          type="button"
          className="mt-10 text-sm text-mist underline-offset-4 hover:underline"
          onClick={() => {
            clearFondaleCache();
            void signOut();
          }}
        >
          {t("Esci dall'account")}
        </button>
      ) : null}
      </details>
      {owner ? (
        <details className="porta">
          <summary>{t("Scuola")}</summary>
          {sezioneScuola}
        </details>
      ) : null}
      {frame.platform && !frame.comeCliente && frame.vista !== "club" ? <ContiIscritti /> : null}
      <section className="mt-10 border-t border-line pt-4">
        <h2 className="text-sm text-mist">{t("Informazioni")}</h2>
        <Copyright className="mt-2" />
      </section>
      <a href="mailto:Tritone.app@gmail.com?subject=Segnalazione%20Tritone" className="mt-6 block text-sm text-lagoon">
        {t("Segnala un miglioramento o un bug")}
      </a>
    </div>
  );
}

function InvitaAmico() {
  const t = useT();
  const link = "https://tritoneapp.it";
  const [src, setSrc] = useState("");
  const [nota, setNota] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#07141a", light: "#ffffff" } })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setSrc("");
      });
    return () => {
      live = false;
    };
  }, []);

  async function condividi() {
    const testo = `${t("Ti invito su Tritone.")} ${link}`;
    setNota(null);
    try {
      if (src && typeof navigator.share === "function") {
        const blob = await (await fetch(src)).blob();
        const file = new File([blob], "tritone.png", { type: "image/png" });
        const conFile = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
        if (conFile) {
          await navigator.share({ files: [file], title: "Tritone", text: testo });
          return;
        }
        await navigator.share({ title: "Tritone", text: testo, url: link });
        return;
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setNota(t("Condivisione non riuscita."));
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-mist">{t("L'amico inquadra il codice con la fotocamera e apre tritoneapp.it.")}</p>
      {src ? <img src={src} alt={t("QR code di Tritone")} className="mx-auto mt-4 w-56 rounded-2xl bg-white p-3" /> : <p className="mt-4 text-sm text-mist">{t("Preparo il codice…")}</p>}
      <button type="button" className="mt-4 min-h-12 w-full rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => void condividi()}>
        {t("Condividi")}
      </button>
      {nota ? <p className="mt-2 text-sm text-brass">{nota}</p> : null}
      <h3 className="mt-6 text-lg">{t("Come installarla")}</h3>
      <p className="mt-2 text-sm">{t("iPhone: apri il link pubblicato in Safari, tocca Condividi, poi Aggiungi a Home. Si apre a tutto schermo.")}</p>
      <p className="mt-2 text-sm">{t("Android: apri lo stesso link in Chrome, menu, Installa app. Non usare «Aggiungi a schermata Home».")}</p>
    </div>
  );
}

function TitolareTrattamento() {
  const t = useT();
  const [nome, setNome] = useState("");
  const [sede, setSede] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getTitolare()
      .then((item) => {
        if (!live) return;
        setNome(item.nome);
        setSede(item.sede);
        setEmail(item.email);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <form
      className="mt-6 space-y-3 border-t border-line pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setNote(null);
        void salvaTitolare({ data: { nome, sede, email } })
          .then(() => setNote("Salvato. Compare nell'informativa."))
          .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non salvato.")))
          .finally(() => setBusy(false));
      }}
    >
      <h3 className="text-xl">{t("Titolare del trattamento")}</h3>
      <p className="text-sm text-mist">{t("Nome e sede di chi gestisce l'app. Li legge chiunque apra l'informativa.")}</p>
      <Input label="Nome o ragione sociale" value={nome} onChange={setNome} />
      <Input label="Sede" value={sede} onChange={setSede} />
      <Input label="Email" value={email} onChange={setEmail} />
      <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
        {busy ? t("Salvo…") : t("Salva nell'informativa")}
      </button>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </form>
  );
}

function ChiaveScuola({ hasChiave, onDone }: { hasChiave: boolean; onDone: () => Promise<void> }) {
  const t = useT();
  const [codice, setCodice] = useState("");
  const [nuovo, setNuovo] = useState(() => chiaveDaCopiare());
  const [copiata, setCopiata] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presente = Boolean(chiaveSulTelefono());

  async function crea() {
    setBusy(true);
    setNote(null);
    try {
      const pair = await creaCoppia();
      await salvaChiaveScuola({ data: { pubblica: pair.pubblica } });
      salvaChiaveSulTelefono(pair.privata);
      tieniChiaveDaCopiare(pair.privata);
      setNuovo(pair.privata);
      setCopiata(false);
    } catch (reason) {
      setNote(messaggioErrore(reason, "Chiave non creata."));
    } finally {
      setBusy(false);
    }
  }

  async function conferma() {
    if (!copiata) {
      setNote("Prima copia la chiave, poi conferma.");
      return;
    }
    confermaChiaveCopiata();
    setNuovo("");
    await onDone();
  }

  function importa() {
    const text = normalizzaPrivata(codice);
    if (text.length < 40) {
      setNote("Incolla la chiave della scuola, quella del primo titolare. Non il codice crittografia dei file.");
      return;
    }
    salvaChiaveSulTelefono(text);
    setNote("Codice salvato su questo telefono.");
  }

  return (
    <section className="mt-6 space-y-3 border-t border-line pt-4">
      <h3 className="text-xl">{t("Chiave della scuola")}</h3>
      <p className="text-sm text-mist">{t("Serve ad aprire le risposte sanitarie. Resta su questo telefono. Copiala e tienila anche su carta.")}</p>
      {presente && !nuovo ? <p className="text-sm">{t("Su questo telefono la chiave c'è.")}</p> : null}
      {nuovo ? (
        <>
          <p className="text-sm text-brass">{t("La chiave resta qui finché non confermi di averla copiata.")}</p>
          <textarea readOnly value={nuovo} className="min-h-28 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
              onClick={() => {
                void navigator.clipboard.writeText(nuovo).then(
                  () => {
                    setCopiata(true);
                    setNote("Codice copiato. Conferma solo quando l'hai messo al sicuro.");
                  },
                  () => setNote("Seleziona il codice e copialo a mano. Poi conferma."),
                );
              }}
            >
              {t("Copia")}
            </button>
            <button type="button" disabled={!copiata} onClick={() => void conferma()} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-40">
              {t("Ho copiato la chiave")}
            </button>
          </div>
        </>
      ) : presente ? (
        <button
          type="button"
          className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
          onClick={() => {
            void navigator.clipboard.writeText(chiaveSulTelefono()).then(
              () => setNote("Codice copiato. Tienilo anche su carta."),
              () => setNote("Seleziona il codice e copialo a mano."),
            );
          }}
        >
          {t("Copia")}
        </button>
      ) : null}
      {!hasChiave && !nuovo ? (
        <button type="button" disabled={busy} onClick={() => void crea()} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
          {busy ? t("Creo…") : t("Crea la chiave")}
        </button>
      ) : null}
      {hasChiave && !nuovo ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            importa();
          }}
        >
          <textarea value={codice} onChange={(event) => setCodice(event.target.value)} placeholder={t("Codice di recupero")} className="min-h-24 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" />
          <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
            {t("Salva il codice su questo telefono")}
          </button>
        </form>
      ) : null}
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function SecondoTitolare() {
  const t = useT();
  const [people, setPeople] = useState<Allievo[] | null>(null);
  const [secondo, setSecondo] = useState<{ nome: string; cognome: string } | null>(null);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function carica() {
    void listStaff().then(setPeople).catch(() => setPeople([]));
    void secondoTitolare().then(setSecondo).catch(() => setSecondo(null));
  }

  useEffect(() => {
    carica();
  }, []);

  return (
    <section className="mt-6 space-y-3 border-t border-line pt-4">
      <h3 className="text-xl">{t("Secondo titolare")}</h3>
      <p className="text-sm text-mist">
        {t("Un diving può avere due titolari. Il secondo ha gli stessi poteri. Sul suo telefono deve inserire il codice di recupero della scuola.")}
      </p>
      {secondo ? (
        <>
          <p className="text-sm">{secondo.cognome} {secondo.nome}</p>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              setNote(null);
              void togliSecondoTitolare()
                .then(() => {
                  setSecondo(null);
                  setNote("Ora è di nuovo nello staff.");
                  carica();
                })
                .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non tolto.")))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t("Tolgo…") : t("Togli il secondo titolare")}
          </button>
        </>
      ) : (
        <>
          <select value={userId} onChange={(event) => setUserId(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3">
            <option value="">{t("Scegli dallo staff")}</option>
            {(people ?? []).map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.cognome} {person.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !userId}
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              setNote(null);
              void aggiungiSecondoTitolare({ data: { userId } })
                .then(() => {
                  setUserId("");
                  setNote("Ora i titolari sono due.");
                  carica();
                })
                .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non aggiunto.")))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t("Aggiungo…") : t("Aggiungi come titolare")}
          </button>
        </>
      )}
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function PassaggioScuola({ accetta, onDone }: { accetta: boolean; onDone: () => Promise<void> }) {
  const t = useT();
  const [people, setPeople] = useState<Allievo[] | null>(null);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codiceNuovo, setCodiceNuovo] = useState("");
  const [pronto, setPronto] = useState<{ pubblica: string; buste: { id: number; cifrato: string }[] } | null>(null);

  useEffect(() => {
    let live = true;
    listStaff()
      .then((items) => {
        if (live) setPeople(items);
      })
      .catch(() => {
        if (live) setPeople([]);
      });
    return () => {
      live = false;
    };
  }, []);

  async function prepara() {
    setBusy(true);
    setNote(null);
    setPronto(null);
    setCodiceNuovo("");
    try {
      const vecchia = chiaveSulTelefono();
      const buste = await listaBusteScuola();
      if (buste.length > 0 && !vecchia) {
        throw new Error("Su questo telefono non c'è il codice della scuola. Senza, le schede già chiuse non si possono passare.");
      }
      const pair = await creaCoppia();
      const nuove: { id: number; cifrato: string }[] = [];
      for (const busta of buste) {
        const testo = await decifra(vecchia, busta.cifrato);
        nuove.push({ id: busta.id, cifrato: await cifra(pair.pubblica, testo) });
      }
      setPronto({ pubblica: pair.pubblica, buste: nuove });
      setCodiceNuovo(pair.privata);
    } catch (reason) {
      setNote(messaggioErrore(reason, "Passaggio non preparato."));
    } finally {
      setBusy(false);
    }
  }

  async function conferma() {
    if (!pronto || !userId) return;
    setBusy(true);
    setNote(null);
    try {
      await passaScuola({ data: { userId, pubblica: pronto.pubblica, buste: pronto.buste } });
      togliChiaveDalTelefono();
      await onDone();
    } catch (reason) {
      setNote(messaggioErrore(reason, "Passaggio non riuscito."));
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-3 border-t border-line pt-4">
      <h3 className="text-xl">{t("Scuola")}</h3>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setNote(null);
          void sospendiModuli({ data: { accetta: !accetta } })
            .then(() => onDone())
            .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non salvato.")))
            .finally(() => setBusy(false));
        }}
      >
        {accetta ? t("Sospendi i nuovi moduli") : t("Riapri i moduli")}
      </button>
      <p className="text-sm text-mist">{t("Il passaggio crea un codice nuovo. Quello vecchio non apre più le schede. Consegnalo al nuovo titolare prima di confermare.")}</p>
      <select
        value={userId}
        onChange={(event) => {
          setUserId(event.target.value);
          setPronto(null);
          setCodiceNuovo("");
        }}
        className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3"
      >
        <option value="">{t("Scegli dallo staff")}</option>
        {(people ?? []).map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.cognome} {person.nome}
          </option>
        ))}
      </select>
      {codiceNuovo ? (
        <>
          <p className="break-all text-xs text-mist">{codiceNuovo}</p>
          <button
            type="button"
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium"
            onClick={() => {
              void navigator.clipboard.writeText(codiceNuovo).then(
                () => setNote("Codice copiato. Consegnalo, poi conferma."),
                () => setNote("Seleziona il codice e copialo a mano, poi conferma."),
              );
            }}
          >
            {t("Copia il codice nuovo")}
          </button>
          <button type="button" disabled={busy} onClick={() => void conferma()} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60">
            {busy ? t("Passo…") : t("Ho copiato, passa la scuola")}
          </button>
        </>
      ) : (
        <button type="button" disabled={busy || !userId} onClick={() => void prepara()} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
          {busy ? t("Preparo…") : t("Prepara il codice nuovo")}
        </button>
      )}
      {people && people.length === 0 ? <p className="text-sm text-mist">{t("Prima qualcuno deve entrare nello staff, con il codice.")}</p> : null}
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function DatiPersonali() {
  const t = useT();
  const frame = useFondale();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const titolare = frame.owner && Boolean(frame.club.id);

  async function scarica() {
    setBusy("scarica");
    setNote(null);
    try {
      const data = await scaricaMieiDati();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tritone-dati.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setNote(messaggioErrore(reason, "Download non riuscito."));
    } finally {
      setBusy(null);
    }
  }

  async function chiudi() {
    const domanda = titolare
      ? t("Chiedere al gestore di chiudere questo diving? Si può solo se non hai staff. Si cancella solo la scuola. Tu resti subacqueo e, se lo sei, staff degli altri diving.")
      : t("Eliminare l'account? Logbook e documenti personali si cancellano. Le schede già inviate restano al diving, senza più il tuo accesso.");
    if (!window.confirm(domanda)) return;
    setBusy("chiudi");
    setNote(null);
    try {
      const result = await eliminaAccount();
      if (result.richiesta) {
        setNote("Richiesta inviata. Il gestore chiude solo il diving. Tu resti subacqueo.");
        setBusy(null);
        return;
      }
      clearFondaleCache();
      await signOut();
    } catch (reason) {
      setNote(messaggioErrore(reason, "Account non eliminato."));
      setBusy(null);
    }
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="text-2xl">{t("I tuoi dati")}</h2>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer text-sm text-lagoon">{t("Informativa")}</summary>
        <div className="mt-3">
          <TestoInformativa />
        </div>
      </details>
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void scarica()} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60">
          {busy === "scarica" ? t("Preparo il file…") : t("Scarica i miei dati")}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void chiudi()} className="min-h-11 rounded-full border border-line px-4 text-sm text-brass disabled:opacity-60">
          {busy === "chiudi" ? t("Chiudo…") : <><span aria-hidden="true" className="inline-block align-middle text-3xl leading-none text-[#FFCC00]">⚠</span> {t("Elimina account")} <span aria-hidden="true" className="inline-block align-middle text-3xl leading-none text-[#FFCC00]">⚠</span></>}
        </button>
      </div>
      {note ? <p className="mt-3 text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function TemaChiaro() {
  const t = useT();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(temaChiaro());
  }, []);

  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-2xl">{t("Modalità chiara")}</h2>
      <p className="text-sm text-mist">{t("Sfondo chiaro e testo scuro. Vale su tutta l'app, anche al prossimo accesso.")}</p>
      <button
        type="button"
        className={`min-h-11 rounded-full px-5 text-sm font-medium ${on ? "bg-lagoon text-ink" : "border border-line"}`}
        onClick={() => {
          const next = !on;
          impostaTemaChiaro(next);
          setOn(next);
        }}
      >
        {on ? t("Modalità chiara accesa") : t("Accendi la modalità chiara")}
      </button>
    </section>
  );
}

function NotificheProfilo() {
  const t = useT();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setOn(notificheTelefonoAttive());
    sync();
    return ascoltaNotificheTelefono(sync);
  }, []);

  return (
    <section className="mt-10 space-y-3 border-t border-line pt-6">
      <h2 className="text-2xl">{t("Notifiche sul telefono")}</h2>
      <p className="text-sm text-mist">
        {t("Un solo permesso per tutti. Lo staff riceve i moduli. Il subacqueo, la scheda letta e le scadenze. Il gestore, le richieste di affiliazione.")}
      </p>
      <button
        type="button"
        disabled={busy}
        className={`min-h-11 rounded-full px-5 text-sm font-medium disabled:opacity-60 ${on ? "bg-lagoon text-ink" : "border border-line"}`}
        onClick={() => {
          setBusy(true);
          setNote(null);
          const run = on ? disattivaNotificheTelefono().then(() => null) : attivaNotificheTelefono();
          void run
            .then((message) => {
              setOn(notificheTelefonoAttive());
              if (message) setNote(message);
            })
            .catch(() => setNote("Non riesco a cambiare le notifiche. Su iPhone l'app va aperta dalla Home."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("Attendo…") : on ? t("Notifiche accese") : t("Attiva le notifiche")}
      </button>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function DocumentiLegali({ diving }: { diving: boolean }) {
  const t = useT();
  const [pdf, setPdf] = useState<{ titolo: string; href: string } | null>(null);
  const [testo, setTesto] = useState(false);
  const voci = [
    { titolo: "Termini e Condizioni d'Uso", versione: "3.8", data: "27 ottobre 2026", href: "/legali/termini-condizioni.pdf" },
    { titolo: "Informativa Privacy", versione: "1.4", data: "20 ottobre 2026", href: "/legali/informativa-privacy.pdf" },
    { titolo: "Condizioni Economiche", versione: "1.2", data: "20 ottobre 2026", href: "/legali/condizioni-economiche.pdf" },
    ...(diving
      ? [{ titolo: "Accordo sul Trattamento dei Dati", versione: "1.4", data: "20 ottobre 2026", href: "/legali/accordo-trattamento.pdf" }]
      : []),
  ];

  return (
    <details className="mt-10 border-t border-line pt-6">
      <summary className="min-h-11 cursor-pointer text-2xl">{t("Documenti legali")}</summary>
      <ul className="mt-4 space-y-3">
        {voci.map((voce) => (
          <li key={voce.href} className="rounded-2xl border border-line px-4 py-3">
            <p className="font-medium">{t(voce.titolo)}</p>
            <p className="mt-1 text-sm text-mist">v{voce.versione} · {t(voce.data)}</p>
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm"
              onClick={() => setPdf({ titolo: t(voce.titolo), href: voce.href })}
            >
              {t("Visualizza")}
            </button>
          </li>
        ))}
        <li className="rounded-2xl border border-line px-4 py-3">
          <p className="font-medium">{t(SCARICO_TITOLO)}</p>
          <p className="mt-1 text-sm text-mist">v{SCARICO_VERSIONE} · {t(SCARICO_DATA)}</p>
          <button type="button" className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setTesto(true)}>
            {t("Visualizza")}
          </button>
        </li>
      </ul>
      {pdf ? <FotoPiena src={pdf.href} alt={pdf.titolo} onClose={() => setPdf(null)} /> : null}
      {testo ? <ScaricoDocumento onClose={() => setTesto(false)} /> : null}
    </details>
  );
}

function PopupCuriosita() {
  const t = useT();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(popupCuriositaAccesi());
  }, []);

  return (
    <section className="mt-10 space-y-3 border-t border-line pt-6">
      <h2 className="text-2xl">{t("Popup curiosità")}</h2>
      <p className="text-sm text-mist">{t("All'avvio, una nozione su immersione, biologia o fisiologia. Si possono spegnere solo questi.")}</p>
      <button
        type="button"
        className={`min-h-11 rounded-full px-5 text-sm font-medium ${on ? "bg-lagoon text-ink" : "border border-line"}`}
        onClick={() => {
          const next = !on;
          impostaPopupCuriosita(next);
          setOn(next);
        }}
      >
        {on ? t("Popup curiosità accesi") : t("Popup curiosità spenti")}
      </button>
    </section>
  );
}

function CodiceCrittografia() {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const [visibile, setVisibile] = useState(false);
  const [presa, setPresa] = useState("");
  const [codice, setCodice] = useState(() => codiceFilePerCopia());

  function salva() {
    try {
      importaChiaveMia(presa.trim());
      setCodice(codiceFilePerCopia());
      setPresa("");
      setVisibile(false);
      setNote("Codice salvato su questo apparecchio. Da qui apre gli stessi file.");
    } catch {
      setNote("Codice non valido. Incolla tutto il testo copiato, da { fino a }.");
    }
  }

  return (
    <section className="mt-10 space-y-3 border-t border-line pt-6">
      <h2 className="text-2xl">{t("Codice crittografia")}</h2>
      <p className="text-sm text-mist">
        {t("È lo stesso codice del primo avvio. Apre brevetti, certificato e assicurazione se cambi telefono. Resta su questo apparecchio.")}
      </p>
      {codice ? (
        <>
          <button
            type="button"
            className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink"
            onClick={() => {
              void navigator.clipboard.writeText(codice).then(
                () => setNote("Codice copiato. Non resta scritto qui."),
                () => {
                  setVisibile(true);
                  setNote("Copia non riuscita. Il codice è qui sotto: selezionalo a mano.");
                },
              );
            }}
          >
            {t("Copia codice crittografia")}
          </button>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setVisibile((value) => !value)}>
            {visibile ? t("Nascondi codice") : t("Mostra per trascriverlo")}
          </button>
          {visibile ? <textarea readOnly value={codice} className="min-h-28 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" /> : null}
        </>
      ) : (
        <p className="text-sm text-mist">{t("Su questo apparecchio il codice non c'è ancora. Incollalo qui sotto.")}</p>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          salva();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Incolla il codice di un altro apparecchio")}</span>
          <textarea
            value={presa}
            onChange={(event) => setPresa(event.target.value)}
            placeholder={t("Incolla qui il codice copiato")}
            className="min-h-28 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
          {t("Salva su questo apparecchio")}
        </button>
      </form>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function CodiceStaff({ onDone }: { onDone: () => Promise<void> }) {
  const t = useT();
  const [codice, setCodice] = useState("");
  const [elenco, setElenco] = useState<StaffMio[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return mieiStaff()
      .then(setElenco)
      .catch(() => setElenco([]));
  }

  useEffect(() => {
    let live = true;
    mieiStaff()
      .then((items) => {
        if (live) setElenco(items);
      })
      .catch(() => {
        if (live) setElenco([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="mt-10 space-y-3 border-t border-line pt-6">
      <h2 className="text-2xl">{t("Staff")}</h2>
      <p className="text-sm text-mist">{t("Inserisci il codice che ti dà il titolare. Puoi entrare nello staff di più diving.")}</p>
      <ul className="space-y-2">
        {(elenco ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-card border border-line px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm">{item.nome}</span>
              {item.sede ? <span className="block text-xs text-mist">{item.sede}</span> : null}
            </span>
            {item.attivo ? (
              <span className="text-xs text-mist">{t("Aperto")}</span>
            ) : (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm"
                onClick={() => {
                  setBusy(true);
                  setNote(null);
                  void attivaStaff({ data: { id: item.id } })
                    .then(() => onDone())
                    .catch((reason: unknown) => {
                      setNote(messaggioErrore(reason, "Non aperto."));
                      setBusy(false);
                    });
                }}
              >
                {t("Apri")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setNote(null);
          void becomeInstructor({ data: { codice } })
            .then(async () => {
              setCodice("");
              await load();
              await onDone();
            })
            .catch((reason: unknown) => {
              setNote(messaggioErrore(reason, "Codice non valido."));
              setBusy(false);
            });
        }}
      >
        <Input label="Inserisci codice staff" value={codice} onChange={setCodice} hint="Ogni diving ha il suo. Puoi aggiungerne un altro quando vuoi." />
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium disabled:opacity-60">
          {busy ? t("Entro…") : t("Entra nello staff")}
        </button>
      </form>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function PassaggioMezzo({ richiesto, onDone }: { richiesto: boolean; onDone: () => Promise<void> }) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-6 space-y-2">
      <h3 className="text-xl">{t("Scuola/Club senza mezzo nautico")}</h3>
      <p className="text-sm text-mist">{t("Barche, guide e foglio barca restano chiusi. Puoi chiedere il passaggio al gestore.")}</p>
      {richiesto ? <p className="text-sm text-brass">{t("Richiesta inviata. Solo il gestore può sbloccare il mezzo nautico.")}</p> : null}
      <button
        type="button"
        disabled={busy || richiesto}
        className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setNote(null);
          void chiediMezzoNautico()
            .then(() => onDone())
            .catch((reason: unknown) => setNote(messaggioErrore(reason, "Richiesta non inviata.")))
            .finally(() => setBusy(false));
        }}
      >
        {richiesto ? t("In attesa del gestore") : t("Richiedi il passaggio a Diving con mezzo nautico")}
      </button>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function Imbarcazioni() {
  const t = useT();
  const [elenco, setElenco] = useState<{ id: number; nome: string }[] | null>(null);
  const [nome, setNome] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listImbarcazioni()
      .then((items) => {
        if (live) setElenco(items);
      })
      .catch(() => {
        if (live) setElenco([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="mt-6 space-y-3 border-t border-line pt-4">
      <h3 className="text-xl">{t("Imbarcazioni")}</h3>
      <p className="text-sm text-mist">{t("Il registro le mostra quando apri un'uscita. Da riva c'è già, non va aggiunta.")}</p>
      <ul className="space-y-2">
        {(elenco ?? []).map((barca) => (
          <li key={barca.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{barca.nome}</span>
            <button
              type="button"
              className="min-h-11 shrink-0 text-danger"
              onClick={() => {
                setBusy(true);
                setNote(null);
                void togliImbarcazione({ data: { id: barca.id } })
                  .then(setElenco)
                  .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non tolta.")))
                  .finally(() => setBusy(false));
              }}
            >
              {t("Togli")}
            </button>
          </li>
        ))}
      </ul>
      {elenco && elenco.length === 0 ? <p className="text-sm text-mist">{t("Nessuna barca, per ora.")}</p> : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setNote(null);
          void aggiungiImbarcazione({ data: { nome } })
            .then((items) => {
              setElenco(items);
              setNome("");
              setNote("Barca aggiunta. Compare nel registro.");
            })
            .catch((reason: unknown) => setNote(messaggioErrore(reason, "Non aggiunta.")))
            .finally(() => setBusy(false));
        }}
      >
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder={t("Nome della barca")}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass"
        />
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60">
          {t("Aggiungi")}
        </button>
      </form>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function ContiIscritti() {
  const t = useT();
  const [conti, setConti] = useState<{ subacquei: number; staff: number; titolari: number } | null>(null);
  const [aperto, setAperto] = useState<"subacquei" | "staff" | "titolari" | null>(null);
  const [elenco, setElenco] = useState<{ nome: string; cognome: string }[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    contiIscritti()
      .then((value) => {
        if (live) setConti(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function apri(quale: "subacquei" | "staff" | "titolari") {
    if (aperto === quale) {
      setAperto(null);
      setElenco(null);
      return;
    }
    setAperto(quale);
    setElenco(null);
    setErrore(null);
    const ruolo = quale === "subacquei" ? "subacqueo" : quale === "staff" ? "istruttore" : "scuola";
    elencoIscritti({ data: { ruolo } })
      .then(setElenco)
      .catch(() => setErrore("Elenco non disponibile."));
  }

  const titolo = aperto === "subacquei" ? t("Subacquei") : aperto === "staff" ? t("Staff") : t("Titolari");

  return (
    <section className="mt-8">
      <h2 className="text-2xl">{t("Iscritti")}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Conto label="Subacquei" n={conti?.subacquei} aperto={aperto === "subacquei"} onClick={() => apri("subacquei")} />
        <Conto label="Staff" n={conti?.staff} aperto={aperto === "staff"} onClick={() => apri("staff")} />
        <Conto label="Titolari" n={conti?.titolari} aperto={aperto === "titolari"} onClick={() => apri("titolari")} />
      </div>
      {aperto ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-3">
          <p className="text-sm text-mist">{titolo}</p>
          {errore ? <p className="mt-2 text-sm text-brass">{t(errore)}</p> : null}
          {!elenco && !errore ? <p className="mt-2 text-sm text-mist">{t("Carico…")}</p> : null}
          {elenco && elenco.length === 0 ? <p className="mt-2 text-sm">{t("Nessuno.")}</p> : null}
          {elenco && elenco.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {elenco.map((persona, index) => (
                <li key={`${persona.cognome}-${persona.nome}-${index}`} className="text-sm">
                  {persona.cognome} {persona.nome}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Conto({ label, n, aperto, onClick }: { label: string; n: number | undefined; aperto: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aperto}
      className={`rounded-card border p-3 text-left ${aperto ? "border-lagoon bg-surface" : "border-line bg-surface"}`}
    >
      <p className="text-2xl leading-none">{n ?? "–"}</p>
      <p className="mt-2 text-xs text-mist">{t(label)}</p>
    </button>
  );
}

function AffiliaDiving({
  nome,
  cognome,
  telefono,
  email,
  anagrafica,
  giaTitolare,
  nomeAttivita,
  mezzoNautico,
  onDone,
}: {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  anagrafica: Record<string, string>;
  giaTitolare: boolean;
  nomeAttivita: string;
  mezzoNautico: boolean;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const [richiesta, setRichiesta] = useState<Affiliazione | null>(null);
  const [first, setFirst] = useState(nome);
  const [last, setLast] = useState(cognome);
  const [divingNome, setDivingNome] = useState("");
  const [sede, setSede] = useState("");
  const [cf, setCf] = useState("");
  const [mail, setMail] = useState(email);
  const [phone, setPhone] = useState(telefono);
  const [codice, setCodice] = useState("");
  const [mezzo, setMezzo] = useState<boolean | null>(null);
  const [bonifico, setBonifico] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    miaAffiliazione()
      .then((item) => {
        if (live) setRichiesta(item);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const aperta = richiesta && richiesta.stato !== "accettata";
  const oggi = new Date().toISOString().slice(0, 10);
  const inProva = oggi <= FINE_PROVA;

  return (
    <section className="mt-10 space-y-3 border-t border-line pt-6">
      <h2 className="text-2xl">{t("Apri un'attività")}</h2>
      <p className="text-sm text-mist">
        {t("Dal profilo puoi chiedere di aprire un'attività. Il gestore riceve i dati e ti manda un codice. Con quel codice diventi titolare.")}
      </p>
      {giaTitolare ? (
        <div className="rounded-card border border-line bg-surface p-4 text-sm">
          <p>
            {mezzoNautico
              ? t("Sei già titolare di un diving{nome}. Non puoi aprirne un'altra.", { nome: nomeAttivita ? `: ${nomeAttivita}` : "" })
              : t("Sei già titolare di una scuola/club{nome}. Non puoi aprirne un'altra.", { nome: nomeAttivita ? `: ${nomeAttivita}` : "" })}
          </p>
        </div>
      ) : aperta ? (
        <div className="rounded-card border border-line bg-surface p-4 text-sm">
          <p>{richiesta.stato === "codice-inviato" ? t("Il gestore ha preparato il codice. Inseriscilo qui.") : t("Richiesta inviata. Il gestore la sta leggendo.")}</p>
          <p className="mt-2 text-mist">
            {richiesta.divingNome} · {richiesta.sede}
            {richiesta.mezzoNautico == null ? "" : ` · ${richiesta.mezzoNautico ? t("Attività con mezzo nautico (Diving)") : t("Attività senza mezzo nautico (Club / Scuola)")}`}
          </p>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setNote(null);
            const manca = campoMancante({ nome: first, cognome: last, mail, phone, divingNome, sede, cf });
            if (manca) {
              setNote(t("Manca: {campo}", { campo: t(manca) }));
              setBusy(false);
              return;
            }
            if (mezzo == null) {
              setNote("Scegli il tipo di attività.");
              setBusy(false);
              return;
            }
            void chiediAffiliazione({
              data: {
                nome: first,
                cognome: last,
                telefono: phone,
                email: mail,
                divingNome,
                sede,
                codiceFiscale: cf,
                divingEmail: "",
                divingTelefono: "",
                anagrafica: istantaneaPersonale(anagrafica, { nome, cognome, telefono, email }),
                mezzoNautico: mezzo,
              },
            })
              .then((item) => {
                setRichiesta(item);
                setNote("Richiesta inviata al gestore.");
              })
              .catch((reason: unknown) => setNote(messaggioErrore(reason, "Richiesta non inviata.")))
              .finally(() => setBusy(false));
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm">{t("Che attività vuoi aprire?")}</legend>
            <button
              type="button"
              className={`min-h-11 w-full rounded-2xl px-4 text-left text-sm ${mezzo === true ? "bg-lagoon font-medium" : "border border-line"}`}
              onClick={() => { setMezzo(true); setBonifico(false); }}
            >
              {t("Attività con mezzo nautico (Diving)")}
            </button>
            <button
              type="button"
              className={`min-h-11 w-full rounded-2xl px-4 text-left text-sm ${mezzo === false ? "bg-lagoon font-medium" : "border border-line"}`}
              onClick={() => { setMezzo(false); setBonifico(false); }}
            >
              {t("Attività senza mezzo nautico (Club / Scuola)")}
            </button>
          </fieldset>
          {mezzo == null ? null : inProva ? (
            <div className="rounded-card border border-line bg-surface p-4 text-sm">
              <p className="font-medium">{t("Periodo di prova gratuito")}</p>
              <p className="mt-2">{t("Fino al 31 marzo 2027 l'attivazione dell'attività è gratuita.")}</p>
              <p className="mt-2">{t("Dopo questa data sarà richiesto il pagamento annuale.")}</p>
              <p className="mt-2">{t("Puoi procedere con l'apertura.")}</p>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-surface p-4 text-sm">
              {mezzo ? (
                <>
                  <p className="font-medium">{t("Piano Diving – 190,00 € / anno")}</p>
                  <p className="mt-2">{t("Per attivare il tuo centro con mezzo nautico, effettua un bonifico di 190,00 € a:")}</p>
                  <p className="mt-2">{t("IBAN: IT87H0366901600428871577626")}</p>
                  <p>{t("Intestatario: Mogliani Alessandro")}</p>
                  <p>{t("Causale: Tritone – Piano Diving – [Nome del tuo centro]")}</p>
                </>
              ) : (
                <>
                  <p className="font-medium">{t("Piano Club / Scuola – 80,00 € / anno")}</p>
                  <p className="mt-2">{t("Per attivare la tua attività senza mezzo nautico, effettua un bonifico di 80,00 € a:")}</p>
                  <p className="mt-2">{t("IBAN: IT87H0366901600428871577626")}</p>
                  <p>{t("Intestatario: Mogliani Alessandro")}</p>
                  <p>{t("Causale: Tritone – Piano Club – [Nome del tuo centro]")}</p>
                </>
              )}
              <p className="mt-2">{t("Una volta ricevuto il pagamento, il piano verrà attivato entro 24 ore.")}</p>
              <button
                type="button"
                className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm"
                onClick={() => setBonifico(true)}
              >
                {t("Ho effettuato il bonifico")}
              </button>
              {bonifico ? <p className="mt-3">{t("Grazie! Verificheremo il pagamento e attiveremo il piano il prima possibile.")}</p> : null}
            </div>
          )}
          <Input label="Nome" value={first} onChange={setFirst} />
          <Input label="Cognome" value={last} onChange={setLast} />
          <Input label="Mail" value={mail} onChange={setMail} />
          <Input label="Cellulare" value={phone} onChange={setPhone} />
          <Input label="Nome diving" value={divingNome} onChange={setDivingNome} />
          <Input label="Indirizzo diving" value={sede} onChange={setSede} />
          <Input label="Codice fiscale diving" value={cf} onChange={setCf} />
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium disabled:opacity-60">
            {busy ? t("Invio…") : t("Invia richiesta")}
          </button>
        </form>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setNote(null);
          void riscattaAffiliazione({ data: { codice } })
            .then(() => onDone())
            .catch((reason: unknown) => {
              setNote(messaggioErrore(reason, "Codice non valido."));
              setBusy(false);
            });
        }}
      >
        <Input label="Codice del gestore" value={codice} onChange={setCodice} hint="Te lo manda il gestore dopo aver letto la richiesta." />
        <button type="submit" disabled={busy} className="min-h-11 rounded-full border border-line px-5 text-sm disabled:opacity-60">
          {t("Diventa titolare")}
        </button>
      </form>
      {note ? <p className="text-sm text-brass">{t(note)}</p> : null}
    </section>
  );
}

function campoMancante(input: { nome: string; cognome: string; mail: string; phone: string; divingNome: string; sede: string; cf: string }): string | null {
  if (!input.nome.trim()) return "Nome";
  if (!input.cognome.trim()) return "Cognome";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.mail.trim())) return "Mail";
  if (input.phone.replace(/\D/g, "").length < 8) return "Cellulare";
  if (input.divingNome.trim().length < 2) return "Nome diving";
  if (input.sede.trim().length < 5) return "Indirizzo diving";
  if (input.cf.replace(/\s/g, "").length < 11) return "Codice fiscale diving";
  return null;
}

function StaffScuola() {
  const t = useT();
  const [people, setPeople] = useState<Allievo[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listStaff()
      .then((items) => {
        if (live) setPeople(items);
      })
      .catch(() => {
        if (live) setPeople([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-2xl">{t("Guide")}</h2>
        <Link to="/nuova/$formKey" params={{ formKey: "scheda-istruttore" }} className="text-sm text-lagoon">
          {t("Apri una guida")}
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {(people ?? []).map((person) => (
          <li key={person.userId} className="rounded-card border border-line px-4 py-3">
            <p className="text-sm">
              {person.cognome} {person.nome}
            </p>
            <p className="mt-1 text-xs text-mist">{person.telefono || t("Telefono non indicato")}</p>
          </li>
        ))}
      </ul>
      {people && people.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessuna guida ancora. Dai il codice staff e registra la scheda.")}</p> : null}
      <button
        type="button"
        className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm"
        onClick={() => {
          void seedExamples()
            .then((result) => setNote(result.inserted ? "Ho inserito tre schede di esempio." : "Gli esempi ci sono già."))
            .catch((reason: unknown) => setNote(messaggioErrore(reason, "Esempi non creati.")));
        }}
      >
        {t("Inserisci esempi")}
      </button>
      {note ? <p className="mt-2 text-sm text-mist">{t(note)}</p> : null}
    </section>
  );
}

function LogoField() {
  const t = useT();
  const frame = useFondale();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = frame.club.id;

  async function save(logo: string) {
    if (id == null) return;
    setBusy(true);
    setNote(null);
    try {
      await setClubLogo({ data: { logo } });
      rememberLogo(id, logo || null);
      await frame.refresh();
      setNote(logo ? "Logo aggiornato." : "Logo rimosso.");
    } catch (reason) {
      setNote(messaggioErrore(reason, "Logo non salvato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line p-4">
      <p className="text-sm text-mist">{t("Logo del diving")}</p>
      <div className="mt-3 flex items-center gap-3">
        <ClubLogo
          id={id}
          hasLogo={frame.club.hasLogo}
          name={frame.club.nome}
          className="h-16 w-16 rounded-2xl bg-white object-contain"
        />
        {!frame.club.hasLogo ? <span className="text-sm text-mist">{t("Nessun logo")}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-lagoon px-4 text-sm font-medium">
          {busy ? t("Carico…") : t("Carica logo")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setNote(null);
              void prepareLogo(file)
                .then((logo) => save(logo))
                .catch((reason: unknown) => {
                  setNote(messaggioErrore(reason, "Immagine non valida."));
                  setBusy(false);
                });
            }}
          />
        </label>
        {frame.club.hasLogo ? (
          <button type="button" disabled={busy} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" onClick={() => void save("")}>
            {t("Rimuovi")}
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm text-brass">{t(note)}</p> : null}
    </div>
  );
}

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Input({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const t = useT();
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-mist">{t(label)}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
      />
      {hint ? <span className="mt-1 block text-xs text-mist">{t(hint)}</span> : null}
    </label>
  );
}
