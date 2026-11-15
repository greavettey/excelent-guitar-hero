/**
 * Node.js PC Bluetooth Server for Guitar Hero X-Plorer -> Excel & Vim Only.
 * Supports GATT notifications (--transport gatt) and connectionless AirTag sniffing (--transport beacon).
 */

import readline from "node:readline";
import { parseArgs } from "node:util";
import { ChaosEngine } from "./chaosEngine.js";
import { executeAction, releaseAllModifiers } from "./keyInjector.js";
import { ChordProcessor, exportAllMappings, resolveAction } from "./mapper.js";
import {
  DEVICE_NAME,
  LED_BLOCKED,
  LED_CHAR_UUID,
  LED_EXCEL,
  LED_VIM,
  SERVICE_UUID,
  STATE_CHAR_UUID,
  TOTAL_NONZERO_STATES,
  decodeBeaconMfgData,
  decodePacket,
  formatBitmask,
} from "./protocol.js";
import { TargetApp, getForegroundWindowInfo } from "./windowGuard.js";

function log(level, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`${ts} [${level}] ${msg}`);
}

export class XPlorerNodeServer {
  constructor({
    transport = "gatt",
    mode = "chord",
    chaos = true,
    bpm = 120,
    rhythmToleranceMs = 135,
    dryRun = false,
    verbose = false,
  } = {}) {
    this.transport = transport;
    this.dryRun = dryRun;
    this.verbose = verbose;
    this.processor = new ChordProcessor({ mode });
    this.chaos = new ChaosEngine({
      enabled: chaos,
      bpm,
      rhythmToleranceMs,
      startTimeMs: Date.now(),
    });
    this._lastLedSent = null;
    this._lastBeaconSeq = -1;
    this._stopped = false;
  }

  stop() {
    this._stopped = true;
    releaseAllModifiers();
  }

  async _dispatchMask(bitmask, nowMs) {
    const fg = getForegroundWindowInfo();
    const rawAction = resolveAction(bitmask, fg.target);
    const decision = this.chaos.evaluate(bitmask, fg.target, rawAction, nowMs);

    for (const msg of decision.logs) {
      log(decision.outcome === "blocked_app" || decision.outcome === "locked_out" ? "WARN" : "CHAOS", msg);
    }
    if (decision.highwayDisplay) {
      console.log(decision.highwayDisplay);
    }

    if (fg.target === TargetApp.NONE) {
      if (this.verbose || decision.logs.length === 0) {
        log(
          "BLOCK",
          `Blocked mask=0x${bitmask.toString(16).padStart(5, "0")} (${formatBitmask(bitmask)}): active '${
            fg.processName || "<none>"
          }' is not Excel or Vim`
        );
      }
      return;
    }

    if (!decision.actionToSend) return;

    const sent = await executeAction(decision.actionToSend, fg.target, { dryRun: this.dryRun });
    const status = this.dryRun ? "DRY-RUN" : sent ? "SENT" : "ABORTED (focus changed)";
    log(
      fg.target.toUpperCase(),
      `${formatBitmask(bitmask)} (0x${bitmask.toString(16).padStart(5, "0")}) -> ${
        decision.actionToSend.name
      } [${status}]`
    );
  }

  async _handleIncomingPacket(pkt, nowMs) {
    const fg = getForegroundWindowInfo();
    const whammyAct = this.chaos.processWhammyVibrato(pkt.bitmask, fg.target, nowMs);
    if (whammyAct) {
      const sent = await executeAction(whammyAct, fg.target, { dryRun: this.dryRun });
      if (sent) {
        log(fg.target.toUpperCase(), `${whammyAct.name} [${this.dryRun ? "DRY-RUN" : "SENT"}]`);
      }
    }

    for (const mask of this.processor.feed(pkt.bitmask, nowMs)) {
      await this._dispatchMask(mask, nowMs);
    }
  }

  async _syncLed(ledChar) {
    if (!ledChar) return;
    const fg = getForegroundWindowInfo();
    const desired =
      fg.target === TargetApp.EXCEL ? LED_EXCEL : fg.target === TargetApp.VIM ? LED_VIM : LED_BLOCKED;
    if (desired !== this._lastLedSent) {
      try {
        await ledChar.writeAsync(Buffer.from([desired]), true);
        this._lastLedSent = desired;
      } catch {
        // Ignore transient write errors
      }
    }
  }

