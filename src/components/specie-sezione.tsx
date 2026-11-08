import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Lock, X } from "lucide-react";
import { Riconosci } from "@/components/riconosci";
import { FotoPiena } from "@/components/foto-vista";
import { messaggioErrore, useT } from "@/lib/i18n";
import { formatDay } from "@/lib/format";
import { prepareFile } from "@/lib/prepare-file";
import { CATALOGO_SCUBADEX, categorieCatalogo, schedaCatalogo, type SpecieCatalogo } from "@/lib/scubadex-catalogo";
import {
  aggiungiSpecieMia,
  leggiSpecieImmersione,
  paginaScubadex,
  salvaSpecieImmersione,
  toggleVistaScubadex,
  type SpecieMia,
  type VistaScubadex,
} from "@/lib/scubadex.functions";
import { fotoCatalogo } from "@/lib/specie.functions";
import { SegnoPro } from "@/components/segno-pro";

type VoceLista = {
  id: string;
  nome: string;
  scientifico: string;
  categoria: string;
  propria: boolean;
  foto?: string;
};

export function SpecieSezione({ pro }: { pro: boolean }) {
  const t = useT();
  const [aperta, setAperta] = useState<"riconosci" | "scubadex" | null>(null);

  function scegli(voce: "riconosci" | "scubadex") {
    setAperta((ora) => (ora === voce ? null : voce));
  }

  return (
    <div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={aperta === "riconosci"}
          className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center ${aperta === "riconosci" ? "border-lagoon bg-lagoon/15" : "border-line bg-surface"}`}
          onClick={() => scegli("riconosci")}
        >
          <span className="text-2xl">{t("Riconosci")}</span>
          <span className="mt-1 text-sm text-mist">{t("Fotografa e identifica")}</span>
        </button>
        {pro ? (
          <button
            type="button"
            aria-pressed={aperta === "scubadex"}
            className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center ${aperta === "scubadex" ? "border-lagoon bg-lagoon/15" : "border-line bg-surface"}`}
            onClick={() => scegli("scubadex")}
          >
            <span className="text-2xl">{t("Scubadex")}<SegnoPro /></span>
            <span className="mt-1 text-sm text-mist">{t("Il tuo catalogo")}</span>
          </button>
        ) : (
          <button type="button" disabled className="flex min-h-28 cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-line bg-deep px-4 py-5 text-center">
            <Lock className="size-5 text-brass" aria-hidden />
            <span className="mt-2 text-2xl">{t("Scubadex")}</span>
            <span className="mt-1 text-sm text-brass">{t("Disponibile con Pro")}</span>
          </button>
        )}
      </div>
      {aperta === "riconosci" ? <Riconosci pro={pro} /> : null}
      {aperta === "scubadex" && pro ? (
        <>
          <CercaNome />
          <Scubadex />
        </>
      ) : null}
    </div>
  );
}

