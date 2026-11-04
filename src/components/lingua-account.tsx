import { useState } from "react";
import { useFondale } from "@/components/app-frame";
import { impostaLingua } from "@/lib/fondale.functions";
import { messaggioErrore, useLingua, useT, type Lingua } from "@/lib/i18n";

export function LinguaAccount() {
  const t = useT();
  const { lingua, setLingua } = useLingua();
  const frame = useFondale();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function scegli(next: Lingua) {
    if (next === lingua || busy) return;
    const prima = lingua;
    setLingua(next);
    setBusy(true);
    setNote(null);
    try {
      await impostaLingua({ data: { lingua: next } });
      await frame.refresh();
    } catch (reason) {
      setLingua(prima);
      setNote(messaggioErrore(reason, "Non salvato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-mist">{t("Lingua")}</span>
        <select
          value={lingua}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value === "en" ? "en" : "it";
            void scegli(next);
          }}
          className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon disabled:opacity-60"
        >
          <option value="it">Italiano</option>
          <option value="en">English</option>
        </select>
      </label>
      {note ? <p className="mt-2 text-sm text-brass">{note}</p> : null}
    </div>
  );
}
