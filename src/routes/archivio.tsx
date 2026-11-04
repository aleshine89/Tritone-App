import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { AppFrame, useFondale } from "@/components/app-frame";
import { listSubmissions, type SubmissionListItem } from "@/lib/fondale.functions";
import { formByKey, GROUP_LABEL } from "@/lib/forms";
import { formatDay, formatWhen, sortLabel } from "@/lib/format";
import { messaggioErrore, linguaAttuale, useT } from "@/lib/i18n";

export const Route = createFileRoute("/archivio")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Archive />
    </AppFrame>
  );
}

const sorts = [
  { id: "dive", label: "Data immersione" },
  { id: "created", label: "Data registrazione" },
  { id: "alpha", label: "Alfabetico" },
] as const;

const groups = ["tutti", "persone", "immersioni", "staff", "attrezzatura"] as const;

const tipi = [
  { id: "", label: "Tutti i moduli" },
  { id: "scheda-socio", label: "Scheda socio" },
  { id: "registro-immersione", label: "Scheda subacqueo" },
  { id: "questionario-medico", label: "Questionario medico" },
  { id: "brevetto-esperienza", label: "Brevetto ed esperienza" },
  { id: "informativa-consenso", label: "Informativa e consenso" },
] as const;

function Archive() {
  const t = useT();
  const frame = useFondale();
  const navigate = useNavigate();
  const staff = frame.pronta && frame.desk && !frame.comeCliente;
  const [sort, setSort] = useState<(typeof sorts)[number]["id"]>("dive");
  const [group, setGroup] = useState<(typeof groups)[number]>("tutti");
  const [tipo, setTipo] = useState<(typeof tipi)[number]["id"]>("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filtri, setFiltri] = useState(false);
  const [perCreazione, setPerCreazione] = useState(false);
  const [creato, setCreato] = useState("");
  const [immersione, setImmersione] = useState("");
  const [rows, setRows] = useState<SubmissionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  const [giorno, setGiorno] = useState<string | null>(null);
  const [mese, setMese] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 200);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!frame.pronta) return;
    if (!frame.desk || frame.comeCliente) {
      void navigate({ to: "/" });
      return;
    }
    let live = true;
    listSubmissions({ data: { sort, group, formKey: tipo || undefined, q: query, archivio: true, creato, immersione } })
      .then((items) => {
        if (live) setRows(items);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(messaggioErrore(reason, "Registro non disponibile."));
        setRows([]);
      });
    return () => {
      live = false;
    };
  }, [sort, group, tipo, query, creato, immersione, frame.profile?.userId, frame.pronta, frame.desk, frame.comeCliente, staff, navigate]);

  useEffect(() => {
    if (frame.oggi) setMese((current) => current || frame.oggi.slice(0, 7));
  }, [frame.oggi]);

  if (!staff) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{t("Archivio moduli")}</h1>
          <p className="mt-2 text-sm text-mist">
            {rows === null ? "…" : rows.length === 1 ? t("1 scheda") : t("{n} schede", { n: rows.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print inline-flex items-center gap-1 text-xs text-mist"
        >
          <Printer className="size-3.5" />
          {t("Stampa schede")}
        </button>
      </div>

      <div className="print-only mt-4 text-ink">
        <p className="text-2xl">{frame.club.nome}</p>
        <p className="text-sm">
          {t("Archivio moduli")} · {t(sortLabel(sort))} · {(rows?.length ?? 0) === 1 ? t("1 scheda") : t("{n} schede", { n: rows?.length ?? 0 })}
        </p>
      </div>

      <div className="no-print mt-4">
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("Cerca per cognome o nome")}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-deep px-4 text-sm outline-none focus-visible:border-brass"
          />
          <button type="button" className="shrink-0 text-sm text-lagoon" onClick={() => setVista((current) => (current === "calendario" ? "lista" : "calendario"))}>
            {vista === "calendario" ? t("Lista") : t("Calendario")}
          </button>
          <button type="button" className="shrink-0 text-sm text-lagoon" aria-expanded={filtri} onClick={() => setFiltri((aperto) => !aperto)}>
            {t("Filtri")}
          </button>
        </div>
        {filtri ? (
          <div className="mt-3 grid gap-3 rounded-2xl border border-line bg-deep p-3">
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t("Tipo di modulo")}</span>
              <select value={tipo} onChange={(event) => setTipo(event.target.value as (typeof tipi)[number]["id"])} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 text-sm">
                {tipi.map((item) => (
                  <option key={item.id || "tutti"} value={item.id}>{t(item.label)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t("Data immersione")}</span>
              <input type="date" value={immersione} onChange={(event) => setImmersione(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3 text-sm" />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={perCreazione}
                onChange={(event) => {
                  const acceso = event.target.checked;
                  setPerCreazione(acceso);
                  if (!acceso) setCreato("");
                }}
                className="h-5 w-5"
              />
              {t("Filtra per data creazione")}
            </label>
            {perCreazione ? (
              <label className="text-sm">
                <span className="mb-1 block text-mist">{t("Data di creazione")}</span>
                <input type="date" value={creato} onChange={(event) => setCreato(event.target.value)} className="min-h-11 rounded-xl border border-line bg-abyss px-3 text-sm" />
              </label>
            ) : null}
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t("Ordine")}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as (typeof sorts)[number]["id"])} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 text-sm">
                {sorts.map((item) => (
                  <option key={item.id} value={item.id}>{t(item.label)}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-1 overflow-x-auto">
              {groups.filter((item) => item !== "attrezzatura").map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setGroup(item)}
                  className={`min-h-9 shrink-0 rounded-full px-2.5 text-xs ${group === item ? "bg-lagoon/15 text-lagoon" : "text-mist"}`}
                >
                  {t(GROUP_LABEL[item])}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-brass">{error}</p> : null}
      {rows === null ? <p className="mt-6 text-sm text-mist">{t("Apro il registro…")}</p> : null}
      {vista === "calendario" && rows ? (
        <Calendario
          mese={mese || frame.oggi.slice(0, 7)}
          oggi={frame.oggi}
          rows={rows}
          giorno={giorno}
          onMese={(next) => {
            setMese(next);
            setGiorno(null);
          }}
          onGiorno={setGiorno}
        />
      ) : null}
      {vista === "lista" && rows && rows.length === 0 ? <p className="mt-6 text-sm text-mist">{t("Nessuna scheda con questi filtri.")}</p> : null}

      {vista === "lista" ? (
      <div className="screen-cards mt-4 space-y-2">
        {rows?.map((row) => (
          <RowCard key={row.id} row={row} />
        ))}
      </div>
      ) : null}
      <table className="print-table hidden w-full text-left text-sm">
          <thead className="border-b border-rule text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-3 py-3 font-medium">{t("Nominativo")}</th>
              <th className="px-3 py-3 font-medium">{t("Modulo")}</th>
              <th className="px-3 py-3 font-medium">{t("Immersione")}</th>
              <th className="px-3 py-3 font-medium">{t("Registrazione")}</th>
              <th className="px-3 py-3 font-medium">{t("Stato")}</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => {
              const title = formByKey(row.formKey)?.title;
              return (
              <tr key={row.id} className="border-b border-rule last:border-0">
                <td className="px-3 py-3">
                  <Link to="/scheda/$id" params={{ id: String(row.id) }} className="font-medium">
                    {row.subjectName}
                  </Link>
                  <div className="text-xs text-ink-soft">{row.extra}</div>
                </td>
                <td className="px-3 py-3">{title ? t(title) : null}</td>
                <td className="px-3 py-3 tabular-nums">{formatDay(row.diveDate)}</td>
                <td className="px-3 py-3 tabular-nums">{formatDay(row.createdAt)}</td>
                <td className="px-3 py-3">{row.status === "bozza" ? t("Bozza") : t("Inviata")}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
    </div>
  );
}

function giornoModulo(row: SubmissionListItem): string {
  const arrivato = (row.createdAt || "").slice(0, 10);
  const dive = (row.diveDate || "").slice(0, 10);
  if (row.formKey === "brevetto-esperienza" || row.formKey === "questionario-medico" || row.formKey === "informativa-consenso") {
    return /^\d{4}-\d{2}-\d{2}$/.test(arrivato) ? arrivato : dive;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(dive) ? dive : arrivato;
}

function spostaMese(mese: string, delta: number): string {
  const [anno, numero] = mese.split("-").map(Number);
  const data = new Date(anno, numero - 1 + delta, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function celleMese(mese: string): (string | null)[] {
  const [anno, numero] = mese.split("-").map(Number);
  const inizio = new Date(anno, numero - 1, 1);
  const vuoti = (inizio.getDay() + 6) % 7;
  const giorni = new Date(anno, numero, 0).getDate();
  const celle: (string | null)[] = Array.from({ length: vuoti }, () => null);
  for (let giorno = 1; giorno <= giorni; giorno += 1) celle.push(`${mese}-${String(giorno).padStart(2, "0")}`);
  return celle;
}

const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function Calendario({
  mese,
  oggi,
  rows,
  giorno,
  onMese,
  onGiorno,
}: {
  mese: string;
  oggi: string;
  rows: SubmissionListItem[];
  giorno: string | null;
  onMese: (mese: string) => void;
  onGiorno: (giorno: string | null) => void;
}) {
  const t = useT();
  const conteggi = new Map<string, number>();
  for (const row of rows) {
    const data = giornoModulo(row);
    if (!data.startsWith(mese)) continue;
    conteggi.set(data, (conteggi.get(data) ?? 0) + 1);
  }
  const [anno, numero] = mese.split("-").map(Number);
  const titolo = new Intl.DateTimeFormat(linguaAttuale() === "en" ? "en-GB" : "it-IT", { month: "long", year: "numeric" }).format(new Date(anno, numero - 1, 1));
  const scelti = giorno
    ? rows
        .filter((row) => giornoModulo(row) === giorno)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id))
    : [];
  return (
    <div className="no-print mt-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="min-h-11 min-w-11 text-lg text-lagoon" aria-label={t("Mese precedente")} onClick={() => onMese(spostaMese(mese, -1))}>
          ‹
        </button>
        <p className="text-lg capitalize">{titolo}</p>
        <button type="button" className="min-h-11 min-w-11 text-lg text-lagoon" aria-label={t("Mese successivo")} onClick={() => onMese(spostaMese(mese, 1))}>
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-mist">
        {GIORNI.map((nome) => (
          <span key={nome}>{t(nome)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celleMese(mese).map((data, index) => {
          if (!data) return <span key={`vuoto-${index}`} />;
          const n = conteggi.get(data) ?? 0;
          const scelto = giorno === data;
          return (
            <button
              key={data}
              type="button"
              disabled={n === 0}
              onClick={() => onGiorno(scelto ? null : data)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm disabled:opacity-60 ${scelto ? "border-lagoon bg-lagoon/15" : "border-line bg-deep"} ${data === oggi ? "text-lagoon" : ""}`}
            >
              <span>{Number(data.slice(8))}</span>
              {n > 0 ? <span className="text-xs font-medium text-lagoon">{n}</span> : null}
            </button>
          );
        })}
      </div>
      {giorno ? (
        <div className="mt-4">
          <p className="text-sm text-mist">{formatDay(giorno)}</p>
          {scelti.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessuna scheda con questi filtri.")}</p> : null}
          <div className="mt-2 space-y-2">
            {scelti.map((row) => (
              <div key={row.id}>
                <p className="mb-1 text-xs text-mist">{formatWhen(row.createdAt)}</p>
                <RowCard row={row} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowCard({ row }: { row: SubmissionListItem }) {
  const t = useT();
  const title = formByKey(row.formKey)?.title;
  return (
    <Link to="/scheda/$id" params={{ id: String(row.id) }} className={`block rounded-2xl border bg-deep px-4 py-3 ${row.status === "inviato" && !row.letto ? "border-brass" : "border-line"}`}>
      <p className="text-sm font-medium">{row.subjectName}</p>
      {title ? <p className="mt-1 text-sm text-mist">{t(title)}</p> : null}
      {row.diveDate ? <p className="mt-1 text-xs text-mist">{formatDay(row.diveDate)}</p> : null}
    </Link>
  );
}
