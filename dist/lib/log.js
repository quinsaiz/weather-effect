// @ts-nocheck
// Centralized debug flag and logging helper
export const DEBUG = false;
export function logDebug(msg) {
    if (DEBUG)
        log(`[Weather Effect] ${msg}`);
}
