import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, Navigation, Thermometer, Waves } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { DiveMap } from "@/components/dive-map";
import { cercaCosta, leggiMare, type GiornoMare, type LetturaMare, type LuogoCosta } from "@/lib/mare.functions";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/condizioni")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Condizioni />
    </AppFrame>
  );
}

function dataCorta(giorno: string): string {
  return new Date(`${giorno}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
}

function etichettaGiorno(giorno: string): string {
  const data = new Date(`${giorno}T12:00:00`);
  return data.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
}

function direzioneDa(gradi: number): string {
  const nomi = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const indice = Math.round((((gradi % 360) + 360) % 360) / 45) % 8;
  return nomi[indice];
}

function Condizioni() {
  const t = useT();
  const [testo, setTesto] = useState("");
  const [luoghi, setLuoghi] = useState<LuogoCosta[]>([]);
  const [nome, setNome] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [scelto, setScelto] = useState<string | null>(null);
  const [lettura, setLettura] = useState<LetturaMare | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);

  async function leggi(puntoLat: number, puntoLon: number, etichetta: string) {
    setNome(etichetta);
    setLat(puntoLat.toFixed(5));
    setLon(puntoLon.toFixed(5));
    setScelto(null);
    setAttesa(true);
    setErrore(null);
    setLuoghi([]);
    try {
      const esito = await leggiMare({ data: { lat: puntoLat, lon: puntoLon } });
      setLettura(esito);
      setScelto(esito.giorni[2]?.giorno ?? esito.giorni[0]?.giorno ?? null);
    } catch (reason) {
      setLettura(null);
      setErrore(messaggioErrore(reason, "Non riesco a leggere il mare adesso."));
    } finally {
      setAttesa(false);
    }
  }

  function scegliTesto() {
    const coordinate = testo.trim().match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (coordinate) {
      const puntoLat = Number(coordinate[1]);
      const puntoLon = Number(coordinate[2]);
      if (Math.abs(puntoLat) <= 90 && Math.abs(puntoLon) <= 180) {
        void leggi(puntoLat, puntoLon, t("Punto sulla mappa"));
        return;
      }
    }
    setAttesa(true);
    setErrore(null);
    void cercaCosta({ data: { q: testo.trim() } })
      .then((lista) => {
        setLuoghi(lista);
        if (!lista.length) setErrore(t("Nessun luogo trovato."));
      })
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Ricerca non riuscita.")))
      .finally(() => setAttesa(false));
  }

  const giorno = lettura?.giorni.find((voce) => voce.giorno === scelto) ?? null;

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/" className="text-sm text-lagoon">{t("Home")}</Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Condizioni marine")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Onde, acqua e trasparenza del punto che scegli.")}</p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          scegliTesto();
        }}
      >
        <input
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          placeholder={t("Spiaggia, città o coordinate")}
          className="min-h-12 flex-1 rounded-2xl border border-line bg-deep px-4 text-sm outline-none"
        />
        <button type="submit" className="min-h-12 rounded-full bg-lagoon px-4 text-sm font-medium text-ink">{t("Cerca")}</button>
      </form>

      {luoghi.length ? (
        <ul className="mt-3 grid gap-2">
          {luoghi.map((luogo) => (
            <li key={`${luogo.lat},${luogo.lon}`}>
              <button type="button" className="min-h-11 w-full rounded-xl border border-line px-3 text-left text-sm" onClick={() => void leggi(luogo.lat, luogo.lon, luogo.nome)}>
                {luogo.nome}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <DiveMap
          lat={lat}
          lng={lon}
          onPick={(puntoLat, puntoLon) => {
            void leggi(Number(puntoLat), Number(puntoLon), t("Punto sulla mappa"));
          }}
        />
      </div>

      {attesa ? <p className="mt-4 text-sm text-mist">{t("Leggo il mare…")}</p> : null}
      {errore ? <p className="mt-4 text-sm text-brass">{errore}</p> : null}

      {lettura && !lettura.copertura ? <p className="mt-4 text-sm text-mist">{t("Per questo tratto di costa non ci sono dati.")}</p> : null}

      {giorno && lettura?.copertura ? (
        <>
          <Testata giorno={giorno} nome={nome} />
          <div className="mt-3 grid grid-cols-7 gap-1">
            {lettura.giorni.map((voce) => {
              const attivo = voce.giorno === giorno.giorno;
              const migliore = voce.giorno === lettura.migliore && voce.punteggio != null;
              const colore = coloreVoto(voce.giudizio);
              return (
                <button
                  key={voce.giorno}
                  type="button"
                  onClick={() => setScelto(voce.giorno)}
                  className={`rounded-2xl border px-0.5 py-2 text-center transition ${attivo ? "-translate-y-0.5 border-lagoon bg-deep shadow-[0_12px_18px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.2)]" : "border-line bg-deep/40 shadow-[inset_0_2px_5px_rgba(0,0,0,0.28)]"}`}
                >
                  <span className="block text-[10px] uppercase text-mist">{etichettaGiorno(voce.giorno)}</span>
                  <span className={`mt-0.5 block text-sm font-medium ${colore}`}>{voce.punteggio ?? "—"}</span>
                  <span className={`mx-auto mt-1 block size-1.5 rounded-full ${migliore ? "bg-brass" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[11px] text-brass">{t("Il pallino segna il giorno migliore.")}</p>
          <Dettaglio giorno={giorno} />
        </>
      ) : null}

      <footer className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-mist">
        <p>Generated using E.U. Copernicus Marine Service Information</p>
        <p className="mt-1 break-words">
          {(lettura?.doi ?? ["10.48670/mds-00373", "10.48670/mds-00359", "10.48670/moi-00279", "10.48670/mds-00358"]).map((doi) => (
            <a key={doi} href={`https://doi.org/${doi}`} className="mr-2 text-lagoon">{doi}</a>
          ))}
        </p>
      </footer>
    </div>
  );
}

