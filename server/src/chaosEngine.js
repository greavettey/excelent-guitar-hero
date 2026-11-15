/**
 * Hilarious / cursed Guitar Hero gameplay mechanics for Excel & Vim:
 *  1. 120 BPM Metronome + Note Streak Multiplier (1x..4x) + Off-Beat Fumble Penalty
 *  2. ASCII 5-Lane Note Highway Riff Gate for dangerous/powerful macros
 *  3. Vertical Tilt (>= 75 deg) "Commit or Die" Star Power Gate for Enter & Save
 *  4. Whammy Bar Vibrato Analog Scrubber (Ctrl+a/Ctrl+x in Vim, Decimal +/- in Excel)
 *  5. Rock Meter Shame Lockout (booed off stage when hitting forbidden apps)
 *  6. 5-Bit Binary "Baudot" Guitar Chord Typing (GUIDE + Frets + Strum Down)
 */

import { actionChord, actionRibbon, actionText, makeAction, repeat } from "./keyInjector.js";
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
  FRET_MASK,
  formatBitmask,
  getTiltLevel,
  getWhammyLevel,
} from "./protocol.js";
import { TargetApp } from "./windowGuard.js";

const BAUDOT_SPECIALS = new Map([
  [27, "="],
  [28, "("],
  [29, ":"],
  [30, "/"],
  [31, ")"],
]);

const RIFF_PRESETS = [
  [BIT_GREEN, BIT_RED, BIT_YELLOW, BIT_BLUE, BIT_ORANGE, BIT_GREEN | BIT_RED],
  [BIT_BLUE, BIT_YELLOW, BIT_RED, BIT_GREEN, BIT_RED | BIT_YELLOW, BIT_ORANGE],
  [BIT_GREEN | BIT_YELLOW, BIT_RED | BIT_BLUE, BIT_YELLOW | BIT_ORANGE, BIT_GREEN, BIT_RED, BIT_BLUE],
];

const MULTIPLIABLE_KEYS = new Set(["up", "down", "left", "right"]);
const MULTIPLIABLE_VIM_TEXTS = new Set(["h", "j", "k", "l", "w", "b", "x"]);

export function decodeBaudotMask(mask) {
  // Triggered strictly by GUIDE + non-zero frets + STRUM_DOWN (without START/BACK)
  if (!(mask & BIT_GUIDE) || !(mask & BIT_STRUM_DOWN)) return null;
  if (mask & (BIT_START | BIT_BACK)) return null;
  const code = mask & FRET_MASK;
  if (code === 0) return null;

  if (code >= 1 && code <= 26) {
    const base = getTiltLevel(mask) >= 1 ? 64 : 96;
    const ch = String.fromCharCode(base + code);
    return actionText(`Baudot '${ch}' (0b${code.toString(2).padStart(5, "0")})`, ch, {
      category: "Baudot Chording",
    });
  }
  const special = BAUDOT_SPECIALS.get(code);
  if (special) {
    return actionText(`Baudot '${special}' (0b${code.toString(2).padStart(5, "0")})`, special, {
      category: "Baudot Chording",
    });
  }
  return null;
}

export function renderAsciiHighway(riff, progress) {
  const lanes = [BIT_GREEN, BIT_RED, BIT_YELLOW, BIT_BLUE, BIT_ORANGE];
  const labels = ["G", "R", "Y", "B", "O"];
  const lines = ["  +---+---+---+---+---+"];
  const start = Math.max(0, progress - 1);
  const end = Math.min(riff.length, progress + 4);
  for (let i = end - 1; i >= start; i--) {
    const note = riff[i];
    const cells = lanes.map((bit, idx) => (note & bit ? `(${labels[idx]})` : " | "));
    const marker = i === progress ? " <-- HIT NOW" : i < progress ? " [OK]" : "";
    lines.push(`  |${cells.join("|")}|${marker}`);
  }
  lines.push("  +---+---+---+---+---+");
  return lines.join("\n");
}

function multiplyAction(action, multiplier) {
  if (multiplier <= 1 || action.steps.length !== 1) return action;
  const step = action.steps[0];
  if (step.kind === "chord" && step.keys.length === 1 && MULTIPLIABLE_KEYS.has(step.keys[0])) {
    return makeAction(`${action.name} [${multiplier}x STREAK]`, [repeat(step.keys[0], multiplier)], {
      category: action.category,
    });
  }
  if (step.kind === "text" && MULTIPLIABLE_VIM_TEXTS.has(step.text)) {
    return actionText(`${action.name} [${multiplier}x STREAK]`, `${multiplier}${step.text}`, {
      category: action.category,
    });
  }
  return action;
}

