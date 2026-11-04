import type { ScadenzaPersonale } from "@/lib/fondale.functions";
import { formatDay } from "@/lib/format";
import { linguaAttuale, tOra } from "@/lib/i18n";
import { mostraAvviso, notificheTelefonoAttive } from "@/lib/push-client";

const memory = "smile-alert:";

function daysUntil(scadenza: string, oggi: string): number {
  const start = new Date(`${oggi}T12:00:00`).getTime();
  const end = new Date(`${scadenza}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function bucket(days: number): "30" | "7" | "0" | "scaduta" | null {
  if (days < 0) return "scaduta";
  if (days === 0) return "0";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  return null;
}

function phrase(item: ScadenzaPersonale, oggi: string): string {
  const days = daysUntil(item.scadenza, oggi);
  const when = linguaAttuale() === "en" ? formatDay(item.scadenza) : item.scadenza.split("-").reverse().join("/");
  const titolo = item.titolo;
  if (item.kind === "brevetto") {
    return days < 0
      ? tOra("Il brevetto «{titolo}» è scaduto il {data}.", { titolo, data: when })
      : tOra("Il brevetto «{titolo}» scade il {data}.", { titolo, data: when });
  }
  if (item.kind === "medico") {
    return days < 0
      ? tOra("Il certificato medico «{titolo}» è scaduto il {data}.", { titolo, data: when })
      : tOra("Il certificato medico «{titolo}» scade il {data}.", { titolo, data: when });
  }
  if (item.kind === "assicurazione") {
    return days < 0
      ? tOra("L'assicurazione «{titolo}» è scaduta il {data}.", { titolo, data: when })
      : tOra("L'assicurazione «{titolo}» scade il {data}.", { titolo, data: when });
  }
  if (item.kind === "socio") {
    return tOra("L'iscrizione a {titolo} scade il {data}. Puoi rinnovare con una nuova Scheda socio.", { titolo, data: when });
  }
  return days < 0
    ? tOra("Il collaudo di «{titolo}» è scaduto il {data}.", { titolo, data: when })
    : tOra("Il collaudo di «{titolo}» scade il {data}.", { titolo, data: when });
}

export async function avvisaScadenze(items: ScadenzaPersonale[], oggi: string): Promise<void> {
  if (!notificheTelefonoAttive()) return;
  const fresh = items.filter((item) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.scadenza)) return false;
    const slot = bucket(daysUntil(item.scadenza, oggi));
    if (!slot) return false;
    const key = `${memory}${item.kind}:${item.id}:${item.scadenza}:${slot}`;
    if (localStorage.getItem(key)) return false;
    return true;
  });
  if (!fresh.length) {
    await scheduleAhead(items);
    return;
  }
  const body =
    fresh.length === 1
      ? phrase(fresh[0], oggi)
      : `${fresh.length} scadenze: ${fresh
          .slice(0, 3)
          .map((item) => item.titolo)
          .join(", ")}${fresh.length > 3 ? ` e altre ${fresh.length - 3}` : ""}.`;
  try {
    await mostraAvviso("Tritone", body, "/personale");
    for (const item of fresh) {
      const slot = bucket(daysUntil(item.scadenza, oggi));
      if (slot) localStorage.setItem(`${memory}${item.kind}:${item.id}:${item.scadenza}:${slot}`, "1");
    }
  } catch {
    return;
  }
  await scheduleAhead(items);
}

async function scheduleAhead(items: ScadenzaPersonale[]): Promise<void> {
  const Trigger = (window as Window & { TimestampTrigger?: new (when: number) => unknown }).TimestampTrigger;
  if (!Trigger || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  for (const item of items) {
    const when = new Date(`${item.scadenza}T09:00:00`).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) continue;
    const tag = `${memory}sched:${item.kind}:${item.id}:${item.scadenza}`;
    if (localStorage.getItem(tag)) continue;
    try {
      await registration.showNotification("Tritone", {
        body: phrase(item, item.scadenza),
        icon: "/brand/mark-192.png",
        tag,
        data: { url: "/personale" },
        showTrigger: new Trigger(when),
      } as NotificationOptions);
      localStorage.setItem(tag, "1");
    } catch {
      return;
    }
  }
}
