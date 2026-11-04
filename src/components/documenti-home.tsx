import { useEffect, useState } from "react";
import { Award, Cross, Cylinder, Shield } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useFondale } from "@/components/app-frame";
import { listBrevetti, listDocumenti, listKit, type Brevetto, type Documento, type Pezzo } from "@/lib/fondale.functions";
import { formatDay, oggiRoma, scadenzaStato } from "@/lib/format";
import { useT } from "@/lib/i18n";

function dataUtile(dates: string[], oggi: string): string | null {
  const valide = dates.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  if (!valide.length) return null;
  const scadute = valide.filter((day) => day < oggi);
  if (scadute.length) return scadute[scadute.length - 1];
  return valide[0];
}

export function DocumentiHome() {
  const t = useT();
  const frame = useFondale();
  const [cards, setCards] = useState<Brevetto[] | null>(null);
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [kit, setKit] = useState<Pezzo[] | null>(null);
  const [oggi, setOggi] = useState(oggiRoma);

  useEffect(() => {
    let live = true;
    const load = () => {
      Promise.all([listBrevetti(), listDocumenti(), listKit()])
        .then(([nextCards, nextDocs, nextKit]) => {
          if (!live) return;
          setCards(nextCards);
          setDocs(nextDocs);
          setKit(nextKit);
        })
        .catch(() => {
          if (!live) return;
          setCards([]);
          setDocs([]);
          setKit([]);
        });
    };
    load();
    const clock = window.setInterval(() => setOggi(oggiRoma()), 15000);
    const onShow = () => {
      if (document.visibilityState === "visible") {
        setOggi(oggiRoma());
        load();
      }
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      window.clearInterval(clock);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [frame.profile?.userId]);

  const medico = dataUtile((docs ?? []).filter((item) => item.kind === "medico").map((item) => item.scadenza), oggi);
  const assicurazione = dataUtile((docs ?? []).filter((item) => item.kind === "assicurazione").map((item) => item.scadenza), oggi);
  const brevetto = dataUtile((cards ?? []).map((item) => item.scadenza), oggi);
  const attrezzo = dataUtile((kit ?? []).map((item) => item.scadenza), oggi);

  const righe = [
    { voce: "medico" as const, label: "Certificato medico", giorno: medico, icona: Cross },
    { voce: "assicurazione" as const, label: "Assicurazione", giorno: assicurazione, icona: Shield },
    { voce: "brevetti" as const, label: "Brevetti", giorno: brevetto, icona: Award },
    { voce: "attrezzatura" as const, label: "Attrezzatura personale", giorno: attrezzo, icona: Cylinder },
  ];

  return (
    <section className="mt-6 rounded-card border border-line bg-deep px-4">
      <ul>
        {righe.map((riga) => {
          const stato = scadenzaStato(riga.giorno, oggi);
          const scaduta = stato === "scaduta";
          const vicina = stato === "in-scadenza";
          return (
            <li key={riga.voce} className={`-mx-4 border-b border-line/70 px-4 last:border-b-0 ${scaduta ? "bg-danger/10 ring-1 ring-inset ring-danger/40" : ""}`}>
              <Link to="/personale" search={{ voce: riga.voce }} className="flex min-h-12 items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <riga.icona className="size-5 shrink-0 text-lagoon" strokeWidth={1.5} />
                  <span className="truncate text-sm">{t(riga.label)}</span>
                </span>
                <span className={`shrink-0 text-sm ${scaduta ? "font-medium text-danger" : vicina ? "font-medium text-brass" : ""}`}>
                  {stato === "mancante" ? t("Manca") : formatDay(riga.giorno)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}