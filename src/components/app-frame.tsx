import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, BookOpen, ClipboardList, LogOut, Settings, Waves } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { avvisaScadenze } from "@/lib/avvisi-scadenza";
import { ClubLogo } from "@/components/club-logo";
import { Copyright } from "@/components/copyright";
import { MascheraPro } from "@/components/maschera-pro";
import { entroUnMese } from "@/lib/prezzi";
import { createProfile, getSessionContext, listScadenze, accettaInformativa, accettaAccordo, accettaResponsabilita, segnaPresenza, type SessionContext } from "@/lib/fondale.functions";
import { TESTO_RESPONSABILITA } from "@/lib/responsabilita";
import { TestoInformativa } from "@/components/informativa";
import { LegaliGate } from "@/components/legali-gate";
import { assicuratiChiaveMia, codiceFileGiaSpiegato, importaChiaveMia, segnaCodiceFileSpiegato } from "@/lib/cifrario";
import { ACCORDO } from "@/lib/accordo";
import { AL_GIORNO, curiositaDelGiorno, curiositaDiAvvio, letteOggi, salvaLette } from "@/lib/curiosita";
import {
  collegaPushProprietario,
  mostraAvviso,
  notificheTelefonoAttive,
} from "@/lib/push-client";
import { ROLE_LABEL, isStaff, type Role } from "@/lib/forms";
import { messaggioErrore, useLingua, useT } from "@/lib/i18n";
import { formatDay } from "@/lib/format";

type Frame = SessionContext & {
  email: string | null;
  refresh: () => Promise<void>;
  vista: "gestione" | "club";
  setVista: (vista: "gestione" | "club") => void;
  comeCliente: boolean;
  setComeCliente: (next: boolean) => void;
  desk: boolean;
  pronta: boolean;
};

const FondaleContext = createContext<Frame | null>(null);

export function useFondale(): Frame {
  const value = useContext(FondaleContext);
  if (!value) throw new Error("Contesto mancante");
  return value;
}

let cache: SessionContext | null = null;

export function clearFondaleCache() {
  cache = null;
}

function AccordoGate({ nome, onDone }: { nome: string; onDone: (next: SessionContext) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 pt-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-3xl leading-none">{t("Accordo con {nome}", { nome: nome || t("la scuola") })}</h1>
      <div className="mt-5 space-y-3 text-sm leading-relaxed text-mist">
        {ACCORDO.map((paragraph) => (
          <p key={paragraph}>{t(paragraph)}</p>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-brass">{t(error)}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="mt-6 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setError(null);
          void accettaAccordo()
            .then(onDone)
            .catch((reason: unknown) => {
              setError(messaggioErrore(reason, "Non salvato."));
              setBusy(false);
            });
        }}
      >
        {busy ? t("Salvo…") : t("Accetto per la scuola")}
      </button>
    </main>
  );
}

function ResponsabilitaGate({ onDone }: { onDone: (next: SessionContext) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 pt-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-3xl leading-none">{t("Responsabilità")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Al primo accesso, per usare Tritone, leggi e accetta.")}</p>
      <div className="mt-5 space-y-3 text-sm leading-relaxed">
        {TESTO_RESPONSABILITA.map((paragraph) => (
          <p key={paragraph}>{t(paragraph)}</p>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-brass">{t(error)}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="mt-6 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setError(null);
          void accettaResponsabilita()
            .then(onDone)
            .catch((reason: unknown) => {
              setError(messaggioErrore(reason, "Non salvato."));
              setBusy(false);
            });
        }}
      >
        {busy ? t("Salvo…") : t("Accetto")}
      </button>
      <button
        type="button"
        className="mt-3 min-h-11 w-full text-sm text-mist"
        onClick={() => {
          clearFondaleCache();
          void signOut();
        }}
      >
        {t("Esci")}
      </button>
    </main>
  );
}

