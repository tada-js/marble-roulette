import type { Metadata } from "next";

import "./globals.css";
import "../styles.css";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "데구르르 (Degururu)",
  description: "공으로 즐기는 핀볼 사다리",
  metadataBase: env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL) : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
