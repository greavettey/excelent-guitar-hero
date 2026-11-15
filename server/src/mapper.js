/**
 * Unified Excel/Vim resolver, chord-settling processor, and CSV/JSON exporter.
 */

import fs from "node:fs";
import path from "node:path";
import { displayKeys } from "./keyInjector.js";
import { resolveExcelAction } from "./mappingsExcel.js";
import { resolveVimAction } from "./mappingsVim.js";
import {
  BIT_BACK,
  BIT_DPAD_LEFT,
  BIT_DPAD_RIGHT,
  BIT_GREEN,
  BIT_GUIDE,
  BIT_RED,
  BIT_START,
  BIT_STRUM_DOWN,
  BIT_STRUM_UP,
  TOTAL_NONZERO_STATES,
  formatBitmask,
  iterAllValidBitmasks,
} from "./protocol.js";
import { TargetApp } from "./windowGuard.js";

export const REPEATABLE_MASKS = new Set([
  BIT_STRUM_UP,
  BIT_STRUM_DOWN,
  BIT_DPAD_LEFT,
  BIT_DPAD_RIGHT,
  BIT_START | BIT_STRUM_UP,
  BIT_START | BIT_STRUM_DOWN,
  BIT_GUIDE | BIT_STRUM_UP,
  BIT_GUIDE | BIT_STRUM_DOWN,
  BIT_GUIDE | BIT_DPAD_LEFT,
  BIT_GUIDE | BIT_DPAD_RIGHT,
  BIT_BACK | BIT_STRUM_UP,
  BIT_BACK | BIT_STRUM_DOWN,
  BIT_GREEN | BIT_RED | BIT_STRUM_UP,
  BIT_GREEN | BIT_RED | BIT_DPAD_RIGHT,
]);

const STRUM_BITS = BIT_STRUM_UP | BIT_STRUM_DOWN;

export function resolveAction(bitmask, target) {
  if (target === TargetApp.EXCEL) return resolveExcelAction(bitmask);
  if (target === TargetApp.VIM) return resolveVimAction(bitmask);
  return null;
}

export class ChordProcessor {
  constructor({
    mode = "chord",
    settleWindowMs = 40,
    repeatDelayMs = 350,
    repeatIntervalMs = 65,
  } = {}) {
    if (mode !== "chord" && mode !== "raw") {
      throw new Error(`Unsupported mode: ${mode}`);
    }
    this.mode = mode;
    this.settleWindowMs = settleWindowMs;
    this.repeatDelayMs = repeatDelayMs;
    this.repeatIntervalMs = repeatIntervalMs;

    this.currentMask = 0;
    this.pendingMask = 0;
    this.firedInCycle = false;
    this.settleDeadlineMs = 0;
    this.nextRepeatAtMs = 0;
  }

  feed(newMask, nowMs) {
    if (newMask === this.currentMask) return [];

    if (this.mode === "raw") {
      this.currentMask = newMask;
      return newMask !== 0 ? [newMask] : [];
    }

    const prevMask = this.currentMask;
    this.currentMask = newMask;
    const emitted = [];

    const strumRising = (newMask & STRUM_BITS) !== 0 && (prevMask & STRUM_BITS) === 0;
    if (strumRising) {
      emitted.push(newMask);
      this.pendingMask = 0;
      this.firedInCycle = true;
      this.nextRepeatAtMs = nowMs + this.repeatDelayMs;
      return emitted;
    }

    if (newMask === 0) {
      if (!this.firedInCycle && this.pendingMask !== 0) {
        emitted.push(this.pendingMask);
      }
      this.pendingMask = 0;
      this.firedInCycle = false;
      return emitted;
    }

    if ((newMask & ~prevMask) !== 0) {
      this.pendingMask = prevMask === 0 ? newMask : this.pendingMask | newMask;
      this.firedInCycle = false;
      this.settleDeadlineMs = nowMs + this.settleWindowMs;
      this.nextRepeatAtMs = nowMs + this.repeatDelayMs;
    }

    return emitted;
  }

  tick(nowMs) {
    if (this.mode === "raw") return [];
    const emitted = [];

    if (!this.firedInCycle && this.pendingMask !== 0 && nowMs >= this.settleDeadlineMs) {
      const toFire = this.currentMask !== 0 ? this.currentMask : this.pendingMask;
      emitted.push(toFire);
      this.firedInCycle = true;
      this.pendingMask = 0;
      this.nextRepeatAtMs = nowMs + this.repeatDelayMs;
    } else if (
      this.firedInCycle &&
      REPEATABLE_MASKS.has(this.currentMask) &&
      nowMs >= this.nextRepeatAtMs
    ) {
      emitted.push(this.currentMask);
      this.nextRepeatAtMs = nowMs + this.repeatIntervalMs;
    }

    return emitted;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportAllMappings(outputPath, fmt = "csv") {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  if (fmt === "csv") {
    const fd = fs.openSync(resolved, "w");
    try {
      fs.writeSync(
        fd,
        "bitmask_hex,chord_label,excel_category,excel_action,excel_keys,vim_category,vim_action,vim_keys\n"
      );
      for (const mask of iterAllValidBitmasks()) {
        const exAct = resolveExcelAction(mask);
        const vimAct = resolveVimAction(mask);
        const line = [
          `0x${mask.toString(16).toUpperCase().padStart(5, "0")}`,
          formatBitmask(mask),
          exAct.category,
          exAct.name,
          displayKeys(exAct),
          vimAct.category,
          vimAct.name,
          displayKeys(vimAct),
        ]
          .map(csvEscape)
          .join(",");
        fs.writeSync(fd, `${line}\n`);
      }
    } finally {
      fs.closeSync(fd);
    }
  } else if (fmt === "json") {
    const rows = [];
    for (const mask of iterAllValidBitmasks()) {
      const exAct = resolveExcelAction(mask);
      const vimAct = resolveVimAction(mask);
      rows.push({
        bitmask: `0x${mask.toString(16).toUpperCase().padStart(5, "0")}`,
        chord: formatBitmask(mask),
        excel: { category: exAct.category, name: exAct.name, keys: displayKeys(exAct) },
        vim: { category: vimAct.category, name: vimAct.name, keys: displayKeys(vimAct) },
      });
    }
    fs.writeFileSync(resolved, JSON.stringify(rows, null, 2), "utf8");
  } else {
    throw new Error(`Unsupported export format: ${fmt}`);
  }

  return TOTAL_NONZERO_STATES;
}
