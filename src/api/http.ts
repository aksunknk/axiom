import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Tauri WebView の CORS / Private Network 制限を回避する API fetch。 */
export function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  if (isTauri) {
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
