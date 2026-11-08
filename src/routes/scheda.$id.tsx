import { useEffect, useState } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { SchedaEditor } from "@/components/scheda-editor";
import { getSubmission, type SubmissionDetail } from "@/lib/fondale.functions";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/scheda/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const solaLettura = hash === "lettura" || hash === "#lettura";
  return (
    <AppFrame>
      <Existing id={id} solaLettura={solaLettura} />
    </AppFrame>
  );
}

function Existing({ id, solaLettura }: { id: string; solaLettura: boolean }) {
  const t = useT();
  const [row, setRow] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSubmission({ data: { id: Number(id) } })
      .then((item) => {
        if (live) setRow(item);
      })
      .catch((reason: unknown) => {
        if (live) setError(messaggioErrore(reason, "Scheda non trovata."));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (error) return <p className="text-sm text-brass">{error}</p>;
  if (!row) return <p className="text-sm text-mist">{t("Apro la scheda…")}</p>;
  return (
    <SchedaEditor
      formKey={row.formKey}
      soloLettura={solaLettura}
      existing={{
        id: row.id,
        status: row.status,
        payload: row.payload,
        createdAt: row.createdAt,
        authorName: row.authorName,
        mine: row.mine,
        clubId: row.clubId,
        riservato: row.riservato,
        aperture: row.aperture,
        modifiche: row.modifiche,
      }}
    />
  );
}
