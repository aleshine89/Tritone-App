import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n";

const FALLBACK_MESSAGE = "Si è verificato un errore imprevisto. Prova a ricaricare la pagina.";
const RICARICA = "tritone-chunk-reload";

const MESSAGGIO_AGGIORNAMENTO = "L'app è stata aggiornata. Premi Ricarica per entrare.";

function errorMessage(error: unknown): string {
  if (moduloVecchio(error)) return MESSAGGIO_AGGIORNAMENTO;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

function moduloVecchio(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /dynamically imported module|module script failed|Importing a module script failed/i.test(text);
}

async function ricaricaPulita() {
  try {
    if ("serviceWorker" in navigator) {
      const registri = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registri.map((registro) => registro.unregister()));
    }
    if ("caches" in window) {
      const chiavi = await caches.keys();
      await Promise.all(chiavi.map((chiave) => caches.delete(chiave)));
    }
  } catch {
    /* si ricarica comunque */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("aggiorna", String(Date.now()));
  window.location.replace(url.toString());
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const t = useT();

  useEffect(() => {
    if (!moduloVecchio(error)) return;
    try {
      if (sessionStorage.getItem(RICARICA) === "1") return;
      sessionStorage.setItem(RICARICA, "1");
    } catch {
      return;
    }
    void ricaricaPulita();
  }, [error]);

  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">{t("Qualcosa è andato storto")}</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {t(errorMessage(error))}
      </p>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium text-ink"
        onClick={() => {
          try {
            sessionStorage.removeItem(RICARICA);
          } catch {
            /* ricarica lo stesso */
          }
          void ricaricaPulita();
        }}
      >
        {t("Ricarica")}
      </button>
    </main>
  );
}

export function segnaAppAperta() {
  try {
    sessionStorage.removeItem(RICARICA);
  } catch {
    /* il telefono tiene la pagina com'è */
  }
}