  async runBle() {
    const { default: noble } = await import("@stoprocent/noble");
    let ledChar = null;
    let tickTimer = null;
    let beatTimer = null;

    const startTimers = () => {
      if (tickTimer) return;
      tickTimer = setInterval(async () => {
        if (this._stopped) return;
        const now = Date.now();
        for (const mask of this.processor.tick(now)) {
          await this._dispatchMask(mask, now);
        }
        await this._syncLed(ledChar);
      }, 10);

      if (this.chaos.enabled && this.verbose) {
        beatTimer = setInterval(() => {
          if (!this._stopped) process.stdout.write("♪ ");
        }, this.chaos.beatPeriodMs);
      }
    };

    const cleanupTimers = () => {
      if (tickTimer) clearInterval(tickTimer);
      if (beatTimer) clearInterval(beatTimer);
      tickTimer = null;
      beatTimer = null;
    };

    return new Promise((resolve) => {
      noble.on("stateChange", async (state) => {
        if (state === "poweredOn") {
          if (this.transport === "beacon") {
            log("INFO", `AirTag Beacon mode: passively sniffing BLE advertisements from '${DEVICE_NAME}'...`);
            await noble.startScanningAsync([], true);
            startTimers();
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
          await this._handleIncomingPacket(pkt, Date.now());
          return;
        }

        if (!isMatch) return;

        try {
          await noble.stopScanningAsync();
          log("INFO", `Found '${name || peripheral.id}', connecting via GATT...`);
          await peripheral.connectAsync();
          log("INFO", "Connected to ESP32-S3 X-Plorer BLE bridge!");

          const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [SERVICE_UUID],
            [STATE_CHAR_UUID, LED_CHAR_UUID]
          );
          const stateChar = characteristics.find((c) => c.uuid.toLowerCase() === STATE_CHAR_UUID);
          ledChar = characteristics.find((c) => c.uuid.toLowerCase() === LED_CHAR_UUID) || null;
          if (!stateChar) {
            throw new Error("State characteristic not found on ESP32");
          }

          stateChar.on("data", async (data) => {
            try {
              const pkt = decodePacket(data);
              await this._handleIncomingPacket(pkt, Date.now());
            } catch (err) {
              log("WARN", `Dropped malformed BLE packet: ${err.message}`);
            }
          });

          await stateChar.subscribeAsync();
          startTimers();

          peripheral.once("disconnect", async () => {
            log("WARN", "ESP32 disconnected; releasing modifiers and rescanning...");
            ledChar = null;
            this._lastLedSent = null;
            releaseAllModifiers();
            cleanupTimers();
            if (!this._stopped) {
              await noble.startScanningAsync([SERVICE_UUID], false);
            } else {
              resolve();
            }
          });
        } catch (err) {
          log("WARN", `BLE connection error: ${err.message}`);
          ledChar = null;
          cleanupTimers();
          if (!this._stopped) {
            setTimeout(() => noble.startScanningAsync([SERVICE_UUID], false).catch(() => {}), 1500);
          }
        }
      });
    });
  }

  async runSimulate() {
    log(
      "INFO",
      `Simulation mode active (${TOTAL_NONZERO_STATES} valid permutations, chaos=${this.chaos.enabled}, bpm=${this.chaos.bpm}).`
    );
    log("INFO", "Focus Excel or Vim (or another app to trigger Rock Meter shame), enter hex bitmask (e.g. 0x00041) or 'q':");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "bitmask> " });
    rl.prompt();
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line || ["q", "quit", "exit"].includes(line.toLowerCase())) break;
      const mask = Number(line);
      if (!Number.isInteger(mask) || mask < 0) {
        console.log("Invalid bitmask. Try e.g. 0x00041");
      } else {
        await this._dispatchMask(mask, Date.now());
      }
      rl.prompt();
    }
    rl.close();
  }
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      transport: { type: "string", default: "gatt" },
      mode: { type: "string", default: "chord" },
      vanilla: { type: "boolean", default: false },
      bpm: { type: "string", default: "120" },
      "rhythm-window": { type: "string", default: "135" },
      "dry-run": { type: "boolean", default: false },
      simulate: { type: "boolean", default: false },
      "export-map": { type: "string" },
      "export-format": { type: "string", default: "csv" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  return values;
}

function printHelp() {
  console.log(`Guitar Hero X-Plorer Node.js -> Excel/Vim-Only Keyboard Server

Options:
  --transport <gatt|beacon>  BLE transport: connected GATT (default) or connectionless AirTag beacon sniffing
  --mode <chord|raw>         Trigger mode: 'chord' (40ms settle + strum + repeat) or 'raw'
  --vanilla                  Disable rhythm/tilt/riff/rock-meter chaos mechanics
  --bpm <number>             Metronome tempo in BPM (default: 120)
  --rhythm-window <ms>       Beat hit tolerance in ms (default: 135)
  --dry-run                  Resolve and gate against Excel/Vim without calling SendInput
  --simulate                 Interactive hex bitmask simulator without Bluetooth hardware
  --export-map <path>        Export all 55,295 bitmask mappings (csv/json) and exit
  --export-format <csv|json> Format for --export-map (default: csv)
  --verbose                  Show metronome beats & debug logs
  -h, --help                 Show this help`);
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    printHelp();
    return 0;
  }

  if (args["export-map"]) {
    const count = exportAllMappings(args["export-map"], args["export-format"]);
    log("INFO", `Exported ${count} bitmask mappings to ${args["export-map"]} (${args["export-format"]})`);
    return 0;
  }

  const server = new XPlorerNodeServer({
    transport: args.transport,
    mode: args.mode,
    chaos: !args.vanilla,
    bpm: Number(args.bpm),
    rhythmToleranceMs: Number(args["rhythm-window"]),
    dryRun: args["dry-run"],
    verbose: args.verbose,
  });

  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });

  if (args.simulate) {
    await server.runSimulate();
    return 0;
  }

  await server.runBle();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("server.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
