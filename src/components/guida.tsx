import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ClipboardList, Waves } from "lucide-react";
import { accettaGuida, type SessionContext } from "@/lib/fondale.functions";
import { isStaff } from "@/lib/forms";
import { messaggioErrore, useT } from "@/lib/i18n";

type Passo = { titolo: string; testo: string; scena: Scena; tocchi: string[] };
type Scena = "home" | "logbook" | "moduli" | "registro" | "scuole" | "codice";
type Ruolo = "gestore" | "banco" | "sub";

function ruoloDi(session: SessionContext, vista: "gestione" | "club"): Ruolo {
  if (session.platform && vista !== "club") return "gestore";
  if (isStaff(session.profile?.role) || session.platform) return "banco";
  return "sub";
}

function passiGuida(ruolo: Ruolo): Passo[] {
  if (ruolo === "gestore") {
    return [
      { titolo: "Le scuole", testo: "Questa è la gestione. Vedi le scuole che usano Tritone.", scena: "scuole", tocchi: ["lista"] },
      { titolo: "Le richieste", testo: "In cima trovi le richieste di affiliazione. Da lì accetti un nuovo diving.", scena: "scuole", tocchi: ["richiesta"] },
      { titolo: "Una scuola", testo: "Apri una scuola per vedere titolare, staff e per sospenderla se serve.", scena: "scuole", tocchi: ["scuola"] },
      { titolo: "Il codice dei file", testo: "Subito dopo questa guida, una volta sola, compare il codice che cifra brevetto, certificato e assicurazione. Salvalo. Su un telefono nuovo, senza quel codice, i file non si riaprono. Poi lo ritrovi solo in Profilo, Impostazioni.", scena: "codice", tocchi: ["copia"] },
      { titolo: "Cambia vista", testo: "In alto passi a Titolare o a Subacqueo. Profilo tiene i tuoi dati.", scena: "scuole", tocchi: ["titolare", "sub", "profilo"] },
    ];
  }
  if (ruolo === "banco") {
    return [
      { titolo: "La barra in basso", testo: "Home, Registro e Moduli. È così che ti sposti nella scuola.", scena: "home", tocchi: ["nav-home", "nav-registro", "nav-moduli"] },
      { titolo: "Home", testo: "Qui vedi cosa c'è da leggere e l'uscita del giorno ancora aperta.", scena: "home", tocchi: ["uscita", "leggere"] },
      { titolo: "Registro", testo: "Verifichi i brevetti, chiudi l'uscita e ritrovi il PDF della giornata.", scena: "registro", tocchi: ["chiudi"] },
      { titolo: "Moduli", testo: "Qui arrivano le schede inviate dai subacquei.", scena: "moduli", tocchi: ["scheda"] },
      { titolo: "Il codice dei file", testo: "Subito dopo questa guida, una volta sola, compare il codice che cifra brevetto, certificato e assicurazione. Salvalo. Su un telefono nuovo, senza quel codice, i file non si riaprono. Poi lo ritrovi solo in Profilo, Impostazioni.", scena: "codice", tocchi: ["copia"] },
      { titolo: "Subacqueo", testo: "In alto passi a Subacqueo: lì ci sono logbook e documenti tuoi.", scena: "home", tocchi: ["sub", "profilo"] },
    ];
  }
  return [
    { titolo: "La barra in basso", testo: "Home, Logbook e Moduli. È così che ti sposti.", scena: "home", tocchi: ["nav-home", "nav-logbook", "nav-moduli"] },
    { titolo: "Home", testo: "Le scadenze e gli strumenti. Ogni riquadro apre la sua pagina.", scena: "home", tocchi: ["scadenza", "strumento"] },
    { titolo: "Logbook", testo: "Il diario delle immersioni. Tocca per aprirla.", scena: "logbook", tocchi: ["immersione"] },
    { titolo: "Moduli", testo: "Li compili e scegli a quale scuola inviarli.", scena: "moduli", tocchi: ["scuola", "invia"] },
    { titolo: "Il codice dei file", testo: "Subito dopo questa guida, una volta sola, compare il codice che cifra brevetto, certificato e assicurazione. Salvalo. Su un telefono nuovo, senza quel codice, i file non si riaprono. Poi lo ritrovi solo in Profilo, Impostazioni.", scena: "codice", tocchi: ["copia"] },
    { titolo: "Profilo", testo: "In alto a destra: i tuoi dati, la foto e la modalità chiara.", scena: "home", tocchi: ["profilo"] },
  ];
}

