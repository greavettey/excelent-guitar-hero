/**
 * Minimal Win32 SendInput keyboard injector via Koffi FFI.
 * Provides sendKey(), sendCombo(), sendText(), and releaseAllModifiers()
 * without application-specific window restrictions.
 */

import koffi from "koffi";

export const VK_MAP = {
  ctrl: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,

  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  esc: 0x1b,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  insert: 0x2d,
  delete: 0x2e,

  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,

  ";": 0xba,
  "=": 0xbb,
};

for (let c = 65; c <= 90; c++) {
  VK_MAP[String.fromCharCode(c).toLowerCase()] = c;
}
for (let c = 48; c <= 57; c++) {
  VK_MAP[String.fromCharCode(c)] = c;
}

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const MOUSE_BUTTON_FLAGS = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
};

const EXTENDED_VKS = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b,
]);

let _user32 = null;
let _SendInput = null;
let _SetCursorPos = null;
let _INPUT = null;

function ensureWin32() {
  if (_SendInput) return true;
  if (process.platform !== "win32") return false;

  _user32 = koffi.load("user32.dll");

  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16",
    wScan: "uint16",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr_t",
  });

  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "int32",
    dy: "int32",
    mouseData: "uint32",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr_t",
  });

  const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
    uMsg: "uint32",
    wParamL: "uint16",
    wParamH: "uint16",
  });

  const INPUT_UNION = koffi.union("INPUT_UNION", {
    mi: MOUSEINPUT,
    ki: KEYBDINPUT,
    hi: HARDWAREINPUT,
  });

  _INPUT = koffi.struct("INPUT", {
    type: "uint32",
    u: INPUT_UNION,
  });

  _SendInput = _user32.func("uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)");
  _SetCursorPos = _user32.func("bool __stdcall SetCursorPos(int X, int Y)");
  return true;
}

function makeVkEvent(vk, isUp = false) {
  let flags = isUp ? KEYEVENTF_KEYUP : 0;
  if (EXTENDED_VKS.has(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: 0,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function makeUnicodeEvent(codeUnit, isUp = false) {
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: 0,
        wScan: codeUnit,
        dwFlags: KEYEVENTF_UNICODE | (isUp ? KEYEVENTF_KEYUP : 0),
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function makeMouseEvent(dwFlags, { dx = 0, dy = 0, mouseData = 0 } = {}) {
  return {
    type: INPUT_MOUSE,
    u: {
      mi: {
        dx,
        dy,
        mouseData,
        dwFlags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function dispatchInputs(events) {
  if (!events.length) return 0;
  if (!ensureWin32()) return 0;
  return _SendInput(events.length, events, koffi.sizeof(_INPUT));
}

export function resolveVk(key) {
  if (typeof key === "number") return key;
  const vk = VK_MAP[String(key).toLowerCase()];
  if (vk === undefined) {
    throw new Error(`Unknown key name: '${key}'`);
  }
  return vk;
}

/**
 * Tap a single key (e.g., "a", "enter", "up", "f5").
 */
export function sendKey(key, { dryRun = false } = {}) {
  const vk = resolveVk(key);
  if (dryRun) return true;
  return dispatchInputs([makeVkEvent(vk, false), makeVkEvent(vk, true)]) === 2;
}

/**
 * Press a key combination (e.g., ["ctrl", "c"], ["alt", "tab"]).
 */
export function sendCombo(keys, { dryRun = false } = {}) {
  const vks = keys.map(resolveVk);
  if (dryRun) return true;
  const events = [];
  for (const vk of vks) events.push(makeVkEvent(vk, false));
  for (let i = vks.length - 1; i >= 0; i--) events.push(makeVkEvent(vks[i], true));
  return dispatchInputs(events) === events.length;
}

/**
 * Type arbitrary Unicode text.
 */
export function sendText(text, { dryRun = false } = {}) {
  if (!text) return true;
  if (dryRun) return true;
  const events = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    events.push(makeUnicodeEvent(code, false), makeUnicodeEvent(code, true));
  }
  return dispatchInputs(events) === events.length;
}

/**
 * Move the mouse cursor to screen pixel coordinates (x, y).
 */
export function moveMouse(x, y, { dryRun = false } = {}) {
  const px = Math.round(Number(x));
  const py = Math.round(Number(y));
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    throw new Error(`Invalid mouse coordinates: (${x}, ${y})`);
  }
  if (dryRun) return true;
  if (!ensureWin32()) return false;
  return Boolean(_SetCursorPos(px, py));
}

/**
 * Send a mouse click ("left", "right", or "middle"), optionally at (x, y).
 */
export function sendClick(button = "left", { x = null, y = null, count = 1, dryRun = false } = {}) {
  const btn = MOUSE_BUTTON_FLAGS[String(button).toLowerCase()];
  if (!btn) {
    throw new Error(`Unknown mouse button: '${button}'`);
  }
  const clicks = Math.max(1, Math.floor(count));
  if (x !== null && y !== null) {
    if (!moveMouse(x, y, { dryRun })) return false;
  }
  if (dryRun) return true;
  const events = [];
  for (let i = 0; i < clicks; i++) {
    events.push(makeMouseEvent(btn.down), makeMouseEvent(btn.up));
  }
  return dispatchInputs(events) === events.length;
}

/**
 * Release stuck modifier keys (call on disconnect or SIGINT).
 */
export function releaseAllModifiers() {
  if (process.platform !== "win32") return;
  dispatchInputs([
    makeVkEvent(VK_MAP.ctrl, true),
    makeVkEvent(VK_MAP.shift, true),
    makeVkEvent(VK_MAP.alt, true),
    makeVkEvent(VK_MAP.win, true),
  ]);
}
