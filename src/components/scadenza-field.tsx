import { useEffect, useState } from "react";
import { formatDay } from "@/lib/format";
import { useLingua, useT } from "@/lib/i18n";

type Parts = { y: string; m: string; d: string };

function split(value: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { y: "", m: "", d: "" };
  return { y: match[1], m: match[2], d: match[3] };
}

function daysInMonth(year: string, month: string): number {
  const y = Number(year) || 2026;
  const m = Number(month) || 1;
  return new Date(y, m, 0).getDate();
}

export function ScadenzaField({
  value,
  onChange,
  tone = "app",
}: {
  value: string;
  onChange: (value: string) => void;
  tone?: "app" | "paper";
}) {
  const t = useT();
  const { lingua } = useLingua();
  const [parts, setParts] = useState<Parts>(() => split(value));

  useEffect(() => {
    setParts(split(value));
  }, [value]);

  function commit(next: Parts) {
    const max = daysInMonth(next.y, next.m);
    const day = next.d && Number(next.d) > max ? String(max).padStart(2, "0") : next.d;
    const fixed = { ...next, d: day };
    setParts(fixed);
    onChange(fixed.y && fixed.m && fixed.d ? `${fixed.y}-${fixed.m}-${fixed.d}` : "");
  }

  const yearNow = new Date().getFullYear();
  const years: string[] = [];
  for (let year = yearNow + 20; year >= yearNow - 100; year -= 1) years.push(String(year));
  if (parts.y && !years.includes(parts.y)) years.unshift(parts.y);
  const days = Array.from({ length: daysInMonth(parts.y, parts.m) }, (_, index) => String(index + 1).padStart(2, "0"));
  const monthName = (index: number) =>
    new Intl.DateTimeFormat(lingua === "en" ? "en-GB" : "it-IT", { month: "short" }).format(new Date(2026, index, 1));

  const selectClass =
    tone === "paper"
      ? "min-h-11 w-full rounded-xl border border-rule bg-transparent px-2 text-ink outline-none focus-visible:border-lagoon"
      : "min-h-11 w-full rounded-xl border border-line bg-deep px-2 text-foam outline-none focus-visible:border-lagoon";

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <select aria-label={t("Giorno")} value={parts.d} onChange={(event) => commit({ ...parts, d: event.target.value })} className={selectClass}>
          <option value="">{t("Giorno")}</option>
          {days.map((day) => (
            <option key={day} value={day}>{Number(day)}</option>
          ))}
        </select>
        <select aria-label={t("Mese")} value={parts.m} onChange={(event) => commit({ ...parts, m: event.target.value })} className={selectClass}>
          <option value="">{t("Mese")}</option>
          {Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1).padStart(2, "0");
            return <option key={month} value={month}>{monthName(index)}</option>;
          })}
        </select>
        <select aria-label={t("Anno")} value={parts.y} onChange={(event) => commit({ ...parts, y: event.target.value })} className={selectClass}>
          <option value="">{t("Anno")}</option>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      {value ? <p className={`mt-2 text-xs ${tone === "paper" ? "text-ink-soft" : "text-mist"}`}>{formatDay(value)}</p> : null}
    </div>
  );
}
