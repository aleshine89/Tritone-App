import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { SchedaEditor } from "@/components/scheda-editor";

export const Route = createFileRoute("/nuova/$formKey")({ component: Page });

function Page() {
  const { formKey } = Route.useParams();
  return (
    <AppFrame>
      <SchedaEditor formKey={formKey} />
    </AppFrame>
  );
}
