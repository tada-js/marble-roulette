import { Suspense } from "react";
import GameClient from "../components/game-client";

export default function Page() {
  // RSC shell for SEO/streaming; the game itself is a client-only canvas app.
  return (
    <Suspense fallback={null}>
      <GameClient />
    </Suspense>
  );
}
