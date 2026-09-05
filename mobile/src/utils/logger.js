/**
 * On-device diagnostic log — so real device behaviour can be inspected
 * without adb/a computer (see app/debug.js, reachable from Profile).
 *
 * Captures console.log/warn/error, uncaught JS errors (ErrorUtils) and
 * unhandled promise rejections into a bounded ring buffer, and persists it
 * to AsyncStorage so the log survives a freeze + force-close + relaunch.
 * Deliberately dependency-free and defensive: a logger that throws, or that
 * grows without bound, would be worse than no logger.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAX_ENTRIES = 400;
const STORAGE_KEY = "mic_debug_log_v1";

let buffer = [];
let persistTimer = null;
let installed = false;

function stringify(v) {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ""}`;
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function schedulePersist() {
  if (persistTimer) return;
  // Debounced so a burst of logs doesn't hammer AsyncStorage.
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    } catch (_) {
      /* never let logging break the app */
    }
  }, 800);
}

/** Record one entry. Safe to call before install(). */
export function addLog(level, ...args) {
  try {
    const entry = {
      t: new Date().toISOString(),
      level,
      msg: args.map(stringify).join(" ").slice(0, 2000),
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
    schedulePersist();
  } catch (_) {
    /* ignore */
  }
}

/** Convenience wrapper used by app code for deliberate diagnostics. */
export const debugLog = (...args) => addLog("debug", ...args);

export function getLogs() {
  return buffer.slice();
}

/** Write the buffer immediately, bypassing the debounce. Call this right
 * before anything that might kill or replace the JS context (e.g.
 * Updates.reloadAsync()) — otherwise a crash in the next few hundred ms
 * loses whatever hasn't been debounced to disk yet. */
export async function flushLogs() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch (_) {}
}

export async function clearLogs() {
  buffer = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

export function formatLogs() {
  return buffer.map((e) => `[${e.t.slice(11, 23)}] ${e.level.toUpperCase()}: ${e.msg}`).join("\n");
}

/** Load the previous session's log (called once at startup). */
export async function loadPersistedLogs() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const prev = JSON.parse(raw);
    if (Array.isArray(prev) && prev.length) {
      // Keep the previous session above the current one, clearly separated,
      // so a freeze that required a force-close is still diagnosable.
      buffer = [...prev, { t: new Date().toISOString(), level: "info", msg: "── app relaunched ──" }, ...buffer].slice(
        -MAX_ENTRIES
      );
    }
  } catch (_) {}
}

/**
 * Patch console + global error handlers. Idempotent; call once as early as
 * possible (app/_layout.js imports this module for its side effect).
 */
export function installLogger() {
  if (installed) return;
  installed = true;

  ["log", "warn", "error"].forEach((level) => {
    const original = console[level];
    console[level] = (...args) => {
      addLog(level, ...args);
      try {
        original.apply(console, args);
      } catch (_) {}
    };
  });

  try {
    const g = global;
    if (g.ErrorUtils?.setGlobalHandler) {
      const prev = g.ErrorUtils.getGlobalHandler?.();
      g.ErrorUtils.setGlobalHandler((err, isFatal) => {
        addLog("fatal", `${isFatal ? "FATAL " : ""}${stringify(err)}`);
        if (prev) prev(err, isFatal);
      });
    }
  } catch (_) {}

  // Unhandled promise rejections — the usual source of silently-missing data.
  try {
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (id, error) => addLog("error", `Unhandled promise rejection: ${stringify(error)}`),
      onHandled: () => {},
    });
  } catch (_) {}

  addLog("info", "logger installed");
}
