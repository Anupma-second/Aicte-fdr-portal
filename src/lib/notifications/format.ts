/**
 * Notification text is stored as a translation key plus values, so each reader sees it
 * in their own language. Older plain-text rows are shown as they are.
 */
const PREFIX = "i18n:";

export type NotificationParams = Record<string, string | number>;

export function encodeText(key: string, params: NotificationParams): string {
  return `${PREFIX}${key}|${JSON.stringify(params)}`;
}

export function decodeText(value: string): { key: string; params: NotificationParams } | null {
  if (!value.startsWith(PREFIX)) return null;
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  try {
    return { key: value.slice(PREFIX.length, separator), params: JSON.parse(value.slice(separator + 1)) };
  } catch {
    return null;
  }
}

type Translate = (key: string, values?: NotificationParams) => string;

export function renderText(value: string, t: Translate): string {
  const decoded = decodeText(value);
  return decoded ? t(decoded.key, decoded.params) : value;
}
