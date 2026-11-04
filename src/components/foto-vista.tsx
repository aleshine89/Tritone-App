/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export type Allegato = { name: string; type: string; data: string };

export function FotoPiena({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const t = useT();
  const pdf = isPdf(src);
  const shown = usePdfUrl(src, pdf);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex shrink-0 items-center justify-end px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <button type="button" className="min-h-11 rounded-full bg-lagoon px-5 text-sm font-medium" onClick={onClose}>
          {t("Chiudi")}
        </button>
      </div>
      <div className="min-h-0 flex-1 px-2" onClick={pdf ? undefined : onClose}>
        {pdf ? (
          <iframe title={alt} src={shown} className="h-full w-full rounded-xl bg-white" />
        ) : (
          <img src={src} alt={alt} className="h-full w-full object-contain" onClick={onClose} />
        )}
      </div>
      {pdf ? (
        <div className="shrink-0 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button type="button" className="min-h-12 w-full rounded-full bg-lagoon text-sm font-medium" onClick={onClose}>
            {t("Chiudi")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useAllegato(id: number, enabled: boolean, load: (id: number) => Promise<Allegato>) {
  const [file, setFile] = useState<Allegato | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setFile(null);
      setFailed(false);
      return;
    }
    let live = true;
    setFile(null);
    setFailed(false);
    load(id)
      .then((next) => {
        if (live) setFile(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, enabled, load]);

  return { file, failed };
}

export function AnteprimaFile({
  id,
  enabled,
  load,
  alt,
  className,
}: {
  id: number;
  enabled: boolean;
  load: (id: number) => Promise<Allegato>;
  alt: string;
  className?: string;
}) {
  const t = useT();
  const { file, failed } = useAllegato(id, enabled, load);
  const [open, setOpen] = useState(false);
  const image = file?.type.startsWith("image/") ? file : null;

  return (
    <>
      <button type="button" className="block w-full overflow-hidden bg-deep text-left" onClick={() => file && setOpen(true)} disabled={!file}>
        {image ? (
          <img src={image.data} alt={alt} className={className ?? "aspect-[3/4] w-full object-contain"} />
        ) : (
          <span className={`grid place-items-center text-xs text-mist ${className ?? "aspect-[3/4] w-full"}`}>
            {failed ? t("Non riesco ad aprirla") : file ? "PDF" : t("Apro…")}
          </span>
        )}
      </button>
      {open && file ? <FotoPiena src={file.data} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function AnteprimaLocale({ data, type, alt }: { data: string; type: string; alt: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const image = type.startsWith("image/");
  return (
    <>
      <button type="button" className="mt-3 block w-full overflow-hidden rounded-2xl border border-line bg-deep" onClick={() => setOpen(true)}>
        {image ? <img src={data} alt={alt} className="max-h-56 w-full object-contain" /> : <span className="grid min-h-24 place-items-center text-sm">{t("Apri il PDF")}</span>}
      </button>
      {open ? <FotoPiena src={data} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function isPdf(src: string) {
  if (src.startsWith("data:application/pdf")) return true;
  const path = src.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  return path.endsWith(".pdf");
}

function usePdfUrl(src: string, pdf: boolean) {
  const [url, setUrl] = useState(src);

  useEffect(() => {
    if (!pdf) {
      setUrl(src);
      return;
    }
    let dead = false;
    let objectUrl = "";
    fetch(src)
      .then((response) => response.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!dead) setUrl(objectUrl);
      })
      .catch(() => {
        if (!dead) setUrl(src);
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, pdf]);

  return url;
}
