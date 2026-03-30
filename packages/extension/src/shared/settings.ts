export interface ExtensionSettings {
  idleTimeoutMinutes: number;
  captureEnabled: boolean;
}

export const DEFAULTS: ExtensionSettings = {
  idleTimeoutMinutes: 30,
  captureEnabled: true,
};

const KEYS = Object.keys(DEFAULTS) as (keyof ExtensionSettings)[];

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS);
  return { ...DEFAULTS, ...stored } as ExtensionSettings;
}

export async function updateSettings(changes: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.local.set(changes);
}
