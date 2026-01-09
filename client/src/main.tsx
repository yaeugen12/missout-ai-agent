import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Initialize Sentry for frontend error tracking
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration({
        tracePropagationTargets: ["localhost", /^https:\/\/[^/]+\.railway\.app/],
      }),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    release: import.meta.env.VITE_APP_VERSION || "development",
    ignoreErrors: [
      "Non-Error promise rejection captured",
      "ResizeObserver loop limit exceeded",
      "Failed to fetch",
      "NetworkError",
    ],
  });
  console.log("[SENTRY] ✅ Frontend error monitoring initialized");
} else {
  console.log("[SENTRY] ⚠️  VITE_SENTRY_DSN not found - frontend error monitoring disabled");
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-zinc-900 border border-red-500/20 rounded-lg p-8">
          <h1 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h1>
          <p className="text-muted-foreground mb-4">The application encountered an error.</p>
          <div className="bg-black/50 border border-white/10 rounded p-4 mb-6 font-mono text-sm text-white/70">
            {error.message}
          </div>
          <div className="flex gap-4">
            <button onClick={resetError} className="px-6 py-2 bg-primary hover:bg-primary/80 text-black font-semibold rounded-lg">
              Try Again
            </button>
            <button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10">
              Go Home
            </button>
          </div>
        </div>
      </div>
    )}
  >
    <App />
  </Sentry.ErrorBoundary>
);
