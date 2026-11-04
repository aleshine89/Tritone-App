import { useState } from "react";
import { FotoPiena } from "@/components/foto-vista";
import { accettaLegali, type SessionContext } from "@/lib/fondale.functions";
import { documentiDi, testoDi, type TipoLegale } from "@/lib/legali";
import { messaggioErrore, useT } from "@/lib/i18n";

export function LegaliGate({ tipo, onDone, onEsci }: { tipo: TipoLegale; onDone: (next: SessionContext) => void; onEsci: () => void }) {
  const t = useT();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aperto, setAperto] = useState<{ titolo: string; href: string } | null>(null);
  const documenti = documentiDi(tipo);
  const testo = testoDi(tipo);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 pt-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-3xl leading-none">{t("Documenti da accettare")}</h1>
      <p className="mt-3 text-sm text-mist">{t("Per usare Tritone leggi i documenti e spunta la dichiarazione. Se li aggiorniamo, te li chiediamo di nuovo.")}</p>
      <ul className="mt-5 space-y-2">
        {documenti.map((doc) => (
          <li key={doc.href}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center rounded-2xl border border-line px-4 text-left text-sm text-lagoon underline"
              onClick={() => setAperto({ titolo: `${t(doc.titolo)} (v${doc.versione})`, href: doc.href })}
            >
              {t(doc.titolo)} (v{doc.versione})
            </button>
          </li>
        ))}
      </ul>
      <label className="mt-6 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={ok} onChange={(event) => setOk(event.target.checked)} />
        <span>{testo}</span>
      </label>
      <p className="mt-2 text-xs text-mist">{t("L'accettazione viene registrata con data, ora e indirizzo IP.")}</p>
      {error ? <p className="mt-3 text-sm text-brass">{t(error)}</p> : null}
      <button
        type="button"
        disabled={!ok || busy}
        className="mt-5 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          setError(null);
          void accettaLegali({ data: { accetto: true } })
            .then(onDone)
            .catch((reason: unknown) => {
              setError(messaggioErrore(reason, "Non salvato."));
              setBusy(false);
            });
        }}
      >
        {busy ? t("Salvo…") : t("Accetta e entra")}
      </button>
      <button
        type="button"
        className="mt-3 min-h-11 w-full rounded-full border border-line text-sm"
        onClick={onEsci}
      >
        {t("Esci")}
      </button>
      {aperto ? <FotoPiena src={aperto.href} alt={aperto.titolo} onClose={() => setAperto(null)} /> : null}
    </main>
  );
}
