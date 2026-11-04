import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { WizardSub } from "@/components/wizard-sub";

export const Route = createFileRoute("/inizia")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Gate />
    </AppFrame>
  );
}

function Gate() {
  const frame = useFondale();
  const profile = frame.profile;
  if (!profile) return null;
  if (profile.role !== "subacqueo" || frame.owner || frame.platform) return <Navigate to="/" />;
  return <WizardSub />;
}
