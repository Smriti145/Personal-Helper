import notifee, {AuthorizationStatus, AndroidImportance, TriggerType} from '@notifee/react-native';
import {Platform} from 'react-native';
import type {State} from '../../shared/routine';
import {planNotifications, reconcileNotifications, serializeUpdates} from '../../shared/notification-plan';

export async function requestReminders() {
  const result = await notifee.requestPermission();
  return result.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

const update = serializeUpdates(async (s: State) => {
  // Validate and resolve every time before touching existing native triggers.
  const plan = planNotifications(s, new Date(), Platform.OS === 'android' ? 50 : 60);
  const allowed = !s.reminders.enabled ||
    (await notifee.getNotificationSettings()).authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  if (!allowed) plan.items = [];
  const channelId = `routine-${s.reminders.sound ? 'sound' : 'silent'}-${s.reminders.vibration ? 'vibrate' : 'quiet'}`;
  if (plan.items.length && Platform.OS === 'android') {
    await notifee.createChannel({id: channelId, name: 'Routine reminders',
      importance: AndroidImportance.DEFAULT, sound: s.reminders.sound ? 'default' : undefined,
      vibration: s.reminders.vibration});
  }
  const count = await reconcileNotifications(plan, {
    ids: () => notifee.getTriggerNotificationIds(),
    cancel: (id) => notifee.cancelTriggerNotification(id),
    upsert: async (item) => {
      await notifee.createTriggerNotification({
        id: item.id, title: 'Your routine reminder', body: 'Open Saha to see your next task.',
        data: {taskId: item.taskId, date: item.date},
        android: {channelId, smallIcon: 'ic_stat_routine', pressAction: {id: 'default'}},
        ios: {sound: s.reminders.sound ? 'default' : undefined,
          foregroundPresentationOptions: {banner: true, list: true, sound: s.reminders.sound, badge: false}},
      }, {type: TriggerType.TIMESTAMP, timestamp: item.timestamp});
    },
  });
  if (!allowed) throw Error('Phone notifications are not allowed. Enable them in device settings.');
  if (plan.issues.length) throw Error(`${count} reminders scheduled. ${plan.issues.length} reminder times need review. ${plan.issues[0]}`);
  return count;
});

export function syncReminders(s: State) {
  // Capture the request so later UI mutations cannot change a queued update.
  return update(JSON.parse(JSON.stringify(s)) as State);
}
