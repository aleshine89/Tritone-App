import { useEffect, useState, type ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, Navigation, Thermometer, Waves } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { DiveMap } from "@/components/dive-map";
import { cercaCosta, contestoMare, leggiMare, type ContestoMare, type GiornoMare, type LetturaMare, type LuogoCosta } from "@/lib/mare.functions";
import { messaggioErrore, useT } from "@/lib/i18n";
import { faseLuna, fraseMuta, luna, sole } from "@/lib/sole";

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

function versoParole(gradi: number): string {
  const nomi = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"];
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
  const [contesto, setContesto] = useState<ContestoMare | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);

  async function leggi(puntoLat: number, puntoLon: number, etichetta: string, giornoPreferito?: string) {
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
      const trovato = giornoPreferito && esito.giorni.some((voce) => voce.giorno === giornoPreferito);
      setScelto(trovato ? giornoPreferito : esito.giorni[2]?.giorno ?? esito.giorni[0]?.giorno ?? null);
    } catch (reason) {
      setLettura(null);
      setErrore(messaggioErrore(reason, "Non riesco a leggere il mare adesso."));
    } finally {
      setAttesa(false);
    }
  }

  useEffect(() => {
    let live = true;
    void contestoMare()
      .then(async (ctx) => {
        if (!live) return;
        setContesto(ctx);
        if (!ctx.luogo) return;
        const lista = await cercaCosta({ data: { q: ctx.luogo } });
        if (!live || !lista[0]) return;
        await leggi(lista[0].lat, lista[0].lon, lista[0].nome, ctx.giorno);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Una volta, all'apertura: se c'è un'uscita o un viaggio, il mare si apre lì.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="mt-4 flex items-center gap-1 rounded-full border border-line bg-deep p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_30px_-24px_rgba(0,0,0,0.9)]"
        onSubmit={(event) => {
          event.preventDefault();
          scegliTesto();
        }}
      >
        <input
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          placeholder={t("Spiaggia, città o coordinate")}
          className="min-h-11 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-mist"
        />
        <button type="submit" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink">{t("Cerca")}</button>
      </form>

      {luoghi.length ? (
        <ul className="mt-3 grid gap-2">
          {luoghi.map((luogo) => (
            <li key={`${luogo.lat},${luogo.lon}`}>
              <button type="button" className="min-h-11 w-full rounded-2xl border border-line bg-deep px-3 text-left text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition active:border-lagoon" onClick={() => void leggi(luogo.lat, luogo.lon, luogo.nome)}>
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

      {attesa ? <AttesaSatellite /> : null}
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
              const altezza = voce.punteggio == null ? 8 : Math.max(12, Math.round(voce.punteggio * 10));
              return (
                <button
                  key={voce.giorno}
                  type="button"
                  onClick={() => setScelto(voce.giorno)}
                  className={`rounded-2xl border px-0.5 py-2 text-center transition duration-200 ${attivo ? "-translate-y-1 border-lagoon bg-deep shadow-[0_16px_24px_-16px_rgba(94,234,212,0.7),inset_0_1px_0_rgba(255,255,255,0.2)]" : "border-line bg-deep/50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"}`}
                >
                  <span className="block text-[10px] uppercase tracking-wide text-mist">{etichettaGiorno(voce.giorno)}</span>
                  <span className={`mt-0.5 block font-display text-sm leading-none ${colore}`}>{voce.punteggio ?? "—"}</span>
                  <span className="mx-auto mt-1 flex h-8 w-1.5 items-end overflow-hidden rounded-full bg-abyss">
                    <span className={`block w-full rounded-full ${voce.giudizio === "no" ? "bg-danger" : voce.giudizio === "limite" ? "bg-brass" : "bg-lagoon"}`} style={{ height: `${altezza}%` }} />
                  </span>
                  <span className={`mx-auto mt-1 block size-1.5 rounded-full ${migliore ? "bg-brass shadow-[0_0_8px_#e8b86d]" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[11px] text-brass">{t("Il pallino segna il giorno migliore.")}</p>
          <Dettaglio giorno={giorno} />
          <Memoria lettura={lettura} />
          <Cielo lat={lat} lon={lon} giorno={giorno} />
          <FraseTua giorno={giorno} contesto={contesto} />
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
  if (giudizio === "entra") return "text-foam";
  if (giudizio === "limite") return "text-brass";
  if (giudizio === "no") return "text-danger";
  return "text-mist";
}

function Testata({ giorno, nome }: { giorno: GiornoMare; nome: string }) {
  const t = useT();
  const colore = giorno.giudizio ? coloreVoto(giorno.giudizio) : "text-mist";
  const frase = giorno.giudizio === "entra" ? t("Si entra") : giorno.giudizio === "limite" ? t("Al limite") : giorno.giudizio === "no" ? t("Meglio no") : t("Dato mancante");
  const voto = giorno.punteggio ?? 0;
  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] border border-lagoon/30 bg-deep px-4 py-5 shadow-[0_24px_40px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_15%_0%,rgba(94,234,212,0.16),transparent_55%),radial-gradient(70%_60%_at_100%_100%,rgba(232,184,109,0.08),transparent_50%)]" />
      <OndaSfondo metri={giorno.onda} />
      <div className="relative flex items-center gap-4">
        <div className="relative size-32 shrink-0">
          <div className="absolute inset-2 rounded-full bg-abyss shadow-[inset_0_10px_18px_rgba(0,0,0,0.55),0_0_24px_rgba(94,234,212,0.18)]" />
          <svg viewBox="0 0 36 36" className="relative size-32 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" className="text-line" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="18" cy="18" r="15" fill="none" className={colore} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(6, Math.round(voto * 10))} 100`} style={{ filter: "drop-shadow(0 0 4px currentColor)" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-display text-4xl leading-none ${colore}`}>{giorno.punteggio ?? "—"}</span>
          </div>
        </div>
        <div className="min-w-0">
          {nome ? <p className="truncate text-xs uppercase tracking-[0.16em] text-lagoon">{nome}</p> : null}
          <p className={`mt-1 text-2xl leading-tight ${colore}`}>{frase}</p>
          <p className="mt-1 text-[11px] leading-snug text-mist">{t("Il voto mette insieme onda, corrente e visibilità. Non è un via libera.")}</p>
          {giorno.vista != null ? <p className="mt-2 font-display text-4xl leading-none text-lagoon drop-shadow-[0_0_16px_rgba(94,234,212,0.45)]">~{giorno.vista} m</p> : null}
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
  const notaOnda = giorno.mare === "lunga" ? t("Onda lunga: il mare respira.") : giorno.mare === "corto" ? t("Mare corto: è più rotto.") : t("massima del giorno");
  const notaAcqua = [
    giorno.acqua18 != null ? t("a 18 m {g} °C", { g: giorno.acqua18 }) : "",
    giorno.acqua40 != null ? t("a 40 m {g} °C", { g: giorno.acqua40 }) : "",
  ].filter(Boolean).join(" · ");
  const corrente = giorno.corrente == null
    ? "—"
    : [t("{v} m/s", { v: giorno.corrente }), giorno.correnteVerso != null ? direzioneDa(giorno.correnteVerso) : ""].filter(Boolean).join(" · ");
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Cella icona={Waves} titolo={t("Onda")} valore={onda} nota={notaOnda}>
          <OndaLinea metri={giorno.onda} />
        </Cella>
        <Cella icona={Thermometer} titolo={t("Acqua")} valore={giorno.acqua != null ? `${giorno.acqua} °C` : "—"} nota={[t("in superficie"), notaAcqua].filter(Boolean).join(" · ")}>
          <ColonnaAcqua superficie={giorno.acqua} metri18={giorno.acqua18} metri40={giorno.acqua40} />
        </Cella>
        <Cella icona={Navigation} titolo={t("Corrente")} valore={corrente} nota={giorno.correnteVerso != null ? t("dove va l'acqua") : undefined}>
          <Bussola gradi={giorno.correnteVerso} />
        </Cella>
        <Cella icona={Eye} titolo={t("Visibilità")} valore={vista} nota={notaVista}>
          <BarraVista metri={giorno.vista} />
        </Cella>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist">{t("Nei giorni avanti è una stima, non una misura.")}</p>
    </>
  );
}

function Memoria({ lettura }: { lettura: LetturaMare }) {
  const t = useT();
  if (lettura.memoriaN > 0 && lettura.memoriaMedia != null) {
    return <p className="mt-3 text-sm text-foam">{t("Le tue immersioni qui, media {m} m su {n}, correggono la stima.", { m: lettura.memoriaMedia, n: lettura.memoriaN })}</p>;
  }
  return <p className="mt-3 text-[11px] leading-relaxed text-mist">{t("Se nel logbook segni visibilità e punto, la stima successiva qui ne tiene conto.")}</p>;
}

function Cielo({ lat, lon, giorno }: { lat: string; lon: string; giorno: GiornoMare }) {
  const t = useT();
  const latN = Number(lat);
  const lonN = Number(lon);
  const luce = Number.isFinite(latN) && Number.isFinite(lonN) && lat !== "" ? sole(latN, lonN, giorno.giorno) : null;
  const fase = faseLuna(giorno.giorno);
  return (
    <div className="mt-3 rounded-[24px] border border-line bg-deep px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center gap-3">
        <DiscoLuna fase={fase} />
        <p className="text-sm text-foam">{t(luna(giorno.giorno))}</p>
      </div>
      <div className="mt-3 space-y-1 text-sm text-mist">
        {giorno.finestraDa != null && giorno.finestraA != null ? <p>{t("L'onda è più bassa tra le {da} e le {a}.", { da: giorno.finestraDa, a: giorno.finestraA })}</p> : null}
        {luce ? <p>{t("Il sole sorge alle {sorge} e tramonta alle {tramonta}.", { sorge: luce.sorge, tramonta: luce.tramonta })}</p> : null}
        {giorno.acqua != null ? <p>{t(fraseMuta(giorno.acqua), { g: giorno.acqua })}</p> : null}
        {giorno.acqua18 != null && (giorno.acqua == null || giorno.acqua - giorno.acqua18 >= 3) ? <p>{t("A 18 m l'acqua è a {g} °C.", { g: giorno.acqua18 })}</p> : null}
        {giorno.correnteVerso != null ? <p>{t("La corrente va verso {verso}.", { verso: t(versoParole(giorno.correnteVerso)) })}</p> : null}
      </div>
    </div>
  );
}

function FraseTua({ giorno, contesto }: { giorno: GiornoMare; contesto: ContestoMare | null }) {
  const t = useT();
  if (!contesto || giorno.onda == null) return null;
  const pezzi: string[] = [];
  if (contesto.uscita === "riva" && giorno.onda >= 0.8) pezzi.push(t("Onda {m} m: da riva è meglio no.", { m: giorno.onda }));
  else if (contesto.uscita === "barca" && giorno.onda >= 0.8 && giorno.giudizio !== "no") pezzi.push(t("Onda {m} m: da riva sarebbe alta, da barca si può entrare. Non è un via libera.", { m: giorno.onda }));
  else if (contesto.uscita === "barca" && giorno.giudizio === "no") pezzi.push(t("Anche da barca oggi è meglio no. Non è un via libera."));
  if (contesto.metri != null && contesto.metri <= 18 && (giorno.giudizio === "limite" || giorno.giudizio === "no")) {
    pezzi.push(t("Il brevetto arriva a {m} m: resta nei tuoi limiti.", { m: contesto.metri }));
  }
  if (!pezzi.length) return null;
  return <p className="mt-3 rounded-2xl border border-brass/40 bg-deep px-3 py-3 text-sm leading-relaxed text-brass shadow-[0_0_24px_-16px_#e8b86d]">{pezzi.join(" ")}</p>;
}

function Cella({ icona: Icon, titolo, valore, nota, children }: { icona: typeof Waves; titolo: string; valore: string; nota?: string; children?: ReactNode }) {
  return (
    <article className="rounded-[22px] border border-line bg-deep px-3 py-3 shadow-[0_18px_28px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="flex items-center gap-2 text-mist">
        <span className="flex size-7 items-center justify-center rounded-full border border-lagoon/30 bg-abyss shadow-[0_0_12px_rgba(94,234,212,0.18)]">
          <Icon className="size-3.5 text-lagoon" strokeWidth={1.6} />
        </span>
        <h2 className="text-[11px] uppercase tracking-[0.14em]">{titolo}</h2>
      </div>
      <p className="mt-2 font-display text-lg leading-tight">{valore}</p>
      {children}
      {nota ? <p className="mt-1 text-[11px] leading-snug text-mist">{nota}</p> : null}
    </article>
  );
}

function OndaSfondo({ metri }: { metri: number | null }) {
  const amp = metri == null ? 6 : Math.min(16, 4 + metri * 5);
  const d = `M0 28 Q 40 ${28 - amp} 80 28 T 160 28 T 240 28 T 320 28 T 400 28 V 80 H 0 Z`;
  return (
    <svg viewBox="0 0 400 80" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-lagoon/25" aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function OndaLinea({ metri }: { metri: number | null }) {
  const amp = metri == null ? 3 : Math.min(12, 2 + metri * 5);
  const d = `M0 16 Q 16 ${16 - amp} 32 16 T 64 16 T 96 16`;
  return (
    <svg viewBox="0 0 96 28" className="mt-2 h-7 w-full text-lagoon" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ColonnaAcqua({ superficie, metri18, metri40 }: { superficie: number | null; metri18: number | null; metri40: number | null }) {
  const righe = [
    { nome: "0", valore: superficie },
    { nome: "18", valore: metri18 },
    { nome: "40", valore: metri40 },
  ].filter((riga) => riga.valore != null);
  if (!righe.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {righe.map((riga) => (
        <div key={riga.nome} className="flex items-center gap-2 text-[10px] text-mist">
          <span className="w-6">{riga.nome}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-abyss">
            <span className="block h-full rounded-full bg-lagoon" style={{ width: `${Math.min(100, Math.max(12, ((riga.valore ?? 0) / 30) * 100))}%`, opacity: 0.45 + Math.min(0.55, (riga.valore ?? 0) / 30) }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Bussola({ gradi }: { gradi: number | null }) {
  if (gradi == null) return null;
  return (
    <div className="relative mx-auto mt-2 size-14 rounded-full border border-lagoon/40 bg-abyss shadow-[inset_0_0_16px_rgba(94,234,212,0.2)]" aria-hidden>
      <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[8px] text-mist">N</span>
      <span
        className="absolute left-1/2 top-1/2 h-5 w-0.5 rounded-full bg-lagoon shadow-[0_0_8px_#5eead4]"
        style={{ transform: `translate(-50%, -100%) rotate(${gradi}deg)`, transformOrigin: "50% 100%" }}
      />
      <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foam" />
    </div>
  );
}

function BarraVista({ metri }: { metri: number | null }) {
  if (metri == null) return null;
  const largo = Math.min(100, Math.max(8, (metri / 30) * 100));
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-abyss" aria-hidden>
      <div className="h-full rounded-full bg-gradient-to-r from-abyss via-lagoon to-foam shadow-[0_0_10px_rgba(94,234,212,0.6)]" style={{ width: `${largo}%` }} />
    </div>
  );
}

function DiscoLuna({ fase }: { fase: number }) {
  const luce = fase <= 0.5 ? fase * 2 : (1 - fase) * 2;
  const destra = fase < 0.5;
  return (
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="13" className="fill-abyss stroke-line" />
      <circle cx="16" cy="16" r="12" fill="#e8b86d" opacity={0.2 + luce * 0.8} />
      <ellipse cx={destra ? 20 : 12} cy="16" rx={6 * (1 - luce)} ry="12" className="fill-abyss" />
    </svg>
  );
}

function AttesaSatellite() {
  const t = useT();
  return (
    <div className="mt-4 overflow-hidden rounded-[28px] border border-lagoon/30 bg-deep px-4 py-5 text-center shadow-[0_24px_40px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12)]">
      <svg viewBox="0 0 320 160" className="mx-auto h-40 w-full max-w-sm" role="img" aria-label={t("Attendi… connessione in corso.")}>
        <rect width="320" height="160" fill="#07141c" />
        <circle cx="28" cy="22" r="1" fill="#f4f1ea" opacity="0.7" />
        <circle cx="250" cy="16" r="1" fill="#f4f1ea" opacity="0.5" />
        <circle cx="180" cy="28" r="1" fill="#5eead4" opacity="0.6" />
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 0; 90 6; 0 0" dur="8s" repeatCount="indefinite" />
          <rect x="36" y="22" width="22" height="8" rx="1" fill="#e8b86d" />
          <rect x="92" y="22" width="22" height="8" rx="1" fill="#e8b86d" />
          <rect x="58" y="18" width="34" height="16" rx="3" fill="#5eead4" />
          <line x1="75" y1="34" x2="75" y2="108" stroke="#5eead4" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.75">
            <animate attributeName="stroke-dashoffset" values="0;-21" dur="1.1s" repeatCount="indefinite" />
          </line>
          <circle cx="75" cy="108" r="3" fill="#5eead4" opacity="0.9">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </g>
        <path fill="#0e3d42" opacity="0.95">
          <animate attributeName="d" dur="3.2s" repeatCount="indefinite" values="M0 118 Q 40 104 80 118 T 160 118 T 240 118 T 320 118 V 160 H 0 Z;M0 118 Q 40 130 80 118 T 160 118 T 240 118 T 320 118 V 160 H 0 Z;M0 118 Q 40 104 80 118 T 160 118 T 240 118 T 320 118 V 160 H 0 Z" />
        </path>
        <path fill="#145e63" opacity="0.85">
          <animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="M0 128 Q 50 118 100 128 T 200 128 T 320 128 V 160 H 0 Z;M0 128 Q 50 140 100 128 T 200 128 T 320 128 V 160 H 0 Z;M0 128 Q 50 118 100 128 T 200 128 T 320 128 V 160 H 0 Z" />
        </path>
      </svg>
      <p className="mt-3 text-base text-foam">{t("Attendi… connessione in corso.")}</p>
    </div>
  );
}
