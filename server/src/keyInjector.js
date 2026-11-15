/**
 * Win32 SendInput keyboard injector via Koffi FFI with strict per-step Excel/Vim verification.
 */

import koffi from "koffi";
import { TargetApp, getForegroundWindowInfo } from "./windowGuard.js";

export const VK_MAP = {
  ctrl: 0x11,
  lctrl: 0xa2,
  rctrl: 0xa3,
  shift: 0x10,
  lshift: 0xa0,
  rshift: 0xa1,
  alt: 0x12,
  lalt: 0xa4,
  ralt: 0xa5,
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
  apps: 0x5d,

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
  ",": 0xbc,
  "-": 0xbd,
  ".": 0xbe,
  "/": 0xbf,
  "`": 0xc0,
  "[": 0xdb,
  "\\": 0xdc,
  "]": 0xdd,
  "'": 0xde,
};

for (const ch of "0123456789") {
  VK_MAP[ch] = ch.charCodeAt(0);
}
for (const ch of "abcdefghijklmnopqrstuvwxyz") {
  VK_MAP[ch] = ch.toUpperCase().charCodeAt(0);
}

export const MODIFIER_KEYS = new Set([
  "ctrl",
  "lctrl",
  "rctrl",
  "shift",
  "lshift",
  "rshift",
  "alt",
  "lalt",
  "ralt",
  "win",
]);

const EXTENDED_VKS = new Set([
  0x21, 0x22, 0x23, 0x24,
  0x25, 0x26, 0x27, 0x28,
  0x2d, 0x2e,
  0x5b, 0x5d,
  0xa3, 0xa5,
]);

export function chord(...keys) {
  return { kind: "chord", keys: keys.map((k) => k.toLowerCase()) };
}

export function text(str) {
  return { kind: "text", text: str };
}

export function repeat(...args) {
  // repeat("up", 5) or repeat("ctrl", "right", 3)
  const count = args[args.length - 1];
  const keys = args.slice(0, -1).map((k) => k.toLowerCase());
  return { kind: "repeat", keys, count };
}

export function makeAction(name, steps, { category = "", requiresRiff = false, requiresStarPower = false } = {}) {
  return { name, steps, category, requiresRiff, requiresStarPower };
}

export function actionChord(name, ...keysAndOpts) {
  let opts = {};
  let keys = keysAndOpts;
  if (typeof keysAndOpts[keysAndOpts.length - 1] === "object") {
    opts = keysAndOpts[keysAndOpts.length - 1];
    keys = keysAndOpts.slice(0, -1);
  }
  return makeAction(name, [chord(...keys)], opts);
}

export function actionText(name, s, opts = {}) {
  return makeAction(name, [text(s)], opts);
}

export function actionEx(name, cmd, opts = {}) {
  return makeAction(name, [text(cmd), chord("enter")], { category: "Vim Ex", ...opts });
}

export function actionRibbon(name, ...tipsAndOpts) {
  let opts = {};
  let tips = tipsAndOpts;
  if (typeof tipsAndOpts[tipsAndOpts.length - 1] === "object") {
    opts = tipsAndOpts[tipsAndOpts.length - 1];
    tips = tipsAndOpts.slice(0, -1);
  }
  const steps = [chord("alt"), ...tips.map((k) => chord(k))];
  return makeAction(name, steps, { category: "Excel Ribbon", ...opts });
}

export function actionGoto(name, cellRef, opts = {}) {
  return makeAction(name, [chord("f5"), text(cellRef), chord("enter")], {
    category: "Excel GoTo",
    ...opts,
  });
}

export function canonicalSignature(act) {
  return act.steps
    .map((s) => {
      if (s.kind === "chord") return `C(${s.keys.join(",")})`;
      if (s.kind === "text") return `T(${JSON.stringify(s.text)})`;
      if (s.kind === "repeat") return `R(${s.keys.join(",")}*${s.count})`;
      throw new Error(`Unknown step kind: ${s.kind}`);
    })
    .join("|");
}

export function displayKeys(act) {
  return act.steps
    .map((s) => {
      if (s.kind === "chord") return s.keys.map((k) => (k.length > 1 ? k.toUpperCase() : k)).join("+");
      if (s.kind === "text") return s.text;
      if (s.kind === "repeat") {
        const combo = s.keys.map((k) => (k.length > 1 ? k.toUpperCase() : k)).join("+");
        return `${combo}x${s.count}`;
      }
      return "";
    })
    .join(" ");
}

