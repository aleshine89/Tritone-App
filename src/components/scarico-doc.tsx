import { useEffect } from "react";
import { SCARICO_TESTO, SCARICO_TITOLO } from "@/lib/scarico-pianificatore";
import { useT } from "@/lib/i18n";

export function ScaricoDocumento({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titolo = t(SCARICO_TITOLO);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={titolo}>
      <div className="flex shrink-0 items-center justify-end px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <button type="button" className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium" onClick={onClose}>
          {t("Chiudi")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <h2 className="text-2xl text-white">{titolo}</h2>
        <p className="mt-4 text-sm leading-relaxed text-white">{t(SCARICO_TESTO)}</p>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button type="button" className="min-h-12 w-full rounded-full bg-lagoon text-sm font-medium" onClick={onClose}>
          {t("Chiudi")}
        </button>
      </div>
    </div>
  );
}
