import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ChaosEngine, decodeBaudotMask } from "../src/chaosEngine.js";
import {
  actionText,
  canonicalSignature,
  chord,
  executeAction,
  getSendInputStructSize,
  text,
  validateAction,
} from "../src/keyInjector.js";
import { ChordProcessor, exportAllMappings, resolveAction } from "../src/mapper.js";
import { resolveExcelAction } from "../src/mappingsExcel.js";
import { resolveVimAction } from "../src/mappingsVim.js";
import {
  BIT_BACK,
  BIT_BLUE,
  BIT_GREEN,
  BIT_GUIDE,
  BIT_ORANGE,
  BIT_RED,
  BIT_START,
  BIT_STRUM_DOWN,
  BIT_YELLOW,
  TOTAL_NONZERO_STATES,
  TOTAL_VALID_STATES,
  decodeBeaconMfgData,
  decodePacket,
  encodeBeaconMfgData,
  encodePacket,
  formatBitmask,
  iterAllValidBitmasks,
  rankBitmask,
  tiltBits,
  unrankBitmask,
  whammyBits,
} from "../src/protocol.js";
import { TargetApp, classifyWindow } from "../src/windowGuard.js";

test("protocol GATT packet and AirTag beacon round-trip + CRC check", () => {
  const mask = BIT_GREEN | BIT_YELLOW | BIT_STRUM_DOWN | whammyBits(5) | tiltBits(2);
  const raw = encodePacket({ bitmask: mask, seq: 42, usbConnected: true, whammyRaw: 18000, tiltPct: 85 });
  assert.equal(raw.length, 12);
  const pkt = decodePacket(raw);
  assert.equal(pkt.bitmask, mask);
  assert.equal(pkt.seq, 42);
  assert.equal(pkt.usbConnected, true);
  assert.equal(pkt.whammyRaw, 18000);
  assert.equal(pkt.tiltPct, 85);

  const beacon = encodeBeaconMfgData({ bitmask: mask, seq: 77 });
  assert.equal(beacon.length, 14);
  const decodedBeacon = decodeBeaconMfgData(beacon);
  assert.equal(decodedBeacon.bitmask, mask);
  assert.equal(decodedBeacon.seq, 77);

  const corrupted = Buffer.from(raw);
  corrupted[11] ^= 0xff;
  assert.throws(() => decodePacket(corrupted));
});

test("bijective rank/unrank covers all 55,296 states (>10k)", () => {
  assert.ok(TOTAL_NONZERO_STATES > 10000);
  assert.equal(TOTAL_VALID_STATES, 55296);
  const seen = new Set();
  for (let r = 0; r < TOTAL_VALID_STATES; r++) {
    const m = unrankBitmask(r);
    assert.equal(rankBitmask(m), r);
    seen.add(m);
  }
  assert.equal(seen.size, TOTAL_VALID_STATES);
});

test("all 55,295 Excel and 55,295 Vim permutations are unique and valid", () => {
  const excelSigs = new Set();
  const vimSigs = new Set();
  let count = 0;

  for (const mask of iterAllValidBitmasks()) {
    count++;
    const exAct = resolveExcelAction(mask);
    const vimAct = resolveVimAction(mask);
    assert.ok(exAct, `Missing Excel action for 0x${mask.toString(16)}`);
    assert.ok(vimAct, `Missing Vim action for 0x${mask.toString(16)}`);
    validateAction(exAct);
    validateAction(vimAct);
    excelSigs.add(canonicalSignature(exAct));
    vimSigs.add(canonicalSignature(vimAct));
  }

  assert.equal(count, TOTAL_NONZERO_STATES);
  assert.equal(excelSigs.size, TOTAL_NONZERO_STATES);
  assert.equal(vimSigs.size, TOTAL_NONZERO_STATES);
  assert.equal(formatBitmask(BIT_GREEN | BIT_ORANGE | BIT_STRUM_DOWN | whammyBits(3)), "G+O+SD+W3");
});

test("windowGuard strictly allows Excel and Vim only", () => {
  assert.equal(classifyWindow("EXCEL.EXE", "XLMAIN", "Book1 - Excel"), TargetApp.EXCEL);
  assert.equal(classifyWindow("gvim.exe", "Vim", "notes.txt - GVIM"), TargetApp.VIM);
  assert.equal(classifyWindow("WindowsTerminal.exe", "CASCADIA", "app.js - NVIM"), TargetApp.VIM);
  assert.equal(classifyWindow("conhost.exe", "ConsoleWindowClass", "cmd", true), TargetApp.VIM);

  assert.equal(classifyWindow("notepad.exe", "Notepad", "Book1 - Excel"), TargetApp.NONE);
  assert.equal(classifyWindow("chrome.exe", "Chrome", "NVIM - Google Chrome"), TargetApp.NONE);
  assert.equal(classifyWindow("Code.exe", "Chrome", "server.js - Visual Studio Code"), TargetApp.NONE);
  assert.equal(classifyWindow("WindowsTerminal.exe", "CASCADIA", "Windows PowerShell", true), TargetApp.NONE);
});

