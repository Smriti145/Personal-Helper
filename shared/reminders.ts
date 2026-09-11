import {
  minutes,
  timeInZone,
  nextTasks,
  latest,
  type State,
} from './routine.ts';
export type Delivery = { count: number; lastAt: number };
export interface NotificationProvider {
  deliver(input: { id: string; title: string; body: string }): Promise<void>;
}
export function quietHours(current: string, start: string, end: string) {
  const n = minutes(current),
    a = minutes(start),
    b = minutes(end);
  return a !== b && (a > b ? n >= a || n < b : n >= a && n < b);
}
/** At most one delivery per scan, eight per session/day, with a ten-minute global cooldown. */
export function planReminder(
  s: State,
  date: string,
  now: Date,
  deliveries: Record<string, Delivery>,
) {
  if (
    !s.reminders.enabled ||
    quietHours(
      timeInZone(s.profile.timezone, now),
      s.reminders.quietStart,
      s.reminders.quietEnd,
    )
  )
    return null;
  const today = Object.entries(deliveries).filter(([key]) =>
    key.startsWith(date),
  );
  if (
    today.reduce((n, [, v]) => n + v.count, 0) >= 8 ||
    today.some(([, v]) => +now - v.lastAt < 600000)
  )
    return null;
  for (const task of nextTasks(s, date, now)) {
    if (
      !task.reminder ||
      !s.reminders.categories.includes(task.category) ||
      minutes(task.scheduled) - s.reminders.advance >
        minutes(timeInZone(s.profile.timezone, now))
    )
      continue;
    const event = latest(s, task);
    const key =
      date +
      ':' +
      task.id +
      (event?.status === 'snoozed' ? ':' + event.at : '');
    const previous = deliveries[key];
    if (
      previous &&
      (previous.count >= (s.reminders.escalation ? 2 : 1) ||
        +now - previous.lastAt < 900000)
    )
      continue;
    return {
      key,
      task,
      followup: !!previous,
      count: (previous?.count || 0) + 1,
    };
  }
  return null;
}
