import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, taskBase } from '../shared/routine.ts';
import { quietHours, planReminder } from '../shared/reminders.ts';
test('Quiet hours work across midnight', () => {
  assert(quietHours('23:00', '22:00', '07:00'));
  assert(quietHours('06:59', '22:00', '07:00'));
  assert(!quietHours('07:00', '22:00', '07:00'));
  assert(!quietHours('12:00', '00:00', '00:00'));
});
test('Reminder scans bound delivery, observe cooldown, and acknowledge completion', () => {
  const s = initialState();
  s.reminders.enabled = true;
  s.tasks = [{ ...taskBase('Routine'), time: '08:00' }];
  const now = new Date('2026-09-09T09:00:00Z');
  const p = planReminder(s, '2026-09-09', now, {});
  assert(p);
  assert.equal(
    planReminder(s, '2026-09-09', now, { [p.key]: { count: 1, lastAt: +now } }),
    null,
  );
  assert.equal(
    planReminder(s, '2026-09-09', new Date(+now + 3600000), {
      [p.key]: { count: 1, lastAt: +now },
    }),
    null,
  );
  s.events = [
    {
      id: 'e',
      taskId: s.tasks[0].id,
      date: '2026-09-09',
      scheduled: '08:00',
      status: 'completed',
      at: now.toISOString(),
    },
  ];
  assert.equal(planReminder(s, '2026-09-09', now, {}), null);
});
