import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { useT } from "@/lib/i18n";
import { DISCLAIMER, FORMS, GROUP_LABEL, type FormGroup } from "@/lib/forms";

export const Route = createFileRoute("/moduli")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Catalog />
    </AppFrame>
  );
}

function Catalog() {
  const t = useT();
  const frame = useFondale();
  const latoScuola = (frame.owner || frame.desk) && !frame.comeCliente;
  const forms = FORMS.filter((form) => {
    if (form.key === "scheda-istruttore" && !frame.owner) return false;
    if (form.group === "attrezzatura" && !latoScuola) return false;
    return true;
  });
  const groups: FormGroup[] = ["persone", "immersioni", "staff", "attrezzatura"];
  const [aperto, setAperto] = useState<FormGroup | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl leading-none">{t("Moduli")}</h1>
      <p className="mt-2 text-sm text-mist">
        {forms.length === 1 ? t("1 modulo") : t("{n} moduli", { n: forms.length })} · {t("scegli il diving quando invii")}
      </p>
      {groups.map((group) => {
        const items = forms.filter((form) => form.group === group);
        if (!items.length) return null;
        return (
          <section key={group} className="mt-4">
            <button
              type="button"
              className="flex min-h-14 w-full items-center justify-between rounded-card border border-line bg-surface px-4 text-left"
              onClick={() => setAperto((current) => (current === group ? null : group))}
            >
              <span>{t(group === "persone" ? "Personali" : GROUP_LABEL[group])}</span>
              <span className="text-sm text-mist">{aperto === group ? t("Chiudi") : items.length}</span>
            </button>
            {aperto === group ? (
              <ul className="mt-2 space-y-2">
                {items.map((form) => (
                  <li key={form.key}>
                    <Link
                      to="/nuova/$formKey"
                      params={{ formKey: form.key }}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line px-4 text-sm"
                    >
                      {t(form.title)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
      <p className="mt-8 text-xs leading-relaxed text-mist">{t(DISCLAIMER)}</p>
    </div>
  );
}
