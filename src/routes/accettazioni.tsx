import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppFrame, useFondale } from "@/components/app-frame";
import { listaAccettazioniLegali, type AccettazioneLegale } from "@/lib/fondale.functions";
import { scriviPdfBlocchi } from "@/lib/foglio-pdf";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/accettazioni")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Elenco />
    </AppFrame>
  );
}

const TIPI = [
  { id: "tutti", label: "Tutti" },
  { id: "subacqueo", label: "Subacqueo" },
  { id: "diving", label: "Diving" },
  { id: "gestore", label: "Gestore" },
  { id: "pianificatore", label: "Pianificatore" },
] as const;

function etichetta(tipo: AccettazioneLegale["tipo"]): string {
  if (tipo === "diving") return "Diving";
  if (tipo === "gestore") return "Gestore";
  if (tipo === "pianificatore") return "Pianificatore";
  return "Subacqueo";
}

function Elenco() {
  const t = useT();
  const frame = useFondale();
  const gestore = frame.pronta && frame.platform && !frame.comeCliente;
  const [rows, setRows] = useState<AccettazioneLegale[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPI)[number]["id"]>("tutti");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");

  useEffect(() => {
    if (!gestore) return;
    let live = true;
    listaAccettazioniLegali()
      .then((value) => {
        if (live) setRows(value);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere le accettazioni."));
      });
    return () => {
      live = false;
    };
  }, [gestore]);

  const visibili = useMemo(() => {
    const ago = q.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (tipo !== "tutti" && row.tipo !== tipo) return false;
      if (dal && row.giorno < dal) return false;
      if (al && row.giorno > al) return false;
      if (!ago) return true;
      return `${row.nome} ${row.cognome} ${row.email}`.toLowerCase().includes(ago);
    });
  }, [rows, q, tipo, dal, al]);

  if (!gestore) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl leading-none">{t("Accettazioni legali")}</h1>
        <p className="mt-3 text-sm text-mist">{t("Solo il gestore vede le accettazioni.")}</p>
      </div>
    );
  }

  function scaricaCsv() {
    const header = ["Nome", "Cognome", "Email", "Tipo account", "Data e ora", "Indirizzo IP", "Versione documenti", "Testo checkbox"];
    const lines = visibili.map((row) =>
      [row.nome, row.cognome, row.email, etichetta(row.tipo), row.quando, row.ip, row.versione, row.testo]
        .map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`)
        .join(","),
    );
    const blob = new Blob([`\uFEFF${header.join(",")}\n${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "accettazioni-legali.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function scaricaPdf() {
    const bytes = scriviPdfBlocchi({
      titolo: "Accettazioni legali",
      nota: "Ora di Roma. Elenco filtrato.",
      vuoto: "Nessuna accettazione.",
      blocchi: visibili.map((row) => [
        `${row.cognome} ${row.nome}`.trim() || row.email,
        row.email,
        etichetta(row.tipo),
        row.quando,
        `IP ${row.ip}`,
        row.versione,
        row.testo,
      ]),
    });
    const binario = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binario).set(bytes);
    const blob = new Blob([binario], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "accettazioni-legali.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <Link to="/" className="text-sm text-lagoon">{t("Home")}</Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Accettazioni legali")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Data e ora sono quelle di Roma, al secondo.")}</p>
      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder={t("Cerca per nome o email")}
        className="mt-4 min-h-11 w-full rounded-2xl border border-line bg-deep px-4 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {TIPI.map((voce) => (
          <button
            key={voce.id}
            type="button"
            className={`min-h-11 rounded-full px-3 text-sm ${tipo === voce.id ? "bg-tide font-medium text-white" : "border border-line"}`}
            onClick={() => setTipo(voce.id)}
          >
            {t(voce.label)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-mist">
          {t("Dal")}
          <input type="date" value={dal} onChange={(event) => setDal(event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-deep px-3 text-sm text-foam" />
        </label>
        <label className="text-xs text-mist">
          {t("Al")}
          <input type="date" value={al} onChange={(event) => setAl(event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-deep px-3 text-sm text-foam" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={scaricaCsv}>{t("Esporta CSV")}</button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={scaricaPdf}>{t("Esporta PDF")}</button>
      </div>
      {errore ? <p className="mt-4 text-sm text-brass">{t(errore)}</p> : null}
      {!rows && !errore ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-deep text-xs text-mist">
            <tr>
              <th className="px-3 py-3 font-medium">{t("Nome e email")}</th>
              <th className="px-3 py-3 font-medium">{t("Tipo account")}</th>
              <th className="px-3 py-3 font-medium">{t("Data e ora")}</th>
              <th className="px-3 py-3 font-medium">{t("Indirizzo IP")}</th>
              <th className="px-3 py-3 font-medium">{t("Versione documenti")}</th>
              <th className="px-3 py-3 font-medium">{t("Testo accettato")}</th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <span className="block font-medium">{row.cognome} {row.nome}</span>
                  <span className="block text-xs text-mist">{row.email}</span>
                </td>
                <td className="px-3 py-3">{t(etichetta(row.tipo))}</td>
                <td className="px-3 py-3 whitespace-nowrap">{row.quando}</td>
                <td className="px-3 py-3">{row.ip}</td>
                <td className="px-3 py-3">{row.versione}</td>
                <td className="px-3 py-3 text-xs leading-relaxed">{row.testo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && visibili.length === 0 ? <p className="mt-3 text-sm text-mist">{t("Nessuna accettazione.")}</p> : null}
    </div>
  );
}
