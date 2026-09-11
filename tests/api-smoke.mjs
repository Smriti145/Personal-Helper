import assert from 'node:assert/strict';
import { initialState } from '../shared/routine.ts';
const base = 'http://localhost:3000';
const common = { Origin: base, 'Content-Type': 'application/json' };
const accounts = [];
const post = (path, data, cookie = '') =>
  fetch(base + path, {
    method: 'POST',
    headers: { ...common, Cookie: cookie },
    body: JSON.stringify(data),
  });
try {
  for (let i = 0; i < 2; i++) {
    const email = `test-${crypto.randomUUID()}@example.invalid`,
      password = crypto.randomUUID() + '-Test';
    const r = await post('/api/auth/register', { email, password });
    assert.equal(r.status, 201, await r.text());
    const cookie = r.headers.get('set-cookie').split(';')[0];
    assert(r.headers.get('set-cookie').includes('HttpOnly'));
    accounts.push({ email, password, cookie });
  }
  const [a, b] = accounts;
  const headers = { ...common, Cookie: a.cookie };
  const read = () => fetch(base + '/api/routine', { headers });
  assert.equal((await fetch(base + '/api/routine')).status, 401);
  assert.equal(
    (
      await fetch(base + '/api/routine', {
        headers: { Cookie: '__sites_local_auth=1' },
      })
    ).status,
    401,
  );
  const state = initialState();
  state.consent = new Date().toISOString();
  state.profile.name = 'Automated test';
  assert.equal(
    (
      await fetch(base + '/api/routine', {
        method: 'PUT',
        headers: { ...headers, Origin: 'https://untrusted.example' },
        body: JSON.stringify({ state, revision: 0 }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + '/api/routine', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ state: { ...state, consent: '' }, revision: 0 }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + '/api/routine', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ state, revision: 0 }),
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await read()).json()).state.profile.name,
    'Automated test',
  );
  assert.equal(
    (
      await (
        await fetch(base + '/api/routine', { headers: { Cookie: b.cookie } })
      ).json()
    ).state,
    null,
  );
  assert.equal(
    (
      await fetch(base + '/api/routine', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ state, revision: 0 }),
      })
    ).status,
    409,
  );
  const login = await post('/api/auth/login', {
    email: a.email,
    password: a.password,
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (
      await post('/api/auth/login', {
        email: a.email,
        password: 'incorrect-password',
      })
    ).status,
    401,
  );
  assert.equal((await post('/api/auth/logout', {}, loginCookie)).status, 200);
  assert.equal(
    (await fetch(base + '/api/routine', { headers: { Cookie: loginCookie } }))
      .status,
    401,
  );
  assert.equal(
    (await fetch(base + '/api/routine', { method: 'DELETE', headers })).status,
    200,
  );
  assert.equal((await (await read()).json()).state, null);
  console.log(
    'PASS: native registration/login, session revocation, anonymous rejection, origin checks, consent, persistence, two-user isolation, conflict protection and routine deletion',
  );
} finally {
  for (const a of accounts) {
    const r = await post(
      '/api/auth/delete',
      { password: a.password },
      a.cookie,
    );
    assert.equal(r.status, 200);
  }
  console.log('PASS: test accounts and sessions removed');
}
