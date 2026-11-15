/**
 * Minimal BLE Scanner & Byte Interpreter for the ESP32-S3 X-Plorer Bridge.
 * Supports GATT notifications (--transport gatt) and connectionless beacons (--transport beacon).
 */

import { parseArgs } from "node:util";
import { DEMO_SEQUENCES, findDemoSequenceIndex } from "./demoSequence.js";
import { releaseAllModifiers, sendClick, sendCombo, sendKey, sendText } from "./keyInjector.js";
import { isEditingExcelCell } from "./excelState.js";
import {
  BIT_BACK,
  BIT_BLUE,
  BIT_DPAD_LEFT,
  BIT_DPAD_RIGHT,
  BIT_GREEN,
  BIT_GUIDE,
  BIT_ORANGE,
  BIT_RED,
  BIT_START,
  BIT_STRUM_DOWN,
  BIT_STRUM_UP,
  BIT_YELLOW,
  DEVICE_NAME,
  FRET_MASK,
  SERVICE_UUID,
  STATE_CHAR_UUID,
  TILT_MASK,
  WHAMMY_MASK,
  decodeBeaconMfgData,
  decodePacket,
  formatBitmask,
  getWhammyLevel,
} from "./protocol.js";

function log(level, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`${ts} [${level}] ${msg}`);
}