test("keyInjector Win32 INPUT struct size and mid-macro focus-loss abort", async () => {
  if (process.platform === "win32") {
    const expected = process.arch === "x64" ? 40 : 28;
    assert.equal(getSendInputStructSize(), expected);
  }

  const macro = { name: "TestMacro", steps: [chord("ctrl", "c"), text("abc")], category: "Test" };
  let sendCount = 0;
  let released = false;

  // Never sends when target is NONE
  const blockedOk = await executeAction(macro, TargetApp.NONE, {
    sendFn: () => {
      sendCount++;
    },
  });
  assert.equal(blockedOk, false);
  assert.equal(sendCount, 0);

  // Aborts step 2 if focus switches to Notepad
  let calls = 0;
  const fgMock = () => {
    calls++;
    return calls === 1
      ? { target: TargetApp.EXCEL, hwnd: 1, pid: 10, processName: "EXCEL.EXE", className: "XLMAIN", title: "Book1" }
      : { target: TargetApp.NONE, hwnd: 2, pid: 20, processName: "notepad.exe", className: "Notepad", title: "Untitled" };
  };

  const abortedOk = await executeAction(macro, TargetApp.EXCEL, {
    stepDelayMs: 0,
    getFgInfo: fgMock,
    sendFn: () => {
      sendCount++;
    },
    releaseFn: () => {
      released = true;
    },
  });
  assert.equal(abortedOk, false);
  assert.equal(sendCount, 1);
  assert.equal(released, true);
});

test("ChordProcessor handles chord settle, strum trigger, and raw mode", () => {
  const proc = new ChordProcessor({ mode: "chord", settleWindowMs: 40, repeatDelayMs: 350, repeatIntervalMs: 65 });
  assert.deepEqual(proc.feed(BIT_GREEN, 1000), []);
  assert.deepEqual(proc.feed(BIT_GREEN | BIT_RED, 1010), []);
  assert.deepEqual(proc.feed(BIT_GREEN | BIT_RED | BIT_STRUM_DOWN, 1020), [
    BIT_GREEN | BIT_RED | BIT_STRUM_DOWN,
  ]);
  assert.deepEqual(proc.feed(0, 1050), []);

  const rawProc = new ChordProcessor({ mode: "raw" });
  assert.deepEqual(rawProc.feed(BIT_GREEN, 1000), [BIT_GREEN]);
  assert.deepEqual(rawProc.feed(BIT_GREEN | BIT_RED, 1005), [BIT_GREEN | BIT_RED]);
});

test("ChaosEngine: 120 BPM streak multiplier & off-beat fumble penalty", () => {
  const chaos = new ChaosEngine({ enabled: true, bpm: 120, rhythmToleranceMs: 120, startTimeMs: 0 });
  const downAct = resolveAction(BIT_STRUM_DOWN, TargetApp.VIM);

  // Hit 5 notes exactly on beats (0, 500, 1000, 1500, 2000 ms) -> streak=5 -> 2x multiplier
  for (let i = 0; i < 5; i++) {
    const res = chaos.evaluate(BIT_STRUM_DOWN, TargetApp.VIM, downAct, i * 500);
    assert.equal(res.outcome, "execute");
    if (i === 4) {
      assert.equal(res.actionToSend.steps[0].text, "2j");
    }
  }

  // Hit off-beat at 2250 ms -> fumble penalty!
  const miss = chaos.evaluate(BIT_STRUM_DOWN, TargetApp.VIM, downAct, 2250);
  assert.equal(miss.outcome, "rhythm_miss");
  assert.equal(miss.actionToSend.steps[0].text, "u");
  assert.equal(chaos.streak, 0);
  assert.equal(chaos.multiplier, 1);
});

test("ChaosEngine: Star Power vertical tilt required for Save/Enter", () => {
  const chaos = new ChaosEngine({ enabled: true, bpm: 120, startTimeMs: 0 });
  const saveMask = BIT_START | BIT_BACK;
  const saveExcel = resolveAction(saveMask, TargetApp.EXCEL);

  const flatRes = chaos.evaluate(saveMask, TargetApp.EXCEL, saveExcel, 500);
  assert.equal(flatRes.outcome, "tilt_required");
  assert.equal(flatRes.actionToSend, null);

  const tiltedRes = chaos.evaluate(saveMask | tiltBits(2), TargetApp.EXCEL, saveExcel, 1000);
  assert.equal(tiltedRes.outcome, "execute");
  assert.equal(tiltedRes.actionToSend.name, "Save Workbook");
});

