import { useCallback, useEffect, useRef, useState, type PointerEvent as Puntatore } from "react";
import { useT } from "@/lib/i18n";
import { bordoDocumento, scalaRiquadro, type Riquadro } from "@/lib/ritaglio-documento";

type Presa = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MANIGLIE: { presa: Presa; left: string; top: string }[] = [
  { presa: "nw", left: "0%", top: "0%" },
  { presa: "n", left: "50%", top: "0%" },
  { presa: "ne", left: "100%", top: "0%" },
  { presa: "e", left: "100%", top: "50%" },
  { presa: "se", left: "100%", top: "100%" },
  { presa: "s", left: "50%", top: "100%" },
  { presa: "sw", left: "0%", top: "100%" },
  { presa: "w", left: "0%", top: "50%" },
];

function eImmagine(file: File): boolean {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

function limita(valore: number, min: number, max: number) {
  return Math.min(max, Math.max(min, valore));
}

function sposta(presa: Presa, start: Riquadro, dx: number, dy: number, maxW: number, maxH: number): Riquadro {
  const min = Math.max(24, Math.round(Math.min(maxW, maxH) * 0.08));
  let { x, y, w, h } = start;
  const destra = x + w;
  const basso = y + h;
  if (presa === "move") {
    return { x: limita(x + dx, 0, Math.max(0, maxW - w)), y: limita(y + dy, 0, Math.max(0, maxH - h)), w, h };
  }
  const nord = presa === "n" || presa === "nw" || presa === "ne";
  const sud = presa === "s" || presa === "sw" || presa === "se";
  const ovest = presa === "w" || presa === "nw" || presa === "sw";
  const est = presa === "e" || presa === "ne" || presa === "se";
  if (ovest) {
    const nx = limita(x + dx, 0, destra - min);
    w = destra - nx;
    x = nx;
  }
  if (est) w = limita(w + dx, min, maxW - x);
  if (nord) {
    const ny = limita(y + dy, 0, basso - min);
    h = basso - ny;
    y = ny;
  }
  if (sud) h = limita(h + dy, min, maxH - y);
  return { x, y, w, h };
}

function proponi(img: HTMLImageElement): Riquadro {
  const max = 360;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  ctx.drawImage(img, 0, 0, w, h);
  const letto = bordoDocumento(ctx.getImageData(0, 0, w, h).data, w, h);
  return scalaRiquadro(letto.riquadro, w, h, img.naturalWidth, img.naturalHeight, letto.rilevato);
}

function FinestraRitaglio({ file, onChiudi }: { file: File; onChiudi: (file: File | null) => void }) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<Riquadro | null>(null);
  const [misura, setMisura] = useState<{ w: number; h: number } | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    const locale = URL.createObjectURL(file);
    setUrl(locale);
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      URL.revokeObjectURL(locale);
      document.body.style.overflow = precedente;
    };
  }, [file]);

  useEffect(() => {
    const suTasto = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChiudi(null);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [onChiudi]);

  const pixel = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * img.naturalWidth,
      y: ((clientY - rect.top) / rect.height) * img.naturalHeight,
    };
  }, []);

  function inizia(presa: Presa, event: Puntatore<HTMLElement>) {
    if (!crop) return;
    const punto = pixel(event.clientX, event.clientY);
    if (!punto) return;
    event.preventDefault();
    event.stopPropagation();
    const origine = { x: punto.x, y: punto.y, crop };
    const suMuovi = (ev: PointerEvent) => {
      const img = imgRef.current;
      const ora = pixel(ev.clientX, ev.clientY);
      if (!img || !ora) return;
      setCrop(sposta(presa, origine.crop, ora.x - origine.x, ora.y - origine.y, img.naturalWidth, img.naturalHeight));
    };
    const suFine = () => {
      window.removeEventListener("pointermove", suMuovi);
      window.removeEventListener("pointerup", suFine);
      window.removeEventListener("pointercancel", suFine);
    };
    window.addEventListener("pointermove", suMuovi);
    window.addEventListener("pointerup", suFine);
    window.addEventListener("pointercancel", suFine);
  }

  async function conferma() {
    const img = imgRef.current;
    if (!img || !crop) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.w));
    canvas.height = Math.max(1, Math.round(crop.h));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    const nome = file.name.replace(/\.[^.]+$/, "") || "documento";
    onChiudi(new File([blob], `${nome}.jpg`, { type: "image/jpeg" }));
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-abyss/95 px-4 py-4" role="dialog" aria-modal="true" aria-labelledby="titolo-ritaglio">
      <h2 id="titolo-ritaglio" className="text-xl">{t("Ritaglia il documento")}</h2>
      <p className="mt-1 text-sm text-mist">{t("Trascina angoli e lati. Il riquadro parte dai bordi, se li vedo.")}</p>
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        {url ? (
          <div
            ref={stageRef}
            className="relative inline-block max-w-full touch-none"
          >
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              className="block max-h-[62vh] max-w-full"
              onLoad={(event) => {
                setMisura({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
                setCrop(proponi(event.currentTarget));
              }}
              onError={() => setErrore(true)}
            />
            {crop && misura ? (
              <>
                <div className="pointer-events-none absolute bg-abyss/70" style={{ left: 0, top: 0, right: 0, height: `${(crop.y / misura.h) * 100}%` }} />
                <div className="pointer-events-none absolute bg-abyss/70" style={{ left: 0, right: 0, bottom: 0, top: `${((crop.y + crop.h) / misura.h) * 100}%` }} />
                <div className="pointer-events-none absolute bg-abyss/70" style={{ left: 0, top: `${(crop.y / misura.h) * 100}%`, width: `${(crop.x / misura.w) * 100}%`, height: `${(crop.h / misura.h) * 100}%` }} />
                <div className="pointer-events-none absolute bg-abyss/70" style={{ right: 0, top: `${(crop.y / misura.h) * 100}%`, width: `${((misura.w - crop.x - crop.w) / misura.w) * 100}%`, height: `${(crop.h / misura.h) * 100}%` }} />
                <div
                  className="absolute border-2 border-brass"
                  style={{
                    left: `${(crop.x / misura.w) * 100}%`,
                    top: `${(crop.y / misura.h) * 100}%`,
                    width: `${(crop.w / misura.w) * 100}%`,
                    height: `${(crop.h / misura.h) * 100}%`,
                  }}
                  onPointerDown={(event) => inizia("move", event)}
                >
                  {MANIGLIE.map((maniglia) => (
                    <span
                      key={maniglia.presa}
                      role="presentation"
                      className="absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
                      style={{ left: maniglia.left, top: maniglia.top }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        inizia(maniglia.presa, event);
                      }}
                    >
                      <i className="size-3.5 rounded-sm border border-deep bg-brass" />
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {errore ? <p className="mt-2 text-sm text-brass">{t("Non riesco a mostrare questa foto.")}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => onChiudi(null)}>
          {t("Annulla")}
        </button>
        <button type="button" disabled={!crop || errore} className="min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60" onClick={() => void conferma()}>
          {t("Usa questo ritaglio")}
        </button>
      </div>
    </div>
  );
}

export function useRitaglioDocumento() {
  const attesa = useRef<{ file: File; resolve: (file: File | null) => void } | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const chiedi = useCallback((ingresso: File) => {
    if (!eImmagine(ingresso)) return Promise.resolve(ingresso);
    attesa.current?.resolve(null);
    return new Promise<File | null>((resolve) => {
      attesa.current = { file: ingresso, resolve };
      setFile(ingresso);
    });
  }, []);

  const chiudi = useCallback((risultato: File | null) => {
    attesa.current?.resolve(risultato);
    attesa.current = null;
    setFile(null);
  }, []);

  const pannello = file ? <FinestraRitaglio file={file} onChiudi={chiudi} /> : null;
  return { chiedi, pannello };
}
