import notifee,{AuthorizationStatus,AndroidImportance,TriggerType} from '@notifee/react-native';
import { Platform } from 'react-native';
import {
  dateInZone,
  shiftDate,
  instances,
  latest,
  minutes,
  type State,
} from '../../shared/routine';
export async function requestReminders() {
 const result=await notifee.requestPermission();
 return result.authorizationStatus>=AuthorizationStatus.AUTHORIZED;
}
function inQuiet(time: string, s: State) {
  const n = minutes(time),
    a = minutes(s.reminders.quietStart),
    b = minutes(s.reminders.quietEnd);
  return a !== b && (a > b ? n >= a || n < b : n >= a && n < b);
}
// Convert the configured wall clock to an instant, including the user's timezone offset.
function instant(date: string, time: string, zone: string) {
  let value = Date.parse(date + 'T' + time + ':00Z');
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const part = (t: string) => parts.find((p) => p.type === t)!.value;
    const seen = Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`,
    );
    value += Date.parse(date + 'T' + time + ':00Z') - seen;
  }
  return value;
}
export async function syncReminders(s: State) {
  await notifee.cancelTriggerNotifications();
  if (
    !s.reminders.enabled ||
    (await notifee.getNotificationSettings()).authorizationStatus < AuthorizationStatus.AUTHORIZED
  )
    return 0;
  const channelId=`routine-${s.reminders.sound?'sound':'silent'}-${s.reminders.vibration?'vibrate':'quiet'}`;
  if(Platform.OS==='android')await notifee.createChannel({id:channelId,name:'Routine reminders',importance:AndroidImportance.DEFAULT,sound:s.reminders.sound?'default':undefined,vibration:s.reminders.vibration});
  const today = dateInZone(s.profile.timezone);
  let count = 0;
  for (let day = 0; day < 7; day++) {
    const date = shiftDate(today, day);
    for (const t of instances(s, date)) {
      const e = latest(s, t);
      if (
        !t.reminder ||
        !s.reminders.categories.includes(t.category) ||
        (e && ['completed', 'skipped', 'missed'].includes(e.status))
      )
        continue;
      const at =
        e?.status === 'snoozed' && e.until
          ? Date.parse(e.until)
          : instant(date, t.scheduled, s.profile.timezone) -
            s.reminders.advance * 60000;
      if (
        at <= Date.now() ||
        inQuiet(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: s.profile.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(at)),
          s,
        )
      )
        continue;
      if (count >= (Platform.OS==='android'?50:60)) return count;
      await notifee.createTriggerNotification({
        id:date+':'+t.id,
        title:'Your routine reminder',
        body:'Open Saha to see your next task.',
        data:{taskId:t.id,date},
        android:{channelId,smallIcon:'ic_stat_routine',pressAction:{id:'default'}},
        ios:{sound:s.reminders.sound?'default':undefined,foregroundPresentationOptions:{banner:true,list:true,sound:s.reminders.sound,badge:false}},
      },{type:TriggerType.TIMESTAMP,timestamp:at});
      count++;
    }
  }
  return count;
}