export class ChaosEngine {
  constructor({
    enabled = true,
    bpm = 120,
    rhythmToleranceMs = 135,
    startTimeMs = 0,
  } = {}) {
    this.enabled = enabled;
    this.bpm = bpm;
    this.beatPeriodMs = 60000 / bpm;
    this.rhythmToleranceMs = rhythmToleranceMs;
    this.startTimeMs = startTimeMs;

    // Rhythm state
    this.streak = 0;
    this.multiplier = 1;

    // Rock Meter state (0..100)
    this.rockMeter = 50;
    this.lockedOut = false;
    this.recoveryHits = 0;

    // Note Highway riff gate state
    this.activeChallenge = null; // { targetAction, targetApp, riff, index }
    this.riffCounter = 0;

    // Whammy vibrato state
    this.lastWhammyLevel = 0;
    this.lastWhammyDir = 0;
    this.whammyReversals = [];
  }

  _updateMultiplier() {
    if (this.streak >= 20) this.multiplier = 4;
    else if (this.streak >= 10) this.multiplier = 3;
    else if (this.streak >= 5) this.multiplier = 2;
    else this.multiplier = 1;
  }

  judgeBeat(nowMs) {
    const elapsed = Math.max(0, nowMs - this.startTimeMs);
    const phase = elapsed % this.beatPeriodMs;
    const dist = Math.min(phase, this.beatPeriodMs - phase);
    return { onBeat: dist <= this.rhythmToleranceMs, errorMs: Math.round(dist) };
  }

  /**
   * Process raw whammy changes for vibrato scrubbing (Ctrl+a/Ctrl+x in Vim, Decimal +/- in Excel).
   */
  processWhammyVibrato(rawMask, targetApp, nowMs) {
    if (!this.enabled || this.lockedOut) return null;
    if (targetApp !== TargetApp.EXCEL && targetApp !== TargetApp.VIM) return null;
    if ((rawMask & FRET_MASK) !== 0) {
      this.lastWhammyLevel = getWhammyLevel(rawMask);
      return null;
    }

    const level = getWhammyLevel(rawMask);
    const diff = level - this.lastWhammyLevel;
    if (diff === 0) return null;

    const dir = diff > 0 ? 1 : -1;
    this.lastWhammyLevel = level;

    if (this.lastWhammyDir !== 0 && dir !== this.lastWhammyDir) {
      this.whammyReversals.push(nowMs);
    }
    this.lastWhammyDir = dir;

    // Keep reversals in sliding 700ms window
    this.whammyReversals = this.whammyReversals.filter((ts) => nowMs - ts <= 700);
    if (this.whammyReversals.length < 3) return null;

    if (targetApp === TargetApp.VIM) {
      return dir > 0
        ? actionChord("Whammy Vibrato: Increment Number (Ctrl+a)", "ctrl", "a", { category: "Whammy Chaos" })
        : actionChord("Whammy Vibrato: Decrement Number (Ctrl+x)", "ctrl", "x", { category: "Whammy Chaos" });
    }
    return dir > 0
      ? actionRibbon("Whammy Vibrato: Increase Decimal", "h", "0", { category: "Whammy Chaos" })
      : actionRibbon("Whammy Vibrato: Decrease Decimal", "h", "9", { category: "Whammy Chaos" });
  }

