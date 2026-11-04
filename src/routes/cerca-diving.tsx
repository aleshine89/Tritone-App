import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { ClubLogo } from "@/components/club-logo";
import { listaDivingNautici, type DivingTrovato } from "@/lib/fondale.functions";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/cerca-diving")({ component: Page });

const SCELTA = "tritone-diving-scelto";

function Page() {
  return (
    <AppFrame>
      <Cerca />
    </AppFrame>
  );
}

function Cerca() {
  const t = useT();
  const navigate = useNavigate();
  const [lista, setLista] = useState<DivingTrovato[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [luogo, setLuogo] = useState("");

  useEffect(() => {
    let live = true;
    listaDivingNautici()
      .then((items) => {
        if (live) setLista(items);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setLista([]);
        setErrore(messaggioErrore(reason, "Non riesco a leggere i diving."));
      });
    return () => {
      live = false;
    };
  }, []);

  const trovati = useMemo(() => {
    const qNome = piega(nome);
    const qLuogo = piega(luogo);
    return (lista ?? []).filter((item) => {
      if (qNome && !piega(item.nome).includes(qNome)) return false;
      if (!qLuogo) return true;
      return piega(`${item.provincia} ${item.citta} ${item.sede}`).includes(qLuogo);
    });
  }, [lista, nome, luogo]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl leading-none">{t("Cerca Diving")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Solo i diving con mezzo nautico.")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Nome del diving")}</span>
          <input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            className="min-h-12 w-full rounded-2xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-mist">{t("Regione o provincia")}</span>
          <input
            value={luogo}
            onChange={(event) => setLuogo(event.target.value)}
            className="min-h-12 w-full rounded-2xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon"
          />
        </label>
      </div>

      {errore ? <p className="mt-4 text-sm text-brass">{errore}</p> : null}
      {lista == null ? <p className="mt-6 text-sm text-mist">{t("Carico i diving…")}</p> : null}
      {lista && lista.length === 0 && !errore ? (
        <p className="mt-6 text-sm text-mist">{t("Nessun diving con mezzo nautico.")}</p>
      ) : null}
      {lista && lista.length > 0 && trovati.length === 0 ? (
        <p className="mt-6 text-sm text-mist">{t("Nessun diving corrisponde.")}</p>
      ) : null}

      <ul className="mt-5 grid gap-3">
        {trovati.map((item) => {
          const posto = luogoDi(item);
          const web = sitoUrl(item.sito);
          const mail = emailOk(item.email);
          const tel = item.telefono.trim();
          return (
            <li key={item.id} className="rounded-2xl border border-line bg-deep p-4">
              <div className="flex items-center gap-3">
                {item.hasLogo ? (
                  <ClubLogo
                    id={item.id}
                    hasLogo
                    name={item.nome}
                    className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-lg font-medium leading-tight">{item.nome}</p>
                  {posto ? <p className="mt-1 text-sm text-mist">{posto}</p> : null}
                </div>
              </div>
              {tel || mail || web ? (
                <div className="mt-3 grid">
                  {tel ? (
                    <a href={`tel:${tel.replace(/[^\d+]/g, "")}`} className="flex min-h-11 items-center text-sm text-lagoon">
                      {tel}
                    </a>
                  ) : null}
                  {mail ? (
                    <a href={`mailto:${mail}`} className="flex min-h-11 items-center break-all text-sm text-lagoon">
                      {mail}
                    </a>
                  ) : null}
                  {web ? (
                    <a href={web} target="_blank" rel="noreferrer" className="flex min-h-11 items-center break-all text-sm text-lagoon">
                      {etichettaSito(web)}
                    </a>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-tide text-sm font-medium text-white"
                onClick={() => {
                  try {
                    sessionStorage.setItem(SCELTA, String(item.id));
                  } catch {
                    /* senza memoria di sessione il diving si sceglie nel modulo */
                  }
                  void navigate({ to: "/moduli" });
                }}
              >
                {t("Invia un modulo")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function piega(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function luogoDi(item: DivingTrovato): string {
  const citta = item.citta.trim();
  const provincia = item.provincia.trim();
  const sede = item.sede.trim();
  const base = citta || sede;
  if (base && provincia && !piega(base).includes(piega(provincia))) return `${base} · ${provincia}`;
  return base || provincia;
}

function emailOk(value: string): string {
  const mail = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : "";
}

function sitoUrl(value: string): string {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function etichettaSito(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return url;
  }
}