function InformativaGate({ onDone }: { onDone: (next: SessionContext) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 pt-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-3xl leading-none">{t("Informativa")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Per usare Tritone serve accettarla. La versione è del 5 ottobre 2026.")}</p>
      <div className="mt-5">
        <TestoInformativa />
      </div>
      {error ? <p className="mt-4 text-sm text-brass">{t(error)}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="mt-6 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setError(null);
          void accettaInformativa()
            .then(onDone)
            .catch((reason: unknown) => {
              setError(messaggioErrore(reason, "Non salvato."));
              setBusy(false);
            });
        }}
      >
        {busy ? t("Salvo…") : t("Accetto")}
      </button>
      <button
        type="button"
        className="mt-3 min-h-11 w-full text-sm text-mist"
        onClick={() => {
          clearFondaleCache();
          void signOut();
        }}
      >
        {t("Esci")}
      </button>
    </main>
  );
}

function Splash({ label, children }: { label: string; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-abyss px-4 text-foam">
      <img src="/brand/mark.png?v=12" alt="" className="h-24 w-24 object-contain" />
      {label ? <p className="mt-6 text-sm text-mist">{t(label)}</p> : null}
      {children}
    </div>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  const t = useT();
  const { user, isPending } = useCurrentUserState();
  const current = useCurrentUser();
  const { setLingua } = useLingua();
  const [session, setSession] = useState<SessionContext | null>(cache);
  const [codiceVisto, setCodiceVisto] = useState(() => codiceFileGiaSpiegato());
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [vista, setVistaState] = useState<"gestione" | "club">("gestione");
  const [comeCliente, setComeClienteState] = useState(false);
  const [pronta, setPronta] = useState(false);
  const unreadRef = useRef<number | null>(null);
  const bucketRef = useRef<string | null>(null);

  function setVista(next: "gestione" | "club") {
    setVistaState(next);
    try {
      localStorage.setItem("diving-hub-vista", next);
    } catch {
      /* il telefono può bloccare la memoria locale */
    }
  }

  function setComeCliente(next: boolean) {
    setComeClienteState(next);
    try {
      localStorage.setItem("diving-hub-cliente", next ? "1" : "0");
    } catch {
      /* il telefono può bloccare la memoria locale */
    }
  }

  useEffect(() => {
    try {
      if (localStorage.getItem("diving-hub-vista") === "club") setVistaState("club");
      if (localStorage.getItem("diving-hub-cliente") === "1") setComeClienteState(true);
    } catch {
      /* ignora */
    }
    setPronta(true);
  }, []);

  useEffect(() => {
    if (session?.lingua === "en" || session?.lingua === "it") setLingua(session.lingua);
  }, [session?.lingua, setLingua]);

  async function refresh() {
    const next = await getSessionContext();
    cache = next;
    setSession(next);
  }

  useEffect(() => {
    if (!user) return;
    let live = true;
    const slow = window.setTimeout(() => {
      if (live) setError("Ci sta mettendo troppo. Controlla la rete e riprova.");
    }, 8000);
    getSessionContext()
      .then((next) => {
        if (!live) return;
        cache = next;
        setSession(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        const message = reason instanceof Error ? reason.message : "";
        if (message.toLowerCase().includes("unauthorized")) setSignedOut(true);
        else setError(messaggioErrore(reason, "Non riesco ad aprire il quaderno."));
      })
      .finally(() => window.clearTimeout(slow));
    return () => {
      live = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!session?.profile) return;
    if (!notificheTelefonoAttive()) return;
    void collegaPushProprietario(false).catch(() => undefined);
  }, [session?.profile?.userId]);

  useEffect(() => {
    if (!session?.profile) return;
    const beat = () => {
      void segnaPresenza().catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
      beat();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [session?.profile?.userId]);

  useEffect(() => {
    if (!session?.profile) return;
    const gestore = session.platform && !comeCliente && vista !== "club";
    const scuola = !comeCliente && (isStaff(session.profile.role) || (session.platform && vista === "club" && session.club.id != null)) && !gestore;
    const bucket = gestore ? "gestore" : scuola ? `scuola:${session.club.id ?? 0}` : "sub";
    const corrente = gestore ? session.unreadGestore : scuola ? session.unread : session.unreadSub;
    const testo = gestore ? session.avvisoGestore : scuola ? session.avviso : session.avvisoSub;
    const previous = unreadRef.current;
    const stesso = bucketRef.current === bucket;
    if (previous !== null && stesso && corrente > previous && notificheTelefonoAttive()) {
      void mostraAvviso(session.club.nome || "Tritone", t(testo || "Nuova scheda registrata."));
    }
    unreadRef.current = corrente;
    bucketRef.current = bucket;
  }, [session?.unread, session?.unreadGestore, session?.unreadSub, session?.profile?.role, session?.platform, session?.club.id, session?.club.nome, session?.avviso, session?.avvisoGestore, session?.avvisoSub, vista, comeCliente, t]);

  useEffect(() => {
    if (!session?.profile) return;
    let live = true;
    listScadenze()
      .then((items) => {
        if (live) return avvisaScadenze(items, session.oggi);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session?.profile?.userId, session?.oggi]);

  if (isPending && !session) return <Splash label="Apro Tritone…" />;
  if (!isPending && !user) return <RedirectToSignIn />;
  if (signedOut) return <RedirectToSignIn />;
  if (error) {
    return (
      <Splash label={error}>
        <button
          type="button"
          className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink"
          onClick={() => {
            setError(null);
            void refresh().catch(() => setError("Non riesco ad aprire il quaderno. Controlla la rete e riprova."));
          }}
        >
          {t("Riprova")}
        </button>
      </Splash>
    );
  }
  if (!session) return <Splash label="Apro Tritone…" />;

  if (!session.profile) {
    return (
      <Onboarding
        onDone={(next) => {
          cache = next;
          setSession(next);
        }}
      />
    );
  }

  if (session.sospesa) {
    return (
      <Splash label="Questa scuola è sospesa. Il gestore della piattaforma può riattivarla.">
        <button
          type="button"
          className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm"
          onClick={() => {
            clearFondaleCache();
            void signOut();
          }}
        >
          {t("Esci")}
        </button>
      </Splash>
    );
  }

  const frame: Frame = {
    ...session,
    email: current?.primaryEmail ?? null,
    refresh,
    vista,
    setVista,
    comeCliente,
    setComeCliente,
    desk: isStaff(session.profile?.role) || (session.platform && vista === "club" && session.club.id != null),
    pronta,
  };

  return (
    <FondaleContext.Provider value={frame}>
      {session.legaliOk ? (
        codiceVisto ? (
          <>
            <Shell>{children}</Shell>
            <Curiosita oggi={session.oggi} />
          </>
        ) : (
          <CodicePrimaVolta onFatto={() => setCodiceVisto(true)} />
        )
      ) : (
        <LegaliGate
          tipo={session.tipoLegale}
          onDone={(next) => {
            cache = next;
            setSession(next);
          }}
          onEsci={() => {
            clearFondaleCache();
            void signOut();
          }}
        />
      )}
    </FondaleContext.Provider>
  );
}

type NavTo = "/" | "/moduli" | "/archivio" | "/attrezzatura" | "/logbook" | "/personale" | "/smile" | "/uscite";

function Curiosita({ oggi }: { oggi: string }) {
  const t = useT();
  const note = curiositaDelGiorno(oggi);
  const [vista, setVista] = useState<number | null>(null);
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    if (!curiositaDiAvvio()) return;
    setVista(letteOggi(oggi));
    setAperta(true);
  }, [oggi]);

  if (vista === null || !aperta || vista >= note.length) return null;
  const nota = note[vista];
  const ultima = vista >= AL_GIORNO - 1;

  function segna(resta: boolean) {
    const next = vista! + 1;
    salvaLette(oggi, next);
    setVista(next);
    setAperta(resta && next < note.length);
  }

  return (
    <div className="no-print fixed inset-0 z-40 grid place-items-end bg-ink/50 p-4 sm:place-items-center" onClick={() => segna(false)}>
      <div
        role="dialog"
        aria-labelledby="curiosita-titolo"
        className="w-full max-w-md rounded-card border border-line bg-deep p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-widest text-brass">
          {t("Popup curiosità · {tema} · {n} di {totale}", { tema: t(nota.tema), n: vista + 1, totale: AL_GIORNO })}
        </p>
        <h2 id="curiosita-titolo" className="mt-2 text-3xl">{t("Prima di entrare in acqua")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-foam">{t(nota.testo)}</p>
        <div className="mt-5 grid gap-2">
          {ultima ? null : (
            <button type="button" className="min-h-11 w-full rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => segna(true)}>
              {t("Salta, un'altra")}
            </button>
          )}
          <button type="button" className="min-h-11 w-full rounded-full border border-line px-4 text-sm" onClick={() => { salvaLette(oggi, AL_GIORNO); setVista(AL_GIORNO); setAperta(false); }}>
            {ultima ? t("Per oggi basta") : t("Chiudi")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const frame = useFondale();
  const asClub = frame.desk && frame.platform;
  const comeCliente = (frame.owner || isStaff(frame.profile?.role) || frame.platform) && frame.comeCliente;
  const staff = (isStaff(frame.profile?.role) || asClub) && !comeCliente;
  const path = useRouterState({ select: (state) => state.location.pathname });
  const gate = typeof window !== "undefined" && hasGateSessionMarker();
  const suiModuli = path.startsWith("/moduli") || path.startsWith("/nuova") || path.startsWith("/scheda");
  const rigaProva = suiModuli ? "" : (frame.abbonamento.riga ? t(frame.abbonamento.riga) : "");

  const gestoreAttivo = frame.platform && !comeCliente && frame.vista !== "club";
  const conto = gestoreAttivo ? frame.unreadGestore : staff ? frame.unread : frame.unreadSub;

  const links: { to: NavTo; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; exact: boolean; also?: string[] }[] =
    comeCliente
      ? [
          { to: "/", label: "Home", icon: Waves, exact: true },
          { to: "/logbook", label: "Logbook", icon: BookOpen, exact: false },
          { to: "/moduli", label: "Moduli", icon: ClipboardList, exact: false, also: ["/nuova", "/scheda"] },
        ]
      : frame.platform && frame.vista !== "club"
        ? [{ to: "/", label: "Scuole", icon: Waves, exact: true }]
        : staff
          ? [
              { to: "/", label: "Home", icon: Waves, exact: true },
              { to: "/uscite", label: frame.club.mezzoNautico ? "Registro" : "Attività", icon: SmileMark, exact: false, also: ["/smile", "/archivio", "/attrezzatura"] },
              { to: "/moduli", label: "Moduli", icon: ClipboardList, exact: false, also: ["/nuova", "/scheda"] },
            ]
          : [
              { to: "/", label: "Home", icon: Waves, exact: true },
              { to: "/logbook", label: "Logbook", icon: BookOpen, exact: false },
              { to: "/moduli", label: "Moduli", icon: ClipboardList, exact: false, also: ["/nuova", "/scheda"] },
            ];

  return (
    <div className="min-h-dvh bg-transparent text-foam md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="no-print hidden border-r border-line bg-abyss/80 md:flex md:flex-col md:justify-between">
        <div>
          <div className="px-5 py-6">
            {frame.platform && !asClub ? (
              <p className="mt-3 text-xs text-mist">{t("Gestione scuole")}</p>
            ) : comeCliente || frame.profile?.role === "subacqueo" ? (
              <p className="mt-3 text-xs text-mist">{t("Subacqueo. Il diving lo scegli solo quando invii un modulo.")}</p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-xs text-mist">
                <ClubLogo id={frame.club.id} hasLogo={frame.club.hasLogo} name={frame.club.nome} className="h-8 w-8 rounded-lg bg-white object-contain" />
                <span className="min-w-0 truncate">{frame.club.nome || t("Scuole subacquee")}</span>
              </p>
            )}
          </div>
          {rigaProva ? <p className="px-5 pb-3 text-sm text-brass">{rigaProva}</p> : null}
          <nav className="flex flex-col gap-1 px-3">
            {links.map((link) => (
              <NavLink key={link.to} {...link} />
            ))}
          </nav>
        </div>
        <ProfileChip gate={gate} />
        <Copyright className="px-4 pb-4" />
      </aside>
      <div className="min-w-0">
        <BarraTipi />
        <RigaNome conto={conto} path={path} />
        <AvvisoRinnovo />
        <PrimaVolta />
        <main className="px-4 py-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-12">{children}{path === "/" ? <p className="mt-8 text-center text-[11px] leading-snug text-mist">Software registrato SIAE – Registro Pubblico Speciale per i programmi per elaboratore<br />TRITONE - LA VOCE DEL MARE · Numero di registrazione: D000030864 – 27/10/2026 · Numero progressivo: D000032389 · Pubblicazione: 07/10/2026</p> : null}<Copyright className={path === "/" ? "mt-3" : "mt-10"} /></main>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t-2 border-lagoon bg-deep px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] md:hidden">
        {rigaProva ? <p className="mx-auto mb-1 max-w-lg px-2 text-center text-xs text-brass">{rigaProva}</p> : null}
        <div className="mx-auto flex max-w-lg gap-1">
          {links.map((link) => {
            const active = link.exact
              ? path === link.to
              : path.startsWith(link.to) || (link.also ?? []).some((item) => path.startsWith(item));
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl ${active ? "bg-tide text-foam" : "text-foam"}`}
              >
                <Icon className="size-6 shrink-0" strokeWidth={1.75} />
                <span className="text-sm font-medium leading-tight">{t(link.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function PrimaVolta() {
  const t = useT();
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    try {
      setAperta(localStorage.getItem("diving-hub-prima") !== "1");
    } catch {
      setAperta(false);
    }
  }, []);

  if (!aperta) return null;

  function chiudi() {
    try {
      localStorage.setItem("diving-hub-prima", "1");
    } catch {
      /* il telefono può bloccare la memoria locale */
    }
    setAperta(false);
  }

  return (
    <div className="no-print border-b border-line bg-deep px-4 py-4">
      <p className="text-sm leading-relaxed text-foam">{t("Sei un subacqueo. Compili i moduli e scegli la scuola.")}</p>
      <p className="mt-1 text-sm leading-relaxed text-foam">{t("Se ti danno un codice, dal Profilo diventi staff o titolare.")}</p>
      <button type="button" className="mt-3 min-h-11 text-sm text-lagoon" onClick={chiudi}>
        {t("Ho capito")}
      </button>
    </div>
  );
}

function BarraTipi() {
  const t = useT();
  const frame = useFondale();
  const navigate = useNavigate();
  const asClub = frame.desk && frame.platform && frame.vista === "club";
  const comeCliente = (frame.owner || isStaff(frame.profile?.role) || frame.platform) && frame.comeCliente;
  const mostra = frame.platform || frame.owner || isStaff(frame.profile?.role);
  const gestoreAttivo = frame.platform && !comeCliente && frame.vista !== "club";
  const divingAttivo = !comeCliente && !gestoreAttivo && (frame.owner || isStaff(frame.profile?.role) || asClub);
  const latoDiving = frame.owner ? t("Titolare") : t("Staff");

  function apri(mode: "gestore" | "diving" | "sub") {
    if (mode === "gestore") {
      frame.setComeCliente(false);
      frame.setVista("gestione");
    } else if (mode === "diving") {
      frame.setComeCliente(false);
      frame.setVista("club");
    } else {
      frame.setComeCliente(true);
    }
    void navigate({ to: "/" });
  }

  if (!mostra) return null;

  return (
    <header className="no-print sticky top-0 z-20 bg-abyss/95 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
      <div className="flex w-full gap-1">
        {frame.platform ? (
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full px-3 text-sm ${gestoreAttivo ? "bg-brass font-medium text-ink" : "border border-line text-foam"}`}
            onClick={() => apri("gestore")}
          >
            {t("Gestore")}
          </button>
        ) : null}
        {frame.owner || isStaff(frame.profile?.role) || frame.platform ? (
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full px-3 text-sm ${divingAttivo ? "bg-brass font-medium text-ink" : "border border-line text-foam"}`}
            onClick={() => apri("diving")}
          >
            {frame.platform && !frame.owner && !isStaff(frame.profile?.role) ? t("Diving") : latoDiving}
          </button>
        ) : null}
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-full px-3 text-sm ${comeCliente ? "bg-brass font-medium text-ink" : "border border-line text-foam"}`}
          onClick={() => apri("sub")}
        >
          {t("Subacqueo")}
        </button>
      </div>
    </header>
  );
}

function AvvisoRinnovo() {
  const t = useT();
  const frame = useFondale();
  const [aperto, setAperto] = useState(false);
  const mostra = frame.owner && !frame.comeCliente && entroUnMese(frame.oggi, frame.club.attivoFino);
  useEffect(() => {
    if (!mostra) return;
    const chiave = `tritone-rinnovo-${frame.club.attivoFino}`;
    if (sessionStorage.getItem(chiave)) return;
    sessionStorage.setItem(chiave, "1");
    setAperto(true);
  }, [mostra, frame.club.attivoFino]);
  if (!aperto) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/70 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:place-items-center">
      <div className="w-full max-w-md rounded-2xl border border-brass bg-deep p-4">
        <h2 className="text-2xl">{t("Rinnova piano")}</h2>
        <p className="mt-2 text-sm text-mist">{t("Il piano annuale scade il {data}.", { data: formatDay(frame.club.attivoFino) })}</p>
        <div className="mt-4 flex gap-2">
          <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: "struttura" }} className="inline-flex min-h-11 items-center rounded-full bg-brass px-4 text-sm font-medium text-ink">
            {t("Rinnova piano")}
          </Link>
          <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setAperto(false)}>
            {t("Chiudi")}
          </button>
        </div>
      </div>
    </div>
  );
}

function NomeIntero({ nome, pro, argento }: { nome: string; pro?: boolean; argento?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [passo, setPasso] = useState(0);
  const misure = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"];
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const adatta = () => {
      const el = ref.current;
      const contenitore = box.current;
      if (!el || !contenitore) return;
      let scelto = misure.length - 1;
      for (let i = 0; i < misure.length; i += 1) {
        el.className = `whitespace-nowrap leading-none ${misure[i]}`;
        if (contenitore.scrollWidth <= contenitore.clientWidth + 1) {
          scelto = i;
          break;
        }
      }
      setPasso(scelto);
    };
    adatta();
    const osserva = new ResizeObserver(adatta);
    osserva.observe(node);
    return () => osserva.disconnect();
  }, [nome, pro]);
  return (
    <div ref={box} className="flex min-w-0 flex-1 items-center gap-1.5">
      <p ref={ref} className={`whitespace-nowrap leading-none ${misure[passo]}`}>{nome}</p>
      {pro ? <MascheraPro className="size-8" argento={argento} /> : null}
    </div>
  );
}

function RigaNome({ conto, path }: { conto: number; path: string }) {
  const t = useT();
  const frame = useFondale();
  const comeCliente = (frame.owner || isStaff(frame.profile?.role) || frame.platform) && frame.comeCliente;
  const nelDiving = !comeCliente && frame.vista === "club" && Boolean(frame.club.nome) && frame.profile?.role !== "subacqueo";
  const nome = nelDiving
    ? frame.club.nome
    : [frame.profile?.nome, frame.profile?.cognome].filter(Boolean).join(" ");

  return (
    <div className="no-print flex items-center justify-between gap-3 border-b border-line bg-deep px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {nelDiving ? (
          <ClubLogo id={frame.club.id} hasLogo={frame.club.hasLogo} name={frame.club.nome} className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain" />
        ) : null}
        <NomeIntero
          nome={nome}
          pro={!nelDiving && frame.abbonamento.proAperto}
          argento={frame.abbonamento.ruolo === "staff" && frame.profile?.pianoAbb !== "pro"}
        />
      </div>
      <div className="flex shrink-0 items-center">
        <Link
          to="/notifiche"
          aria-label={t("Avvisi")}
          className={`relative grid h-11 w-11 place-items-center ${path.startsWith("/notifiche") ? "text-brass" : "text-foam"}`}
        >
          <Bell className="size-5" strokeWidth={1.6} />
          {conto > 0 ? (
            <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-xs font-semibold text-brass">
              {conto > 9 ? "9+" : conto}
            </span>
          ) : null}
        </Link>
        <Link
          to="/profilo"
          aria-label={t("Profilo")}
          className={`grid h-11 w-11 place-items-center ${path.startsWith("/profilo") ? "text-brass" : "text-foam"}`}
        >
          <Settings className="size-5" strokeWidth={1.6} />
        </Link>
      </div>
    </div>
  );
}