export function SpecieLogbook({
  entryId,
  pro,
  giorno,
  ids,
  onChange,
}: {
  entryId: number;
  pro: boolean;
  giorno: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pronto, setPronto] = useState(entryId <= 0);
  const scelto = useRef(false);

  useEffect(() => {
    scelto.current = false;
    if (!pro || !entryId) {
      setPronto(true);
      return;
    }
    let live = true;
    setPronto(false);
    leggiSpecieImmersione({ data: { entryId } })
      .then((rows) => {
        if (!live || scelto.current) return;
        onChange(rows);
        setPronto(true);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Catalogo non aperto."));
      });
    return () => {
      live = false;
    };
  }, [entryId, pro, onChange]);

  if (!pro) {
    return (
      <div className="sm:col-span-2">
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-mist" disabled>
          <Lock className="size-4 text-brass" aria-hidden />
          {t("Aggiungi specie viste")}
        </button>
        <p className="mt-2 text-xs text-brass">{t("Disponibile con Pro")}</p>
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60" disabled={!pronto} onClick={() => setAperto(true)}>
        {t("Aggiungi specie viste")}<SegnoPro />
      </button>
      {ids.length ? <p className="mt-2 text-xs text-mist">{t("{n} specie in questa immersione", { n: ids.length })}</p> : null}
      {errore ? <p className="mt-2 text-sm text-danger">{errore}</p> : null}
      {aperto ? (
        <SelettoreSpecie
          scelte={ids}
          onChiudi={() => setAperto(false)}
          onSalva={(next) => {
            scelto.current = true;
            onChange(next);
            setAperto(false);
            setErrore(null);
            if (!entryId) return;
            void salvaSpecieImmersione({ data: { entryId, ids: next, giorno } }).catch((reason: unknown) => {
              setErrore(messaggioErrore(reason, "Specie non salvate."));
            });
          }}
        />
      ) : null}
    </div>
  );
}

function CercaNome() {
  const t = useT();
  const [testo, setTesto] = useState("");
  const [scelta, setScelta] = useState<SpecieCatalogo | null>(null);
  const q = testo.trim().toLowerCase();
  const trovate = q.length < 2 ? [] : CATALOGO_SCUBADEX.filter((item) => `${item.nomeComune} ${item.nomeScientifico}`.toLowerCase().includes(q)).slice(0, 12);
  return (
    <section className="mt-8">
      <h2 className="text-2xl">{t("Cerca per nome")}</h2>
      <input value={testo} onChange={(event) => setTesto(event.target.value)} placeholder={t("Nome comune o scientifico")} className="mt-3 min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none focus-visible:border-lagoon" />
      <ul className="mt-3 grid gap-2">
        {trovate.map((item) => (
          <li key={item.id}>
            <button type="button" className="min-h-11 w-full rounded-2xl border border-line bg-deep px-4 text-left text-sm" onClick={() => setScelta(item)}>
              <span className="block font-medium">{item.nomeComune}</span>
              <span className="block text-xs italic text-mist">{item.nomeScientifico}</span>
            </button>
          </li>
        ))}
      </ul>
      {scelta ? <SchedaCompleta scheda={scelta} onClose={() => setScelta(null)} /> : null}
    </section>
  );
}

const cacheFoto = new Map<string, string>();

function miniaturaDi(url: string): string {
  return url.replace("/large.", "/square.").replace("/medium.", "/square.").replace("/small.", "/square.");
}

function Miniatura({ scientifico, propria, foto, root }: { scientifico: string; propria: boolean; foto: string; root: RefObject<HTMLElement | null> }) {
  const nota = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(propria ? foto : cacheFoto.get(scientifico) ?? "");

  useEffect(() => {
    if (propria) {
      setUrl(foto);
      return;
    }
    if (!scientifico || cacheFoto.has(scientifico)) {
      setUrl(cacheFoto.get(scientifico) ?? "");
      return;
    }
    const el = nota.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      void fotoCatalogo({ data: { nome: scientifico } })
        .then((row) => {
          cacheFoto.set(scientifico, row.url || "");
          setUrl(row.url || "");
        })
        .catch(() => {
          cacheFoto.set(scientifico, "");
        });
    }, { root: root.current, rootMargin: "160px" });
    io.observe(el);
    return () => io.disconnect();
  }, [foto, propria, root, scientifico]);

  const src = url ? (propria ? url : miniaturaDi(url)) : "";
  return (
    <span ref={nota} className="size-14 shrink-0 overflow-hidden rounded-xl bg-abyss">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

function Scubadex() {
  const t = useT();
  const [pagina, setPagina] = useState<{ viste: VistaScubadex[]; proprie: SpecieMia[]; anno: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"tutte" | "viste" | "non">("tutte");
  const [categoria, setCategoria] = useState("");
  const [aperta, setAperta] = useState<VoceLista | null>(null);
  const [nuova, setNuova] = useState(false);
  const lista = useRef<HTMLUListElement>(null);

  function carica() {
    return paginaScubadex().then(setPagina);
  }

  useEffect(() => {
    let live = true;
    paginaScubadex()
      .then((value) => {
        if (live) setPagina(value);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Catalogo non aperto."));
      });
    return () => {
      live = false;
    };
  }, []);

  const viste = new Map((pagina?.viste ?? []).map((row) => [row.id, row.giorno]));
  const voci: VoceLista[] = [
    ...CATALOGO_SCUBADEX.map((item) => ({ id: item.id, nome: item.nomeComune, scientifico: item.nomeScientifico, categoria: item.raggruppamento, propria: false })),
    ...(pagina?.proprie ?? []).map((item) => ({ id: item.id, nome: item.nome, scientifico: item.luogo, categoria: t("Le mie"), propria: true, foto: item.foto })),
  ];
  const visibili = voci.filter((item) => {
    if (categoria && item.categoria !== categoria) return false;
    const vista = viste.has(item.id);
    if (filtro === "viste") return vista;
    if (filtro === "non") return !vista;
    return true;
  });
  const anno = pagina?.anno ?? new Date().getFullYear();
  const nuove = (pagina?.viste ?? []).filter((row) => row.giorno.startsWith(String(anno))).length;

  async function spunta(id: string) {
    setErrore(null);
    try {
      await toggleVistaScubadex({ data: { id } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non aggiornata."));
    }
  }

  const totale = voci.length;
  const fatte = viste.size;
  const giro = totale ? Math.round((fatte / totale) * 100) : 0;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 36 36" className="size-16 shrink-0 -rotate-90 text-line" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-lagoon" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${giro} 100`} />
        </svg>
        <div className="min-w-0">
          <h2 className="text-2xl">{t("Scubadex")}<SegnoPro /></h2>
          <p className="mt-1 text-lg">{t("{n} di {totale}", { n: fatte, totale })}</p>
          <p className="text-sm text-brass">{t("Nuove quest'anno: {n}", { n: nuove })}</p>
        </div>
      </div>
      {errore ? <p className="mt-2 text-sm text-danger">{errore}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["tutte", "viste", "non"] as const).map((voce) => (
          <button key={voce} type="button" className={`min-h-11 rounded-full px-4 text-sm ${filtro === voce ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => setFiltro(voce)}>
            {t(voce === "tutte" ? "Tutte" : voce === "viste" ? "Viste" : "Non viste")}
          </button>
        ))}
        <select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="min-h-11 rounded-full border border-line bg-deep px-3 text-sm">
          <option value="">{t("Tutte le categorie")}</option>
          {categorieCatalogo().map((nome) => <option key={nome} value={nome}>{nome}</option>)}
          <option value={t("Le mie")}>{t("Le mie")}</option>
        </select>
      </div>
      <button type="button" className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => setNuova(true)}>
        {t("Aggiungi specie")}
      </button>
      <ul ref={lista} className="mt-3 grid max-h-[28rem] gap-2 overflow-auto">
        {visibili.map((item) => {
          const vista = viste.has(item.id);
          return (
            <li key={item.id} className={`flex items-center gap-2 rounded-2xl border px-2 py-2 ${vista ? "border-lagoon bg-deep" : "border-line bg-deep opacity-75"}`}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setAperta(item)}>
                <Miniatura scientifico={item.propria ? "" : item.scientifico} propria={item.propria} foto={item.foto ?? ""} root={lista} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.nome}</span>
                  <span className="block truncate text-xs italic text-mist">{item.scientifico}</span>
                </span>
              </button>
              <button type="button" className={`min-h-11 shrink-0 rounded-full px-3 text-xs ${vista ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => void spunta(item.id)}>
                {vista ? t("Vista") : t("Non vista")}
              </button>
            </li>
          );
        })}
      </ul>
      {aperta ? <DettaglioVoce voce={aperta} propria={(pagina?.proprie ?? []).find((item) => item.id === aperta.id) ?? null} onClose={() => setAperta(null)} /> : null}
      {nuova ? <NuovaSpecie onClose={() => setNuova(false)} onFatta={() => { setNuova(false); void carica(); }} /> : null}
    </section>
  );
}

function FinestraSpecie({ titolo, onClose, children }: { titolo: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const suTasto = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", suTasto);
    return () => {
      document.body.style.overflow = prima;
      window.removeEventListener("keydown", suTasto);
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/80 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={titolo}
      onClick={onClose}
    >
      <div className="relative flex max-h-[min(92vh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-deep shadow-xl" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-ink/75 text-foam" aria-label={t("Chiudi")} onClick={onClose}>
          <X className="size-5" aria-hidden />
        </button>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function SchedaCompleta({ scheda, onClose }: { scheda: SpecieCatalogo; onClose: () => void }) {
  const t = useT();
  const [foto, setFoto] = useState("");
  const [piena, setPiena] = useState(false);
  const campi = [
    ["Dove vive", scheda.doveVive],
    ["Cosa mangia", scheda.cosaMangia],
    ["Dove è facile avvistarla", scheda.doveAvvistarlo],
    ["Dimensioni", scheda.dimensioni],
    ["Dimorfismo sessuale", scheda.dimorfismo],
    ["Curiosità", scheda.curiosita],
  ] as const;
  useEffect(() => {
    let live = true;
    setFoto("");
    fotoCatalogo({ data: { nome: scheda.nomeScientifico } })
      .then((row) => {
        if (live && row.url) setFoto(row.url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [scheda.nomeScientifico]);
  return (
    <FinestraSpecie titolo={scheda.nomeComune} onClose={onClose}>
      <button type="button" className="relative block w-full" onClick={() => { if (foto) setPiena(true); }}>
        {foto ? <img src={foto} alt={scheda.nomeComune} className="h-72 w-full object-cover" /> : <span className="block h-40 bg-abyss" />}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/70 to-transparent px-4 pb-4 pt-16 text-left">
          <span className="block text-xs uppercase tracking-wide text-brass">{scheda.raggruppamento}</span>
          <span className="mt-1 block text-2xl font-medium">{scheda.nomeComune}</span>
        </span>
      </button>
      <div className="px-4 py-4">
        <p className="text-sm italic text-mist">{scheda.nomeScientifico}</p>
        <dl className="mt-5 grid gap-4">
          {campi.map(([etichetta, valore]) => valore ? (
            <div key={etichetta}>
              <dt className="text-[11px] uppercase tracking-wide text-mist">{t(etichetta)}</dt>
              <dd className="mt-1 text-sm leading-relaxed">{valore}</dd>
            </div>
          ) : null)}
        </dl>
      </div>
      {piena && foto ? <FotoPiena src={foto} alt={scheda.nomeComune} onClose={() => setPiena(false)} /> : null}
    </FinestraSpecie>
  );
}

function DettaglioVoce({ voce, propria, onClose }: { voce: VoceLista; propria: SpecieMia | null; onClose: () => void }) {
  const scheda = schedaCatalogo(voce.id);
  if (scheda) return <SchedaCompleta scheda={scheda} onClose={onClose} />;
  return <SchedaMia specie={propria} nome={voce.nome} onClose={onClose} />;
}

function SchedaMia({ specie, nome, onClose }: { specie: SpecieMia | null; nome: string; onClose: () => void }) {
  const t = useT();
  const [piena, setPiena] = useState(false);
  return (
    <FinestraSpecie titolo={nome} onClose={onClose}>
      <button type="button" className="relative block w-full" onClick={() => { if (specie?.foto) setPiena(true); }}>
        {specie?.foto ? <img src={specie.foto} alt="" className="h-72 w-full object-cover" /> : <span className="block h-40 bg-abyss" />}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/70 to-transparent px-4 pb-4 pt-16 text-left">
          <span className="block text-xs uppercase tracking-wide text-brass">{t("Nel tuo catalogo")}</span>
          <span className="mt-1 block text-2xl font-medium">{nome}</span>
        </span>
      </button>
      <div className="px-4 py-4">
        {specie?.giorno ? <p className="text-sm text-mist">{formatDay(specie.giorno)}</p> : null}
        {specie?.luogo ? <p className="mt-2 text-sm italic text-mist">{specie.luogo}</p> : null}
        {specie?.note ? <p className="mt-4 text-sm leading-relaxed">{specie.note}</p> : null}
      </div>
      {piena && specie?.foto ? <FotoPiena src={specie.foto} alt={nome} onClose={() => setPiena(false)} /> : null}
    </FinestraSpecie>
  );
}

function NuovaSpecie({ onClose, onFatta }: { onClose: () => void; onFatta: () => void }) {
  const t = useT();
  const [nome, setNome] = useState("");
  const [note, setNote] = useState("");
  const [giorno, setGiorno] = useState("");
  const [luogo, setLuogo] = useState("");
  const [foto, setFoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    setBusy(true);
    setErrore(null);
    try {
      await aggiungiSpecieMia({ data: { nome, note, giorno, luogo, foto } });
      onFatta();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Specie non salvata."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-sm font-medium">{t("Aggiungi al tuo catalogo")}</p>
      <p className="mt-1 text-xs text-mist">{t("Resta solo nel tuo Scubadex. Non entra nel catalogo generale.")}</p>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Nome della specie")}</span>
        <input value={nome} onChange={(event) => setNome(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Data")}</span>
        <input type="date" value={giorno} onChange={(event) => setGiorno(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Luogo")}</span>
        <input value={luogo} onChange={(event) => setLuogo(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none focus-visible:border-lagoon" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-mist">{t("Note")}</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-xl border border-line bg-deep px-3 py-2 outline-none focus-visible:border-lagoon" />
      </label>
      <label className="relative mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm">
        {t("Foto")}
        <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void prepareFile(file, "guarda").then((pronto) => setFoto(pronto.data)).catch((reason: unknown) => setErrore(messaggioErrore(reason, "La foto non è adatta.")));
        }} />
      </label>
      {foto ? <img src={foto} alt="" className="mt-3 h-24 w-24 rounded-xl object-cover" /> : null}
      {errore ? <p className="mt-2 text-sm text-danger">{errore}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || nome.trim().length < 2} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void salva()}>{t("Salva")}</button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onClose}>{t("Annulla")}</button>
      </div>
    </div>
  );
}

function SelettoreSpecie({ scelte, onChiudi, onSalva }: { scelte: string[]; onChiudi: () => void; onSalva: (ids: string[]) => void }) {
  const t = useT();
  const [ids, setIds] = useState(scelte);
  const [testo, setTesto] = useState("");
  const [proprie, setProprie] = useState<SpecieMia[]>([]);
  useEffect(() => {
    let live = true;
    paginaScubadex().then((value) => { if (live) setProprie(value.proprie); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const q = testo.trim().toLowerCase();
  const catalogo = CATALOGO_SCUBADEX.filter((item) => !q || `${item.nomeComune} ${item.nomeScientifico}`.toLowerCase().includes(q)).slice(0, 20);
  const mie = proprie.filter((item) => !q || item.nome.toLowerCase().includes(q));
  function toggle(id: string) {
    setIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-sm font-medium">{t("Aggiungi specie viste")}</p>
      <input value={testo} onChange={(event) => setTesto(event.target.value)} placeholder={t("Cerca una specie")} className="mt-3 min-h-11 w-full rounded-xl border border-line bg-deep px-3 outline-none focus-visible:border-lagoon" />
      <ul className="mt-3 max-h-72 space-y-1 overflow-auto">
        {mie.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={ids.includes(item.id)} onChange={() => toggle(item.id)} />
              <span>{item.nome}</span>
            </label>
          </li>
        ))}
        {catalogo.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={ids.includes(item.id)} onChange={() => toggle(item.id)} />
              <span>{item.nomeComune} <span className="text-mist">{item.nomeScientifico}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button type="button" className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium text-ink" onClick={() => onSalva(ids)}>{t("Salva")}</button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onChiudi}>{t("Annulla")}</button>
      </div>
    </div>
  );
}