function coloreVoto(giudizio: GiornoMare["giudizio"]): string {
  if (giudizio === "calmo") return "text-foam";
  if (giudizio === "mosso") return "text-brass";
  if (giudizio === "molto") return "text-danger";
  return "text-mist";
}

function Testata({ giorno, nome }: { giorno: GiornoMare; nome: string }) {
  const t = useT();
  const colore = giorno.giudizio ? coloreVoto(giorno.giudizio) : "text-mist";
  const frase = giorno.giudizio === "calmo" ? t("Mare calmo") : giorno.giudizio === "mosso" ? t("Mare mosso") : giorno.giudizio === "molto" ? t("Mare molto mosso") : t("Dato mancante");
  const voto = giorno.punteggio ?? 0;
  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-deep px-4 py-5 shadow-[0_22px_40px_-24px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.14)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(94,234,212,0.18),transparent)]" />
      <div className="relative flex items-center gap-4">
        <div className="relative size-28 shrink-0 rounded-full bg-abyss shadow-[inset_0_8px_16px_rgba(0,0,0,0.45),0_8px_16px_-12px_rgba(0,0,0,0.8)]">
          <svg viewBox="0 0 36 36" className="size-28 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="14" fill="none" className="text-line" stroke="currentColor" strokeWidth="2.2" />
            <circle cx="18" cy="18" r="14" fill="none" className={colore} stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(6, Math.round(voto * 10))} 100`} style={{ filter: "drop-shadow(0 0 3px currentColor)" }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-display text-4xl leading-none ${colore}`}>{giorno.punteggio ?? "—"}</span>
          </div>
        </div>
        <div className="min-w-0">
          {nome ? <p className="truncate text-sm text-mist">{nome}</p> : null}
          <p className={`text-2xl leading-tight ${colore}`}>{frase}</p>
          <p className="mt-1 text-sm text-mist">{giorno.onda != null ? t("onda {m} m", { m: giorno.onda }) : t("onda non disponibile")}</p>
          {giorno.vista != null ? <p className="mt-2 font-display text-4xl leading-none text-lagoon drop-shadow-[0_6px_12px_rgba(94,234,212,0.35)]">~{giorno.vista} m</p> : null}
          <p className="mt-1 text-[11px] text-mist">{t("Stima: parte dal satellite e cambia con l'onda prevista. Non è ciò che vedi sott'acqua.")}</p>
        </div>
      </div>
    </section>
  );
}

function Dettaglio({ giorno }: { giorno: GiornoMare }) {
  const t = useT();
  const vista = giorno.vista != null ? `~${giorno.vista} m` : "—";
  const notaVista = giorno.secchi != null
    ? t("Satellite ~{m} m, {g}", { m: giorno.secchi, g: dataCorta(giorno.secchiDel ?? giorno.giorno) })
    : giorno.vista != null
      ? t("Stima sull'onda prevista")
      : t("Non disponibile qui");
  const onda = giorno.onda == null
    ? "—"
    : [
        t("{m} m", { m: giorno.onda }),
        giorno.periodo != null ? t("{s} s", { s: giorno.periodo }) : "",
        giorno.direzione != null ? direzioneDa(giorno.direzione) : "",
      ].filter(Boolean).join(" · ");
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Cella icona={Waves} titolo={t("Onda")} valore={onda} nota={t("massima del giorno")} />
        <Cella icona={Thermometer} titolo={t("Acqua")} valore={giorno.acqua != null ? `${giorno.acqua} °C` : "—"} />
        <Cella icona={Navigation} titolo={t("Corrente")} valore={giorno.corrente != null ? `${giorno.corrente} m/s` : "—"} />
        <Cella icona={Eye} titolo={t("Visibilità")} valore={vista} nota={notaVista} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist">{t("Nei giorni avanti è una stima, non una misura.")}</p>
    </>
  );
}

function Cella({ icona: Icon, titolo, valore, nota }: { icona: typeof Waves; titolo: string; valore: string; nota?: string }) {
  return (
    <article className="rounded-2xl border border-line bg-deep px-3 py-3 shadow-[0_14px_24px_-18px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="flex items-center gap-2 text-mist">
        <span className="flex size-7 items-center justify-center rounded-full bg-abyss shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)]">
          <Icon className="size-3.5 text-lagoon" strokeWidth={1.6} />
        </span>
        <h2 className="text-xs">{titolo}</h2>
      </div>
      <p className="mt-2 text-lg leading-tight">{valore}</p>
      {nota ? <p className="mt-1 text-[11px] text-mist">{nota}</p> : null}
    </article>
  );
}
