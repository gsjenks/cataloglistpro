// Per-device settings, stored only in this browser's localStorage.
// The Anthropic API key never leaves the device except in calls the app makes
// directly to api.anthropic.com on your behalf.

const KEY = "mt:apiKey";
const MODEL = "mt:model";

export const DEFAULT_MODEL = "claude-opus-5";
export const MODELS = [
  { id: "claude-opus-5", label: "Opus 5 — highest quality" },
  { id: "claude-sonnet-5", label: "Sonnet 5 — great, ~5× cheaper" },
] as const;

export function getApiKey(): string {
  return localStorage.getItem(KEY) ?? "";
}
export function setApiKey(v: string): void {
  localStorage.setItem(KEY, v.trim());
}
export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function getModel(): string {
  return localStorage.getItem(MODEL) || DEFAULT_MODEL;
}
export function setModel(v: string): void {
  localStorage.setItem(MODEL, v);
}