export function GuidaGate({ session, vista, onDone }: { session: SessionContext; vista: "gestione" | "club"; onDone: (next: SessionContext) => void }) {
  const t = useT();
  const ruolo = ruoloDi(session, vista);
  const passi = passiGuida(ruolo);
  const [indice, setIndice] = useState(0);
  const [tocco, setTocco] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passo = passi[indice] ?? passi[0];
  const ultimo = indice >= passi.length - 1;
  const attivo = passo.tocchi[tocco % passo.tocchi.length] ?? "";

  useEffect(() => {
    setTocco(0);
    const timer = window.setInterval(() => setTocco((value) => value + 1), 1100);
    return () => window.clearInterval(timer);
  }, [indice]);

  function fine() {
    setBusy(true);
    setError(null);
    void accettaGuida()
      .then(onDone)
      .catch((reason: unknown) => {
        setError(messaggioErrore(reason, "Non salvato."));
        setBusy(false);
      });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <style>{`
        @keyframes guida-tap {
          0% { transform: scale(0.7); opacity: 0.85; }
          70% { transform: scale(1.35); opacity: 0; }
          100% { opacity: 0; }
        }
        .guida-tap {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 2.75rem;
          height: 2.75rem;
          margin: -1.375rem 0 0 -1.375rem;
          border-radius: 999px;
          border: 2px solid #5eead4;
          background: rgb(94 234 212 / 0.28);
          pointer-events: none;
          animation: guida-tap 1.1s ease-out infinite;
        }
      `}</style>
      <p className="text-xs uppercase tracking-widest text-brass">
        {t("Guida · {n} di {totale}", { n: indice + 1, totale: passi.length })}
      </p>
      <div className="mt-3 min-h-0 flex-1">
        <Telefono ruolo={ruolo} scena={passo.scena} attivo={attivo} nome={session.club.nome || t("Mare Blu")} />
      </div>
      <h1 className="mt-4 text-2xl leading-none">{t(passo.titolo)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-mist">{t(passo.testo)}</p>
      {error ? <p className="mt-2 text-sm text-brass">{t(error)}</p> : null}
      <div className="pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {ultimo ? (
          <button type="button" disabled={busy} onClick={fine} className="min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60">
            {busy ? t("Salvo…") : t("Fine guida")}
          </button>
        ) : (
          <button type="button" onClick={() => setIndice((value) => value + 1)} className="min-h-12 w-full rounded-full bg-lagoon font-medium">
            {t("Avanti")}
          </button>
        )}
      </div>
    </main>
  );
}

