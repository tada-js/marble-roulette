import { track } from "@vercel/analytics";
import posthog from "posthog-js";

type AnalyticsPrimitive = string | number | boolean;
type AnalyticsPayload = Record<string, AnalyticsPrimitive>;
type AnalyticsSink = (name: AnalyticsEventName, payload: AnalyticsPayload) => void;

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_KEY_ENV = "VITE_POSTHOG_KEY";
const POSTHOG_HOST_ENV = "VITE_POSTHOG_HOST";

let analyticsInitialized = false;
let posthogEnabled = false;

export const ANALYTICS_EVENTS = Object.freeze({
  gameStart: "game_start",
  resultOpen: "result_open",
  resultCopy: "result_copy",
});

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTrackableValue(value: unknown): value is AnalyticsPrimitive {
  if (typeof value === "string") return value.length > 0;
  if (typeof value === "boolean") return true;
  if (isFiniteNumber(value)) return true;
  return false;
}

function sanitizePayload(payload: AnalyticsPayload): AnalyticsPayload {
  const nextPayload: AnalyticsPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!isTrackableValue(value)) continue;
    if (typeof value === "number") {
      // Keep analytics payload compact and stable.
      nextPayload[key] = Math.round(value * 1000) / 1000;
      continue;
    }
    nextPayload[key] = value;
  }
  return nextPayload;
}

function readEnvText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function initPosthogClient(): void {
  const posthogKey = readEnvText(import.meta.env[POSTHOG_KEY_ENV]);
  if (!posthogKey) return;

  const posthogHost = readEnvText(import.meta.env[POSTHOG_HOST_ENV]) || DEFAULT_POSTHOG_HOST;
  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      person_profiles: "identified_only",
      disable_session_recording: true,
    });
    posthogEnabled = true;
  } catch {
    posthogEnabled = false;
  }
}

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (analyticsInitialized) return;
  analyticsInitialized = true;
  initPosthogClient();
}

const ANALYTICS_SINKS: AnalyticsSink[] = [
  (name, payload) => {
    void track(name, payload);
  },
  (name, payload) => {
    if (!posthogEnabled) return;
    posthog.capture(name, payload);
  },
];

export function trackAnalyticsEvent(name: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  const sanitizedPayload = sanitizePayload(payload);
  try {
    for (const sink of ANALYTICS_SINKS) {
      try {
        sink(name, sanitizedPayload);
      } catch {
        // Ignore analytics failures so gameplay is never impacted.
      }
    }
  } catch {
    // Ignore unexpected analytics runtime errors so gameplay is never impacted.
  }
}