function SmileMark({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-md bg-white ${className ?? "size-6"}`}>
      <img src="/brand/mark.png?v=11" alt="" className="h-4/5 w-4/5 object-contain" />
    </span>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  exact,
  also = [],
}: {
  to: NavTo;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  exact: boolean;
  also?: string[];
}) {
  const t = useT();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const active = exact ? path === to : path.startsWith(to) || also.some((item) => path.startsWith(item));
  return (
    <Link
      to={to}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base ${active ? "bg-tide text-foam" : "text-foam"}`}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
      {t(label)}
    </Link>
  );
}

function ProfileChip({ gate }: { gate: boolean }) {
  const t = useT();
  const frame = useFondale();
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-line px-4 py-4">
      <Link to="/profilo" className="block">
        <p className="text-sm">
          {frame.profile?.nome} {frame.profile?.cognome}
        </p>
        <p className="text-xs text-mist">{frame.profile ? t(ROLE_LABEL[frame.profile.role]) : ""}</p>
      </Link>
      {!gate ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 flex min-h-11 items-center gap-2 text-sm text-mist"
          onClick={() => {
            setBusy(true);
            clearFondaleCache();
            signOut().catch(() => setBusy(false));
          }}
        >
          <LogOut className="size-4" />
          {busy ? t("Esco…") : t("Esci")}
        </button>
      ) : null}
    </div>
  );
}

