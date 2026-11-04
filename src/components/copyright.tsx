export function Copyright({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-mist ${className}`.trim()}>
      © 2026 Mogliani Alessandro - Tutti i diritti riservati.
    </p>
  );
}
