import { env } from 'cloudflare:workers';
import { getSessionUser, validClientRequest } from '@/lib/auth';
import { validateState } from '@/lib/routine';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = await getSessionUser();
  if (!user) return json({ error: 'Sign in to load your routine.' }, 401);
  try {
    const row = await env.DB.prepare(
      'SELECT state_json, revision FROM routine_states WHERE user_id = ?',
    )
      .bind(user.userId)
      .first<{ state_json: string; revision: number }>();
    return json(
      row
        ? { state: JSON.parse(row.state_json), revision: row.revision }
        : { state: null, revision: 0 },
    );
  } catch {
    return json(
      { error: 'Your routine could not be loaded. Please retry.' },
      503,
    );
  }
}
function sameOrigin(r: Request) {
  return validClientRequest(r);
}
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: 'Sign in to save.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2000000)
      return json(
        { error: 'Export your history before adding more records.' },
        413,
      );
    const { state, revision } = JSON.parse(raw);
    if (!validateState(state) || !Number.isInteger(revision) || revision < 0)
      return json({ error: 'Check your configuration and consent.' }, 400);
    const result =
      revision === 0
        ? await env.DB.prepare(
            'INSERT INTO routine_states (user_id,state_json,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING',
          )
            .bind(user.userId, JSON.stringify(state), new Date().toISOString())
            .run()
        : await env.DB.prepare(
            'UPDATE routine_states SET state_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?',
          )
            .bind(
              JSON.stringify(state),
              new Date().toISOString(),
              user.userId,
              revision,
            )
            .run();
    if (!result.meta.changes)
      return json(
        {
          error:
            'Another session changed your routine. Reload before editing again.',
        },
        409,
      );
    return json({ revision: revision + 1 });
  } catch {
    return json(
      {
        error:
          'Unable to save. Your changes are still on screen; retry saving.',
      },
      503,
    );
  }
}
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin.' }, 403);
  await env.DB.prepare('DELETE FROM routine_states WHERE user_id = ?')
    .bind(user.userId)
    .run();
  return json({ deleted: true });
}
