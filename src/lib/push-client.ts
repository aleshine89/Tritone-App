import { deletePushDevice, publicPushKey, savePushDevice } from "@/lib/fondale.functions";

const PREFERENZA = "smile-notifiche-telefono";
const CAMBIO = "smile-notifiche";

function keyBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function avvisaCambio() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CAMBIO));
}

export function ascoltaNotificheTelefono(onChange: () => void): () => void {
  window.addEventListener(CAMBIO, onChange);
  return () => window.removeEventListener(CAMBIO, onChange);
}

export function notificheTelefonoAttive(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(PREFERENZA) === "off") return false;
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function mostraAvviso(title: string, body: string, url = "/notifiche"): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/brand/mark-192.png",
      tag: "diving-hub-avviso",
      data: { url },
    });
  } catch {
    /* Su Android new Notification non esiste: non bloccare la pagina. */
  }
}

export async function collegaPushProprietario(chiedi: boolean): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(PREFERENZA) === "off") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "Su questo telefono la notifica arriva solo se l'app è installata sulla Home.";
  }
  if (Notification.permission !== "granted") {
    if (!chiedi) return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Permesso non concesso. Sbloccalo dalle impostazioni del telefono.";
  }
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await publicPushKey();
  const current = await registration.pushManager.getSubscription();
  const subscription =
    current ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey) as BufferSource,
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return "Il telefono non ha completato l'iscrizione.";
  }
  await savePushDevice({
    data: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return null;
}

export async function attivaNotificheTelefono(): Promise<string | null> {
  localStorage.setItem(PREFERENZA, "on");
  const note = await collegaPushProprietario(true);
  if (note) localStorage.setItem(PREFERENZA, "off");
  avvisaCambio();
  return note;
}

export async function disattivaNotificheTelefono(): Promise<void> {
  localStorage.setItem(PREFERENZA, "off");
  avvisaCambio();
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  try {
    const listed = await registration.getNotifications();
    for (const note of listed) {
      if (note.tag.startsWith("smile")) note.close();
    }
  } catch {
    // Non tutte le versioni espongono le notifiche già in coda.
  }
  const current = await registration.pushManager.getSubscription();
  if (!current) return;
  const endpoint = current.endpoint;
  await current.unsubscribe();
  try {
    await deletePushDevice({ data: { endpoint } });
  } catch {
    // Il telefono è già staccato.
  }
}