function Onboarding({ onDone }: { onDone: (next: SessionContext) => void }) {
  const t = useT();
  const [role, setRole] = useState<Role>("subacqueo");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [codice, setCodice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const versioni = [
    { id: "subacqueo" as const, title: "Subacqueo", text: "Nessun codice. Invii i moduli al diving che scegli." },
  ];

  return (
    <div className="min-h-dvh bg-abyss px-4 py-8 text-foam">
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl">{t("Chi sei")}</h1>
        <ol className="mt-3 space-y-1 text-sm text-mist">
          <li>{t("1. Subacqueo: nessun codice. Scegli il diving quando invii un modulo.")}</li>
          <li>{t("2. Il diving si chiede dopo, dal profilo. Il gestore riceve la notifica e l'anagrafica.")}</li>
          <li>{t("3. Staff: un solo codice, quello del titolare. Vedi il registro, nient'altro.")}</li>
          <li>{t("4. Gestore: solo chi vende l'app. Vede le scuole, non i loro moduli.")}</li>
        </ol>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            createProfile({
              data: { nome, cognome, telefono, role, nomeScuola: "", sede: "", codice },
            })
              .then(onDone)
              .catch((reason: unknown) => {
                setError(messaggioErrore(reason, "Non riesco a salvare il profilo."));
                setBusy(false);
              });
          }}
        >
          <div className="grid gap-2">
            {versioni.map((item) => (
              <label
                key={item.id}
                className={`block cursor-pointer rounded-2xl border px-4 py-3 ${role === item.id ? "border-brass bg-surface" : "border-line"}`}
              >
                <span className="flex items-start gap-3">
                  <input type="radio" name="ruolo" className="mt-1" checked={role === item.id} onChange={() => setRole(item.id)} />
                  <span>
                    <span className="block text-sm font-medium">{t(item.title)}</span>
                    <span className="block text-sm text-mist">{t(item.text)}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          {role === "istruttore" ? (
            <p className="text-sm text-mist">
              {t("Entri come istruttore o guida di un diving già aperto. Vedi il registro di quella scuola, non l'area del gestore e non i dati riservati del titolare.")}
            </p>
          ) : null}
          {role === "piattaforma" ? <p className="text-sm text-mist">{t("Accesso del gestore: vedi le scuole affiliate, non i loro moduli.")}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" value={nome} onChange={setNome} />
            <Field label="Cognome" value={cognome} onChange={setCognome} />
          </div>
          <Field label="Telefono" value={telefono} onChange={setTelefono} />
          {role === "istruttore" ? (
            <Field label="Codice staff" value={codice} onChange={setCodice} hint="Te lo dà il titolare. Non è il codice del gestore." />
          ) : null}
          {role === "piattaforma" ? (
            <Field label="Codice gestore" value={codice} onChange={setCodice} hint="Solo chi vende e gestisce l'app." />
          ) : null}
          {error ? <p className="text-sm text-brass">{t(error)}</p> : null}
          <button type="submit" disabled={busy} className="min-h-11 w-full rounded-full bg-lagoon px-4 font-medium text-foam disabled:opacity-60">
            {busy ? t("Salvo…") : t("Entra")}
          </button>
        </form>
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <button type="button" className="text-mist underline-offset-4 hover:underline" onClick={() => setRole("istruttore")}>
            {t("Sono già staff di una scuola")}
          </button>
          <button type="button" className="text-mist underline-offset-4 hover:underline" onClick={() => setRole("piattaforma")}>
            {t("Accesso gestore")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
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
        className="min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass"
      />
      {hint ? <span className="mt-1 block text-xs text-mist">{t(hint)}</span> : null}
    </label>
  );
}

function CodicePrimaVolta({ onFatto }: { onFatto: () => void }) {
  const t = useT();
  const [codice, setCodice] = useState("");
  const [presa, setPresa] = useState("");
  const [altro, setAltro] = useState(false);
  const [copiata, setCopiata] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function crea() {
    setNote(null);
    const pair = await assicuratiChiaveMia();
    setCodice(JSON.stringify({ pubblica: pair.pubblica, privata: pair.privata }));
    setCopiata(false);
    setAltro(false);
  }

  function chiudi() {
    segnaCodiceFileSpiegato();
    onFatto();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <p className="text-xs uppercase tracking-widest text-lagoon">{t("Solo questa volta")}</p>
      <h1 className="mt-2 text-3xl leading-none">{t("Salva il codice di crittografia")}</h1>
      <p className="mt-4 text-sm leading-relaxed text-mist">
        {t("Chiude su questo telefono brevetti, certificato medico e assicurazione. Se cambi telefono, senza questo codice quei file non si riaprono. Le scadenze restano visibili lo stesso. Dopo questa schermata non compare più: lo copi quando vuoi da Profilo, Impostazioni.")}
      </p>
      {altro ? (
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              importaChiaveMia(presa.trim());
              chiudi();
            } catch {
              setNote("Codice non valido.");
            }
          }}
        >
          <p className="text-sm text-mist">{t("Incolla il codice salvato sull'altro telefono. Non crearne uno nuovo, altrimenti i file vecchi restano chiusi.")}</p>
          <textarea value={presa} onChange={(event) => setPresa(event.target.value)} className="min-h-28 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" />
          <button type="submit" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
            {t("Usa questo codice")}
          </button>
        </form>
      ) : codice ? (
        <div className="mt-6 space-y-3">
          <textarea readOnly value={codice} className="min-h-28 w-full rounded-xl border border-line bg-abyss px-3 py-2 text-xs" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink"
              onClick={() => {
                void navigator.clipboard.writeText(codice).then(
                  () => {
                    setCopiata(true);
                    setNote("Codice copiato. Mettilo al sicuro, poi continua.");
                  },
                  () => setNote("Seleziona il codice e copialo a mano."),
                );
              }}
            >
              {t("Copia il codice")}
            </button>
            <button type="button" disabled={!copiata} onClick={chiudi} className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-40">
              {t("Ho salvato il codice")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void crea()} className="mt-6 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
          {t("Crea il codice di questo telefono")}
        </button>
      )}
      {!altro ? (
        <button type="button" className="mt-4 text-left text-sm text-mist underline-offset-4 hover:underline" onClick={() => setAltro(true)}>
          {t("Ho già un codice, è un telefono nuovo")}
        </button>
      ) : null}
      {note ? <p className="mt-3 text-sm text-brass">{t(note)}</p> : null}
    </main>
  );
}
