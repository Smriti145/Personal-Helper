import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, taskBase} from '../shared/routine.ts';
import {wallClockInstant, planNotifications, reconcileNotifications, serializeUpdates, type PlannedNotification} from '../shared/notification-plan.ts';

function state() {
  const s = initialState();
  s.consent = '2026-09-01T00:00:00Z';
  s.reminders.enabled = true;
  s.reminders.quietStart = s.reminders.quietEnd = '00:00';
  return s;
}
const now = new Date('2026-09-09T06:00:00Z');

test('Timezone conversion respects fractional offsets and refuses DST gaps/folds', () => {
  assert.equal(wallClockInstant('2026-09-09', '07:00', 'Asia/Kolkata'), Date.parse('2026-09-09T01:30:00Z'));
  assert.equal(wallClockInstant('2026-03-08', '02:30', 'America/New_York'), null);
  assert.equal(wallClockInstant('2026-11-01', '01:30', 'America/New_York'), null);
  assert.equal(wallClockInstant('2026-11-01', '03:00', 'America/New_York'), Date.parse('2026-11-01T08:00:00Z'));
  assert.equal(wallClockInstant('2026-04-05', '01:45', 'Australia/Lord_Howe'), null);
});

test('Native plan respects weekly recurrence, date bounds, relative offsets and advance', () => {
  const s = state();
  s.meals.breakfast = '08:00';
  s.reminders.advance = 15;
  s.tasks = [{...taskBase('Before breakfast'), anchor: 'breakfast', offset: -30,
    days: [3], start: '2026-09-09', end: '2026-09-09'}];
  const plan = planNotifications(s, now, 50);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].timestamp, Date.parse('2026-09-09T07:15:00Z'));
  assert.deepEqual(plan.issues, []);
});

test('Queue cap uses actual delivery time including snoozes; stable IDs survive restart', () => {
  const s = state();
  s.tasks = [{...taskBase('Snoozed'), time: '07:00'}, {...taskBase('Earlier'), time: '08:00'}];
  s.events = [{id: 'snooze', taskId: s.tasks[0].id, date: '2026-09-09', status: 'snoozed',
    scheduled: '07:00', at: now.toISOString(), until: '2026-09-09T09:00:00Z'}];
  const first = planNotifications(s, now, 1);
  assert.equal(first.items[0].taskId, s.tasks[1].id);
  assert.deepEqual(planNotifications(JSON.parse(JSON.stringify(s)), now, 1), first);
  s.events.push({...s.events[0], id: 'done', status: 'completed'});
  assert(!planNotifications(s, now, 50).items.some((i) => i.taskId === s.tasks[0].id && i.date === '2026-09-09'));
});

test('Quiet hours apply to advance delivery across midnight, and categories/reminder switches apply', () => {
  const s = state();
  s.tasks = [{...taskBase('Midnight'), time: '00:05'}];
  s.reminders.advance = 15;
  s.reminders.quietStart = '22:00';
  s.reminders.quietEnd = '07:00';
  assert.equal(planNotifications(s, now, 50).items.length, 0);
  s.reminders.quietEnd = '22:00';
  assert.equal(planNotifications(s, now, 50).items[0].timestamp, Date.parse('2026-09-09T23:50:00Z'));
  s.reminders.categories = [];
  assert.equal(planNotifications(s, now, 50).items.length, 0);
  s.reminders.enabled = false;
  assert.deepEqual(planNotifications(s, now, 50), {items: [], issues: []});
});

test('Ambiguous medical time is reported without changing instructions or scheduling a substitute', () => {
  const s = state();
  s.profile.timezone = 'America/New_York';
  s.medications = [{id: 'medicine', name: 'User medicine', dose: 'User dose', instruction: 'User instruction',
    prescriber: '', notes: '', start: '2026-11-01', end: '2026-11-01',
    slots: [{...taskBase('', 'medication'), time: '01:30'}]}];
  const before = JSON.stringify(s);
  const plan = planNotifications(s, new Date('2026-11-01T04:00:00Z'), 50);
  assert.equal(plan.items.length, 0);
  assert.equal(plan.issues.length, 1);
  assert.equal(JSON.stringify(s), before);
});

test('Invalid enabled configuration fails before producing a replacement plan', () => {
  const s = state();
  s.tasks = [{...taskBase('Invalid'), time: '99:00'}];
  assert.throws(() => planNotifications(s, now, 50), /configuration/);
});

const item = (id: string, timestamp = 100): PlannedNotification => ({id, date: '2026-09-09', taskId: id, timestamp});
test('Reconciliation keeps valid reminders on failure and still removes completed/stale triggers', async () => {
  const native = new Map([['keep', item('keep')], ['completed', item('completed')]]);
  const canceled: string[] = [];
  await assert.rejects(reconcileNotifications({items: [item('keep'), item('new')], issues: []}, {
    ids: async () => [...native.keys()],
    cancel: async (id) => {canceled.push(id); native.delete(id);},
    upsert: async (value) => {if (value.id === 'new') throw Error('OS failure'); native.set(value.id, value);},
  }), /could not be updated/);
  assert.deepEqual(canceled, ['completed']);
  assert(native.has('keep'));
});

test('Repeated reconciliation upserts same IDs without duplicates and disabling clears triggers', async () => {
  const native = new Map<string, PlannedNotification>();
  const provider = {ids: async () => [...native.keys()], cancel: async (id: string) => {native.delete(id);},
    upsert: async (value: PlannedNotification) => {native.set(value.id, value);}};
  const plan = {items: [item('one')], issues: []};
  await reconcileNotifications(plan, provider);
  await reconcileNotifications(plan, provider);
  assert.equal(native.size, 1);
  await reconcileNotifications({items: [], issues: []}, provider);
  assert.equal(native.size, 0);
});

test('Failed listing performs no writes; failed cancellation reports failure but continues', async () => {
  let writes = 0;
  await assert.rejects(reconcileNotifications({items: [item('one')], issues: []}, {
    ids: async () => {throw Error('Read failure');}, cancel: async () => {writes++;}, upsert: async () => {writes++;},
  }));
  assert.equal(writes, 0);
  await assert.rejects(reconcileNotifications({items: [item('one')], issues: []}, {
    ids: async () => ['stale'], cancel: async () => {throw Error('Cancel failure');}, upsert: async () => {writes++;},
  }));
  assert.equal(writes, 1);
});

test('Concurrent updates are serialized and newer completion wins over older scheduling', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {release = resolve;});
  const calls: number[] = [];
  const update = serializeUpdates(async (version: number) => {
    calls.push(version);
    if (version === 1) await gate;
    return version;
  });
  const first = update(1);
  const second = update(2);
  await Promise.resolve();
  assert.deepEqual(calls, [1]);
  release();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(calls, [1, 2]);
});

test('A failed queued update does not block later retry', async () => {
  const update = serializeUpdates(async (fail: boolean) => {if (fail) throw Error('failed'); return 'saved';});
  const failed = update(true);
  const retry = update(false);
  await assert.rejects(failed);
  assert.equal(await retry, 'saved');
});
