import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  taskBase,
  instances,
  plannedInstances,
  refreshDay,
  latest,
  nextTasks,
  validateState,
  dateInZone,
  type State,
  type Event,
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

for (const status of ['completed', 'skipped', 'snoozed', 'missed', 'pending'] as const) {
  test(`Today's edits preserve ${status} medication details and original action history`, () => {
    const s = state();
    const date = '2026-09-09';
    s.medications = [{
      id: 'medicine', name: 'Original name', dose: 'Original dose',
      instruction: 'User instruction', prescriber: '', notes: '',
      start: date, end: '2026-09-30',
      slots: [{ ...taskBase('', 'medication'), time: '07:00' }],
    }];
    s.tasks = [{ ...taskBase('Untouched'), time: '08:00' }];
    s.snapshots[date] = plannedInstances(s, date);
    s.snapshots['2026-09-08'] = [];
    const original = structuredClone(s.snapshots[date][0]);
    const action: Event = {
      id: 'action', taskId: original.id, date, status,
      scheduled: original.scheduled, at: date + 'T07:01:00Z',
      ...(status === 'snoozed' ? { until: date + 'T07:15:00Z' } : {}),
    };
    s.events = [action];
    const before = structuredClone(s);
    const edited = structuredClone(s);
    edited.medications[0].name = 'New name';
    edited.medications[0].dose = 'New user dose';
    edited.medications[0].instruction = 'New user instruction';
    edited.medications[0].slots[0].time = '10:00';
    edited.tasks[0].time = '09:00';
    const result = refreshDay(s, edited, date);

    assert.deepEqual(instances(result, date)[0], original);
    assert.deepEqual(latest(result, original), action);
    assert.equal(instances(result, date)[1].scheduled, '09:00');
    const tomorrow = instances(result, '2026-09-10').find((t) => t.id === original.id)!;
    assert.equal(tomorrow.scheduled, '10:00');
    assert.equal(tomorrow.title, 'New name · New user dose');
    assert.equal(tomorrow.note, 'New user instruction');
    assert.deepEqual(result.events, before.events);
    assert.deepEqual(result.snapshots['2026-09-08'], before.snapshots['2026-09-08']);
    assert.deepEqual(s, before, 'Editing must not mutate the previous state');
    assert.deepEqual(refreshDay(result, edited, date), result, 'Repeated refresh is idempotent');
    assert(validateState(result));
  });
}

test('Routine switches retain recorded tasks while removing untouched old-routine tasks', () => {
  const s = state();
  const date = '2026-09-09';
  s.tasks = [
    { ...taskBase('Recorded'), routine: 'Weekday' },
    { ...taskBase('Untouched'), routine: 'Weekday' },
    { ...taskBase('Travel'), routine: 'Travel day' },
  ];
  s.snapshots[date] = plannedInstances(s, date);
  s.events = [{ id: 'done', taskId: s.tasks[0].id, date, scheduled: '09:00',
    status: 'completed', at: date + 'T09:05:00Z' }];
  const result = refreshDay(s, { ...s, dayRoutines: { [date]: 'Travel day' } }, date);
  assert.deepEqual(instances(result, date).map((t) => t.title), ['Recorded', 'Travel']);
  assert.equal(latest(result, instances(result, date)[0])?.status, 'completed');
});

test('Removing a medication slot retains its recorded occurrence without creating a replacement', () => {
  const s = state();
  const date = '2026-09-09';
  s.medications = [{
    id: 'medicine', name: 'User medicine', dose: 'User dose', instruction: 'User instruction',
    prescriber: '', notes: '', start: date, end: '',
    slots: [taskBase('', 'medication'), { ...taskBase('', 'medication'), time: '19:00' }],
  }];
  s.snapshots[date] = plannedInstances(s, date);
  s.events = [{ id: 'done', taskId: s.medications[0].slots[0].id, date,
    scheduled: '09:00', status: 'completed', at: date + 'T09:05:00Z' }];
  const edited = structuredClone(s);
  edited.medications[0].slots.shift();
  const result = refreshDay(s, edited, date);
  assert.equal(instances(result, date).length, 2);
  assert.equal(instances(result, '2026-09-10').length, 1);
  assert.deepEqual(instances(result, date), s.snapshots[date]);
  assert(validateState(result));
});

test('First explicit edit materializes the day and updates untouched relative times', () => {
  const s = state();
  s.tasks = [{ ...taskBase('After meal'), anchor: 'breakfast', offset: 15 }];
  const edited = { ...s, meals: { ...s.meals, breakfast: '09:00' } };
  const result = refreshDay(s, edited, '2026-09-09');
  assert.equal(instances(result, '2026-09-09')[0].scheduled, '09:15');
  assert.deepEqual(s.snapshots, {});
});

test('Duplicate and empty identifiers cannot conflate task occurrences or event histories', () => {
  const s = state();
  const task = taskBase('Task');
  const event: Event = { id: 'event', taskId: task.id, date: '2026-09-09',
    scheduled: '09:00', status: 'completed', at: '2026-09-09T09:01:00Z' };
  const medicine = { id: 'medicine', name: 'User medicine', dose: 'User dose',
    instruction: 'User instruction', prescriber: '', notes: '', start: '', end: '',
    slots: [{ ...task, category: 'medication' as const }] };
  const occurrence = { ...task, date: '2026-09-09', scheduled: '09:00' };
  for (const invalid of [
    { ...s, tasks: [task, task] },
    { ...s, tasks: [{ ...task, id: ' ' }] },
    { ...s, tasks: [task], medications: [medicine] },
    { ...s, medications: [{ ...medicine, slots: [medicine.slots[0], medicine.slots[0]] }] },
    { ...s, medications: [medicine, { ...medicine, slots: [taskBase('', 'medication')] }] },
    { ...s, events: [event, event] },
    { ...s, snapshots: { '2026-09-09': [occurrence, occurrence] } },
  ]) assert.equal(validateState(invalid), false);
  assert(validateState({ ...s, tasks: [task], events: [event],
    snapshots: { '2026-09-09': [occurrence] } }), 'References to a template ID are valid');
});

test('Minute offsets must be whole numbers so generated HH:MM times remain valid', () => {
  for (const offset of [0.5, -0.5, Infinity, NaN, 1441]) {
    const s = state();
    s.tasks = [{ ...taskBase('Relative'), anchor: 'breakfast', offset }];
    assert.equal(validateState(s), false);
  }
  for (const offset of [-1440, -30, 0, 15, 1440]) {
    const s = state();
    s.tasks = [{ ...taskBase('Relative'), anchor: 'breakfast', offset }];
    assert(validateState(s));
    assert.match(instances(s, '2026-09-09')[0].scheduled, /^\d{2}:\d{2}$/);
  }
});
