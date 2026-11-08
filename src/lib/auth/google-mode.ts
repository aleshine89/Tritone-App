import { createServerFn } from "@tanstack/react-start";

/** Vero solo dove sono impostate le chiavi Google dirette (Vercel). Qui su Grok resta falso. */
export const googleDirettoAttivo = createServerFn({ method: "POST" }).handler(async () => {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return Boolean(id && secret);
});
