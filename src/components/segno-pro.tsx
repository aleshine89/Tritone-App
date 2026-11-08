import { useFondale } from "@/components/app-frame";
import { MascheraPro } from "@/components/maschera-pro";

export function SegnoPro({ className }: { className?: string }) {
  const frame = useFondale();
  const argento = frame.abbonamento.ruolo === "staff" && frame.profile?.pianoAbb !== "pro";
  return <MascheraPro className={className} argento={argento} />;
}
