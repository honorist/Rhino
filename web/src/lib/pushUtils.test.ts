import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './pushUtils';

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64 padrão', () => {
    // "Hi" → "SGk="
    const out = urlBase64ToUint8Array('SGk=');
    expect(Array.from(out)).toEqual([0x48, 0x69]);
  });

  it('aceita base64-url-safe sem padding', () => {
    // bytes [0xfb, 0xff, 0xbf] em base64-url = "-_-_"
    const out = urlBase64ToUint8Array('-_-_');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(3);
  });

  it('mantém comprimento esperado para chaves VAPID típicas (65 bytes)', () => {
    const vapid =
      'BPe1XJa3vDqU4QyqQpQXqJoYpQUgYpQXqJoYpQUgYpQXqJoYpQUgYpQXqJoYpQUgYpQXqJoYpQUgYpQXqJoYpQU';
    const out = urlBase64ToUint8Array(vapid);
    expect(out.length).toBeGreaterThan(60);
  });
});
