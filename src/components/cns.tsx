import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass";

/** Minuti NOAA per il 100% di CNS. Soglia inclusa: la fascia è quella della ppO2 reale, non quella più alta. */
const FASCE: ReadonlyArray<readonly [number, number]> = [
  [1.6, 45],
  [1.5, 120],
  [1.4, 150],
  [1.3, 180],
  [1.2, 210],
  [1.1, 240],
  [1.0, 300],
  [0.9, 360],
  [0.8, 450],
  [0.7, 570],
  [0.6, 720],
];

type Esito =
  | { ppo2: number; oltre: true }
  | { ppo2: number; oltre: false; minuti: number | null };

export function CnsCalc({ riquadro = false }: { riquadro?: boolean }) {
  const t = useT();
  const [o2, setO2] = useState("");
  const [metri, setMetri] = useState("");
  const [cns, setCns] = useState("");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  function calcola() {
    const valori = leggi(o2, metri, cns);
    if (!valori) {
      setEsito(null);
      setErrore(t("Controlla miscela, profondità e CNS."));
      return;
    }
    setErrore(null);
    const ppo2 = (valori.o2 / 100) * (valori.metri / 10 + 1);
    if (ppo2 > 1.6) {
      setEsito({ ppo2, oltre: true });
      return;
    }
    const limite = fascia(ppo2);
    setEsito({ ppo2, oltre: false, minuti: limite == null ? null : limite * (valori.cns / 100) });
  }

  if (!riquadro) {
    return (
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-lg">{t("Calcolatore CNS")}</h3>
        <p className="mt-2 text-sm text-mist">{t("Tempo a questa profondità e miscela per non superare il CNS che indichi. Fasce NOAA, sulla ppO2 reale.")}</p>
        <div className="mt-4">
          <div className="grid gap-3">
            <Field label={t("Miscela, ossigeno %")}>
              <input inputMode="decimal" value={o2} onChange={(event) => setO2(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("Profondità in metri")}>
              <input inputMode="decimal" value={metri} onChange={(event) => setMetri(event.target.value)} className={inputClass} />
            </Field>
            <Field label={t("CNS desiderato %")}>
              <input inputMode="decimal" value={cns} onChange={(event) => setCns(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <button type="button" onClick={calcola} className="mt-4 min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white">
            {t("Calcola")}
          </button>
          {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
          {esito ? (
            <div className="mt-4 rounded-2xl border border-brass/40 px-4 py-4">
              <p className="text-sm text-mist">{t("PpO2 {val}", { val: esito.ppo2.toFixed(2) })}</p>
              {esito.oltre ? (
                <p className="mt-2 text-sm text-brass">{t("La PpO2 supera 1,6.")}</p>
              ) : esito.minuti == null ? (
                <p className="mt-2 text-lg">{t("A questa PpO2 il tempo non è limitato dal CNS.")}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-mist">{t("Tempo disponibile")}</p>
                  <p className="mt-1 text-4xl">{t("{n} min", { n: minutiTesto(esito.minuti) })}</p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-lagoon bg-deep px-4 py-4">
      <h2 className="text-xl font-medium">{t("Calcolatore CNS")}</h2>
      <p className="mt-1 text-sm text-mist">{t("Tempo disponibile a quella profondità")}</p>
      <div className="mt-4">
        <div className="grid gap-3">
          <Field label={t("Miscela, ossigeno %")}>
            <input inputMode="decimal" value={o2} onChange={(event) => setO2(event.target.value)} className={inputClass} />
          </Field>
          <Field label={t("Profondità in metri")}>
            <input inputMode="decimal" value={metri} onChange={(event) => setMetri(event.target.value)} className={inputClass} />
          </Field>
          <Field label={t("CNS desiderato %")}>
            <input inputMode="decimal" value={cns} onChange={(event) => setCns(event.target.value)} className={inputClass} />
          </Field>
        </div>
        <button type="button" onClick={calcola} className="mt-4 min-h-11 rounded-full bg-tide px-4 text-sm font-medium text-white">
          {t("Calcola")}
        </button>
        {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
        {esito ? (
          <div className="mt-4">
            {esito.oltre ? (
              <p className="text-2xl text-brass">{t("La PpO2 supera 1,6.")}</p>
            ) : esito.minuti == null ? (
              <p className="text-2xl">{t("A questa PpO2 il tempo non è limitato dal CNS.")}</p>
            ) : (
              <p className="text-4xl leading-none">{t("{n} min", { n: minutiTesto(esito.minuti) })}</p>
            )}
            <p className="mt-2 text-sm text-mist">{t("PpO2 {val}", { val: esito.ppo2.toFixed(2) })}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function fascia(ppo2: number): number | null {
  if (ppo2 < 0.5) return null;
  for (const [soglia, minuti] of FASCE) {
    if (ppo2 + 1e-9 >= soglia) return minuti;
  }
  return null;
}

function leggi(o2s: string, metris: string, cnss: string): { o2: number; metri: number; cns: number } | null {
  const o2 = numero(o2s);
  const metri = numero(metris);
  const cns = numero(cnss);
  if (o2 == null || metri == null || cns == null) return null;
  if (o2 <= 0 || o2 > 100 || metri < 0 || metri > 400 || cns <= 0 || cns > 100) return null;
  return { o2, metri, cns };
}

function numero(value: string): number | null {
  const testo = value.trim().replace(",", ".");
  if (!testo) return null;
  const n = Number(testo);
  return Number.isFinite(n) ? n : null;
}

function minutiTesto(minuti: number): string {
  const tondi = Math.round(minuti * 10) / 10;
  return Number.isInteger(tondi) ? String(tondi) : tondi.toFixed(1);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-mist">{label}</span>
      {children}
    </label>
  );
}
