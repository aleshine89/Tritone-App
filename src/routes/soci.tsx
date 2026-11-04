import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { AreaSoci } from "@/components/area-soci";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/soci")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Soci />
    </AppFrame>
  );
}

function Soci() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-mist">
        <ArrowLeft className="size-4" />
        {t("Home")}
      </Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Soci")}</h1>
      <AreaSoci />
    </div>
  );
}
