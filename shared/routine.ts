let createId:()=>string = () => (globalThis as unknown as {crypto:{randomUUID:()=>string}}).crypto.randomUUID();
export const configureIds = (factory: () => string) => {
  createId = factory;
};
export type Category =
  | 'routine'
  | 'medication'
  | 'meal'
  | 'hydration'
  | 'movement'
  | 'sleep'
  | 'wellbeing'
  | 'appointment';
export type Task = {
  id: string;
  title: string;
  category: Category;
  time: string;
  anchor: string;
  offset: number;
  days: number[];
  routine: string;
  priority: number;
  duration: number;
  reminder: boolean;
  note: string;
  start: string;
  end: string;
};
export type Medicine = {
  id: string;
  name: string;
  dose: string;
  instruction: string;
  prescriber: string;
  notes: string;
  start: string;
  end: string;
  slots: Task[];
};
export type Event = {
  id: string;
  taskId: string;
  date: string;
  status: 'completed' | 'skipped' | 'snoozed' | 'pending' | 'missed';
  at: string;
  scheduled: string;
  until?: string;
  reason?: string;
};
export type DayLog = {
  water: number;
  movement: number;
  sleep: number;
  mood: number;
  energy: number;
  stress: number;
  symptoms: string;
  note: string;
};
export type State = {
  version: 1;
  onboarded: boolean;
  consent: string;
  profile: {
    name: string;
    age: string;
    timezone: string;
    wake: string;
    sleep: string;
    workStart: string;
    workEnd: string;
    commute: number;
    workDays: number[];
    dietary: string;
    avoid: string;
    allergies: string;
    goals: string;
    waterTarget: number;
    container: number;
    movementTarget: number;
    sleepTarget: number;
  };
  meals: Record<string, string>;
  mealPlans: Record<string, string>;
  routines: string[];
  dayRoutines: Record<string, string>;
  tasks: Task[];
  medications: Medicine[];
  events: Event[];
  logs: Record<string, DayLog>;
  snapshots: Record<string, Instance[]>;
  deliveryHistory: Record<string, { count: number; lastAt: number }>;
  reminders: {
    enabled: boolean;
    advance: number;
    categories: Category[];
    quietStart: string;
    quietEnd: string;
    snooze: number;
    escalation: boolean;
    sound: boolean;
    vibration: boolean;
  };
};
export const blankLog = (): DayLog => ({
  water: 0,
  movement: 0,
  sleep: 0,
  mood: 3,
  energy: 3,
  stress: 3,
  symptoms: '',
  note: '',
});
export const initialState = (): State => ({
  version: 1,
  onboarded: false,
  consent: '',
  profile: {
    name: '',
    age: '',
    timezone: 'UTC',
    wake: '07:00',
    sleep: '22:30',
    workStart: '09:00',
    workEnd: '17:00',
    commute: 30,
    workDays: [1, 2, 3, 4, 5],
    dietary: 'Unspecified',
    avoid: '',
    allergies: '',
    goals: '',
    waterTarget: 2000,
    container: 250,
    movementTarget: 20,
    sleepTarget: 8,
  },
  meals: {
    breakfast: '08:00',
    lunch: '13:00',
    snack: '16:00',
    dinner: '19:00',
  },
  mealPlans: {},
  routines: ['Weekday', 'Weekend', 'Busy day', 'Travel day'],
  dayRoutines: {},
  tasks: [],
  medications: [],
  events: [],
  logs: {},
  snapshots: {},
  deliveryHistory: {},
  reminders: {
    enabled: false,
    advance: 0,
    categories: [
      'routine',
      'medication',
      'meal',
      'hydration',
      'movement',
      'sleep',
      'wellbeing',
      'appointment',
    ],
    quietStart: '22:30',
    quietEnd: '07:00',
    snooze: 10,
    escalation: false,
    sound: false,
    vibration: false,
  },
});
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const clock = (m: number) =>
  `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
export const dateInZone = (zone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const timeInZone = (zone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
export const shiftDate = (date: string, n: number) =>
  new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function taskBase(title = '', category: Category = 'routine'): Task {
  return {
    id: createId(),
    title,
    category,
    time: '09:00',
    anchor: '',
    offset: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    routine: 'All routines',
    priority: 2,
    duration: 0,
    reminder: true,
    note: '',
    start: '',
    end: '',
  };
}
export function generateBasics(s: State): Task[] {
  const p = s.profile;
  return [
    { ...taskBase('Wake up'), time: p.wake },
    ...Object.entries(s.meals).map(([name, time]) => ({
      ...taskBase(name[0].toUpperCase() + name.slice(1), 'meal'),
      time,
    })),
    {
      ...taskBase('Commute'),
      time: clock(minutes(p.workStart) - p.commute),
      days: p.workDays,
    },
    {
      ...taskBase('Work / study'),
      time: p.workStart,
      duration: (minutes(p.workEnd) - minutes(p.workStart) + 1440) % 1440,
      days: p.workDays,
    },
    {
      ...taskBase('Movement', 'movement'),
      time: clock(minutes(p.workEnd) + p.commute + 30),
      duration: p.movementTarget,
    },
    { ...taskBase('Wind down', 'sleep'), time: clock(minutes(p.sleep) - 30) },
    { ...taskBase('Sleep', 'sleep'), time: p.sleep },
  ];
}
export type Instance = Task & { date: string; scheduled: string };
export function routineFor(s: State, date: string) {
  return (
    s.dayRoutines[date] ||
    (s.profile.workDays.includes(new Date(date + 'T12:00:00Z').getUTCDay())
      ? 'Weekday'
      : 'Weekend')
  );
}
export function instances(s: State, date: string): Instance[] {
  if (s.snapshots?.[date]) return s.snapshots[date];
  return plannedInstances(s, date);
}
export function plannedInstances(s: State, date: string): Instance[] {
  const all = [
    ...s.tasks,
    ...s.medications.flatMap((m) =>
      m.slots.map((t) => ({
        ...t,
        title: m.name + ' · ' + m.dose,
        note: [m.instruction, m.notes].filter(Boolean).join(' · '),
        start: m.start,
        end: m.end,
      })),
    ),
  ];
  const result: Instance[] = [];
  for (const source of [shiftDate(date, -1), date, shiftDate(date, 1)])
    for (const t of all) {
      if (
        !t.days.includes(new Date(source + 'T12:00:00Z').getUTCDay()) ||
        (t.start && source < t.start) ||
        (t.end && source > t.end) ||
        (t.routine !== 'All routines' && t.routine !== routineFor(s, source))
      )
        continue;
      const anchor = t.anchor
        ? s.meals[t.anchor] ||
          (t.anchor === 'wake'
            ? s.profile.wake
            : t.anchor === 'sleep'
              ? s.profile.sleep
              : t.time)
        : t.time;
      const total = minutes(anchor) + (t.anchor ? t.offset : 0);
      const actualDate = shiftDate(source, Math.floor(total / 1440));
      if (actualDate === date)
        result.push({ ...t, date, scheduled: clock(total) });
    }
  return result.sort(
    (a, b) => a.scheduled.localeCompare(b.scheduled) || a.priority - b.priority,
  );
}
export function latest(s: State, t: Instance) {
  return s.events.filter((e) => e.taskId === t.id && e.date === t.date).at(-1);
}
export function nextTasks(s: State, date: string, now = new Date()) {
  return instances(s, date)
    .filter((t) => {
      const e = latest(s, t);
      return (
        !e ||
        e.status === 'pending' ||
        (e.status === 'snoozed' && (!e.until || Date.parse(e.until) <= +now))
      );
    })
    .sort(
      (a, b) =>
        a.scheduled.localeCompare(b.scheduled) || a.priority - b.priority,
    );
}
export function validateState(value: unknown): value is State {
  try {
    const s = value as State;
    if (
      !s ||
      s.version !== 1 ||
      typeof s.onboarded !== 'boolean' ||
      typeof s.consent !== 'string' ||
      !s.consent ||
      !s.profile ||
      !s.reminders
    )
      return false;
    const str = (v: unknown, max = 4000) =>
      typeof v === 'string' && v.length <= max;
    const record = (v: unknown) =>
      !!v && typeof v === 'object' && !Array.isArray(v);
    const day = (v: unknown) =>
      typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v + 'T00:00:00Z')) &&
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    const optionalDay = (v: unknown) => v === '' || day(v);
    if (
      ![
        s.profile.name,
        s.profile.age,
        s.profile.timezone,
        s.profile.dietary,
        s.profile.avoid,
        s.profile.allergies,
        s.profile.goals,
      ].every((v) => str(v))
    )
      return false;
    if (
      !Array.isArray(s.profile.workDays) ||
      !s.profile.workDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
      return false;
    if (
      ![
        s.reminders.enabled,
        s.reminders.escalation,
        s.reminders.sound,
        s.reminders.vibration,
      ].every((v) => typeof v === 'boolean')
    )
      return false;
    if (
      !record(s.meals) ||
      !['breakfast', 'lunch', 'snack', 'dinner'].every(
        (k) => typeof s.meals[k] === 'string',
      )
    )
      return false;
    if (
      !record(s.mealPlans) ||
      !Object.values(s.mealPlans).every((v) => str(v))
    )
      return false;
    if (
      !record(s.dayRoutines) ||
      !Object.entries(s.dayRoutines).every(([d, r]) => day(d) && str(r, 80))
    )
      return false;
    if (
      s.profile.sleepTarget > 24 ||
      s.reminders.snooze < 1 ||
      s.reminders.snooze > 1440
    )
      return false;
    new Intl.DateTimeFormat('en', { timeZone: s.profile.timezone });
    if (
      !record(s.deliveryHistory) ||
      !Object.values(s.deliveryHistory).every(
        (d) =>
          Number.isFinite(d.lastAt) &&
          Number.isInteger(d.count) &&
          d.count >= 1 &&
          d.count <= 2,
      ) ||
      !Number.isFinite(s.reminders.advance) ||
      s.reminders.advance < 0 ||
      s.reminders.advance > 1440 ||
      !Array.isArray(s.reminders.categories) ||
      !s.reminders.categories.every((c) =>
        [
          'routine',
          'medication',
          'meal',
          'hydration',
          'movement',
          'sleep',
          'wellbeing',
          'appointment',
        ].includes(c),
      )
    )
      return false;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      ![
        s.profile.wake,
        s.profile.sleep,
        s.profile.workStart,
        s.profile.workEnd,
        s.reminders.quietStart,
        s.reminders.quietEnd,
        ...Object.values(s.meals),
      ].every((t) => typeof t === 'string' && time.test(t))
    )
      return false;
    if (
      ![
        s.profile.waterTarget,
        s.profile.container,
        s.profile.movementTarget,
        s.profile.sleepTarget,
        s.profile.commute,
        s.reminders.snooze,
      ].every((n) => Number.isFinite(n) && n >= 0 && n <= 10000)
    )
      return false;
    const validTask = (t: Task) =>
      t &&
      str(t.id, 100) &&
      typeof t.reminder === 'boolean' &&
      [1, 2, 3].includes(t.priority) &&
      Number.isFinite(t.duration) &&
      t.duration >= 0 &&
      t.duration <= 1440 &&
      optionalDay(t.start) &&
      optionalDay(t.end) &&
      typeof t.title === 'string' &&
      t.title.length <= 300 &&
      time.test(t.time) &&
      Array.isArray(t.days) &&
      t.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      Number.isFinite(t.offset) &&
      Math.abs(t.offset) <= 1440 &&
      [
        'routine',
        'medication',
        'meal',
        'hydration',
        'movement',
        'sleep',
        'wellbeing',
        'appointment',
      ].includes(t.category) &&
      typeof t.routine === 'string' &&
      typeof t.note === 'string' &&
      typeof t.anchor === 'string' &&
      ['', 'breakfast', 'lunch', 'snack', 'dinner', 'wake', 'sleep'].includes(
        t.anchor,
      ) &&
      typeof t.start === 'string' &&
      typeof t.end === 'string' &&
      (!t.end || !t.start || t.end >= t.start);
    return (
      record(s.snapshots) &&
      Object.entries(s.snapshots).every(
        ([d, ts]) =>
          day(d) &&
          Array.isArray(ts) &&
          ts.length <= 3400 &&
          ts.every(
            (t) =>
              validTask(t) &&
              day(t.date) &&
              t.date === d &&
              time.test(t.scheduled),
          ),
      ) &&
      Array.isArray(s.tasks) &&
      s.tasks.length <= 1000 &&
      s.tasks.every(validTask) &&
      Array.isArray(s.medications) &&
      s.medications.length <= 100 &&
      s.medications.every(
        (m) =>
          str(m.id, 100) &&
          str(m.prescriber) &&
          optionalDay(m.start) &&
          optionalDay(m.end) &&
          typeof m.name === 'string' &&
          typeof m.dose === 'string' &&
          typeof m.instruction === 'string' &&
          typeof m.notes === 'string' &&
          typeof m.start === 'string' &&
          typeof m.end === 'string' &&
          (!m.end || !m.start || m.end >= m.start) &&
          Array.isArray(m.slots) &&
          m.slots.length > 0 &&
          m.slots.length <= 24 &&
          m.slots.every(validTask),
      ) &&
      Array.isArray(s.events) &&
      s.events.length <= 50000 &&
      s.events.every(
        (e) =>
          str(e.id, 100) &&
          str(e.taskId, 100) &&
          day(e.date) &&
          time.test(e.scheduled) &&
          (!e.until || Number.isFinite(Date.parse(e.until))) &&
          (!e.reason || str(e.reason)) &&
          /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
          ['completed', 'skipped', 'snoozed', 'pending', 'missed'].includes(
            e.status,
          ) &&
          Number.isFinite(Date.parse(e.at)),
      ) &&
      Array.isArray(s.routines) &&
      s.routines.every((r) => typeof r === 'string') &&
      !!s.dayRoutines &&
      !!s.mealPlans &&
      record(s.logs) &&
      Object.keys(s.logs).every(day) &&
      Object.values(s.logs).every(
        (l) =>
          str(l.symptoms) &&
          str(l.note) &&
          l.water >= 0 &&
          l.movement >= 0 &&
          l.sleep >= 0 &&
          l.sleep <= 24 &&
          [l.mood, l.energy, l.stress].every((n) => n >= 1 && n <= 5) &&
          [l.water, l.movement, l.sleep, l.mood, l.energy, l.stress].every(
            Number.isFinite,
          ),
      )
    );
  } catch {
    return false;
  }
}

/** Close already-materialized days without inventing replacement medication tasks. */
export function closePastDays(
  s: State,
  today: string,
  now = new Date(),
): State {
  const events = [...s.events];
  for (const [date, tasks] of Object.entries(s.snapshots)) {
    if (date >= today) continue;
    for (const t of tasks) {
      const e = latest(s, t);
      if (!e || e.status === 'pending' || e.status === 'snoozed')
        events.push({
          id: createId(),
          taskId: t.id,
          date,
          status: 'missed',
          at: now.toISOString(),
          scheduled: t.scheduled,
          reason: 'Not recorded before the day ended',
        });
    }
  }
  return events.length === s.events.length ? s : { ...s, events };
}
