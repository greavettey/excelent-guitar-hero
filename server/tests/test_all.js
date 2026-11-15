import test from "node:test";
import assert from "node:assert/strict";
import {
  BIT_BACK,
  BIT_GREEN,
  BIT_GUIDE,
  BIT_START,
  BIT_STRUM_DOWN,
  LED_EXCEL,
  PKT_SIZE,
  decodeBeaconMfgData,
  decodePacket,
  encodeBeaconMfgData,
  encodePacket,
  formatBitmask,
  getTiltLevel,
  getWhammyLevel,
  tiltBits,
  whammyBits,
} from "../src/protocol.js";
import { moveMouse, resolveVk, sendClick, sendCombo, sendKey, sendText } from "../src/keyInjector.js";
import {
  classifyExcelFocus,
  getForegroundExcelInfo,
  isEditingExcelCell,
  isExcelFocused,
  normalizeCellRef,
} from "../src/excelState.js";
import { MinimalBleClient, parseCliArgs } from "../src/server.js";
import { DEMO_SEQUENCES, findDemoSequenceIndex } from "../src/demoSequence.js";

test("encodePacket and decodePacket round-trip 12-byte BLE frame", () => {
  const mask = BIT_GREEN | BIT_STRUM_DOWN | whammyBits(5) | tiltBits(2);
  const buf = encodePacket({
    bitmask: mask,
    seq: 42,
    usbConnected: true,
    ledMode: LED_EXCEL,
    whammyRaw: 12345,
    tiltPct: 85,
  });

  assert.equal(buf.length, PKT_SIZE);
  const pkt = decodePacket(buf);
  assert.equal(pkt.seq, 42);
  assert.equal(pkt.usbConnected, true);
  assert.equal(pkt.bitmask, mask);
  assert.equal(pkt.whammyRaw, 12345);
  assert.equal(pkt.tiltPct, 85);
  assert.equal(getWhammyLevel(pkt.bitmask), 5);
  assert.equal(getTiltLevel(pkt.bitmask), 2);
  assert.equal(formatBitmask(pkt.bitmask), "G+SD+W5+T2");
});

test("decodePacket rejects corrupted CRC", () => {
  const buf = encodePacket({ bitmask: BIT_GREEN, seq: 1 });
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => decodePacket(buf), /CRC mismatch/);
});

test("encodeBeaconMfgData and decodeBeaconMfgData round-trip", () => {
  const mfg = encodeBeaconMfgData({ bitmask: BIT_GREEN, seq: 7, usbConnected: false });
  const pkt = decodeBeaconMfgData(mfg);
  assert.equal(pkt.seq, 7);
  assert.equal(pkt.usbConnected, false);
  assert.equal(pkt.bitmask, BIT_GREEN);
});

test("keyInjector resolves keys and supports dry-run sendKey/sendCombo/sendText", () => {
  assert.equal(resolveVk("a"), 65);
  assert.equal(resolveVk("enter"), 0x0d);
  assert.throws(() => resolveVk("not_a_real_key"), /Unknown key/);

  assert.equal(sendKey("a", { dryRun: true }), true);
  assert.equal(sendCombo(["ctrl", "c"], { dryRun: true }), true);
  assert.equal(sendText("hello", { dryRun: true }), true);
  assert.equal(moveMouse(100, 200, { dryRun: true }), true);
  assert.equal(sendClick("left", { dryRun: true }), true);
  assert.equal(sendClick("right", { x: 100, y: 200, count: 2, dryRun: true }), true);
  assert.throws(() => sendClick("invalid_btn", { dryRun: true }), /Unknown mouse button/);
  assert.throws(() => moveMouse("abc", 10, { dryRun: true }), /Invalid mouse coordinates/);
});

