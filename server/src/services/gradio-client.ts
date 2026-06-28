import { Client } from "@gradio/client";
import { config } from '../config/index.js';

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;
let unavailableUntil = 0;

/**
 * Get a lazy-initialized Gradio client connected to the ACE-Step Gradio app.
 * Caches the connection for reuse across requests.
 */
export async function getGradioClient(): Promise<Client> {
  if (clientInstance) return clientInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const client = await Client.connect(config.acestep.apiUrl, {
        events: ["data", "status"],
      });
      clientInstance = client;
      console.log(`[Gradio] Connected to ${config.acestep.apiUrl}`);
      return client;
    } catch (error) {
      console.error(`[Gradio] Failed to connect to ${config.acestep.apiUrl}:`, error);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Reset the cached Gradio client, forcing a new connection on next use.
 */
export function resetGradioClient(): void {
  clientInstance = null;
  connectionPromise = null;
}

/**
 * Mark Gradio as unavailable for durationMs (default 2 min) to skip retries.
 */
export function markGradioUnavailable(durationMs = 120_000): void {
  unavailableUntil = Date.now() + durationMs;
  clientInstance = null;
  connectionPromise = null;
}

/**
 * Check if the Gradio app is reachable.
 * Only checks Gradio-specific endpoints — avoids false positives from FastAPI/Uvicorn
 * servers which respond to "/" but are not Gradio apps.
 */
export async function isGradioAvailable(): Promise<boolean> {
  if (Date.now() < unavailableUntil) return false;

  const baseUrl = config.acestep.apiUrl;
  const candidates = [
    `${baseUrl}/gradio_api/info`, // Gradio 5+
    `${baseUrl}/info`,            // Gradio 4.x
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return true;
    } catch {
      // Try next candidate
    }
  }
  return false;
}
