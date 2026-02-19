import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { createInquiryApiHandler } from "./scripts/inquiry-api.mjs";

const DEV_SEC_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

/**
 * Vite middleware plugin to keep the existing inquiry API behavior
 * while moving frontend runtime to Vite + React.
 */
function inquiryApiPlugin() {
  return {
    name: "degururu-inquiry-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      const handleInquiry = createInquiryApiHandler({
        toEmail: String(env.INQUIRY_TO_EMAIL || process.env.INQUIRY_TO_EMAIL || "").trim(),
        fromEmail: String(env.INQUIRY_FROM_EMAIL || process.env.INQUIRY_FROM_EMAIL || "onboarding@resend.dev").trim(),
        resendApiKey: String(env.RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim(),
        allowedOrigins: String(env.INQUIRY_ALLOWED_ORIGINS || process.env.INQUIRY_ALLOWED_ORIGINS || "").trim(),
      });

      server.middlewares.use(async (req, res, next) => {
        const method = String(req.method || "GET").toUpperCase();
        const pathname = String(req.url || "").split("?")[0];
        if (method !== "POST" || pathname !== "/api/inquiry") return next();

        try {
          await handleInquiry(req, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), inquiryApiPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: DEV_SEC_HEADERS,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    headers: DEV_SEC_HEADERS,
  },
  build: {
    outDir: "dist-vite",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (id.includes("/ui-react/components/modals/ResultModal")) return "result-modal";
          return undefined;
        },
      },
    },
  },
});