test("excelState classifies XLMAIN / EXCEL6 / EXCEL7 / EXCEL< focus states", () => {
  const editing = classifyExcelFocus("XLMAIN", "EXCEL6", "Book1 - Excel");
  assert.equal(editing.isExcel, true);
  assert.equal(editing.isEditingCell, true);
  assert.equal(editing.isEditing, true);
  assert.equal(editing.isGrid, false);

  const formula = classifyExcelFocus("XLMAIN", "EXCEL<", "Book1 - Excel");
  assert.equal(formula.isExcel, true);
  assert.equal(formula.isFormulaBar, true);
  assert.equal(formula.isEditing, true);

  const grid = classifyExcelFocus("XLMAIN", "EXCEL7", "Book1 - Excel");
  assert.equal(grid.isExcel, true);
  assert.equal(grid.isGrid, true);
  assert.equal(grid.isEditing, false);

  const other = classifyExcelFocus("Notepad", "Edit", "Untitled - Notepad");
  assert.equal(other.isExcel, false);
  assert.equal(other.isEditing, false);

  assert.equal(normalizeCellRef(" $b$12 "), "B12");
});

test("excelState live Win32 foreground query runs cleanly", () => {
  const info = getForegroundExcelInfo();
  assert.equal(typeof info.isExcel, "boolean");
  assert.equal(typeof info.isEditing, "boolean");
  assert.equal(typeof isExcelFocused(), "boolean");
  assert.equal(typeof isEditingExcelCell(), "boolean");
});

test("MinimalBleClient handles whammy alphabet and normal combos in dry-run mode", () => {
  const client = new MinimalBleClient({ dryRun: true });
  // Whammy W2 + Green (1) + Strum Down -> 'a'
  client.handleBitmask(whammyBits(2) | BIT_GREEN | BIT_STRUM_DOWN, whammyBits(2) | BIT_GREEN);
  // Whammy W0 + FRET_MASK -> normal combo
  client.handleBitmask(0x1f, 0);
  // GUIDE + Green + Strum Down -> '=SUM('
  client.handleBitmask(BIT_GUIDE | BIT_GREEN | BIT_STRUM_DOWN, 0);
  // GUIDE + Strum Up -> Alt+= (AutoSum)
  client.handleBitmask(BIT_GUIDE | 0x20, 0);
});

test("MinimalBleClient --demo mode toggles, cycles sequences, and wraps cleanly", () => {
  assert.equal(parseCliArgs(["--demo"]).demo, true);
  assert.equal(parseCliArgs([]).demo, false);
  assert.equal(parseCliArgs(["--demo-seq", "boss"])["demo-seq"], "boss");
  assert.equal(findDemoSequenceIndex("boss"), 1);
  assert.equal(findDemoSequenceIndex("image"), 3);
  assert.equal(findDemoSequenceIndex("4"), 3);

  // Start in normal mode, toggle demo ON with GUIDE + START
  const client = new MinimalBleClient({ dryRun: true, demo: false });
  assert.equal(client.demo, false);
  client.handleBitmask(BIT_GUIDE | BIT_START, 0);
  assert.equal(client.demo, true);
  assert.equal(client._demoSeqIndex, 0);

  // Release edge (G+SD -> G) should NOT advance
  client.handleBitmask(BIT_GREEN, BIT_GREEN | BIT_STRUM_DOWN);
  assert.equal(client._demoIndex, 0);

  // Run through every step of every sequence and verify wrap-around / noLoop + GUIDE+BACK cycling
  for (let s = 0; s < DEMO_SEQUENCES.length; s++) {
    const seq = client.activeDemoSequence;
    for (let i = 0; i < seq.steps.length; i++) {
      const mask = i % 2 === 0 ? BIT_GREEN : BIT_STRUM_DOWN;
      client.handleBitmask(mask, 0);
    }
    if (seq.noLoop) {
      assert.equal(client._demoIndex, seq.steps.length);
      // Extra strums should not refill/restart when noLoop is true
      client.handleBitmask(BIT_GREEN, 0);
      assert.equal(client._demoIndex, seq.steps.length);
    } else {
      assert.equal(client._demoIndex, 0);
    }
    client.handleBitmask(BIT_GUIDE | BIT_BACK, 0);
  }
  assert.equal(client._demoSeqIndex, 0);

  // Toggle demo OFF with GUIDE + START
  client.handleBitmask(BIT_GUIDE | BIT_START, 0);
  assert.equal(client.demo, false);
});