test("ChaosEngine: Note Highway riff gate unlocks macro and punishes wrong note", () => {
  const chaos = new ChaosEngine({ enabled: true, bpm: 120, startTimeMs: 0 });
  const goalSeekMask = BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE;
  const gated = resolveAction(goalSeekMask, TargetApp.EXCEL);
  // Goal Seek requiresRiff === true
  assert.equal(gated.requiresRiff, true);

  const startRes = chaos.evaluate(goalSeekMask, TargetApp.EXCEL, gated, 500);
  assert.equal(startRes.outcome, "riff_started");
  assert.ok(startRes.highwayDisplay.includes("HIT NOW"));

  // Play preset 0 riff: G, R, Y, B, O, G+R
  const notes = [BIT_GREEN, BIT_RED, BIT_YELLOW, BIT_BLUE, BIT_ORANGE, BIT_GREEN | BIT_RED];
  for (let i = 0; i < 5; i++) {
    const step = chaos.evaluate(notes[i] | BIT_STRUM_DOWN, TargetApp.EXCEL, actionText("ignored", "x"), 1000 + i * 500);
    assert.equal(step.outcome, "riff_progress");
  }
  const done = chaos.evaluate(notes[5] | BIT_STRUM_DOWN, TargetApp.EXCEL, actionText("ignored", "x"), 3500);
  assert.equal(done.outcome, "riff_unlocked");
  assert.equal(done.actionToSend.name, gated.name);

  // Wrong note triggers Esc fail penalty
  chaos.evaluate(goalSeekMask, TargetApp.EXCEL, gated, 4000);
  const fail = chaos.evaluate(BIT_ORANGE | BIT_STRUM_DOWN, TargetApp.EXCEL, actionText("ignored", "x"), 4500);
  assert.equal(fail.outcome, "riff_failed");
  assert.deepEqual(fail.actionToSend.steps[0].keys, ["esc"]);
});

test("ChaosEngine: Rock Meter shame lockout and 5-strum recovery solo", () => {
  const chaos = new ChaosEngine({ enabled: true, bpm: 120, startTimeMs: 0 });
  // 4 blocked strums drop Rock Meter 50 -> 35 -> 20 -> 5 -> 0 (lockout)
  for (let i = 0; i < 3; i++) {
    const res = chaos.evaluate(BIT_GREEN, TargetApp.NONE, null, i * 500);
    assert.equal(res.outcome, "blocked_app");
    assert.equal(chaos.lockedOut, false);
  }
  const lockRes = chaos.evaluate(BIT_GREEN, TargetApp.NONE, null, 1500);
  assert.equal(lockRes.outcome, "blocked_app");
  assert.equal(chaos.rockMeter, 0);
  assert.equal(chaos.lockedOut, true);

  // Even Excel is blocked until 5 recovery strums complete
  const act = resolveAction(BIT_STRUM_DOWN, TargetApp.EXCEL);
  for (let i = 0; i < 4; i++) {
    const rec = chaos.evaluate(BIT_STRUM_DOWN, TargetApp.EXCEL, act, 2000 + i * 500);
    assert.equal(rec.outcome, "locked_out");
    assert.equal(rec.actionToSend, null);
  }
  const encore = chaos.evaluate(BIT_STRUM_DOWN, TargetApp.EXCEL, act, 4000);
  assert.equal(encore.outcome, "recovered");
  assert.equal(chaos.lockedOut, false);
});

test("ChaosEngine: Whammy vibrato & 5-bit Baudot chording", () => {
  const chaos = new ChaosEngine({ enabled: true, bpm: 120, startTimeMs: 0 });
  // Rapid whammy wiggle: 0 -> 5 -> 1 -> 6 -> 1 -> 6
  const levels = [5, 1, 6, 1, 6];
  let triggered = null;
  levels.forEach((lvl, idx) => {
    const act = chaos.processWhammyVibrato(whammyBits(lvl), TargetApp.VIM, 100 + idx * 80);
    if (act) triggered = act;
  });
  assert.ok(triggered);
  assert.deepEqual(triggered.steps[0].keys, ["ctrl", "a"]);

  // Baudot 5-bit binary chord typing
  const aAct = decodeBaudotMask(BIT_GUIDE | BIT_GREEN | BIT_STRUM_DOWN); // 1 -> 'a'
  assert.equal(aAct.steps[0].text, "a");
  const capE = decodeBaudotMask(BIT_GUIDE | BIT_GREEN | BIT_YELLOW | BIT_STRUM_DOWN | tiltBits(1)); // 5 -> 'E'
  assert.equal(capE.steps[0].text, "E");
  const eq = decodeBaudotMask(BIT_GUIDE | 27 | BIT_STRUM_DOWN); // 27 -> '='
  assert.equal(eq.steps[0].text, "=");
});

test("exportAllMappings writes all 55,295 rows to CSV and JSON", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xplorer-node-"));
  try {
    const csvPath = path.join(tmpDir, "map.csv");
    const jsonPath = path.join(tmpDir, "map.json");
    assert.equal(exportAllMappings(csvPath, "csv"), TOTAL_NONZERO_STATES);
    assert.equal(exportAllMappings(jsonPath, "json"), TOTAL_NONZERO_STATES);

    const csvLines = fs.readFileSync(csvPath, "utf8").trimEnd().split("\n");
    assert.equal(csvLines.length, TOTAL_NONZERO_STATES + 1);

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(jsonData.length, TOTAL_NONZERO_STATES);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
