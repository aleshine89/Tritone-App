import { useState } from "react";
import { incassaPagamento, registroPagamenti, type PagamentoRiga } from "@/lib/pagamenti.functions";
import { euro } from "@/lib/prezzi";
import { messaggioErrore, useT } from "@/lib/i18n";
import { formatDay } from "@/lib/format";

export function RegistroPagamenti() {
  const t = useT();
  const [mese, setMese] = useState(new Date().toISOString().slice(0, 7));
  const [filtro, setFiltro] = useState<"fattura" | "carta" | "bonifico">("fattura");
  const [righe, setRighe] = useState<PagamentoRiga[] | null>(null);
  const [scelto, setScelto] = useState<PagamentoRiga | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  function carica(next = filtro) {
    setErrore(null);
    void registroPagamenti({ data: { mese, filtro: next } })
      .then(setRighe)
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Registro non aperto.")));
  }

  function scarica() {
    if (!righe) return;
    const corpo = ["data,nome,tipo,metodo,importo,fattura", ...righe.map((row) =>
      [row.quando, row.nome, row.tipo, row.metodo, euro(row.importoCent), row.fattura ? "si" : "no"].join(","),
    )].join("\n");
    const url = URL.createObjectURL(new Blob([corpo], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pagamenti-${mese}-${filtro}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-deep p-4">
      <h2 className="text-2xl">{t("Registro pagamenti")}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="month" value={mese} onChange={(event) => setMese(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3" />
        {(["fattura", "carta", "bonifico"] as const).map((voce) => (
          <button key={voce} type="button" className={`min-h-11 rounded-full px-4 text-sm ${filtro === voce ? "bg-lagoon font-medium text-ink" : "border border-line"}`} onClick={() => { setFiltro(voce); carica(voce); }}>
            {voce === "fattura" ? t("Stripe con fattura") : voce === "carta" ? t("Stripe senza fattura") : t("Bonifico")}
          </button>
        ))}
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={() => carica()}>{t("Apri")}</button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={scarica}>{t("Scarica registro")}</button>
      </div>
      {errore ? <p className="mt-2 text-sm text-danger">{errore}</p> : null}
      <ul className="mt-3 grid gap-2">
        {(righe ?? []).map((row) => (
          <li key={row.id}>
            <button type="button" className="w-full rounded-xl border border-line px-3 py-2 text-left text-sm" onClick={() => setScelto(row)}>
              {formatDay(row.quando)} · {row.nome} · {euro(row.importoCent)} · {row.stato === "attesa" ? t("In attesa") : row.applicato ? t("Attivo") : t("Pagato")}
            </button>
            {row.tipo !== "sub" && !row.applicato ? (
              <button
                type="button"
                className="mt-1 min-h-11 rounded-full border border-brass px-4 text-sm text-brass"
                onClick={() => {
                  void incassaPagamento({ data: { id: row.id } })
                    .then(() => carica())
                    .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Piano non attivato.")));
                }}
              >
                {t("Attiva dopo il pagamento")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {scelto ? (
        <div className="mt-3 text-sm">
          <p className="font-medium">{scelto.nome}</p>
          {scelto.fattura ? (
            <p className="mt-1 text-mist">{[scelto.dati.nome, scelto.dati.cognome, scelto.dati.ragione, scelto.dati.cf, scelto.dati.piva, scelto.dati.indirizzo, scelto.dati.sdi, scelto.dati.pec].filter(Boolean).join(" · ") || t("Nessun dato fattura.")}</p>
          ) : <p className="mt-1 text-mist">{t("Senza fattura")}</p>}
        </div>
      ) : null}
    </section>
  );
}
