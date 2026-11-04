import { useRef, useState } from "react";
import { FotoPiena } from "@/components/foto-vista";
import { messaggioErrore, useT, type Traduci } from "@/lib/i18n";
import { fotoUrlSafe, prepareFotoSpecie } from "@/lib/prepare-file";
import { schedaCatalogo, type SpecieCatalogo } from "@/lib/scubadex-catalogo";
import { riconosciSpecie, type Riconoscimento, type SchedaSpecie } from "@/lib/specie.functions";

const MEMORIA = "smile-specie-correzioni";

type Correzione = { sbagliato: string; giusto: string; nota: string };

function leggiCorrezioni(): Correzione[] {
  try {
    const raw = localStorage.getItem(MEMORIA);
    const data = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is Correzione => {
        if (!item || typeof item !== "object") return false;
        const row = item as Correzione;
        return typeof row.sbagliato === "string" && typeof row.giusto === "string";
      })
      .slice(-8);
  } catch {
    return [];
  }
}

function ricorda(sbagliate: string[], giusto: string, nota: string) {
  if (!sbagliate.length || !giusto) return;
  const prima = leggiCorrezioni();
  const nuove = sbagliate.map((sbagliato) => ({ sbagliato, giusto, nota: nota.slice(0, 80) }));
  localStorage.setItem(MEMORIA, JSON.stringify([...prima, ...nuove].slice(-8)));
}

