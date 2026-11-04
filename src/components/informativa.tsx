import { useEffect, useState } from "react";
import { getTitolare } from "@/lib/fondale.functions";
import { useT } from "@/lib/i18n";
import { paragrafiInformativa, type TitolareTesto } from "@/lib/informativa";

const VUOTO: TitolareTesto = { nome: "", sede: "", email: "" };
const PREFISSO = "Titolare del trattamento dell'account, del logbook e dei Tools è ";
const FALLBACK_CHI = "il gestore di Tritone. Nome e sede si inseriscono dalla Gestione, e da quel momento compaiono qui";

export function TestoInformativa() {
  const t = useT();
  const [titolare, setTitolare] = useState<TitolareTesto>(VUOTO);

  useEffect(() => {
    let live = true;
    getTitolare()
      .then((next) => {
        if (live) setTitolare(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-mist">
      {paragrafiInformativa(titolare).map((paragraph) => {
        if (paragraph.startsWith(PREFISSO) && paragraph.endsWith(".")) {
          const chi = paragraph.slice(PREFISSO.length, -1);
          const shown = chi === FALLBACK_CHI ? t(FALLBACK_CHI) : chi;
          return (
            <p key={paragraph}>{t("Titolare del trattamento dell'account, del logbook e dei Tools è {chi}.", { chi: shown })}</p>
          );
        }
        return <p key={paragraph}>{t(paragraph)}</p>;
      })}
    </div>
  );
}
