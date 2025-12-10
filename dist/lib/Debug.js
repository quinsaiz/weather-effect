// @ts-nocheck
export const DEBUG = true;
export function logDebug(msg) {
    if (DEBUG)
        log(`[Weather Effect] ${msg}`);
}
export function logError(msg) {
    globalThis.logError
        ? globalThis.logError(`[Weather Effect] ${msg}`)
        : log(`[Weather Effect][Error] ${msg}`);
}
