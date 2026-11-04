import { useState, type ReactNode } from "react";
import { CnsCalc } from "@/components/cns";
import { useT } from "@/lib/i18n";

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-deep px-3 text-foam outline-none focus-visible:border-brass";

const LIMITI = [1.2, 1.3, 1.4, 1.6] as const;

export function ModCalc({ separato = false }: { separato?: boolean }) {
  const t = useT();
  const [o2, setO2] = useState("");
  const [he, setHe] = useState("");
  const [limit, setLimit] = useState<(typeof LIMITI)[number]>(1.4);

  const mix = readMix(o2, he);
  const rows = mix ? LIMITI.map((ppo2) => ({ ppo2, mod: modOf(mix.o2, ppo2) })) : [];
  const chosen = mix ? modOf(mix.o2, limit) : null;

  return (
    <section className={separato ? "rounded-2xl border border-lagoon bg-deep px-4 py-4" : "mt-8"}>
      <h2 className={separato ? "text-xl font-medium" : "text-2xl"}>{separato ? t("Calcolatore MOD") : t("MOD")}</h2>
      <p className="mt-2 text-sm text-mist">
        {t("Profondità massima della miscela che inserisci. Conta solo l'ossigeno: MOD = (PpO2 / FO2 − 1) × 10. La quota mostrata è arrotondata per difetto.")}
      </p>

      <div className={separato ? "mt-4" : "mt-4 rounded-card border border-line bg-surface p-4"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Ossigeno %")}>
            <input inputMode="decimal" value={o2} onChange={(event) => setO2(event.target.value)} className={inputClass} />
          </Field>
          <Field label={t("Elio %")}>
            <input inputMode="decimal" value={he} onChange={(event) => setHe(event.target.value)} className={inputClass} />
          </Field>
        </div>
        {mix ? (
          <p className="mt-2 text-xs text-mist">
            {t(gasName(mix.o2, mix.he))}
            {mix.n2 >= 0 ? ` · ${t("azoto {n}%", { n: Math.round(mix.n2) })}` : ` · ${t("la somma supera il 100%")}`}
            {mix.o2 > 0 ? ` · ${t("in superficie PpO2 {val}", { val: (mix.o2 / 100).toFixed(2) })}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-mist">{t("Scrivi l'ossigeno della miscela.")}</p>
        )}
        {mix && mix.o2 > 0 && mix.o2 < 18 ? (
          <p className="mt-2 text-sm text-brass">{t("In superficie questa miscela è ipossica. Non respirarla prima della quota prevista.")}</p>
        ) : null}
        {mix && mix.n2 < 0 ? <p className="mt-2 text-sm text-brass">{t("Ossigeno e elio insieme superano il 100%.")}</p> : null}

        <p className="mt-4 text-sm text-mist">{t("PpO2 massima")}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {LIMITI.map((ppo2) => (
            <button
              key={ppo2}
              type="button"
              onClick={() => setLimit(ppo2)}
              className={`min-h-11 rounded-xl border text-sm ${limit === ppo2 ? "border-brass bg-deep" : "border-line"}`}
            >
              {ppo2.toFixed(1)}
            </button>
          ))}
        </div>

        {chosen && mix && mix.n2 >= 0 ? (
          <div className="mt-4 rounded-2xl border border-brass/40 px-4 py-4">
            <p className="text-sm text-mist">{t("MOD a PpO2 {val}", { val: limit.toFixed(2) })}</p>
            {chosen.exact < 0 ? (
              <p className="mt-1 text-2xl">{t("Già in superficie superi questa PpO2.")}</p>
            ) : (
              <p className="mt-1 text-4xl">{chosen.floor} m</p>
            )}
            {chosen.exact >= 0 ? <p className="mt-1 text-xs text-mist">{t("Calcolo {exact} m, non scendere oltre {floor} m.", { exact: chosen.exact.toFixed(1), floor: chosen.floor })}</p> : null}
          </div>
        ) : null}

        {rows.length > 0 && mix && mix.n2 >= 0 && mix.o2 > 0 ? (
          <ul className="mt-4 divide-y divide-line text-sm">
            {rows.map((row) => (
              <li key={row.ppo2} className="flex items-baseline justify-between py-2">
                <span className="text-mist">{t("PpO2 {val}", { val: row.ppo2.toFixed(1) })}</span>
                <span>{row.mod.exact < 0 ? t("Oltre il limite in superficie") : `${row.mod.floor} m`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {separato ? null : <CnsCalc />}
      </div>
      <p className="mt-3 text-xs text-mist">{t("È un calcolo sulla percentuale che hai scritto. La responsabilità della quota e della miscela vera resta tua.")}</p>
    </section>
  );
}

function modOf(o2Percent: number, ppo2: number): { exact: number; floor: number } {
  const exact = (ppo2 / (o2Percent / 100) - 1) * 10;
  return { exact, floor: Math.floor(exact) };
}

function readMix(o2s: string, hes: string): { o2: number; he: number; n2: number } | null {
  if (o2s.trim() === "") return null;
  const o2 = Number(o2s.replace(",", "."));
  const he = hes.trim() === "" ? 0 : Number(hes.replace(",", "."));
  if (!Number.isFinite(o2) || !Number.isFinite(he) || o2 <= 0 || o2 > 100 || he < 0 || he > 100) return null;
  return { o2, he, n2: 100 - o2 - he };
}

function gasName(o2: number, he: number): string {
  const o = Math.round(o2);
  const h = Math.round(he);
  if (h <= 0 && o >= 99) return "Ossigeno";
  if (h <= 0 && o >= 20 && o <= 22) return "Aria";
  if (h <= 0) return `EAN${o}`;
  return `Tx ${o}/${h}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-mist">{label}</span>
      {children}
    </label>
  );
}
