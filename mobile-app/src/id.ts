// index.js installs react-native-get-random-values before App is imported.
export function randomUUID(): string {
  const provider = (globalThis as unknown as {
    crypto: {getRandomValues: (bytes: Uint8Array) => Uint8Array};
  }).crypto;
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