export function Riconosci({ pro = false }: { pro?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scatto, setScatto] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [scartate, setScartate] = useState<string[]>([]);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [esito, setEsito] = useState<Riconoscimento | null>(null);
  const [scelta, setScelta] = useState(0);
  const [piena, setPiena] = useState<{ src: string; alt: string } | null>(null);
  const [migliorata, setMigliorata] = useState(false);

  async function cerca(foto: string, escludi: string[]) {
    setBusy(true);
    setError(null);
    setAvviso(null);
    setEsito(null);
    try {
      setScelta(0);
      setEsito(
        await riconosciSpecie({
          data: { data: fotoUrlSafe(foto), nota, scartate: escludi, memoria: leggiCorrezioni() },
        }),
      );
    } catch (reason) {
      setError(erroreSpecie(reason, t));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setAvviso(null);
    setEsito(null);
    setScartate([]);
    setMigliorata(false);
    try {
      const ready = await prepareFotoSpecie(file);
      if (ready.type !== "image/jpeg") throw new Error("Usa una foto.");
      setScatto(ready.data);
      setMigliorata(Boolean(ready.ottimizzata));
      setScelta(0);
      setEsito(
        await riconosciSpecie({
          data: { data: fotoUrlSafe(ready.data), nota, scartate: [], memoria: leggiCorrezioni() },
        }),
      );
    } catch (reason) {
      setError(erroreSpecie(reason, t));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function scegliRisposta(scelta: "si" | "no" | "nonsa") {
    setEsito((current) => {
      if (!current?.marino || !current.domanda) return current;
      if (scelta === "nonsa") return { marino: true, probabile: false, opzioni: current.opzioni };
      const nome = (scelta === "si" ? current.domanda.si : current.domanda.no).toLowerCase();
      const scelto = current.opzioni.find((item) => item.scientifico.toLowerCase() === nome);
      if (!scelto) return { ...current, domanda: undefined };
      const altri = current.opzioni.filter((item) => item !== scelto);
      return { marino: true, probabile: true, opzioni: [scelto, ...altri] };
    });
    setScelta(0);
  }

  function nonEQuesta() {
    const nome = trovato?.opzioni[scelta]?.scientifico;
    if (!scatto || !nome || busy || !trovato) return;
    const next = scartate.some((item) => item.toLowerCase() === nome.toLowerCase()) ? scartate : [...scartate, nome];
    setScartate(next);
    const rest = trovato.opzioni.filter((item) => !next.some((seen) => seen.toLowerCase() === item.scientifico.toLowerCase()));
    if (rest.length) {
      setScelta(0);
      setEsito({ marino: true, probabile: rest.length === 1, opzioni: rest });
      setAvviso(rest.length === 1 ? t("Resta questa. Se non è lei, la scarto e cerco ancora.") : t("Ok, passo alla successiva."));
      return;
    }
    void cerca(scatto, next);
  }

  function eQuesta() {
    const nome = trovato?.opzioni[scelta]?.scientifico;
    if (!nome) return;
    ricorda(scartate, nome, nota);
    setAvviso(scartate.length ? t("Ok. La prossima volta parto da questa correzione.") : t("Ok, tengo questa specie."));
  }

  const trovato = esito?.marino ? esito : null;

  return (
    <section className="mt-4">
      <h2 className="text-2xl">{t("Riconosci")}</h2>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
        onClick={() => input.current?.click()}
      >
        {t("Foto dal telefono")}
      </button>
      {scatto ? (
        <div className="relative mt-4">
          <button type="button" className="block w-full overflow-hidden rounded-card" onClick={() => setPiena({ src: scatto, alt: t("La tua foto") })}>
            <img src={scatto} alt={t("La tua foto")} className="max-h-56 w-full object-cover" />
          </button>
          {migliorata ? <p className="mt-2 text-sm text-mist">{t("Ho migliorato la foto: era piccola, scura o poco nitida.")}</p> : null}
          {error ? (
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-ink/85 px-3 py-2">
              <p className="text-sm text-danger">{error}</p>
              <button type="button" className="mt-2 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={() => void cerca(scatto, scartate)}>
                {t("Riprova")}
              </button>
            </div>
          ) : null}
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-danger">{error}</p>
      ) : null}
      {esito && !esito.marino ? (
        <div className="mt-4">
          <p className="text-sm text-foam">{traduciFraseSpecie(esito.messaggio, t)}</p>
          {scatto ? (
            <button
              type="button"
              disabled={busy}
              className="mt-3 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
              onClick={() => void cerca(scatto, scartate)}
            >
              {t("Riprova")}
            </button>
          ) : null}
        </div>
      ) : null}
      {trovato?.domanda ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-foam">{traduciFraseSpecie(trovato.domanda.testo, t)}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-full bg-lagoon px-3 text-sm font-medium" onClick={() => scegliRisposta("si")}>
              {t(nomeOpzione(trovato, trovato.domanda.si)) || t("Sì")}
            </button>
            <button type="button" className="min-h-11 flex-1 rounded-full border border-line px-3 text-sm" onClick={() => scegliRisposta("no")}>
              {t(nomeOpzione(trovato, trovato.domanda.no)) || t("No")}
            </button>
          </div>
          <button type="button" className="mt-2 min-h-11 w-full rounded-full border border-line text-sm" onClick={() => scegliRisposta("nonsa")}>
            {t("Non lo so")}
          </button>
        </div>
      ) : null}
      {trovato && trovato.opzioni.length > 1 ? (
        <div className="mt-4">
          <p className="text-sm text-mist">{trovato.probabile ? t("Anche queste somigliano") : t("Non è ancora sicuro. Ecco le specie che vedo.")}</p>
          <div className="mt-2 flex flex-col gap-2">
            {trovato.opzioni.map((item, index) => (
              <button
                key={item.scientifico}
                type="button"
                className={`min-h-11 rounded-full border px-4 text-sm ${index === scelta ? "border-lagoon bg-surface text-foam" : "border-line text-mist"}`}
                onClick={() => setScelta(index)}
              >
                {t(item.nome)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {trovato ? (
        <div className="mt-5">
          {trovato.opzioni[scelta] ? (
            <Dettaglio
              item={trovato.opzioni[scelta]}
              dubbio={!trovato.probabile}
              completa={pro ? schedaCatalogo(trovato.opzioni[scelta].scientifico) : null}
              onPhoto={(src, alt) => setPiena({ src, alt })}
            />
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium" onClick={eQuesta}>
              {t("È questa")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
              onClick={nonEQuesta}
            >
              {t("Non è questa")}
            </button>
          </div>
          {scartate.length ? <p className="mt-2 text-xs text-mist">{t("Scartate: {lista}", { lista: scartate.join(", ") })}</p> : null}
          {avviso ? <p className="mt-2 text-sm text-foam">{avviso}</p> : null}
        </div>
      ) : null}
      {scatto ? (
        <div className="mt-6">
          <label className="block text-sm text-foam" htmlFor="nota-specie">
            {t("Dettagli per affinare")}
          </label>
          <textarea
            id="nota-specie"
            value={nota}
            maxLength={400}
            onChange={(event) => setNota(event.target.value)}
            placeholder={t("Ad esempio: ciuffo branchiale, Passetto, di notte")}
            className="mt-2 min-h-24 w-full rounded-2xl border border-line bg-deep px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
            onClick={() => void cerca(scatto, scartate)}
          >
            {t("Cerca con questi dettagli")}
          </button>
        </div>
      ) : null}
      {piena ? <FotoPiena src={piena.src} alt={piena.alt} onClose={() => setPiena(null)} /> : null}
      {busy ? <ClessidraPesce /> : null}
    </section>
  );
}

function nomeOpzione(esito: { opzioni: { scientifico: string; nome: string }[] }, scientifico: string): string {
  return esito.opzioni.find((item) => item.scientifico.toLowerCase() === scientifico.toLowerCase())?.nome ?? "";
}

function ClessidraPesce() {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" role="status" aria-live="polite" aria-label={t("Sto cercando nel database")}>
      <style>{`
        @keyframes smile-hour {
          0%, 38% { transform: rotate(0deg); }
          50%, 88% { transform: rotate(180deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes smile-grain {
          0% { transform: translateY(-6px); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(34px); opacity: 0; }
        }
        .smile-hour { animation: smile-hour 2.6s ease-in-out infinite; transform-origin: 50px 70px; }
        .smile-grain { animation: smile-grain 1.15s linear infinite; }
      `}</style>
      <div className="w-full max-w-xs rounded-card border border-line bg-deep px-6 py-8 text-center shadow-xl">
        <div className="relative mx-auto h-36 w-24 text-lagoon" aria-hidden="true">
          <svg viewBox="0 0 100 140" className="smile-hour h-full w-full">
            <ellipse cx="50" cy="40" rx="30" ry="26" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M20 38c-12-2-16 10-8 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="60" cy="36" r="4" fill="currentColor" />
            <circle cx="61.2" cy="35" r="1.3" className="fill-deep" />
            <path d="M34 64c8 8 24 8 32 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M34 76c8-8 24-8 32 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx="50" cy="100" rx="30" ry="26" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M32 122c6 12 30 12 36 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <svg viewBox="0 0 100 140" className="pointer-events-none absolute inset-0 h-full w-full">
            <circle cx="50" cy="68" r="2.2" className="smile-grain fill-lagoon" />
            <circle cx="46" cy="66" r="1.6" className="smile-grain fill-lagoon" style={{ animationDelay: "0.28s" }} />
            <circle cx="54" cy="67" r="1.5" className="smile-grain fill-lagoon" style={{ animationDelay: "0.55s" }} />
          </svg>
        </div>
        <p className="mt-2 text-sm text-foam">{t("Guardo la foto…")}</p>
      </div>
    </div>
  );
}

function Dettaglio({
  item,
  dubbio,
  completa,
  onPhoto,
}: {
  item: SchedaSpecie;
  dubbio: boolean;
  completa: SpecieCatalogo | null;
  onPhoto: (src: string, alt: string) => void;
}) {
  const t = useT();
  const nome = t(item.nome);
  const titolo = dubbio ? t("Potrebbe essere {nome}", { nome }) : nome;
  return (
    <div className="mt-5">
      {item.foto[0] ? (
        <button type="button" className="relative block h-80 w-full overflow-hidden rounded-card" onClick={() => onPhoto(item.foto[0].url, nome)}>
          <img src={item.foto[0].url} alt={nome} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-4 text-left">
            <span className="block text-xs uppercase tracking-widest text-foam">{t(item.gruppo)}</span>
            <span className="mt-1 block text-4xl leading-none">{titolo}</span>
            <span className="mt-2 block text-sm italic text-foam">{item.scientifico}</span>
          </span>
        </button>
      ) : (
        <>
          <p className="text-xs uppercase tracking-widest text-brass">{t(item.gruppo)}</p>
          <h3 className="mt-1 text-4xl leading-none">{titolo}</h3>
          <p className="mt-2 text-sm italic text-mist">{item.scientifico}</p>
        </>
      )}
      {item.segno ? <p className="mt-3 text-sm text-brass">{traduciSegno(item.segno, t)}</p> : null}
      <p className="mt-3 text-sm leading-relaxed text-foam">{t(item.testo)}</p>
      {completa ? <SchedaCampi scheda={completa} /> : null}
      {item.foto.length > 1 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {item.foto.slice(1).map((foto) => (
            <li key={foto.url}>
              <button type="button" className="block w-full overflow-hidden rounded-xl" onClick={() => onPhoto(foto.url, nome)}>
                <img src={foto.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <a href={item.scheda} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-brass">
        {t("Scheda nel database")}
      </a>
    </div>
  );
}

function SchedaCampi({ scheda }: { scheda: SpecieCatalogo }) {
  const t = useT();
  const campi = [
    ["Dove vive", scheda.doveVive],
    ["Cosa mangia", scheda.cosaMangia],
    ["Dove è facile avvistarla", scheda.doveAvvistarlo],
    ["Dimensioni", scheda.dimensioni],
    ["Dimorfismo sessuale", scheda.dimorfismo],
    ["Curiosità", scheda.curiosita],
  ] as const;
  return (
    <dl className="mt-4 grid gap-3">
      {campi.map(([etichetta, valore]) => valore ? (
        <div key={etichetta}>
          <dt className="text-xs uppercase tracking-wide text-brass">{t(etichetta)}</dt>
          <dd className="mt-1 text-sm text-foam">{valore}</dd>
        </div>
      ) : null)}
    </dl>
  );
}

function erroreSpecie(reason: unknown, t: Traduci): string {
  const raw = reason instanceof Error && reason.message ? reason.message : "";
  const stato = /^Non ho letto la foto \((\d+)\)\. Avvicina e tocca Riprova\.$/.exec(raw);
  if (stato) return t("Non ho letto la foto ({status}). Avvicina e tocca Riprova.", { status: stato[1] });
  return messaggioErrore(reason, "Non ho letto la foto. Avvicina e tocca Riprova.");
}

function traduciFraseSpecie(testo: string, t: Traduci): string {
  const stato = /^Non ho letto la foto \((\d+)\)\. Avvicina e tocca Riprova\.$/.exec(testo);
  if (stato) return t("Non ho letto la foto ({status}). Avvicina e tocca Riprova.", { status: stato[1] });
  const dubbio = /^Non è ancora sicuro\. È (.+), oppure somiglia di più a (.+)\?$/.exec(testo);
  if (dubbio) return t("Non è ancora sicuro. È {a}, oppure somiglia di più a {b}?", { a: t(dubbio[1]), b: t(dubbio[2]) });
  return t(testo);
}

function traduciSegno(segno: string, t: Traduci): string {
  return segno
    .split(" · ")
    .map((part) => t(part))
    .join(" · ");
}
