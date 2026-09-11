import { env } from 'cloudflare:workers';
import {
  getSessionUser,
  hashPassword,
  newSalt,
  verifyPassword,
  createSession,
  sessionCookie,
  allowAuthAttempt,
  validClientRequest,
} from '@/lib/auth';
const response = (data: unknown, status = 200, cookie?: string) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (!validClientRequest(request))
    return response({ error: 'Invalid request origin.' }, 403);
  const { action } = await params;
  try {
    if (action === 'logout') {
      const user = await getSessionUser();
      if (user)
        await env.DB.prepare(
          'DELETE FROM sessions WHERE id = ? AND user_id = ?',
        )
          .bind(user.sessionId, user.userId)
          .run();
      return response({ ok: true }, 200, sessionCookie('', request, 0));
    }
    if (action === 'delete') {
      const user = await getSessionUser();
      if (!user) return response({ error: 'Sign in first.' }, 401);
      const raw = await request.text();
      if (raw.length > 8192)
        return response({ error: 'Input is too long.' }, 400);
      const data = JSON.parse(raw);
      if (typeof data.password !== 'string' || data.password.length > 256)
        return response({ error: 'Enter your current password.' }, 400);
      if (!(await allowAuthAttempt('delete:' + user.userId)))
        return response({ error: 'Too many attempts. Try again later.' }, 429);
      const account = await env.DB.prepare(
        'SELECT salt,password_hash FROM accounts WHERE id = ?',
      )
        .bind(user.userId)
        .first<{ salt: string; password_hash: string }>();
      if (
        !account ||
        !(await verifyPassword(
          data.password,
          account.salt,
          account.password_hash,
        ))
      )
        return response({ error: 'Password is incorrect.' }, 401);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM routine_states WHERE user_id = ?').bind(
          user.userId,
        ),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(
          user.userId,
        ),
        env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(user.userId),
      ]);
      return response({ ok: true }, 200, sessionCookie('', request, 0));
    }
    if (!['register', 'login'].includes(action))
      return response({ error: 'Not found.' }, 404);
    if (!env.AUTH_SECRET)
      return response(
        {
          error:
            'Local authentication needs AUTH_SECRET configured. See the project README.',
        },
        503,
      );
    const raw = await request.text();
    if (raw.length > 8192)
      return response({ error: 'Input is too long.' }, 400);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return response({ error: 'Invalid input.' }, 400);
    }
    const email =
      typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = data.password;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 256
    )
      return response(
        { error: 'Enter a valid email and a password of 12–256 characters.' },
        400,
      );
    if (!(await allowAuthAttempt(email)))
      return response(
        { error: 'Too many attempts. Please try again in 15 minutes.' },
        429,
      );
    const account = await env.DB.prepare(
      'SELECT id,password_hash,salt FROM accounts WHERE email = ?',
    )
      .bind(email)
      .first<{ id: string; password_hash: string; salt: string }>();
    if (action === 'register') {
      if (account)
        return response(
          {
            error: 'An account with this email already exists. Please sign in.',
          },
          409,
        );
      const id = crypto.randomUUID(),
        salt = newSalt();
      const hash = await hashPassword(password, salt);
      await env.DB.prepare(
        'INSERT INTO accounts (id,email,password_hash,salt,created_at) VALUES (?,?,?,?,?)',
      )
        .bind(id, email, hash, salt, new Date().toISOString())
        .run();
      return authenticated(id, request, 201);
    }
    const valid = await verifyPassword(
      password,
      account?.salt || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      account?.password_hash || '',
    );
    if (!account || !valid)
      return response({ error: 'Email or password is incorrect.' }, 401);
    return authenticated(account.id, request, 200);
  } catch {
    return response(
      {
        error:
          'Authentication is unavailable. Check local database setup and try again.',
      },
      503,
    );
  }
}

async function authenticated(id: string, request: Request, status: number) {
  const session = await createSession(id, request);
  return response(
    {
      ok: true,
      ...(request.headers.get('x-saha-client') === 'native'
        ? { token: session.token }
        : {}),
    },
    status,
    session.cookie,
  );
}