  /**
   * Handle an incoming action attempt against all chaos rules.
   * Returns { outcome, actionToSend, logs: string[], highwayDisplay?: string }.
   */
  evaluate(bitmask, targetApp, resolvedAction, nowMs) {
    const logs = [];

    // 1. Forbidden App -> Rock Meter drops violently
    if (targetApp === TargetApp.NONE) {
      if (this.enabled) {
        this.rockMeter = Math.max(0, this.rockMeter - 15);
        this.streak = 0;
        this._updateMultiplier();
        if (this.rockMeter === 0 && !this.lockedOut) {
          this.lockedOut = true;
          this.recoveryHits = 0;
          logs.push("BOOED OFF STAGE! Rock Meter hit 0 -> LOCKED OUT until 5 recovery strums in Excel/Vim!");
        } else {
          logs.push(`SHAME! Rock Meter -15 (now ${this.rockMeter}/100). Focus Excel or Vim!`);
        }
      }
      return { outcome: "blocked_app", actionToSend: null, logs };
    }

    if (!this.enabled) {
      return { outcome: "execute", actionToSend: resolvedAction, logs };
    }

    // 2. Rock Meter Lockout Recovery Solo
    if (this.lockedOut) {
      this.recoveryHits += 1;
      this.rockMeter = Math.min(100, this.rockMeter + 6);
      if (this.recoveryHits >= 5) {
        this.lockedOut = false;
        this.recoveryHits = 0;
        logs.push(`ENCORE! Recovery solo complete (Rock Meter ${this.rockMeter}/100) — controls restored!`);
        return { outcome: "recovered", actionToSend: null, logs };
      }
      logs.push(`LOCKED OUT (Recovery Solo ${this.recoveryHits}/5 strums, Rock Meter ${this.rockMeter}/100)`);
      return { outcome: "locked_out", actionToSend: null, logs };
    }

    // 3. Active Note Highway Riff Challenge
    if (this.activeChallenge) {
      if (this.activeChallenge.targetApp !== targetApp) {
        this.activeChallenge = null;
        logs.push("Note Highway aborted (switched app).");
      } else {
        const expectedFrets = this.activeChallenge.riff[this.activeChallenge.index];
        const actualFrets = bitmask & FRET_MASK;
        if (actualFrets === expectedFrets) {
          this.activeChallenge.index += 1;
          if (this.activeChallenge.index >= this.activeChallenge.riff.length) {
            const unlocked = this.activeChallenge.targetAction;
            this.activeChallenge = null;
            this.rockMeter = Math.min(100, this.rockMeter + 10);
            logs.push(`RIFF COMPLETE! Unlocked macro: ${unlocked.name}`);
            return { outcome: "riff_unlocked", actionToSend: unlocked, logs };
          }
          const highway = renderAsciiHighway(this.activeChallenge.riff, this.activeChallenge.index);
          logs.push(
            `Note ${this.activeChallenge.index}/${this.activeChallenge.riff.length} HIT! Next: ${formatBitmask(
              this.activeChallenge.riff[this.activeChallenge.index]
            )}`
          );
          return { outcome: "riff_progress", actionToSend: null, logs, highwayDisplay: highway };
        }

        // Wrong note! Cancel riff and punish with Esc
        this.activeChallenge = null;
        this.streak = 0;
        this._updateMultiplier();
        this.rockMeter = Math.max(0, this.rockMeter - 8);
        logs.push(
          `RIFF FAILED! Expected ${formatBitmask(expectedFrets)}, got ${formatBitmask(actualFrets || bitmask)} -> sending Esc!`
        );
        return {
          outcome: "riff_failed",
          actionToSend: actionChord("Riff Fail Penalty (Esc)", "esc", { category: "Penalty" }),
          logs,
        };
      }
    }

    // 4. 5-Bit Binary Baudot Chording (GUIDE + frets + STRUM_DOWN)
    const baudot = decodeBaudotMask(bitmask);
    const candidateAction = baudot || resolvedAction;
    if (!candidateAction) {
      return { outcome: "noop", actionToSend: null, logs };
    }

    // 5. Star Power Vertical Tilt Gate for Enter / Save
    if (candidateAction.requiresStarPower && getTiltLevel(bitmask) < 2) {
      this.rockMeter = Math.max(0, this.rockMeter - 3);
      logs.push(
        `STAR POWER REQUIRED for '${candidateAction.name}': Tilt guitar vertical (>=75 deg / T2)! (Rock ${this.rockMeter}/100)`
      );
      return { outcome: "tilt_required", actionToSend: null, logs };
    }

    // 6. Trigger Note Highway Riff Gate for high-power macros
    if (candidateAction.requiresRiff) {
      const riff = RIFF_PRESETS[this.riffCounter % RIFF_PRESETS.length];
      this.riffCounter += 1;
      this.activeChallenge = {
        targetAction: candidateAction,
        targetApp,
        riff,
        index: 0,
      };
      const highway = renderAsciiHighway(riff, 0);
      logs.push(
        `NOTE HIGHWAY: Play ${riff.length}-note riff to unlock '${candidateAction.name}'! First note: ${formatBitmask(
          riff[0]
        )}`
      );
      return { outcome: "riff_started", actionToSend: null, logs, highwayDisplay: highway };
    }

    // 7. 120 BPM Rhythm Judge (exempt Esc/Cancel so you can always bail out)
    const isCancel = bitmask === BIT_BACK;
    if (!isCancel) {
      const { onBeat, errorMs } = this.judgeBeat(nowMs);
      if (!onBeat) {
        this.streak = 0;
        this._updateMultiplier();
        this.rockMeter = Math.max(0, this.rockMeter - 6);
        if (this.rockMeter === 0) {
          this.lockedOut = true;
          this.recoveryHits = 0;
          logs.push(`OFF-BEAT (${errorMs}ms off) & Rock Meter hit 0 -> LOCKED OUT!`);
          return { outcome: "locked_out", actionToSend: null, logs };
        }
        const penalty =
          targetApp === TargetApp.VIM
            ? actionText("Off-Beat Fumble (Undo u)", "u", { category: "Penalty" })
            : actionChord("Off-Beat Fumble (Esc)", "esc", { category: "Penalty" });
        logs.push(`MISSED BEAT (${errorMs}ms off)! Streak reset -> fumble penalty (${penalty.name})`);
        return { outcome: "rhythm_miss", actionToSend: penalty, logs };
      }

      this.streak += 1;
      this._updateMultiplier();
      this.rockMeter = Math.min(100, this.rockMeter + 2);
      const boosted = multiplyAction(candidateAction, this.multiplier);
      if (this.multiplier > 1) {
        logs.push(`ON BEAT (${errorMs}ms) | Streak ${this.streak} (${this.multiplier}x) | Rock ${this.rockMeter}/100`);
      }
      return { outcome: "execute", actionToSend: boosted, logs };
    }

    return { outcome: "execute", actionToSend: candidateAction, logs };
  }
}