function Telefono({ ruolo, scena, attivo, nome }: { ruolo: Ruolo; scena: Scena; attivo: string; nome: string }) {
  const t = useT();
  const voci = ruolo === "gestore" ? ["Scuole"] : ruolo === "banco" ? ["Home", "Registro", "Moduli"] : ["Home", "Logbook", "Moduli"];
  const voceAttiva = scena === "logbook" ? "Logbook" : scena === "registro" ? "Registro" : scena === "moduli" ? "Moduli" : voci[0];
  return (
    <div className="mx-auto flex h-[min(58dvh,28rem)] max-w-sm flex-col overflow-hidden rounded-[1.6rem] border border-line bg-abyss shadow-xl">
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        {ruolo !== "sub" ? (
          <span className="mr-auto flex gap-1">
            {ruolo === "gestore" ? <Pill id="gestore" attivo={attivo} on={false}>{t("Gestore")}</Pill> : null}
            <Pill id="titolare" attivo={attivo} on={ruolo === "banco"}>{t("Titolare")}</Pill>
            <Pill id="sub" attivo={attivo} on={false}>{t("Subacqueo")}</Pill>
          </span>
        ) : null}
        <Pill id="profilo" attivo={attivo} on={attivo === "profilo"}>{t("Profilo")}</Pill>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3">
        {scena === "home" && ruolo === "sub" ? <HomeSub attivo={attivo} /> : null}
        {scena === "home" && ruolo === "banco" ? <HomeBanco attivo={attivo} nome={nome} /> : null}
        {scena === "logbook" ? <SchermoLog attivo={attivo} /> : null}
        {scena === "moduli" ? <SchermoModuli attivo={attivo} banco={ruolo === "banco"} /> : null}
        {scena === "registro" ? <SchermoRegistro attivo={attivo} /> : null}
        {scena === "scuole" ? <SchermoScuole attivo={attivo} nome={nome} /> : null}
        {scena === "codice" ? <SchermoCodice attivo={attivo} /> : null}
      </div>
      <div className="grid border-t-2 border-lagoon bg-deep px-1 py-1" style={{ gridTemplateColumns: `repeat(${voci.length}, minmax(0, 1fr))` }}>
        {voci.map((voce) => {
          const id = `nav-${voce.toLowerCase()}`;
          const Icon = voce === "Logbook" ? BookOpen : voce === "Moduli" || voce === "Registro" ? ClipboardList : Waves;
          return (
            <Tocco key={voce} on={attivo === id} className="w-full">
              <span className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] ${voce === voceAttiva ? "bg-tide" : ""}`}>
                <Icon className="size-4" strokeWidth={1.75} />
                {t(voce)}
              </span>
            </Tocco>
          );
        })}
      </div>
    </div>
  );
}

function HomeSub({ attivo }: { attivo: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-2xl leading-none">Marco</p>
      <p className="mt-1 text-[11px] text-mist">{t("Subacqueo")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="aspect-square rounded-2xl bg-surface" />
        <div className="flex aspect-square items-end rounded-2xl bg-surface p-2 text-sm">18 m</div>
      </div>
      <p className="mt-3 text-xs text-mist">{t("Scadenze")}</p>
      <Tocco on={attivo === "scadenza"} className="mt-1 w-full">
        <span className="block w-full rounded-xl border border-line px-2 py-2 text-xs">{t("Certificato medico · ok")}</span>
      </Tocco>
      <div className="mt-2 flex gap-1">
        <Tocco on={attivo === "strumento"}>
          <span className="rounded-full bg-lagoon px-3 py-1 text-[11px] text-ink">{t("Specie")}</span>
        </Tocco>
        <span className="rounded-full border border-line px-3 py-1 text-[11px]">{t("Checklist")}</span>
      </div>
    </div>
  );
}

function HomeBanco({ attivo, nome }: { attivo: string; nome: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-[11px] text-brass">{t("Titolare")}</p>
      <p className="text-2xl leading-none">{nome}</p>
      <Tocco on={attivo === "uscita"} className="mt-3 w-full">
        <span className="block w-full rounded-xl border border-brass bg-amber px-2 py-2 text-xs text-brass">{t("Oggi · da chiudere")}</span>
      </Tocco>
      <Tocco on={attivo === "leggere"} className="mt-3 w-full">
        <span className="block w-full text-xl text-brass">{t("2 moduli da leggere")}</span>
      </Tocco>
      <span className="mt-2 block rounded-xl border border-line bg-surface px-2 py-2 text-xs">{t("Giulia Rossi · questionario")}</span>
    </div>
  );
}

function SchermoLog({ attivo }: { attivo: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-2xl leading-none">{t("Logbook")}</p>
      <Tocco on={attivo === "immersione"} className="mt-3 w-full">
        <span className="block w-full rounded-xl border border-line bg-surface px-2 py-2">
          <span className="block text-sm">Passetto</span>
          <span className="text-[11px] text-mist">18 m · 42 min</span>
        </span>
      </Tocco>
      <span className="mt-2 block rounded-xl border border-line px-2 py-2 text-sm text-mist">{t("Scogliera · 12 m")}</span>
    </div>
  );
}

function SchermoModuli({ attivo, banco }: { attivo: string; banco: boolean }) {
  const t = useT();
  if (banco) {
    return (
      <div>
        <p className="text-2xl leading-none">{t("Moduli")}</p>
        <Tocco on={attivo === "scheda"} className="mt-3 w-full">
          <span className="block w-full rounded-xl border border-brass bg-surface px-2 py-2 text-sm">{t("Giulia Rossi · da leggere")}</span>
        </Tocco>
      </div>
    );
  }
  return (
    <div>
      <p className="text-2xl leading-none">{t("Questionario")}</p>
      <p className="mt-2 text-[11px] text-mist">{t("Scuola")}</p>
      <Tocco on={attivo === "scuola"} className="mt-1 w-full">
        <span className="block w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm">{t("Mare Blu")}</span>
      </Tocco>
      <Tocco on={attivo === "invia"} className="mt-4 w-full">
        <span className="block w-full rounded-full bg-lagoon py-2 text-center text-sm text-ink">{t("Invia allo staff")}</span>
      </Tocco>
    </div>
  );
}

function SchermoRegistro({ attivo }: { attivo: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-2xl leading-none">{t("Uscita di oggi")}</p>
      <p className="mt-2 text-xs text-mist">{t("Brevetti verificati")}</p>
      <Tocco on={attivo === "chiudi"} className="mt-4 w-full">
        <span className="block w-full rounded-full bg-lagoon py-2 text-center text-sm text-ink">{t("Chiudi e crea il PDF")}</span>
      </Tocco>
    </div>
  );
}

function SchermoCodice({ attivo }: { attivo: string }) {
  const t = useT();
  return (
    <div>
      <p className="text-2xl leading-none">{t("Brevetti")}</p>
      <div className="mt-3 rounded-xl border border-brass bg-amber px-2 py-2">
        <p className="text-xs text-brass">{t("Salva questo codice. Su un telefono nuovo riapre i file.")}</p>
        <Tocco on={attivo === "copia"} className="mt-2">
          <span className="rounded-full bg-lagoon px-3 py-1 text-[11px] text-ink">{t("Copia il codice")}</span>
        </Tocco>
      </div>
    </div>
  );
}

function SchermoScuole({ attivo, nome }: { attivo: string; nome: string }) {
  const t = useT();
  return (
    <div>
      <Tocco on={attivo === "richiesta"} className="w-full">
        <span className="block w-full rounded-xl border border-brass bg-amber px-2 py-2 text-xs text-brass">{t("1 richiesta di affiliazione")}</span>
      </Tocco>
      <Tocco on={attivo === "lista" || attivo === "scuola"} className="mt-3 w-full">
        <span className="block w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm">{nome}</span>
      </Tocco>
      <span className="mt-2 block rounded-xl border border-line px-2 py-2 text-sm text-mist">{t("Blu Profondo")}</span>
    </div>
  );
}

function Pill({ id, attivo, on, children }: { id: string; attivo: string; on: boolean; children: ReactNode }) {
  return (
    <Tocco on={attivo === id}>
      <span className={`rounded-full px-2.5 py-1 text-[11px] ${on || attivo === id ? "bg-lagoon text-ink" : "border border-line"}`}>{children}</span>
    </Tocco>
  );
}

function Tocco({ on, children, className = "" }: { on: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      {children}
      {on ? <span className="guida-tap" key="tap" /> : null}
    </span>
  );
}
