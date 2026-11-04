import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/smile")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Hub />
    </AppFrame>
  );
}

function Hub() {
  const frame = useFondale();
  const t = useT();
  const staff = frame.desk;

  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t("Schede inviate")}</h1>
        <p className="mt-2 text-sm text-mist">{t("Le schede e gli attrezzi sono della scuola.")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl leading-none">{t("Schede inviate")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Schede dei subacquei e attrezzi della scuola.")}</p>
      <Link to="/uscite" search={{ id: undefined }} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-lagoon px-4 text-sm font-medium">
        {t("Registro")}
      </Link>
      <ul className="mt-6 space-y-4">
        <li>
          <Link
            to="/archivio"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-medium"
          >
            {t("Archivio moduli")}
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-mist">{t("Schede compilate, da consultare e stampare.")}</p>
        </li>
        <li>
          <Link
            to="/attrezzatura"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-medium"
          >
            {t("Attrezzi")}
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-mist">{t("Scadenze e manutenzioni dell'attrezzatura.")}</p>
        </li>
      </ul>
    </div>
  );
}
