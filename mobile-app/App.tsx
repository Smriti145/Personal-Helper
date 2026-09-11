import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import {randomUUID} from './src/id';
import {
  initialState,
  blankLog,
  generateBasics,
  instances,
  plannedInstances,
  latest,
  nextTasks,
  dateInZone,
  timeInZone,
  shiftDate,
  routineFor,
  taskBase,
  configureIds,
  closePastDays,
  validateState,
  type State,
  type Task,
  type Instance,
  type Medicine,
  type Event,
} from '../shared/routine';
import * as api from './src/api';
import { requestReminders, syncReminders } from './src/notifications';
configureIds(randomUUID);
const tabs = [
  'Today',
  'Builder',
  'Medicines',
  'Meals',
  'Track',
  'Calendar',
  'Insights',
  'Settings',
];
const icons: Record<string, string> = {
  routine: '☀',
  medication: '✚',
  meal: '◉',
  hydration: '◌',
  movement: '↗',
  sleep: '☾',
  wellbeing: '♡',
  appointment: '▦',
};
const categories = Object.keys(icons) as Task['category'][];
function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: '#315d47' }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
  secure = false,
}: {
  label: string;
  value: string | number;
  onChange: (s: string) => void;
  numeric?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        defaultValue={numeric ? String(value) : undefined}
        value={numeric ? undefined : String(value)}
        onChangeText={numeric ? undefined : onChange}
        onEndEditing={numeric ? (e) => onChange(e.nativeEvent.text) : undefined}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize="none"
        secureTextEntry={secure}
        style={styles.input}
      />
    </View>
  );
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}
function Choices({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        {choices.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected: c === value }}
            onPress={() => onChange(c)}
            style={[styles.chip, c === value && styles.chipOn]}
          >
            <Text style={[styles.chipText, c === value && { color: '#fff' }]}>
              {c}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#315d47' }}
      />
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <RoutineApp />
    </SafeAreaProvider>
  );
}
function RoutineApp() {
  const [s, setS] = useState<State>(initialState);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [preview, setPreview] = useState(false);
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('Today');
  const [date, setDate] = useState('');
  const [now, setNow] = useState(new Date());
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState<Task | null>(null);
  const [med, setMed] = useState<Medicine | null>(null);
  const [action, setAction] = useState<{
    task: Instance;
    kind: 'skipped' | 'snoozed';
  } | null>(null);
  const [reason, setReason] = useState('Busy');
  const [delay, setDelay] = useState(10);
  const [routineName, setRoutineName] = useState('');
  const [allFlow, setAllFlow] = useState(false);
  const revision = useRef(0),
    generation = useRef(0),
    saving = useRef(false);
  const stateRef = useRef(s);
  stateRef.current = s;
  const today = dateInZone(s.profile.timezone, now),
    selected = tab === 'Calendar' && date ? date : today;
  const tasks = instances(s, selected),
    done = tasks.filter((t) => latest(s, t)?.status === 'completed').length,
    pending = nextTasks(s, selected, now),
    next = pending[0],
    log = s.logs[selected] || blankLog();
  const missed = tasks.filter((t) =>
    ['skipped', 'missed'].includes(latest(s, t)?.status || ''),
  ).length;
  const change = (fn: (s: State) => State) => {
    generation.current++;
    setS(fn);
    setDirty(true);
  };
  async function loadAccount() {
    const data = await api.load();
    revision.current = data.revision;
    setS(
      data.state
        ? {
            ...initialState(),
            ...data.state,
            reminders: { ...initialState().reminders, ...data.state.reminders },
          }
        : {
            ...initialState(),
            profile: {
              ...initialState().profile,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          },
    );
    setSignedIn(true);
    setDirty(false);
  }
  useEffect(() => {
    api
      .restoreSession()
      .then(async (found) => {
        if (found) await loadAccount();
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNow(n);
      const current = stateRef.current;
      if (!current.onboarded) return;
      const day = dateInZone(current.profile.timezone, n);
      const updated = closePastDays(current, day, n);
      if (updated !== current) change(() => updated);
    };
    const timer = setInterval(tick, 30000);
    const sub = AppState.addEventListener('change', (v) => {
      if (v === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  async function save() {
    if (preview) {
      setMessage(
        'Temporary preview only. Create an account to keep your routine.',
      );
      return;
    }
    if (saving.current) return;
    const current = stateRef.current;
    if (!validateState(current)) {
      setMessage(
        'Check your times (HH:MM), dates, numeric goals and consent before saving.',
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    const version = generation.current;
    try {
      const result = await api.save(current, revision.current);
      revision.current = result.revision;
      if (generation.current === version) setDirty(false);
      setMessage('Saved to your account.');
      await syncReminders(current);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty || !signedIn || preview || !s.onboarded) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [s, dirty, signedIn, preview]);
  function act(
    t: Instance,
    status: Event['status'],
    why?: string,
    wait?: number,
  ) {
    change((v) => ({
      ...v,
      snapshots: { ...v.snapshots, [t.date]: instances(v, t.date) },
      events: [
        ...v.events,
        {
          id: randomUUID(),
          taskId: t.id,
          date: t.date,
          scheduled: t.scheduled,
          status,
          at: new Date().toISOString(),
          reason: why,
          until: wait
            ? new Date(Date.now() + wait * 60000).toISOString()
            : undefined,
        },
      ],
    }));
    setAction(null);
  }
  function editState(updated: State) {
    return {
      ...updated,
      snapshots: {
        ...updated.snapshots,
        [today]: plannedInstances(updated, today),
      },
    };
  }
  function profile(key: string, value: string | number | number[]) {
    change((v) => ({ ...v, profile: { ...v.profile, [key]: value } }));
  }
  function row(t: Instance) {
    const e = latest(s, t);
    return (
      <View key={t.id} style={styles.task}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={'Complete ' + t.title}
            accessibilityState={{ checked: e?.status === 'completed' }}
            onPress={() =>
              act(t, e?.status === 'completed' ? 'pending' : 'completed')
            }
            style={[styles.check, e?.status === 'completed' && styles.chipOn]}
          >
            <Text
              style={
                e?.status === 'completed'
                  ? { color: '#fff' }
                  : { color: '#315d47' }
              }
            >
              {e?.status === 'completed' ? '✓' : icons[t.category]}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.taskTitle,
                e?.status === 'completed' && styles.strike,
              ]}
            >
              {t.title}
            </Text>
            <Text style={styles.small}>
              {t.note || t.category}
              {t.duration ? ` · ${t.duration} min` : ''}
            </Text>
            <Text style={styles.small}>
              {e
                ? `${e.status} · ${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : t.reminder
                  ? 'Reminder on'
                  : 'Reminder off'}
              {e?.reason ? ' · ' + e.reason : ''}
            </Text>
          </View>
          <Text style={styles.label}>{t.scheduled}</Text>
        </View>
        <View style={styles.taskActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDelay(s.reminders.snooze);
              setAction({ task: t, kind: 'snoozed' });
            }}
          >
            <Text style={styles.link}>Snooze</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAction({ task: t, kind: 'skipped' })}
          >
            <Text style={styles.link}>Skip</Text>
          </Pressable>
          {selected >= today && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const m = s.medications.find((m) =>
                  m.slots.some((x) => x.id === t.id),
                );
                if (m) setMed(JSON.parse(JSON.stringify(m)));
                else setEditor({ ...t });
              }}
            >
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }
  const auth = async () => {
    setBusy(true);
    try {
      await api.signIn(email, password, register);
      setPassword('');
      await loadAccount();
      setMessage('');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.h1}>Loading your routine…</Text>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              Saha <Text style={{ color: '#739068' }}>●</Text>
            </Text>
            <Text style={styles.eyebrow}>YOUR DAILY ALLY</Text>
          </View>
          {(signedIn || preview) && (
            <Button
              secondary
              disabled={busy || !dirty}
              onPress={() => void save()}
            >
              {busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </Button>
          )}
        </View>
        {message !== '' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setMessage('')}
            style={styles.notice}
          >
            <Text style={styles.body}>{message}</Text>
          </Pressable>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {!signedIn && !preview ? (
            <>
              <Text style={styles.h1}>A day that works for you.</Text>
              <Text style={styles.body}>
                Your schedule. Your preferences. One clear next step.
              </Text>
              <Card title={register ? 'Create your account' : 'Welcome back'}>
                <Field label="Email" value={email} onChange={setEmail} />
                <Field
                  label="Password · at least 12 characters"
                  value={password}
                  onChange={setPassword}
                  secure
                />
                <Button
                  disabled={busy || password.length < 12}
                  onPress={() => void auth()}
                >
                  {register ? 'Create account' : 'Sign in'}
                </Button>
                <Button secondary onPress={() => setRegister(!register)}>
                  {register ? 'Already have an account?' : 'Create an account'}
                </Button>
              </Card>
              <Button
                secondary
                onPress={() => {
                  setPreview(true);
                  setS((v) => ({
                    ...v,
                    profile: {
                      ...v.profile,
                      timezone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                  }));
                }}
              >
                Explore without saving
              </Button>
              <Text style={styles.small}>
                Preview data disappears when the app closes. Configure the
                account API address in the developer setup.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>
                {new Date(selected + 'T12:00:00').toLocaleDateString(
                  undefined,
                  { weekday: 'long', month: 'short', day: 'numeric' },
                )}{' '}
                · {routineFor(s, selected)}
              </Text>
              <Text style={styles.h1}>
                {!s.onboarded
                  ? 'Make it your routine'
                  : tab === 'Today'
                    ? `Hello, ${s.profile.name || 'there'} 🌱`
                    : tab}
              </Text>
              {(!s.onboarded || tab === 'Settings') && (
                <>
                  <Card title="Your preferences">
                    <Field
                      label="Name"
                      value={s.profile.name}
                      onChange={(v) => profile('name', v)}
                    />
                    <Field
                      label="Age (optional)"
                      value={s.profile.age}
                      onChange={(v) => profile('age', v)}
                      numeric
                    />
                    <Field
                      label="Time zone · e.g. Asia/Kolkata"
                      value={s.profile.timezone}
                      onChange={(v) => {
                        try {
                          new Intl.DateTimeFormat('en', { timeZone: v });
                          profile('timezone', v);
                        } catch {
                          setMessage('Use a valid time zone name.');
                        }
                      }}
                    />
                    <Choices
                      label="Dietary preference"
                      choices={[
                        'Unspecified',
                        'Vegetarian',
                        'Vegan',
                        'Jain',
                        'Other',
                      ]}
                      value={s.profile.dietary}
                      onChange={(v) => profile('dietary', v)}
                    />
                    <Field
                      label="Foods avoided / cultural restrictions"
                      value={s.profile.avoid}
                      onChange={(v) => profile('avoid', v)}
                    />
                    <Field
                      label="Allergies"
                      value={s.profile.allergies}
                      onChange={(v) => profile('allergies', v)}
                    />
                    <Field
                      label="Your routine goals"
                      value={s.profile.goals}
                      onChange={(v) => profile('goals', v)}
                    />
                  </Card>
                  <Card title="Your daily schedule">
                    {(['wake', 'sleep', 'workStart', 'workEnd'] as const).map(
                      (k, i) => (
                        <Field
                          key={k}
                          label={
                            [
                              'Wake time (HH:MM)',
                              'Bedtime (HH:MM)',
                              'Work/study starts',
                              'Work/study ends',
                            ][i]
                          }
                          value={s.profile[k]}
                          onChange={(v) => profile(k, v)}
                        />
                      ),
                    )}
                    <Days
                      days={s.profile.workDays}
                      onChange={(v) => profile('workDays', v)}
                    />
                    {Object.entries(s.meals).map(([k, v]) => (
                      <Field
                        key={k}
                        label={k + ' time (HH:MM)'}
                        value={v}
                        onChange={(value) =>
                          change((s) => ({
                            ...s,
                            meals: { ...s.meals, [k]: value },
                          }))
                        }
                      />
                    ))}
                    {(
                      [
                        'commute',
                        'waterTarget',
                        'container',
                        'movementTarget',
                        'sleepTarget',
                      ] as const
                    ).map((k, i) => (
                      <Field
                        key={k}
                        label={
                          [
                            'Commute minutes',
                            'Daily water target (ml)',
                            'Container size (ml)',
                            'Movement target (minutes)',
                            'Sleep target (hours)',
                          ][i]
                        }
                        numeric
                        value={s.profile[k]}
                        onChange={(v) => profile(k, Number(v))}
                      />
                    ))}
                    <Text style={styles.small}>
                      Existing tasks stay under your control. Use Builder to
                      adjust them.
                    </Text>
                  </Card>
                  <Card title="Reminders">
                    <Toggle
                      label="Enable reminders"
                      value={s.reminders.enabled}
                      onChange={(enabled) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, enabled },
                        }))
                      }
                    />
                    <Toggle
                      label="Sound"
                      value={s.reminders.sound}
                      onChange={(sound) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, sound },
                        }))
                      }
                    />
                    <Field
                      label="Quiet hours start (HH:MM)"
                      value={s.reminders.quietStart}
                      onChange={(quietStart) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, quietStart },
                        }))
                      }
                    />
                    <Field
                      label="Quiet hours end (HH:MM)"
                      value={s.reminders.quietEnd}
                      onChange={(quietEnd) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, quietEnd },
                        }))
                      }
                    />
                    <Field
                      numeric
                      label="Default snooze minutes"
                      value={s.reminders.snooze}
                      onChange={(n) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, snooze: Number(n) },
                        }))
                      }
                    />
                    <Field
                      numeric
                      label="Advance reminder minutes"
                      value={s.reminders.advance}
                      onChange={(n) =>
                        change((v) => ({
                          ...v,
                          reminders: { ...v.reminders, advance: Number(n) },
                        }))
                      }
                    />
                    <Button
                      secondary
                      onPress={async () => {
                        try {
                          const ok = await requestReminders();
                          setMessage(
                            ok
                              ? `${await syncReminders(s)} upcoming reminders scheduled.`
                              : 'Notifications were not allowed. You can enable them in device settings.',
                          );
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    >
                      Enable phone notifications
                    </Button>
                    <Text style={styles.small}>
                      The app schedules up to 60 upcoming reminders for the next
                      seven days. Reopen it to refresh the schedule. Device
                      settings can affect delivery.
                    </Text>
                  </Card>
                  <Card title="Your control">
                    <Toggle
                      label="I consent to saving the health and routine information I enter."
                      value={!!s.consent}
                      onChange={(checked) =>
                        change((v) => ({
                          ...v,
                          consent: checked ? new Date().toISOString() : '',
                        }))
                      }
                    />
                    {!s.onboarded ? (
                      <Button
                        disabled={!s.profile.name.trim() || !s.consent}
                        onPress={() => {
                          const updated = {
                            ...s,
                            onboarded: true,
                            tasks: generateBasics(s).map((t) => ({
                              ...t,
                              start: today,
                            })),
                          };
                          if (!validateState(updated)) {
                            setMessage(
                              'Check your schedule times, dates and goals.',
                            );
                            return;
                          }
                          change(() => updated);
                          setTab('Today');
                        }}
                      >
                        Generate my first day →
                      </Button>
                    ) : (
                      <>
                        <Button
                          secondary
                          onPress={() =>
                            void Share.share({
                              message: JSON.stringify(s, null, 2),
                              title: 'My routine export',
                            })
                          }
                        >
                          Export my data
                        </Button>
                        <Button
                          secondary
                          disabled={dirty || busy}
                          onPress={async () => {
                            try {
                              if (!preview) await api.signOut();
                              setSignedIn(false);
                              setPreview(false);
                              setS(initialState());
                              await syncReminders(initialState());
                            } catch (e) {
                              setMessage((e as Error).message);
                            }
                          }}
                        >
                          Sign out
                        </Button>
                        <Field
                          label="Current password (for account deletion)"
                          value={password}
                          onChange={setPassword}
                          secure
                        />
                        <Button
                          secondary
                          disabled={preview || !password || busy}
                          onPress={() =>
                            Alert.alert(
                              'Delete your account?',
                              'This permanently deletes your account, sessions and routine records. Export first if you want a copy.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      await api.deleteAccount(password);
                                      await syncReminders(initialState());
                                      setPassword('');
                                      setSignedIn(false);
                                      setS(initialState());
                                      setDirty(false);
                                    } catch (e) {
                                      setMessage((e as Error).message);
                                    }
                                  },
                                },
                              ],
                            )
                          }
                        >
                          Delete account and data
                        </Button>
                      </>
                    )}
                  </Card>
                </>
              )}
              {s.onboarded && tab === 'Today' && (
                <>
                  <View style={styles.hero}>
                    <Text style={styles.heroEyebrow}>YOUR NEXT ACTION</Text>
                    <Text style={styles.heroTitle}>
                      {next?.title || 'A little breathing room'}
                    </Text>
                    <Text style={styles.heroText}>
                      {next
                        ? `${next.scheduled} · ${next.note || next.category}`
                        : 'No pending task right now. Snoozed tasks return when due.'}
                    </Text>
                    {next && (
                      <View style={styles.wrap}>
                        <Button onPress={() => act(next, 'completed')}>
                          ✓ Mark done
                        </Button>
                        <Button
                          secondary
                          onPress={() => {
                            setDelay(s.reminders.snooze);
                            setAction({ task: next, kind: 'snoozed' });
                          }}
                        >
                          Snooze
                        </Button>
                      </View>
                    )}
                  </View>
                  <View style={styles.metrics}>
                    <View>
                      <Text style={styles.number}>
                        {done}/{tasks.length}
                      </Text>
                      <Text style={styles.small}>Completed</Text>
                    </View>
                    <View>
                      <Text style={styles.number}>
                        {tasks.length
                          ? Math.round((done / tasks.length) * 100)
                          : 0}
                        %
                      </Text>
                      <Text style={styles.small}>Routine consistency</Text>
                    </View>
                  </View>
                  {missed >= 3 && (
                    <Card title="Let’s focus on the next important thing">
                      <Text style={styles.body}>
                        Today didn’t go as planned. That’s okay.
                      </Text>
                      <Button secondary onPress={() => setAllFlow(!allFlow)}>
                        {allFlow ? 'Get back on track' : 'Show full day'}
                      </Button>
                    </Card>
                  )}
                  <Card
                    title={
                      missed >= 3 && !allFlow
                        ? 'Your next three'
                        : 'Today’s flow'
                    }
                  >
                    {(missed >= 3 && !allFlow
                      ? [...pending]
                          .sort((a, b) => a.priority - b.priority)
                          .slice(0, 3)
                      : tasks
                    ).map(row)}
                    <Button
                      secondary
                      onPress={() => setEditor({ ...taskBase(), start: today })}
                    >
                      ＋ Add task
                    </Button>
                  </Card>
                  <Card title="Hydration">
                    <Text style={styles.number}>
                      {log.water} / {s.profile.waterTarget} ml
                    </Text>
                    <Button
                      onPress={() =>
                        change((v) => ({
                          ...v,
                          logs: {
                            ...v.logs,
                            [selected]: {
                              ...log,
                              water: log.water + s.profile.container,
                            },
                          },
                        }))
                      }
                    >
                      ＋ {s.profile.container} ml
                    </Button>
                  </Card>
                  <Button secondary onPress={() => setTab('Track')}>
                    How are you feeling? Check in →
                  </Button>
                </>
              )}
              {s.onboarded && tab === 'Builder' && (
                <>
                  <Card title="Choose today’s routine">
                    <Choices
                      label="Routine"
                      choices={s.routines}
                      value={routineFor(s, today)}
                      onChange={(name) =>
                        change((v) =>
                          editState({
                            ...v,
                            dayRoutines: { ...v.dayRoutines, [today]: name },
                          }),
                        )
                      }
                    />
                    <Field
                      label="New routine name"
                      value={routineName}
                      onChange={setRoutineName}
                    />
                    <Button
                      secondary
                      onPress={() => {
                        if (
                          routineName.trim() &&
                          !s.routines.includes(routineName.trim())
                        )
                          change((v) => ({
                            ...v,
                            routines: [...v.routines, routineName.trim()],
                          }));
                        setRoutineName('');
                      }}
                    >
                      Create routine
                    </Button>
                  </Card>
                  <Button
                    onPress={() => setEditor({ ...taskBase(), start: today })}
                  >
                    ＋ Add routine task
                  </Button>
                  <Card title="Schedule">{tasks.map(row)}</Card>
                </>
              )}
              {s.onboarded && tab === 'Medicines' && (
                <>
                  <Text style={styles.body}>
                    Enter your prescription or professional’s instructions
                    exactly. Saha never changes dosage, duration or replaces a
                    missed dose.
                  </Text>
                  <Button
                    onPress={() =>
                      setMed({
                        id: randomUUID(),
                        name: '',
                        dose: '',
                        instruction: '',
                        prescriber: '',
                        notes: '',
                        start: today,
                        end: '',
                        slots: [taskBase('', 'medication')],
                      })
                    }
                  >
                    ＋ Add medicine
                  </Button>
                  {s.medications.length ? (
                    s.medications.map((m) => (
                      <Card key={m.id} title={m.name + ' · ' + m.dose}>
                        <Text style={styles.body}>{m.instruction}</Text>
                        <Text style={styles.small}>
                          {m.start} — {m.end || 'No end date'} ·{' '}
                          {m.slots.length} dose times
                        </Text>
                        <Button
                          secondary
                          onPress={() => setMed(JSON.parse(JSON.stringify(m)))}
                        >
                          Edit medication
                        </Button>
                      </Card>
                    ))
                  ) : (
                    <Card title="No medicines added">
                      <Text style={styles.body}>
                        Only the medicines you enter will appear here.
                      </Text>
                    </Card>
                  )}
                </>
              )}
              {s.onboarded && tab === 'Meals' && (
                <Card title="Meals that fit your preferences">
                  <Text style={styles.body}>
                    {s.profile.dietary} · Avoid:{' '}
                    {s.profile.avoid || 'not specified'} · Allergies:{' '}
                    {s.profile.allergies || 'not specified'}
                  </Text>
                  {Object.entries(s.meals).map(([k, t]) => (
                    <Field
                      key={k}
                      label={k + ' · ' + t}
                      value={s.mealPlans[selected + ':' + k] || ''}
                      onChange={(value) =>
                        change((v) => ({
                          ...v,
                          mealPlans: {
                            ...v.mealPlans,
                            [selected + ':' + k]: value,
                          },
                        }))
                      }
                    />
                  ))}
                </Card>
              )}
              {s.onboarded && tab === 'Track' && (
                <Card title="A moment for yourself">
                  {(
                    [
                      'water',
                      'movement',
                      'sleep',
                      'mood',
                      'energy',
                      'stress',
                    ] as const
                  ).map((k, i) => (
                    <Field
                      key={selected + k}
                      numeric
                      label={
                        [
                          'Water (ml)',
                          'Movement (minutes)',
                          'Sleep (hours)',
                          'Mood (1–5)',
                          'Energy (1–5)',
                          'Stress (1–5)',
                        ][i]
                      }
                      value={log[k]}
                      onChange={(n) =>
                        change((v) => ({
                          ...v,
                          logs: {
                            ...v.logs,
                            [selected]: {
                              ...(v.logs[selected] || blankLog()),
                              [k]: Number(n),
                            },
                          },
                        }))
                      }
                    />
                  ))}
                  <Field
                    label="Symptoms you choose to track"
                    value={log.symptoms}
                    onChange={(symptoms) =>
                      change((v) => ({
                        ...v,
                        logs: { ...v.logs, [selected]: { ...log, symptoms } },
                      }))
                    }
                  />
                  <Field
                    label="Notes"
                    value={log.note}
                    onChange={(note) =>
                      change((v) => ({
                        ...v,
                        logs: { ...v.logs, [selected]: { ...log, note } },
                      }))
                    }
                  />
                  <Button onPress={() => void save()}>Save check-in</Button>
                </Card>
              )}
              {s.onboarded && tab === 'Calendar' && (
                <>
                  <View style={styles.wrap}>
                    <Button
                      secondary
                      onPress={() => setDate(shiftDate(selected, -1))}
                    >
                      ← Previous
                    </Button>
                    <Button secondary onPress={() => setDate(today)}>
                      Today
                    </Button>
                    <Button
                      secondary
                      onPress={() => setDate(shiftDate(selected, 1))}
                    >
                      Next →
                    </Button>
                  </View>
                  <Card title="Choose a date">
                    <View style={styles.wrap}>
                      {Array.from(
                        {
                          length: new Date(
                            Number(selected.slice(0, 4)),
                            Number(selected.slice(5, 7)),
                            0,
                          ).getDate(),
                        },
                        (_, i) => {
                          const d =
                            selected.slice(0, 8) +
                            String(i + 1).padStart(2, '0');
                          return (
                            <Pressable
                              key={d}
                              onPress={() => setDate(d)}
                              accessibilityRole="button"
                              style={[
                                styles.day,
                                d === selected && styles.chipOn,
                              ]}
                            >
                              <Text
                                style={d === selected ? { color: 'white' } : {}}
                              >
                                {i + 1}
                              </Text>
                            </Pressable>
                          );
                        },
                      )}
                    </View>
                    <Text style={styles.body}>
                      {done} completed · {missed} missed/skipped
                    </Text>
                    <Text style={styles.small}>
                      Water {log.water} ml · {log.note}
                    </Text>
                  </Card>
                  <Card title="Daily summary">{tasks.map(row)}</Card>
                </>
              )}
              {s.onboarded && tab === 'Insights' && (
                <>
                  <Card title="Your week, without judgement">
                    <Text style={styles.body}>
                      Routine adherence, not a medical or health score.
                    </Text>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = shiftDate(today, i - 6),
                        ts = instances(s, d),
                        n = ts.filter(
                          (t) => latest(s, t)?.status === 'completed',
                        ).length,
                        p = ts.length ? (n / ts.length) * 100 : 0;
                      return (
                        <View key={d} style={styles.field}>
                          <View style={styles.row}>
                            <Text style={styles.body}>{d}</Text>
                            <Text style={styles.label}>
                              {n}/{ts.length} · {Math.round(p)}%
                            </Text>
                          </View>
                          <View style={styles.bar}>
                            <View style={[styles.fill, { width: `${p}%` }]} />
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                  <Card title="By category">
                    {categories.map((c) => {
                      const ts = Array.from({ length: 7 }, (_, i) =>
                        instances(s, shiftDate(today, -i)),
                      )
                        .flat()
                        .filter((t) => t.category === c);
                      return ts.length ? (
                        <View key={c} style={styles.row}>
                          <Text style={styles.body}>{c}</Text>
                          <Text style={styles.label}>
                            {
                              ts.filter(
                                (t) => latest(s, t)?.status === 'completed',
                              ).length
                            }
                            /{ts.length}
                          </Text>
                        </View>
                      ) : null;
                    })}
                    <Text style={styles.small}>
                      Logged days retain their schedule. Unlogged dates use the
                      current plan.
                    </Text>
                  </Card>
                </>
              )}
            </>
          )}
        </ScrollView>
        {(signedIn || preview) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.nav}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
          >
            {tabs.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: t === tab }}
                style={[styles.navButton, t === tab && styles.chipOn]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.navText, t === tab && { color: '#fff' }]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <Modal
        visible={!!editor || !!med || !!action}
        animationType="slide"
        onRequestClose={() => {
          setEditor(null);
          setMed(null);
          setAction(null);
        }}
      >
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.content}
            >
              <Button
                secondary
                onPress={() => {
                  setEditor(null);
                  setMed(null);
                  setAction(null);
                }}
              >
                Close
              </Button>
              {editor && (
                <>
                  <Text style={styles.h1}>Routine task</Text>
                  <Field
                    label="Task name"
                    value={editor.title}
                    onChange={(title) => setEditor({ ...editor, title })}
                  />
                  <Choices
                    label="Category"
                    choices={categories.filter((c) => c !== 'medication')}
                    value={editor.category}
                    onChange={(category) =>
                      setEditor({
                        ...editor,
                        category: category as Task['category'],
                      })
                    }
                  />
                  <TaskFields
                    task={editor}
                    update={setEditor}
                    routines={s.routines}
                  />
                  <Button
                    onPress={() => {
                      const updated = editState({
                        ...s,
                        tasks: [
                          ...s.tasks.filter((t) => t.id !== editor.id),
                          editor,
                        ],
                      });
                      if (!editor.title.trim() || !validateState(updated)) {
                        setMessage('Check task name, times and dates.');
                        return;
                      }
                      change(() => updated);
                      setEditor(null);
                    }}
                  >
                    Save task
                  </Button>
                </>
              )}
              {med && (
                <>
                  <Text style={styles.h1}>Medication</Text>
                  {(
                    [
                      'name',
                      'dose',
                      'instruction',
                      'prescriber',
                      'notes',
                      'start',
                      'end',
                    ] as const
                  ).map((k, i) => (
                    <Field
                      key={k}
                      label={
                        [
                          'Medicine name',
                          'Dose / strength',
                          'Exact food / other instruction',
                          'Prescriber',
                          'Notes',
                          'Start date (YYYY-MM-DD)',
                          'End date (optional)',
                        ][i]
                      }
                      value={med[k]}
                      onChange={(v) => setMed({ ...med, [k]: v })}
                    />
                  ))}
                  {med.slots.map((t, i) => (
                    <Card key={t.id} title={'Dose ' + (i + 1)}>
                      <TaskFields
                        task={t}
                        update={(task) =>
                          setMed({
                            ...med,
                            slots: med.slots.map((x) =>
                              x.id === task.id ? task : x,
                            ),
                          })
                        }
                        routines={s.routines}
                      />
                      {med.slots.length > 1 && (
                        <Button
                          secondary
                          onPress={() =>
                            setMed({
                              ...med,
                              slots: med.slots.filter((x) => x.id !== t.id),
                            })
                          }
                        >
                          Remove dose slot
                        </Button>
                      )}
                    </Card>
                  ))}
                  <Button
                    secondary
                    onPress={() =>
                      setMed({
                        ...med,
                        slots: [...med.slots, taskBase('', 'medication')],
                      })
                    }
                  >
                    ＋ Add dose time
                  </Button>
                  <Button
                    onPress={() => {
                      const updated = editState({
                        ...s,
                        medications: [
                          ...s.medications.filter((m) => m.id !== med.id),
                          med,
                        ],
                      });
                      if (
                        !med.name.trim() ||
                        !med.dose.trim() ||
                        !med.instruction.trim() ||
                        !validateState(updated)
                      ) {
                        setMessage(
                          'Enter medicine name, dose, instructions and valid dates/times.',
                        );
                        return;
                      }
                      change(() => updated);
                      setMed(null);
                    }}
                  >
                    Save medication
                  </Button>
                </>
              )}
              {action && (
                <>
                  <Text style={styles.h1}>
                    {action.kind === 'snoozed'
                      ? 'Snooze reminder'
                      : 'This task wasn’t completed'}
                  </Text>
                  {action.kind === 'snoozed' ? (
                    <>
                      <Choices
                        label="Minutes"
                        choices={['5', '10', '15', '30']}
                        value={String(delay)}
                        onChange={(v) => setDelay(Number(v))}
                      />
                      <Field
                        label="Custom minutes"
                        value={delay}
                        numeric
                        onChange={(v) => setDelay(Number(v))}
                      />
                    </>
                  ) : (
                    <Choices
                      label="Reason (optional)"
                      choices={[
                        'Forgot',
                        'Busy',
                        'Travelling',
                        'Sleeping',
                        'Schedule changed',
                        'Didn’t feel well',
                        'Other',
                      ]}
                      value={reason}
                      onChange={setReason}
                    />
                  )}
                  <Button
                    disabled={
                      action.kind === 'snoozed' && (delay < 1 || delay > 1440)
                    }
                    onPress={() =>
                      act(
                        action.task,
                        action.kind,
                        action.kind === 'skipped' ? reason : undefined,
                        action.kind === 'snoozed' ? delay : undefined,
                      )
                    }
                  >
                    Confirm
                  </Button>
                </>
              )}
              {message !== '' && <Text style={styles.error}>{message}</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
function Days({
  days,
  onChange,
}: {
  days: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Recurring days</Text>
      <View style={styles.wrap}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
          <Pressable
            key={d}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: days.includes(i) }}
            onPress={() =>
              onChange(
                days.includes(i) ? days.filter((x) => x !== i) : [...days, i],
              )
            }
            style={[styles.day, days.includes(i) && styles.chipOn]}
          >
            <Text style={days.includes(i) ? { color: '#fff' } : {}}>{d}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function TaskFields({
  task: t,
  update,
  routines,
}: {
  task: Task;
  update: (t: Task) => void;
  routines: string[];
}) {
  return (
    <>
      <Choices
        label="Timing"
        choices={[
          'Fixed',
          'breakfast',
          'lunch',
          'snack',
          'dinner',
          'wake',
          'sleep',
        ]}
        value={t.anchor || 'Fixed'}
        onChange={(v) => update({ ...t, anchor: v === 'Fixed' ? '' : v })}
      />
      {t.anchor ? (
        <Field
          numeric
          label="Offset minutes · negative = before"
          value={t.offset}
          onChange={(v) => update({ ...t, offset: Number(v) })}
        />
      ) : (
        <Field
          label="Time (HH:MM)"
          value={t.time}
          onChange={(time) => update({ ...t, time })}
        />
      )}
      <Choices
        label="Applies to"
        choices={['All routines', ...routines]}
        value={t.routine}
        onChange={(routine) => update({ ...t, routine })}
      />
      <Choices
        label="Priority"
        choices={['High', 'Medium', 'Low']}
        value={['High', 'Medium', 'Low'][t.priority - 1]}
        onChange={(v) =>
          update({ ...t, priority: ['High', 'Medium', 'Low'].indexOf(v) + 1 })
        }
      />
      <Field
        numeric
        label="Duration (minutes)"
        value={t.duration}
        onChange={(v) => update({ ...t, duration: Number(v) })}
      />
      <Days days={t.days} onChange={(days) => update({ ...t, days })} />
      {t.category !== 'medication' && (
        <>
          <Field
            label="Start date (optional YYYY-MM-DD)"
            value={t.start}
            onChange={(start) => update({ ...t, start })}
          />
          <Field
            label="End date (same as start for one-time tasks)"
            value={t.end}
            onChange={(end) => update({ ...t, end })}
          />
          <Field
            label="Notes / appointment location"
            value={t.note}
            onChange={(note) => update({ ...t, note })}
          />
        </>
      )}
      <Toggle
        label="Reminder enabled"
        value={t.reminder}
        onChange={(reminder) => update({ ...t, reminder })}
      />
    </>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8f3' },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#dde5d8',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: '#263e2e',
    letterSpacing: -1,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.7,
    color: '#667c5d',
    fontWeight: '700',
    marginVertical: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 14,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  h1: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#243d2c',
    marginBottom: 8,
  },
  h2: { fontSize: 20, fontWeight: '700', color: '#263e2e', marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, color: '#52634f' },
  small: { fontSize: 13, lineHeight: 20, color: '#657360' },
  label: { fontSize: 14, fontWeight: '600', color: '#344c35' },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e6db',
    borderRadius: 20,
    gap: 8,
    marginVertical: 3,
  },
  field: { gap: 8, marginVertical: 8 },
  input: {
    fontSize: 16,
    color: '#263e2e',
    backgroundColor: '#fafcf8',
    borderWidth: 1,
    borderColor: '#cad7c4',
    borderRadius: 10,
    padding: 12,
    minHeight: 46,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginVertical: 5,
  },
  button: {
    backgroundColor: '#315d47',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    marginVertical: 5,
    minHeight: 46,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: '#e8eee0' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#edf2e8', borderRadius: 10, padding: 11 },
  chipOn: { backgroundColor: '#315d47' },
  chipText: { fontSize: 14, color: '#415c3c' },
  task: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: '#e8eee2',
    gap: 9,
  },
  taskTitle: { fontSize: 16, fontWeight: '600', color: '#293f2d' },
  strike: { textDecorationLine: 'line-through', opacity: 0.6 },
  check: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#adbea4',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskActions: { flexDirection: 'row', gap: 24, justifyContent: 'flex-end' },
  link: { fontSize: 14, color: '#416d49', paddingVertical: 5 },
  hero: { backgroundColor: '#294d38', borderRadius: 23, padding: 24, gap: 14 },
  heroTitle: { fontSize: 25, lineHeight: 31, fontWeight: '700', color: '#fff' },
  heroText: { fontSize: 15, lineHeight: 22, color: '#d6e5cf' },
  heroEyebrow: {
    fontSize: 12,
    letterSpacing: 1.8,
    fontWeight: '700',
    color: '#c5d8bc',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 17,
  },
  number: { fontSize: 30, fontWeight: '700', color: '#31513a' },
  notice: { backgroundColor: '#edf0d5', padding: 12 },
  error: { color: '#9d3939', fontSize: 14, marginTop: 14 },
  nav: {
    flexGrow: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#dce5d5',
    paddingVertical: 10,
    maxHeight: 68,
  },
  navButton: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 12 },
  navText: { fontSize: 14, fontWeight: '600', color: '#536c49' },
  day: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#eaf0e3',
  },
  bar: {
    height: 8,
    backgroundColor: '#e6eddc',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: { height: 8, backgroundColor: '#769c66', borderRadius: 5 },
});