function formatHexBytes(buf) {
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

export class MinimalBleClient {
  constructor({ transport = "gatt", changesOnly = false, dryRun = false, demo = false, demoSeq = 0 } = {}) {
    this.transport = transport;
    this.changesOnly = changesOnly;
    this.dryRun = dryRun;
    this.demo = demo;
    this._demoSeqIndex = typeof demoSeq === "number" ? demoSeq : findDemoSequenceIndex(demoSeq);
    this._demoIndex = 0;
    this._demoBusy = false;
    this._lastBeaconSeq = -1;
    this._lastMask = null;
    this._lastUsb = null;
    this._stopped = false;
  }

  get activeDemoSequence() {
    return DEMO_SEQUENCES[this._demoSeqIndex];
  }

  toggleDemo() {
    this.demo = !this.demo;
    if (this.demo) {
      const seq = this.activeDemoSequence;
      log(
        "DEMO",
        `Demo mode ON -> [${this._demoSeqIndex + 1}/${DEMO_SEQUENCES.length}] ${seq.name} (step ${this._demoIndex + 1}/${seq.steps.length})`
      );
    } else {
      log("DEMO", "Demo mode OFF -> normal controller mappings active");
    }
    return this.demo;
  }

  nextDemoSequence() {
    this._demoSeqIndex = (this._demoSeqIndex + 1) % DEMO_SEQUENCES.length;
    this._demoIndex = 0;
    const seq = this.activeDemoSequence;
    log(
      "DEMO",
      `Switched sequence -> [${this._demoSeqIndex + 1}/${DEMO_SEQUENCES.length}] ${seq.name} (${seq.steps.length} steps)`
    );
    return seq;
  }

  resetDemo() {
    this._demoIndex = 0;
    const seq = this.activeDemoSequence;
    log("DEMO", `Reset sequence [${seq.name}] to step 1/${seq.steps.length}`);
  }

  stop() {
    this._stopped = true;
    releaseAllModifiers();
  }

  /**
   * Expand your bitmask -> key injection mappings here.
   * 
   
   
   * 
   * 
   */
  handleBitmask(bitmask, prevMask = 0) {
    if (bitmask === 0) return;

    const baseMask = bitmask & ~WHAMMY_MASK;
    const prevBase = (prevMask ?? 0) & ~WHAMMY_MASK;
    const newPressEdge = baseMask !== 0 && (baseMask & ~prevBase) !== 0;

    // Live demo controls from the guitar (work in both normal and demo mode)
    if (newPressEdge && baseMask === (BIT_GUIDE | BIT_START)) {
      this.toggleDemo();
      return;
    }
    if (newPressEdge && baseMask === (BIT_GUIDE | BIT_BACK)) {
      this.nextDemoSequence();
      return;
    }

    if (this.demo) {
      if (!newPressEdge || this._demoBusy) return;

      const seq = this.activeDemoSequence;
      if (this._demoIndex >= seq.steps.length) {
        log("DEMO", `[${seq.id}] Complete! Press 'r' + Enter to reset or GUIDE+BACK for next sequence.`);
        return;
      }

      const step = seq.steps[this._demoIndex];
      log("DEMO", `[${seq.id} ${this._demoIndex + 1}/${seq.steps.length}] ${step.label}`);
      if (seq.noLoop) {
        this._demoIndex += 1;
      } else {
        this._demoIndex = (this._demoIndex + 1) % seq.steps.length;
      }
      if (!this.dryRun) this._demoBusy = true;
      Promise.resolve(step.run(this.dryRun))
        .catch((err) => log("WARN", `Demo step failed: ${err.message}`))
        .finally(() => {
          this._demoBusy = false;
        });
      return;
    }

    // Whammy held (W2..W7): 5-bit binary fret chord (1..26) + strum -> a..z / A..Z
    const whammy = getWhammyLevel(bitmask);
    if (whammy >= 2) {
      const frets = bitmask & FRET_MASK;
      const strumDownEdge = Boolean((bitmask & BIT_STRUM_DOWN) && !(prevMask & BIT_STRUM_DOWN));
      const strumUpEdge = Boolean((bitmask & BIT_STRUM_UP) && !(prevMask & BIT_STRUM_UP));

      if (frets >= 1 && frets <= 26) {
        if (strumDownEdge) {
          sendText(String.fromCharCode(96 + frets), { dryRun: this.dryRun });
        } else if (strumUpEdge) {
          sendText(String.fromCharCode(64 + frets), { dryRun: this.dryRun });
        }
      }
      return;
    }

    // Normal neck/body combos (ignore W0/W1 resting whammy jitter)
    if (baseMask === 0 || baseMask === prevBase) return;

    if (baseMask === (BIT_ORANGE | BIT_STRUM_DOWN)) sendKey("space", { dryRun: this.dryRun });
    else if (baseMask === (BIT_BLUE | BIT_ORANGE)) sendKey("tab", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GREEN | BIT_YELLOW | BIT_ORANGE)) sendKey("esc", { dryRun: this.dryRun });
    else if (baseMask === FRET_MASK) {
      sendCombo(["ctrl", "s"], { dryRun: this.dryRun });
      sendCombo(["ctrl", "w"], { dryRun: this.dryRun });
    }
    else if (baseMask === BIT_DPAD_LEFT) sendKey("left", { dryRun: this.dryRun });
    else if (baseMask === BIT_DPAD_RIGHT) sendKey("right", { dryRun: this.dryRun });
    else if (baseMask === BIT_STRUM_UP) sendKey("up", { dryRun: this.dryRun });
    else if (baseMask === BIT_STRUM_DOWN) sendKey("down", { dryRun: this.dryRun });
    else if (baseMask === BIT_BACK) sendClick("left", { dryRun: this.dryRun });
    else if (baseMask === BIT_START) sendClick("right", { dryRun: this.dryRun });

    // Common Excel shortcuts & formulas (GUIDE + fret / strum)
    else if (baseMask === (BIT_GUIDE | BIT_GREEN)) sendKey("enter", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_RED)) sendKey("f2", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_YELLOW)) sendCombo(["ctrl", "z"], { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_BLUE)) sendCombo(["ctrl", "c"], { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_ORANGE)) sendCombo(["ctrl", "v"], { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_GREEN | BIT_STRUM_DOWN)) sendText("=SUM(", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_RED | BIT_STRUM_DOWN)) sendText("=AVERAGE(", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_YELLOW | BIT_STRUM_DOWN)) sendText("=COUNT(", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_BLUE | BIT_STRUM_DOWN)) sendText("=IF(", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_ORANGE | BIT_STRUM_DOWN)) sendText("=XLOOKUP(", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_STRUM_UP)) sendCombo(["alt", "="], { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_STRUM_DOWN)) sendCombo(["ctrl", ";"], { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_DPAD_LEFT)) sendKey("backspace", { dryRun: this.dryRun });
    else if (baseMask === (BIT_GUIDE | BIT_DPAD_RIGHT)) sendKey("delete", { dryRun: this.dryRun });
  }

  onPacket(pkt, rawBuf) {
    const bitmask = pkt.bitmask & ~TILT_MASK;
    const changed = bitmask !== this._lastMask || pkt.usbConnected !== this._lastUsb;
    if (this.changesOnly && !changed) {
      return;
    }

    const prevMask = this._lastMask;
    this._lastMask = bitmask;
    this._lastUsb = pkt.usbConnected;

    const maskHex = `0x${bitmask.toString(16).padStart(5, "0")}`;
    const buttons = formatBitmask(bitmask);
    const whammyLvl = getWhammyLevel(bitmask);

    log(
      "DATA",
      `seq=${pkt.seq} usb=${pkt.usbConnected ? 1 : 0} mask=${maskHex} (${buttons}) ` +
        `whammy=${pkt.whammyRaw}[W${whammyLvl}] | bytes=[${formatHexBytes(rawBuf)}]`
    );

    if (bitmask !== prevMask) {
      this.handleBitmask(bitmask, prevMask ?? 0);
    }
  }

  async run() {
    const { default: noble } = await import("@stoprocent/noble");

    return new Promise((resolve) => {
      noble.on("stateChange", async (state) => {
        if (state === "poweredOn") {
          if (this.transport === "beacon") {
            log("INFO", `Beacon mode: scanning for '${DEVICE_NAME}' manufacturer data...`);
            await noble.startScanningAsync([], true);
          } else {
            log("INFO", `GATT mode: scanning for '${DEVICE_NAME}' (service ${SERVICE_UUID})...`);
            await noble.startScanningAsync([SERVICE_UUID], false);
          }
        } else {
          log("WARN", `Bluetooth adapter state: ${state}`);
        }
      });

      noble.on("discover", async (peripheral) => {
        if (this._stopped) return;
        const adv = peripheral.advertisement || {};
        const name = adv.localName || "";
        const svcUuids = (adv.serviceUuids || []).map((u) => u.toLowerCase());
        const isMatch = name === DEVICE_NAME || svcUuids.includes(SERVICE_UUID);

        if (this.transport === "beacon") {
          if (!adv.manufacturerData) return;
          let pkt;
          try {
            pkt = decodeBeaconMfgData(adv.manufacturerData);
          } catch {
            return;
          }
          if (pkt.seq === this._lastBeaconSeq) return;
          this._lastBeaconSeq = pkt.seq;
          this.onPacket(pkt, adv.manufacturerData);
          return;
        }

        if (!isMatch) return;

        try {
          await noble.stopScanningAsync();
          log("INFO", `Found '${name || peripheral.id}', connecting...`);
          await peripheral.connectAsync();
          log("INFO", "Connected! Discovering state characteristic...");

          const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [SERVICE_UUID],
            [STATE_CHAR_UUID]
          );
          const stateChar = characteristics.find((c) => c.uuid.toLowerCase() === STATE_CHAR_UUID);
          if (!stateChar) {
            throw new Error(`Characteristic ${STATE_CHAR_UUID} not found`);
          }

          stateChar.on("data", (data) => {
            let pkt;
            try {
              pkt = decodePacket(data);
            } catch (err) {
              log("WARN", `Malformed packet [${formatHexBytes(data)}]: ${err.message}`);
              return;
            }
            this.onPacket(pkt, data);
          });

          await stateChar.subscribeAsync();
          log("INFO", "Subscribed to controller state notifications.");

          peripheral.once("disconnect", async () => {
            log("WARN", "Disconnected; rescanning...");
            releaseAllModifiers();
            if (!this._stopped) {
              await noble.startScanningAsync([SERVICE_UUID], false);
            } else {
              resolve();
            }
          });
        } catch (err) {
          log("WARN", `BLE error: ${err.message}`);
          if (!this._stopped) {
            setTimeout(() => noble.startScanningAsync([SERVICE_UUID], false).catch(() => {}), 1500);
          }
        }
      });
    });
  }
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      transport: { type: "string", default: "gatt" },
      "changes-only": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      demo: { type: "boolean", default: false },
      "demo-seq": { type: "string", default: "battle" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  return values;
}

