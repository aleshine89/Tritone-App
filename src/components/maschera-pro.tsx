import { useId } from "react";

export function MascheraPro({ className, argento = false }: { className?: string; argento?: boolean }) {
  const id = `tridente-${useId().replace(/:/g, "")}`;
  const chiaro = argento ? "#f4f7fb" : "#fff1b8";
  const medio = argento ? "#c5ced6" : "#e6b23c";
  const scuro = argento ? "#7d8b99" : "#9a6412";
  return (
    <span className="inline-flex shrink-0 items-center align-middle" title="Pro">
      <svg viewBox="0 0 64 64" className={className ?? "ml-1 size-6"} aria-hidden>
        <defs>
          <linearGradient id={id} x1="14" y1="4" x2="50" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={chiaro} />
            <stop offset="0.42" stopColor={medio} />
            <stop offset="1" stopColor={scuro} />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" fill="none" stroke={`url(#${id})`} strokeWidth="2.2" />
        <path
          fill={`url(#${id})`}
          d="M32 6.4 36.4 15.6 33.6 16.6v16.2h-3.2V16.6L27.6 15.6 32 6.4z
             M20.2 15.2 16.8 19.4c-4.2 6.2-2.6 14.2 4.6 18.2l2.2-3.4c-4.4-2.4-5.4-7.2-2.6-11.2l2.8-2.2-3.6-5.6z
             M43.8 15.2 47.2 19.4c4.2 6.2 2.6 14.2-4.6 18.2l-2.2-3.4c4.4-2.4 5.4-7.2 2.6-11.2l-2.8-2.2 3.6-5.6z
             M24.2 34.2h15.6c.4 2-1.4 3.8-4.2 4.4-1.6.4-2.8.4-3.6 0-2.6-.6-4.2-2.2-3.8-4h-4z
             M29.2 39.2h5.6V54h-5.6V39.2z"
        />
      </svg>
      <span className="sr-only">Pro</span>
    </span>
  );
}
