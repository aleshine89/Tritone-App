import { useEffect, useState } from "react";
import { getClubLogo } from "@/lib/fondale.functions";

const cache = new Map<number, string | null>();
const listeners = new Set<() => void>();

export function rememberLogo(id: number, data: string | null) {
  cache.set(id, data);
  listeners.forEach((notify) => notify());
}

export function ClubLogo({
  id,
  hasLogo = true,
  name,
  className,
}: {
  id: number | null;
  hasLogo?: boolean;
  name: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(id != null ? (cache.get(id) ?? null) : null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const notify = () => setTick((value) => value + 1);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  useEffect(() => {
    if (id == null || !hasLogo) {
      setSrc(null);
      return;
    }
    const hit = cache.get(id);
    if (hit !== undefined) {
      setSrc(hit);
      return;
    }
    let live = true;
    getClubLogo({ data: { id } })
      .then((data) => {
        cache.set(id, data);
        if (live) setSrc(data);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [id, hasLogo, tick]);

  if (!src) return null;
  return <img src={src} alt={name ? `Logo di ${name}` : "Logo del diving"} className={className ?? "h-14 w-14 rounded-2xl bg-white object-contain"} />;
}
