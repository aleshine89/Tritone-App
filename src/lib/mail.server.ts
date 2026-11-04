import { env } from "@/lib/env.server";

const MITTENTE = "noreply@tritoneapp.it";

function pulisci(value: string | undefined): string | undefined {
  const text = value?.trim().replace(/^["']|["']$/g, "");
  return text || undefined;
}

function chiaveApi(): string | undefined {
  return (pulisci(env("BREVO_API_KEY")) ?? pulisci(env("BREVO_SMTP_KEY")) ?? pulisci(env("SMTP_PASS")))?.replace(/\s+/g, "");
}

let ultimoErrorePosta: string | null = null;

export function azzeraErrorePosta() {
  ultimoErrorePosta = null;
}

export function prendiErrorePosta(): string | null {
  const value = ultimoErrorePosta;
  ultimoErrorePosta = null;
  return value;
}

async function inviaConApi(key: string, input: { to: string; subject: string; text: string }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Tritone", email: MITTENTE },
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.text,
    }),
  });
  if (response.ok) return;
  const body = (await response.text()).slice(0, 180);
  if (response.status === 401) {
    throw new Error("La chiave non è accettata. In Brevo apri SMTP e API, scheda API, genera una chiave che inizia con xkeysib- e mettila nel segreto BREVO_API_KEY.");
  }
  throw new Error(`Brevo non ha accettato la mail (${response.status}). ${body}`);
}

export function postaPronta(): boolean {
  return Boolean(chiaveApi());
}

export async function inviaMail(input: { to: string; subject: string; text: string }) {
  ultimoErrorePosta = null;
  try {
    const key = chiaveApi();
    if (!key) throw new Error("Manca la chiave. Nel segreto BREVO_API_KEY metti la chiave API di Brevo, quella che inizia con xkeysib-.");
    await inviaConApi(key, input);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "La mail non è partita.";
    ultimoErrorePosta = message;
    throw new Error(message);
  }
}
