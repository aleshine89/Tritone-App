import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { azzeraErrorePosta, prendiErrorePosta } from "@/lib/mail.server";

function messaggioDi(reason: unknown, fallback: string): string {
  const nested = reason && typeof reason === "object" && "body" in reason ? (reason as { body?: { message?: string } }).body?.message : "";
  return nested || (reason instanceof Error ? reason.message : "") || fallback;
}

async function confermaMail(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: string };
    const email = String(body.email ?? "").trim();
    if (!email.includes("@")) return Response.json({ ok: false, message: "Mail non valida." });
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: "/" },
      headers: request.headers,
    });
    return Response.json({ ok: true, message: "" });
  } catch (reason) {
    return Response.json({ ok: false, message: messaggioDi(reason, "La mail non è partita.") });
  }
}

async function recuperaPassword(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: string };
    const email = String(body.email ?? "").trim();
    if (!email.includes("@")) return Response.json({ ok: false, message: "Mail non valida." });
    azzeraErrorePosta();
    const origin = new URL(request.url).origin;
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `${origin}/login` },
      headers: request.headers,
    });
    const errore = prendiErrorePosta();
    if (errore) return Response.json({ ok: false, message: errore });
    return Response.json({ ok: true, message: "" });
  } catch (reason) {
    return Response.json({ ok: false, message: messaggioDi(reason, "La mail non è partita.") });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/auth/conferma-mail") return confermaMail(request);
        if (url.pathname === "/api/auth/recupera-password") return recuperaPassword(request);
        return auth.handler(request);
      },
    },
  },
});
