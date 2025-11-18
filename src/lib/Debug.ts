// @ts-nocheck

export const DEBUG = true;

export function logDebug(msg: string) {
  if (DEBUG) log(`[Weather Effect] ${msg}`);
}
