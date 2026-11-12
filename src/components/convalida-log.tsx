import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useFondale } from "@/components/app-frame";
import { convalideInAttesa, firmaConvalida } from "@/lib/fondale.functions";
import { messaggioErrore, useT } from "@/lib/i18n";

export function ConvalideInAttesa() {
  const frame = useFondale();
  const [righe, setRighe] = useState<{ id: number; da: string; testo: string }[] | null>(null);

  useEffect(() => {
    let live = true;
    void convalideInAttesa()
      .then((rows) => {
        if (live) setRighe(rows);
      })
      .catch(() => {
        if (live) setRighe([]);
      });
    return () => {
      live = false;
    };
  }, [frame.profile?.userId]);

  if (!righe?.length) return null;

  return (
    <div className="mb-4 grid gap-3">
      {righe.map((riga) => (
        <Scheda
          key={riga.id}
          riga={riga}
          onFatta={() => {
            setRighe((lista) => lista?.filter((item) => item.id !== riga.id) ?? []);
            void frame.refresh();
          }}
        />
      ))}
    </div>
  );
}

function Scheda({ riga, onFatta }: { riga: { id: number; da: string; testo: string }; onFatta: () => void }) {
  const t = useT();
  const [firma, setFirma] = useState("");
  const [tratti, setTratti] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function conferma() {
    if (tratti < 1 || !firma.startsWith("data:image/png;base64,")) {
      setErrore(t("Firma col dito"));
      return;
    }
    setBusy(true);
    setErrore(null);
    try {
      await firmaConvalida({ data: { id: riga.id, firma } });
      onFatta();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non validata."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-brass bg-deep px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-brass">{t("Convalida immersione")}</p>
      <p className="mt-2 text-sm">{riga.testo}</p>
      <Tappeto onChange={(data, n) => { setFirma(data); setTratti(n); }} />
      {errore ? <p className="mt-2 text-sm text-brass">{errore}</p> : null}
      <button type="button" disabled={busy || tratti < 1} className="mt-3 min-h-12 w-full rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60" onClick={() => void conferma()}>
        {busy ? t("Salvo…") : t("Conferma")}
      </button>
    </section>
  );
}

function Tappeto({ onChange }: { onChange: (data: string, tratti: number) => void }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const tratti = useRef(0);
  const attivo = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * 2));
    canvas.height = Math.max(1, Math.floor(rect.height * 2));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#f3efe4";
  }, []);

  function punto(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function giu(event: PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    attivo.current = true;
    const dove = punto(event);
    ctx.beginPath();
    ctx.moveTo(dove.x, dove.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function muovi(event: PointerEvent<HTMLCanvasElement>) {
    if (!attivo.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const dove = punto(event);
    ctx.lineTo(dove.x, dove.y);
    ctx.stroke();
    tratti.current += 1;
  }

  function su() {
    if (!attivo.current || !ref.current) return;
    attivo.current = false;
    onChange(ref.current.toDataURL("image/png"), tratti.current);
  }

  return (
    <div className="mt-3">
      <p className="mb-1 text-sm text-mist">{t("Firma col dito")}</p>
      <canvas ref={ref} className="h-36 w-full touch-none rounded-xl border border-line bg-abyss" onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} />
    </div>
  );
}
