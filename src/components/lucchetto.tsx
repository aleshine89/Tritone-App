import { Link } from "@tanstack/react-router";
import { useFondale } from "@/components/app-frame";
import { formatDay } from "@/lib/format";
import { useT } from "@/lib/i18n";

export function Lucchetto({ chiusura }: { chiusura: "prova" | "prezzo" }) {
  const t = useT();
  return (
    <section className="mx-auto max-w-3xl rounded-card border border-line bg-surface p-5">
      <h2 className="text-2xl">{chiusura === "prova" ? t("Prova fino al {data}", { data: formatDay("2027-03-31") }) : t("Sblocca con Pro")}</h2>
      <p className="mt-2 text-sm text-mist">{t("Pianifica, specie, MOD e checklist. I moduli da inviare restano aperti. Il Pro costa 14,90 € l'anno.")}</p>
      {chiusura === "prezzo" ? (
        <Link to="/piano" search={{ esito: undefined, session_id: undefined, tipo: undefined }} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brass px-4 text-sm font-medium text-ink">
          {t("Sblocca con Pro")}
        </Link>
      ) : (
        <p className="mt-4 text-sm text-brass">{t("Fino al 31 marzo 2027 l'attivazione è gratuita.")}</p>
      )}
    </section>
  );
}

export function ScuolaChiusa() {
  const t = useT();
  const frame = useFondale();
  const staff = frame.desk && !frame.comeCliente;
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-3xl leading-none">{t("Diving non in regola")}</h1>
      <p className="mt-3 text-sm text-mist">
        {t("L'area della scuola, le anagrafiche e i moduli ricevuti si aprono solo se il diving è in prova valida oppure attivo. Login, profilo e moduli già inviati restano consultabili.")}
      </p>
      {staff ? (
        <Link to="/archivio" className="mt-4 inline-flex min-h-11 items-center text-sm text-lagoon">
          {t("Archivio moduli")}
        </Link>
      ) : null}
    </section>
  );
}
