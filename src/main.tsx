import { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapGameApp } from "./app/create-game-app";
import { AppShell } from "./ui-react/app-shell";

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
    bootstrapGameApp();
  }, []);

  return <AppShell />;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("루트 엘리먼트를 찾을 수 없습니다: #root");

createRoot(rootEl).render(<App />);
