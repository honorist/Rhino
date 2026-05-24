/**
 * Utilitários puros para Web Push (sem DOM).
 * Porte do js/push.js.
 */

/** Converte VAPID base64-url-safe para Uint8Array (formato do PushManager). */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // Aloca em ArrayBuffer explícito p/ casar com BufferSource do PushManager.
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
