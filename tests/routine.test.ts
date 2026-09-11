import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  taskBase,
  instances,
  plannedInstances,
  nextTasks,
  validateState,
  dateInZone,
  type State,
} from '../shared/routine.ts';
function state() {
  const s = initialState();
  s.consent = new Date().toISOString();
  return s;
}
test('No predefined personal data or medications', () => {
  const s = state();
  assert.equal(s.profile.name, '');
  assert.deepEqual(s.medications, []);
  assert.equal(s.profile.dietary, 'Unspecified');
  assert(validateState(s));
});
test('Medication meal offsets follow user inputs without changing instructions', () => {
  const s = state();
  s.meals.breakfast = '07:00';
  s.medications = [
    {
      id: 'm',
      name: 'User medicine',
      dose: 'User dose',
      instruction: '30 minutes before breakfast',
      prescriber: '',
      notes: '',
      start: '2026-09-01',
      end: '2026-09-30',
      slots: [
        { ...taskBase('', 'medication'), anchor: 'breakfast', offset: -30 },
      ],
    },
  ];
  assert.equal(instances(s, '2026-09-09')[0].scheduled, '06:30');
  s.meals.breakfast = '08:00';
  assert.equal(instances(s, '2026-09-09')[0].scheduled, '07:30');
  assert.equal(s.medications[0].instruction, '30 minutes before breakfast');
  assert.equal(instances(s, '2026-10-01').length, 0);
});
test('Relative times cross midnight with source recurrence and date bounds', () => {
  const s = state();
  s.meals.breakfast = '00:15';
  s.tasks = [
    {
      ...taskBase('Before meal'),
      anchor: 'breakfast',
      offset: -30,
      start: '2026-09-09',
      end: '2026-09-09',
      days: [3],
    },
  ];
  assert.equal(instances(s, '2026-09-08')[0].scheduled, '23:45');
  assert.equal(instances(s, '2026-09-09').length, 0);
});
test('Routine and weekly recurrence filtering', () => {
  const s = state();
  s.tasks = [{ ...taskBase('Work'), routine: 'Weekday', days: [1, 3, 5] }];
  assert.equal(instances(s, '2026-09-09').length, 1);
  assert.equal(instances(s, '2026-09-10').length, 0);
  s.dayRoutines['2026-09-09'] = 'Travel day';
  assert.equal(instances(s, '2026-09-09').length, 0);
});
test('Completion removes next action; snooze returns only when due', () => {
  const s = state();
  const task = taskBase('Task');
  s.tasks = [task];
  s.events = [
    {
      id: 'event',
      taskId: task.id,
      date: '2026-09-09',
      scheduled: '09:00',
      status: 'snoozed',
      at: '2026-09-09T09:00:00Z',
      until: '2026-09-09T09:10:00Z',
    },
  ];
  assert.equal(
    nextTasks(s, '2026-09-09', new Date('2026-09-09T09:05:00Z')).length,
    0,
  );
  assert.equal(
    nextTasks(s, '2026-09-09', new Date('2026-09-09T09:11:00Z')).length,
    1,
  );
  s.events.push({ ...s.events[0], id: 'done', status: 'completed' });
  assert.equal(nextTasks(s, '2026-09-09').length, 0);
  assert.equal(s.tasks.length, 1);
});
test('Logged snapshots survive later schedule changes', () => {
  const s = state();
  s.tasks = [taskBase('Original')];
  s.snapshots['2026-09-09'] = plannedInstances(s, '2026-09-09');
  s.tasks[0] = { ...s.tasks[0], title: 'Updated', time: '10:00' };
  assert.equal(instances(s, '2026-09-09')[0].title, 'Original');
  assert.equal(instances(s, '2026-09-10')[0].title, 'Updated');
});
test('Timezone dates follow user timezone rather than device timezone', () => {
  assert.equal(
    dateInZone('Asia/Kolkata', new Date('2026-09-08T20:00:00Z')),
    '2026-09-09',
  );
  assert.equal(
    dateInZone('America/New_York', new Date('2026-09-08T20:00:00Z')),
    '2026-09-08',
  );
});
test('Invalid inputs cannot enter saved health state', () => {
  for (const alter of [
    (s: State) => (s.profile.timezone = 'Invalid/Zone'),
    (s: State) => (s.profile.sleepTarget = 25),
    (s: State) => (s.profile.workDays = [8]),
    (s: State) => (s.tasks = [{ ...taskBase('bad'), time: '99:99' }]),
    (s: State) => (s.tasks = [{ ...taskBase('bad'), start: '2026-02-30' }]),
    (s: State) => (s.consent = ''),
    (s: State) => (s.snapshots = { 'not-a-date': [] }),
  ]) {
    const s = state();
    alter(s);
    assert.equal(validateState(s), false);
  }
});

test('Malformed snapshots and out-of-range wellbeing are rejected', () => {
  const s = state();
  s.snapshots = {
    '2026-09-09': [
      { ...taskBase('Broken'), date: '2026-09-09', scheduled: '99:99' },
    ],
  };
  assert.equal(validateState(s), false);
});

test('Closing a past day records missed tasks once and never adds medication doses', async () => {
  const { closePastDays } = await import('../shared/routine.ts');
  let s = state();
  s.tasks = [taskBase('Routine')];
  s.snapshots['2026-09-08'] = plannedInstances(s, '2026-09-08');
  s = closePastDays(s, '2026-09-09');
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].status, 'missed');
  assert.equal(closePastDays(s, '2026-09-09').events.length, 1);
  assert.equal(s.tasks.length, 1);
});
