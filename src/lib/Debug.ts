export const DEBUG = true;

export function logDebug(msg: string) {
  if (DEBUG) log(`[Weather Effect] ${msg}`);
}

export function logError(msg: string) {
  log(`[Weather Effect][Error] ${msg}`);
}
