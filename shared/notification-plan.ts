import {dateInZone, timeInZone, shiftDate, instances, latest, validateState, type State} from './routine.ts';
import {quietHours} from './reminders.ts';

export type PlannedNotification = {id: string; taskId: string; date: string; timestamp: number};
export type NotificationPlan = {items: PlannedNotification[]; issues: string[]};

/** Return only an unambiguous wall-clock instant; never normalize a DST gap. */
export function wallClockInstant(date: string, time: string, zone: string): number | null {
  const target = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const wall = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (key: string) => parts.find((p) => p.type === key)!.value;
    return Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
  };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = target + hours * 3600000;
    offsets.add(wall(sample) - sample);
  }
  const candidates = [...offsets].map((offset) => target - offset)
    .filter((candidate) => wall(candidate) === target);
  return candidates.length === 1 ? candidates[0] : null;
}

export function planNotifications(s: State, now: Date, limit: number): NotificationPlan {
  if (!s.reminders.enabled) return {items: [], issues: []};
  if (!validateState(s) || !Number.isFinite(+now) || !Number.isInteger(limit) || limit < 1)
    throw Error('Check your routine configuration before refreshing reminders.');
  const today = dateInZone(s.profile.timezone, now);
  const items: PlannedNotification[] = [];
  const issues: string[] = [];
  for (let day = 0; day < 7; day++) {
    const date = shiftDate(today, day);
    for (const task of instances(s, date)) {
      const event = latest(s, task);
      if (!task.reminder || !s.reminders.categories.includes(task.category) ||
          (event && ['completed', 'skipped', 'missed'].includes(event.status))) continue;
      const snoozed = event?.status === 'snoozed' && event.until;
      const instant = snoozed ? Date.parse(snoozed) : wallClockInstant(date, task.scheduled, s.profile.timezone);
      if (instant === null || !Number.isFinite(instant)) {
        issues.push(`${date} ${task.scheduled}: this local time is missing or ambiguous. Review it in your schedule.`);
        continue;
      }
      const timestamp = instant - (snoozed ? 0 : s.reminders.advance * 60000);
      if (timestamp <= +now || quietHours(timeInZone(s.profile.timezone, new Date(timestamp)),
        s.reminders.quietStart, s.reminders.quietEnd)) continue;
      items.push({id: `${date}:${task.id}`, taskId: task.id, date, timestamp});
    }
  }
  items.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  return {items: items.slice(0, limit), issues};
}

export interface TriggerProvider {
  ids(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  upsert(item: PlannedNotification): Promise<void>;
}

/** A failed operation never prevents attempts to reconcile the remaining triggers. */
export async function reconcileNotifications(plan: NotificationPlan, provider: TriggerProvider) {
  const wanted = new Set(plan.items.map((item) => item.id));
  const existing = await provider.ids();
  let failures = 0;
  // Free capacity and remove obsolete/completed triggers, retaining every still-valid ID.
  for (const id of existing) {
    if (!wanted.has(id)) {
      try { await provider.cancel(id); } catch { failures++; }
    }
  }
  for (const item of plan.items) {
    try { await provider.upsert(item); } catch { failures++; }
  }
  if (failures) throw Error('Some phone reminders could not be updated. Retry refreshing reminders.');
  return plan.items.length;
}

/** FIFO serialization also recovers after a failed request. */
export function serializeUpdates<Input, Output>(update: (input: Input) => Promise<Output>) {
  let tail: Promise<unknown> = Promise.resolve();
  return (input: Input): Promise<Output> => {
    const result = tail.then(() => update(input));
    tail = result.catch(() => undefined);
    return result;
  };
}
