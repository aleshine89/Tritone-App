import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { listSubmissions, type SubmissionListItem } from "@/lib/fondale.functions";
import { formatDay, scadenzaStato } from "@/lib/format";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/attrezzatura")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Gear />
    </AppFrame>
  );
}

const order = ["scaduta", "in-scadenza", "ok", "mancante"] as const;
const label = {
  scaduta: "Scadute",
  "in-scadenza": "Entro 30 giorni",
  ok: "In regola",
  mancante: "Senza scadenza",
};

function Gear() {
  const t = useT();
  const frame = useFondale();
  const [rows, setRows] = useState<SubmissionListItem[] | null>(null);
  const staff = frame.desk;

  useEffect(() => {
    if (!staff) return;
    let live = true;
    listSubmissions({ data: { sort: "dive", group: "attrezzatura" } })
      .then((items) => {
        if (live) setRows(items);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [staff]);

  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">{t("Attrezzatura")}</h1>
        <p className="mt-3 text-sm text-mist">{t("Il registro di collaudo e manutenzione è riservato a istruttori e guide.")}</p>
      </div>
    );
  }

  const grouped = order.map((key) => ({
    key,
    items: (rows ?? []).filter((row) => scadenzaStato(row.scadenza, frame.oggi) === key),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-none">{t("Manutenzione")}</h1>
          <p className="mt-2 text-sm text-mist">
            {rows === null ? "…" : rows.length === 0 ? t("Nessun intervento in registro.") : rows.length === 1 ? t("1 intervento") : t("{n} interventi", { n: rows.length })}
          </p>
        </div>
        <Link to="/nuova/$formKey" params={{ formKey: "registro-attrezzatura" }} className="inline-flex min-h-11 items-center rounded-full bg-lagoon px-4 text-sm font-medium">
          {t("Nuovo intervento")}
        </Link>
      </div>
      {rows === null ? <p className="mt-6 text-sm text-mist">{t("Controllo le scadenze…")}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-6 text-sm text-mist">{t("Nessun intervento in registro.")}</p> : null}
      {grouped.map((bucket) =>
        bucket.items.length ? (
          <section key={bucket.key} className="mt-8">
            <h2 className="text-2xl">{t(label[bucket.key])}</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {bucket.items.map((row) => (
                <li key={row.id}>
                  <Link to="/scheda/$id" params={{ id: String(row.id) }} className="flex min-h-14 items-center justify-between gap-3 py-2">
                    <span>
                      <span className="block text-sm">{row.subjectName}</span>
                      <span className="block text-xs text-mist">{row.extra}</span>
                    </span>
                    <span className={`text-xs tabular-nums ${bucket.key === "scaduta" ? "text-danger" : bucket.key === "in-scadenza" ? "text-brass" : "text-lagoon"}`}>{formatDay(row.scadenza || row.diveDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
