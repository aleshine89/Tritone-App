import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
};

const SW_URL = "/sw.js?v=20261006b";

export function RegisterPwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
    }
    const refresh = () => {
      void navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
    };
    void navigator.serviceWorker.register(SW_URL, { updateViaCache: "none" }).catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

export function InstallApp() {
  const t = useT();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    try {
      setVisibile(localStorage.getItem("tritone-installa-chiuso") !== "1");
    } catch {
      setVisibile(false);
    }
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visibile) return null;

  function chiudi() {
    try {
      localStorage.setItem("tritone-installa-chiuso", "1");
    } catch {
      /* il telefono può bloccare la memoria locale */
    }
    setVisibile(false);
  }

  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <p>{t("Per non vedere l’indirizzo in alto, installa Tritone. Una scorciatoia del browser lo lascia visibile.")}</p>
      <p className="mt-2">{t("iPhone: apri il link pubblicato in Safari, tocca Condividi, poi Aggiungi a Home. Si apre a tutto schermo.")}</p>
      <p className="mt-1">{t("Android: apri lo stesso link in Chrome, menu, Installa app. Non usare «Aggiungi a schermata Home».")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompt ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full bg-lagoon px-4 text-sm font-medium"
            onClick={() => {
              void prompt.prompt().finally(() => setPrompt(null));
            }}
          >
            {t("Installa sul telefono")}
          </button>
        ) : null}
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={chiudi}>
          {t("Chiudi")}
        </button>
      </div>
    </div>
  );
}
