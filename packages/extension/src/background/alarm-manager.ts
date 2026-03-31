export const ALARM_PREFIX = "idle-tab-";

export async function resetIdleAlarm(tabId: number, timeoutMinutes: number): Promise<void> {
  const name = `${ALARM_PREFIX}${tabId}`;
  await chrome.alarms.clear(name);
  chrome.alarms.create(name, { delayInMinutes: timeoutMinutes });
}

export async function clearIdleAlarm(tabId: number): Promise<void> {
  await chrome.alarms.clear(`${ALARM_PREFIX}${tabId}`);
}

export function parseTabIdFromAlarm(alarmName: string): number | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) return null;
  const id = parseInt(alarmName.slice(ALARM_PREFIX.length), 10);
  return isNaN(id) ? null : id;
}
