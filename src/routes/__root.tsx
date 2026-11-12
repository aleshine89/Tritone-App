import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { LinguaProvider } from "@/lib/i18n";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { RegisterPwa } from "@/components/pwa";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-600.css";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Tritone" },
      { name: "description", content: "Quaderno di bordo per le scuole subacquee: ogni scuola ha la sua area, i subacquei inviano i moduli solo a lei." },
      { name: "theme-color", content: "#050d12" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "apple-mobile-web-app-title", content: "Tritone" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/brand/mark-192.png?v=13" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/brand/mark-192.png?v=13" },
    ],
  }),
  component: () => (
    <html lang="it" className="antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("tritone-chiara")==="1"){document.documentElement.classList.add("chiara");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#f4f7f5")}}catch(e){}`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <RegisterPwa />
        <AuthProvider>
          <LinguaProvider>
            <Outlet />
          </LinguaProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