function printHelp() {
  const seqList = DEMO_SEQUENCES.map((s, i) => `${i + 1}:${s.id}`).join(", ");
  console.log(`Minimal X-Plorer BLE Scanner, Byte Interpreter & Key Injector

Options:
  --transport <gatt|beacon>  BLE transport: connected GATT (default) or connectionless beacon
  --changes-only             Only log packets when bitmask or USB connection state changes
  --dry-run                  Decode packets without calling Win32 SendInput
  --demo                     Start in demo mode (any button/strum advances the Excel sequence)
  --demo-seq <name|index>    Demo sequence to load (${seqList})
  -h, --help                 Show this help

Live Demo Controls (available even when launched without --demo):
  Guitar:   GUIDE + START = toggle demo mode ON/OFF | GUIDE + BACK = cycle sequence
  Terminal: d + Enter = toggle demo | n + Enter = next sequence | r + Enter = reset step`);
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    printHelp();
    return 0;
  }

  const client = new MinimalBleClient({
    transport: args.transport,
    changesOnly: args["changes-only"],
    dryRun: args["dry-run"],
    demo: args.demo,
    demoSeq: args["demo-seq"],
  });

  if (args.demo) {
    const seq = client.activeDemoSequence;
    log("INFO", `Demo mode ON: ${seq.name} (${seq.steps.length} steps). GUIDE+START toggles OFF, GUIDE+BACK switches sequence.`);
  } else {
    log("INFO", "Normal mode. Press GUIDE+START on guitar (or 'd' + Enter here) anytime to toggle Demo mode.");
  }

  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      const cmd = chunk.trim().toLowerCase();
      if (cmd === "d") client.toggleDemo();
      else if (cmd === "n") client.nextDemoSequence();
      else if (cmd === "r") client.resetDemo();
    });
  }

  process.on("SIGINT", () => {
    client.stop();
    process.exit(0);
  });

  await client.run();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("server.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
