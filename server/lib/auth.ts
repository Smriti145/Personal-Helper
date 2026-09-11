import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
const encoder = new TextEncoder();
const cookieName = 'saha_session';
const b64 = (input: Uint8Array) =>
  btoa(String.fromCharCode(...input))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const bytes = (input: string) =>
  Uint8Array.from(atob(input.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
async function signingKey() {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
    throw Error('Authentication secret is not configured.');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: bytes(salt),
          iterations: 100000,
        },
        key,
        256,
      ),
    ),
  );
}
export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
) {
  const actual = await hashPassword(password, salt);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}
export async function createSession(userId: string, request: Request) {
  const sid = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const data =
    b64(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))) +
    '.' +
    b64(encoder.encode(JSON.stringify({ sub: userId, sid, exp })));
  const token =
    data +
    '.' +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          'HMAC',
          await signingKey(),
          encoder.encode(data),
        ),
      ),
    );
  await env.DB.prepare(
    'INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)',
  )
    .bind(sid, userId, exp)
    .run();
  return { cookie: sessionCookie(token, request, 86400), token };
}
export function sessionCookie(value: string, request: Request, maxAge: number) {
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function getSessionUser() {
  try {
    const h = await headers();
    const raw =
      h.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ||
      h
        .get('cookie')
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1);
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [head, payload, signature] = parts;
    const meta = JSON.parse(new TextDecoder().decode(bytes(head)));
    if (
      meta.alg !== 'HS256' ||
      !(await crypto.subtle.verify(
        'HMAC',
        await signingKey(),
        bytes(signature),
        encoder.encode(head + '.' + payload),
      ))
    )
      return null;
    const data = JSON.parse(new TextDecoder().decode(bytes(payload)));
    if (
      typeof data.sub !== 'string' ||
      typeof data.sid !== 'string' ||
      !Number.isFinite(data.exp) ||
      data.exp <= Date.now() / 1000
    )
      return null;
    const session = await env.DB.prepare(
      'SELECT id FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?',
    )
      .bind(data.sid, data.sub, Math.floor(Date.now() / 1000))
      .first();
    return session ? { userId: data.sub, sessionId: data.sid } : null;
  } catch {
    return null;
  }
}
export async function allowAuthAttempt(email: string) {
  const key = b64(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(email)),
    ),
  );
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO auth_attempts (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN reset_at < ? THEN 1 ELSE attempts + 1 END, reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END RETURNING attempts',
  )
    .bind(key, now + 900000, now, now, now + 900000)
    .first<{ attempts: number }>();
  return !!row && row.attempts <= 10;
}

export function validClientRequest(request: Request) {
  const origin = request.headers.get('origin');
  return origin
    ? origin === new URL(request.url).origin
    : request.headers.get('x-saha-client') === 'native';
}
