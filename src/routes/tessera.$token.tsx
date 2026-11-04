import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import { verificaTessera, type VerificaTessera } from "@/lib/fondale.functions";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/tessera/$token")({ component: Page });

function Page() {
  const { token } = Route.useParams();
  const t = useT();
  const [dato, setDato] = useState<VerificaTessera | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    verificaTessera({ data: { token } })
      .then((value) => {
        if (live) setDato(value);
      })
      .catch(() => {
        if (live) setDato(null);
      });
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <p className="text-xs uppercase tracking-wide text-brass">{t("Verifica tessera")}</p>
      {dato === undefined ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {dato === null ? <p className="mt-4 text-sm text-brass">{t("Tessera non trovata.")}</p> : null}
      {dato ? (
        <article className="mt-4 overflow-hidden rounded-2xl border border-line bg-deep">
          <div className="h-1.5 bg-lagoon" />
          <div className="px-4 py-4">
            <span className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-line bg-abyss text-lagoon">
              <Waves className="size-7" aria-hidden />
              {dato.logo ? <img src={dato.logo} alt="" className="absolute inset-0 h-16 w-16 bg-white object-contain" /> : null}
            </span>
            <p className="mt-4 text-2xl font-medium">{dato.intestatario}</p>
            <p className="mt-2 text-sm">{t("N. {numero}", { numero: dato.numero })}</p>
            <p className="mt-1 text-sm text-mist">{dato.club}</p>
            <p className="text-xs text-mist">{t("Anno {anno}", { anno: dato.anno })}</p>
            <p className={`mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${dato.attivo ? "bg-lagoon text-ink" : "bg-danger/15 text-danger"}`}>
              {dato.attivo ? t("Socio attivo") : t("Non attivo")}
            </p>
          </div>
        </article>
      ) : null}
    </main>
  );
}
