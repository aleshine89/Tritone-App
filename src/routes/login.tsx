import { useEffect, useState } from "react";
import { createFileRoute, Navigate, useNavigate, useRouter } from "@tanstack/react-router";
import { authClient, authEnabled, signInGoogle } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { clearFondaleCache } from "@/components/app-frame";
import { Copyright } from "@/components/copyright";
import { TestoInformativa } from "@/components/informativa";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [logo, setLogo] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLogo(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  if (logo) {
    return (
      <main className="grid min-h-dvh place-items-center bg-abyss px-4 text-foam">
        <img src="/brand/logo.png?v=12" alt="Tritone" className="w-[min(94vw,760px)] max-h-[82vh] object-contain" />
      </main>
    );
  }
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-abyss px-4 py-10 text-foam">
        <img src="/brand/mark.png?v=12" alt="" className="mx-auto h-24 w-24 object-contain" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;
  return <LoginCard />;
}

function LoginCard() {
  const t = useT();
  const [mode, setMode] = useState<"in" | "up" | "reset">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [letto, setLetto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<"conferma" | "password" | null>(null);
  const [inviata, setInviata] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [fatta, setFatta] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trovato = params.get("token");
    if (trovato) setToken(trovato);
    if (params.get("error")) setError("Il link non è più valido. Chiedine un altro.");
  }, []);

  async function enter() {
    setBusy(true);
    setError(null);
    setInviata(false);
    try {
      if (mode === "reset") {
        await chiediRecupero(email.trim());
        setInviata(true);
        setAvviso("password");
        return;
      }
      if (mode === "up") {
        if (password.length < 10) throw new Error("La password deve avere almeno 10 caratteri.");
        if (password !== confirm) throw new Error("Le password non coincidono.");
        if (!letto) throw new Error("Per creare l'account leggi e accetta l'informativa.");
        const created = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: email.split("@")[0] || "Subacqueo",
        });
        if (created.error) throw new Error(created.error.message || "Registrazione non riuscita.");
        try {
          await chiediMail(email.trim());
          setInviata(true);
        } catch (reason) {
          setError(humanAuth(reason instanceof Error ? reason.message : "La mail non è partita."));
        }
        setAvviso("conferma");
        return;
      }
      const signed = await authClient.signIn.email({ email: email.trim(), password });
      if (signed.error) {
        const message = signed.error.message || "Accesso non riuscito.";
        if (/verif/i.test(message)) {
          try {
            await chiediMail(email.trim());
            setInviata(true);
          } catch (reason) {
            setError(humanAuth(reason instanceof Error ? reason.message : "La mail non è partita."));
          }
          setAvviso("conferma");
          return;
        }
        throw new Error(message);
      }
      clearFondaleCache();
      await router.invalidate();
      await navigate({ to: "/" });
    } catch (reason) {
      setError(humanAuth(reason instanceof Error ? reason.message : "Accesso non riuscito."));
    } finally {
      setBusy(false);
    }
  }

  async function salvaPassword() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (password.length < 10) throw new Error("La password deve avere almeno 10 caratteri.");
      if (password !== confirm) throw new Error("Le password non coincidono.");
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Il link non è più valido. Chiedine un altro.");
      setToken(null);
      setPassword("");
      setConfirm("");
      setFatta(true);
      setMode("in");
      window.history.replaceState(null, "", "/login");
    } catch (reason) {
      setError(humanAuth(reason instanceof Error ? reason.message : "Il link non è più valido."));
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10 text-foam">
        <h1 className="text-3xl leading-none">{t("Nuova password")}</h1>
        <p className="mt-4 text-base leading-relaxed">{t("Scegline una di almeno 10 caratteri. Quella vecchia non funziona più.")}</p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void salvaPassword();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Password")}</span>
            <input type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mist">{t("Ripeti la password")}</span>
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass" />
          </label>
          {error ? <p className="text-sm text-brass">{t(error)}</p> : null}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60">
            {busy ? t("Attendi…") : t("Salva la password")}
          </button>
        </form>
      </main>
    );
  }

  if (avviso) {
    const titolo = inviata ? t("Mail inviata") : t("Mail non inviata");
    const testo = !inviata
      ? t("L'invio non è riuscito. L'account resta fermo finché non parte il link.")
      : avviso === "password"
        ? t("Se l'account {email} esiste, il link per la nuova password è in arrivo. Guarda anche nello spam. Vale un'ora.", { email: email.trim() })
        : t("Apri il link inviato a {email}. Serve solo la prima volta, per creare l'account. Dopo, entri con mail e password. Guarda anche nello spam. Vale un'ora.", { email: email.trim() });
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10 text-foam">
        <h1 className="text-3xl leading-none">{titolo}</h1>
        <p className="mt-4 text-base leading-relaxed">{testo}</p>
        {error ? <p className="mt-4 text-sm text-brass">{t(error)}</p> : null}
        <button
          type="button"
          disabled={busy}
          className="mt-6 min-h-12 w-full rounded-full bg-lagoon font-medium disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            setError(null);
            const richiesta = avviso === "password" ? chiediRecupero(email.trim()) : chiediMail(email.trim());
            void richiesta
              .then(() => setInviata(true))
              .catch((reason: unknown) => {
                setInviata(false);
                setError(humanAuth(reason instanceof Error ? reason.message : "La mail non è partita."));
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? t("Invio…") : t("Invia di nuovo")}
        </button>
        <button
          type="button"
          className="mt-3 min-h-11 text-sm text-mist"
          onClick={() => {
            if (avviso === "password") {
              setAvviso(null);
              setMode("in");
              return;
            }
            setBusy(true);
            setError(null);
            void authClient.signIn.email({ email: email.trim(), password })
              .then(async (signed) => {
                if (signed.error) {
                  const message = signed.error.message || "";
                  if (/verif/i.test(message)) {
                    setError("Il link non risulta ancora aperto. Aprilo dalla mail, poi tocca di nuovo qui.");
                    return;
                  }
                  throw new Error(message);
                }
                clearFondaleCache();
                await router.invalidate();
                await navigate({ to: "/" });
              })
              .catch((reason: unknown) => {
                setError(humanAuth(reason instanceof Error ? reason.message : "Accesso non riuscito."));
              })
              .finally(() => setBusy(false));
          }}
        >
          {avviso === "password" ? t("Torna all'accesso") : t("Ho aperto il link")}
        </button>
        <Copyright className="mt-10" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-abyss px-4 py-10 pt-[calc(2.5rem+env(safe-area-inset-top))] text-foam">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
        <section>
          <img src="/brand/logo.png?v=12" alt="Tritone" className="mx-auto h-40 w-auto max-w-full object-contain" />
          <h1 className="sr-only">Tritone</h1>
          <p className="mt-4 max-w-md text-base text-mist">
            {t("Una app per tante scuole subacquee. La scuola entra nella propria area. Il subacqueo invia i moduli solo a lei.")}
          </p>
        </section>
        <section className="rounded-card border border-line bg-deep p-5">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-abyss p-1 text-sm">
            <button
              type="button"
              className={`min-h-11 rounded-full ${mode === "up" ? "bg-surface text-foam" : "text-mist"}`}
              onClick={() => setMode("up")}
            >
              {t("Nuovo account")}
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-full ${mode === "in" ? "bg-surface text-foam" : "text-mist"}`}
              onClick={() => setMode("in")}
            >
              {t("Ho già l'accesso")}
            </button>
          </div>
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void enter();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-mist">{t("Email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass"
              />
            </label>
            {mode === "reset" ? <p className="text-sm text-mist">{t("Ti mandiamo un link per scegliere una nuova password.")}</p> : null}
            {mode === "reset" ? null : (
            <label className="block text-sm">
              <span className="mb-1 block text-mist">{t("Password")}</span>
              <input
                type="password"
                required
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass"
              />
            </label>
            )}
            {mode === "up" ? (
              <label className="block text-sm">
                <span className="mb-1 block text-mist">{t("Ripeti la password")}</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-brass"
                />
              </label>
            ) : null}
            {mode === "up" ? (
              <div className="rounded-xl border border-line p-3">
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={letto} onChange={(event) => setLetto(event.target.checked)} />
                  <span>{t("Ho letto l'informativa e l'accetto.")}</span>
                </label>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-lagoon">{t("Leggi l'informativa")}</summary>
                  <div className="mt-3">
                    <TestoInformativa />
                  </div>
                </details>
              </div>
            ) : null}
            {fatta ? <p className="text-sm text-lagoon">{t("Password aggiornata. Ora puoi entrare.")}</p> : null}
            {error ? <p className="text-sm text-brass">{t(error)}</p> : null}
            <button
              type="submit"
              disabled={busy || !authEnabled}
              className="min-h-11 w-full rounded-full bg-lagoon font-medium text-foam disabled:opacity-60"
            >
              {busy ? t("Attendi…") : mode === "up" ? t("Crea l'account") : mode === "reset" ? t("Invia il link") : t("Entra")}
            </button>
            {mode === "in" ? (
              <button type="button" className="min-h-11 w-full text-sm text-mist" onClick={() => { setMode("reset"); setError(null); setFatta(false); }}>
                {t("Password dimenticata")}
              </button>
            ) : null}
            {mode === "reset" ? (
              <button type="button" className="min-h-11 w-full text-sm text-mist" onClick={() => { setMode("in"); setError(null); }}>
                {t("Torna all'accesso")}
              </button>
            ) : null}
          </form>
          {authEnabled ? (
            <div className="mt-5 space-y-2">
              <p className="text-center text-xs uppercase tracking-widest text-mist">{t("oppure")}</p>
              <button
                type="button"
                onClick={() => {
                  void signInGoogle({ callbackURL: "/" }).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : "Accesso non riuscito.");
                  });
                }}
                className="min-h-11 w-full rounded-full border border-line text-sm"
              >
                {t("Continua con Google")}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-mist">{t("L'accesso non è ancora attivo.")}</p>
          )}
        </section>
      </div>
      <Copyright className="mx-auto mt-10 max-w-5xl" />
    </main>
  );
}

async function chiediRecupero(email: string) {
  const response = await fetch("/api/auth/recupera-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (response.ok && body?.ok !== false) return;
  throw new Error(body?.message || "La mail non è partita.");
}
async function chiediMail(email: string) {
  const response = await fetch("/api/auth/conferma-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (response.ok && body?.ok !== false) return;
  throw new Error(body?.message || "La mail non è partita.");
}

function humanAuth(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("already") || text.includes("esist")) return "Questa email è già registrata. Entra con la password.";
  if (text.includes("password") && (text.includes("short") || text.includes("8") || text.includes("10") || text.includes("caratter"))) {
    return "La password deve avere almeno 10 caratteri.";
  }
  if (text.includes("segreti") || text.includes("brevo") || text.includes("mittente") || text.includes("partita")) return message;
  if (text.includes("verif")) return "La mail non è ancora confermata. Controlla la posta e apri il link, poi entra.";
  if (text.includes("coincid")) return message;
  if (text.includes("token") || text.includes("link non")) return "Il link non è più valido. Chiedine un altro.";
  if (text.includes("invalid") || text.includes("credential")) return "Email o password non corretti.";
  if (text.includes("origin")) return "Accesso non riuscito da questo collegamento. Riprova.";
  return message || "Accesso non riuscito.";
}
