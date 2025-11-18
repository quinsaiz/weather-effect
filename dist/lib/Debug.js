// @ts-nocheck
export const DEBUG = true;
export function logDebug(msg) {
    if (DEBUG)
        log(`[Weather Effect] ${msg}`);
}
