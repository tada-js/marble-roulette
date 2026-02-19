import { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { initAnalytics } from "./app/analytics";
import { bootstrapGameApp } from "./app/create-game-app";
import { initializeI18n, t } from "./i18n/runtime";
import { AppShell } from "./ui-react/AppShell";
import { registerServiceWorker } from "./pwa/register-service-worker";

declare global {
  interface Window {
    __degururuBootstrapped__?: boolean;
  }
}

/**
 * Root app entry for React-rendered UI shell.
 * Engine/render logic remains in the existing vanilla modules.
 */
function App() {
  const bootstrappedRef = useRef(false);

  useLayoutEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    if (window.__degururuBootstrapped__) return;
    window.__degururuBootstrapped__ = true;
    initAnalytics();
    const app = bootstrapGameApp();

    return () => {
      app?.dispose?.();
      window.__degururuBootstrapped__ = false;
    };
  }, []);

  return (
    <>
      <AppShell />
      <Analytics />
    </>
  );
}

initializeI18n();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error(t("error.rootMissing", { selector: "#root" }));

createRoot(rootEl).render(<App />);
registerServiceWorker();