export function validateAction(act) {
  if (!act || !act.name) throw new Error("Action must have a non-empty name");
  if (!Array.isArray(act.steps) || act.steps.length === 0) {
    throw new Error(`Action ${JSON.stringify(act.name)} has no steps`);
  }
  for (const step of act.steps) {
    if (step.kind === "chord" || step.kind === "repeat") {
      if (!step.keys || step.keys.length === 0) {
        throw new Error(`Empty keys in action ${JSON.stringify(act.name)}`);
      }
      for (const k of step.keys) {
        if (!(k in VK_MAP)) {
          throw new Error(`Unknown key ${JSON.stringify(k)} in action ${JSON.stringify(act.name)}`);
        }
      }
      if (step.kind === "repeat" && !(step.count > 0)) {
        throw new Error(`Repeat count must be > 0 in action ${JSON.stringify(act.name)}`);
      }
    } else if (step.kind === "text") {
      if (!step.text) throw new Error(`Empty text step in action ${JSON.stringify(act.name)}`);
    } else {
      throw new Error(`Invalid step kind ${step.kind}`);
    }
  }
}

let sendApi = null;

export function getSendInputStructSize() {
  initSendApi();
  return sendApi ? koffi.sizeof(sendApi.INPUT) : 0;
}

function initSendApi() {
  if (sendApi || process.platform !== "win32") return sendApi;

  const user32 = koffi.load("user32.dll");
  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "int32",
    dy: "int32",
    mouseData: "uint32",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr_t",
  });
  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16",
    wScan: "uint16",
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
  const INPUT = koffi.struct("INPUT", {
    type: "uint32",
    u: INPUT_UNION,
  });

  sendApi = {
    INPUT,
    INPUT_SIZE: koffi.sizeof(INPUT),
    SendInput: user32.func("uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)"),
    MapVirtualKeyW: user32.func("uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)"),
  };
  return sendApi;
}

const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const MAPVK_VK_TO_VSC = 0;

function makeVkInput(api, vk, keyUp = false) {
  let flags = keyUp ? KEYEVENTF_KEYUP : 0;
  if (EXTENDED_VKS.has(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
  const scan = api.MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
  return {
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
  };
}

function makeUnicodeInput(codeUnit, keyUp = false) {
  const flags = KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0);
  return {
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: 0, wScan: codeUnit, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
  };
}

export function defaultSendInputs(inputs) {
  if (!inputs || inputs.length === 0 || process.platform !== "win32") return 0;
  const api = initSendApi();
  const sent = api.SendInput(inputs.length, inputs, api.INPUT_SIZE);
  if (sent !== inputs.length) {
    throw new Error(`SendInput sent ${sent}/${inputs.length} events`);
  }
  return sent;
}

function buildChordEvents(api, keys) {
  const mods = keys.filter((k) => MODIFIER_KEYS.has(k)).map((k) => VK_MAP[k]);
  const primaries = keys.filter((k) => !MODIFIER_KEYS.has(k)).map((k) => VK_MAP[k]);
  const events = [];
  for (const m of mods) events.push(makeVkInput(api, m, false));
  for (const p of primaries) {
    events.push(makeVkInput(api, p, false));
    events.push(makeVkInput(api, p, true));
  }
  for (const m of [...mods].reverse()) events.push(makeVkInput(api, m, true));
  return events;
}

function buildUnicodeEvents(str) {
  const buf = Buffer.from(str, "utf16le");
  const events = [];
  for (let i = 0; i < buf.length; i += 2) {
    const unit = buf.readUInt16LE(i);
    events.push(makeUnicodeInput(unit, false));
    events.push(makeUnicodeInput(unit, true));
  }
  return events;
}

export function releaseAllModifiers(sendFn = defaultSendInputs) {
  if (process.platform !== "win32") return;
  const api = initSendApi();
  const events = ["ctrl", "shift", "alt"].map((m) => makeVkInput(api, VK_MAP[m], true));
  sendFn(events);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeAction(
  action,
  expectedTarget,
  {
    dryRun = false,
    stepDelayMs = 15,
    getFgInfo = getForegroundWindowInfo,
    sendFn = defaultSendInputs,
    releaseFn = releaseAllModifiers,
  } = {}
) {
  if (expectedTarget !== TargetApp.EXCEL && expectedTarget !== TargetApp.VIM) {
    return false;
  }

  validateAction(action);
  if (dryRun) return true;

  const api = initSendApi();
  for (let idx = 0; idx < action.steps.length; idx++) {
    const fg = getFgInfo();
    if (fg.target !== expectedTarget) {
      releaseFn(sendFn);
      return false;
    }

    const step = action.steps[idx];
    if (step.kind === "chord") {
      sendFn(buildChordEvents(api, step.keys));
    } else if (step.kind === "text") {
      sendFn(buildUnicodeEvents(step.text));
    } else if (step.kind === "repeat") {
      for (let r = 0; r < step.count; r++) {
        if (r > 0 && r % 4 === 0) {
          if (getFgInfo().target !== expectedTarget) {
            releaseFn(sendFn);
            return false;
          }
        }
        sendFn(buildChordEvents(api, step.keys));
      }
    }

    if (idx + 1 < action.steps.length && stepDelayMs > 0) {
      await sleepMs(stepDelayMs);
    }
  }

  return true;
}
