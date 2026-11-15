/**
 * Predefined Excel demo sequences for toggleable `--demo` mode.
 * Every sequence uses F5 (Go To) for deterministic cell/range targeting
 * so formulas always land in the exact intended cells.
 */

import { sendCombo, sendKey, sendText } from "./keyInjector.js";
import { buildImageDemoSteps } from "./imageDemo.js";

function goTo(ref, label) {
  return {
    label: label || `Go to ${ref}`,
    run(dryRun) {
      sendKey("f5", { dryRun });
      sendText(ref, { dryRun });
      sendKey("enter", { dryRun });
    },
  };
}

function typeCell(text, nextKey = "tab") {
  return {
    label: `Type "${text}" + ${nextKey}`,
    run(dryRun) {
      sendText(text, { dryRun });
      if (nextKey) sendKey(nextKey, { dryRun });
    },
  };
}

function comboStep(keys, label) {
  return {
    label: label || keys.join("+"),
    run(dryRun) {
      sendCombo(keys, { dryRun });
    },
  };
}

function boldTitleStep(ref, title) {
  return [
    goTo(ref, `Jump to ${ref} (Title)`),
    {
      label: `Write bold title "${title}"`,
      run(dryRun) {
        sendText(title, { dryRun });
        sendKey("enter", { dryRun });
        sendKey("up", { dryRun });
        sendCombo(["ctrl", "b"], { dryRun });
      },
    },
  ];
}

function tableStep(range) {
  return [
    goTo(range, `Select ${range} (Excel Table)`),
    {
      label: `Format ${range} as Excel Table (Ctrl+T + Enter)`,
      run(dryRun) {
        sendCombo(["ctrl", "t"], { dryRun });
        sendKey("enter", { dryRun });
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Sequence 1: Guitar Hero Battle of the Bands & Shred-O-Meter
// ---------------------------------------------------------------------------
const BAND_BATTLE_STEPS = [
  ...boldTitleStep("A1", "BATTLE OF THE SPREADSHEET BANDS (F9 TO RE-ROLL)"),

  goTo("A3", "Jump to A3 (Headers)"),
  typeCell("Band", "tab"),
  typeCell("Shred", "tab"),
  typeCell("Crowd Hype", "tab"),
  typeCell("Encore Song", "tab"),
  typeCell("Meter", "tab"),
  typeCell("Verdict", "enter"),

  goTo("A4", "Jump to A4 (Band 1)"),
  typeCell("Clippy & The Macros", "tab"),
  typeCell("=RANDBETWEEN(40,100)", "tab"),
  typeCell("=RANDBETWEEN(20,100)", "tab"),
  typeCell('=CHOOSE(RANDBETWEEN(1,4),"Free Bird","Wonderwall (Banned)","Through the Fire & Cells","VLOOKUP Blues")', "tab"),
  typeCell('=REPT("|",ROUND(B4/5,0))', "tab"),
  typeCell('=IF(B4+C4>=150,"FACE MELTED","BOOED OFF STAGE")', "enter"),

  goTo("A5", "Jump to A5 (Band 2)"),
  typeCell("Ctrl+Z Top", "tab"),
  typeCell("=RANDBETWEEN(40,100)", "tab"),
  typeCell("=RANDBETWEEN(20,100)", "tab"),
  typeCell('=CHOOSE(RANDBETWEEN(1,4),"Free Bird","Wonderwall (Banned)","Through the Fire & Cells","VLOOKUP Blues")', "tab"),
  typeCell('=REPT("|",ROUND(B5/5,0))', "tab"),
  typeCell('=IF(B5+C5>=150,"FACE MELTED","BOOED OFF STAGE")', "enter"),

  goTo("A6", "Jump to A6 (Band 3)"),
  typeCell("The #REF! Rebels", "tab"),
  typeCell("=RANDBETWEEN(40,100)", "tab"),
  typeCell("=RANDBETWEEN(20,100)", "tab"),
  typeCell('=CHOOSE(RANDBETWEEN(1,4),"Free Bird","Wonderwall (Banned)","Through the Fire & Cells","VLOOKUP Blues")', "tab"),
  typeCell('=REPT("|",ROUND(B6/5,0))', "tab"),
  typeCell('=IF(B6+C6>=150,"FACE MELTED","BOOED OFF STAGE")', "enter"),

  goTo("A7", "Jump to A7 (Band 4)"),
  typeCell("X-Plorer Shredders", "tab"),
  typeCell("=RANDBETWEEN(75,100)", "tab"),
  typeCell("=RANDBETWEEN(65,100)", "tab"),
  typeCell('=CHOOSE(RANDBETWEEN(1,4),"Free Bird","Wonderwall (Banned)","Through the Fire & Cells","VLOOKUP Blues")', "tab"),
  typeCell('=REPT("|",ROUND(B7/5,0))', "tab"),
  typeCell('=IF(B7+C7>=150,"FACE MELTED","BOOED OFF STAGE")', "enter"),

  goTo("A9", "Jump to A9 (Winner Callout)"),
  typeCell("HEADLINER SCORE", "tab"),
  typeCell("=MAX(B4:B7)", "tab"),
  typeCell("=MAX(C4:C7)", "enter"),

  ...tableStep("A3:F7"),
  goTo("A3:C7", "Select A3:C7 (Shred vs Hype Chart)"),
  comboStep(["alt", "f1"], "Insert embedded Column Chart (Alt+F1)"),
];

// ---------------------------------------------------------------------------
// Sequence 2: Boss Fight vs Clippy the Undead
// ---------------------------------------------------------------------------
const BOSS_FIGHT_STEPS = [
  ...boldTitleStep("A1", "BOSS FIGHT: CLIPPY THE UNDEAD (HP: 200)"),

  goTo("A3", "Jump to A3 (Headers)"),
  typeCell("Turn", "tab"),
  typeCell("Guitar Dmg", "tab"),
  typeCell("Hit Type", "tab"),
  typeCell("Boss HP Left", "tab"),
  typeCell("Status", "tab"),
  typeCell("Loot Drop", "enter"),

  goTo("A4", "Jump to A4 (Turn 1)"),
  typeCell("Turn 1", "tab"),
  typeCell("=RANDBETWEEN(20,55)", "tab"),
  typeCell('=IF(B4>=45,"CRIT SHRED!","Power Chord")', "tab"),
  typeCell("=200-SUM($B$4:B4)", "tab"),
  typeCell('=IF(D4<=0,"DEFEATED!","STILL ANGRY")', "tab"),
  typeCell('=IF(D4<=0,CHOOSE(RANDBETWEEN(1,3),"Golden Whammy","Cursed Pivot Table","+99 Vim Speed"),"Keep Playing")', "enter"),

  goTo("A5", "Jump to A5 (Turn 2)"),
  typeCell("Turn 2", "tab"),
  typeCell("=RANDBETWEEN(20,55)", "tab"),
  typeCell('=IF(B5>=45,"CRIT SHRED!","Power Chord")', "tab"),
  typeCell("=200-SUM($B$4:B5)", "tab"),
  typeCell('=IF(D5<=0,"DEFEATED!","STILL ANGRY")', "tab"),
  typeCell('=IF(D5<=0,CHOOSE(RANDBETWEEN(1,3),"Golden Whammy","Cursed Pivot Table","+99 Vim Speed"),"Keep Playing")', "enter"),

  goTo("A6", "Jump to A6 (Turn 3)"),
  typeCell("Turn 3", "tab"),
  typeCell("=RANDBETWEEN(20,55)", "tab"),
  typeCell('=IF(B6>=45,"CRIT SHRED!","Power Chord")', "tab"),
  typeCell("=200-SUM($B$4:B6)", "tab"),
  typeCell('=IF(D6<=0,"DEFEATED!","STILL ANGRY")', "tab"),
  typeCell('=IF(D6<=0,CHOOSE(RANDBETWEEN(1,3),"Golden Whammy","Cursed Pivot Table","+99 Vim Speed"),"Keep Playing")', "enter"),

  goTo("A7", "Jump to A7 (Turn 4)"),
  typeCell("Turn 4", "tab"),
  typeCell("=RANDBETWEEN(20,55)", "tab"),
  typeCell('=IF(B7>=45,"CRIT SHRED!","Power Chord")', "tab"),
  typeCell("=200-SUM($B$4:B7)", "tab"),
  typeCell('=IF(D7<=0,"DEFEATED!","STILL ANGRY")', "tab"),
  typeCell('=IF(D7<=0,CHOOSE(RANDBETWEEN(1,3),"Golden Whammy","Cursed Pivot Table","+99 Vim Speed"),"Keep Playing")', "enter"),

  goTo("A8", "Jump to A8 (Turn 5)"),
  typeCell("Turn 5", "tab"),
  typeCell("=RANDBETWEEN(30,75)", "tab"),
  typeCell('=IF(B8>=45,"FINISHER!","Power Chord")', "tab"),
  typeCell("=200-SUM($B$4:B8)", "tab"),
  typeCell('=IF(D8<=0,"DEFEATED!","ENRAGED!")', "tab"),
  typeCell('=IF(D8<=0,CHOOSE(RANDBETWEEN(1,3),"Golden Whammy","Cursed Pivot Table","+99 Vim Speed"),"Run Away!")', "enter"),

  ...tableStep("A3:F8"),
  goTo("A3:B8", "Select A3:B8 (Damage Per Turn Chart)"),
  comboStep(["alt", "f1"], "Insert embedded Column Chart (Alt+F1)"),
];

// ---------------------------------------------------------------------------
// Sequence 3: Corporate Excuse & Blame Generator
// ---------------------------------------------------------------------------
const EXCUSE_STEPS = [
  ...boldTitleStep("A1", "AUTOMATED STANDUP EXCUSE GENERATOR"),

  goTo("A3", "Jump to A3 (Headers)"),
  typeCell("Ticket", "tab"),
  typeCell("Culprit", "tab"),
  typeCell("Disaster", "tab"),
  typeCell("Fake ETA", "tab"),
  typeCell("Standup Excuse", "tab"),
  typeCell("Believability", "tab"),
  typeCell("Outcome", "enter"),

  goTo("A4", "Jump to A4 (Row 1)"),
  typeCell("JIRA-404", "tab"),
  typeCell("DNS", "tab"),
  typeCell("quantum race condition", "tab"),
  typeCell("Tuesday", "tab"),
  typeCell('=B4&" caused a "&C4&" (fixed by "&D4&")"', "tab"),
  typeCell("=RANDBETWEEN(15,98)/100", "tab"),
  typeCell('=IF(F4<0.35,"FIRED","PROMOTED")', "enter"),

  goTo("A5", "Jump to A5 (Row 2)"),
  typeCell("JIRA-666", "tab"),
  typeCell("The Intern", "tab"),
  typeCell("rogue Excel macro", "tab"),
  typeCell("next sprint", "tab"),
  typeCell('=B5&" caused a "&C5&" (fixed by "&D5&")"', "tab"),
  typeCell("=RANDBETWEEN(15,98)/100", "tab"),
  typeCell('=IF(F5<0.35,"FIRED","PROMOTED")', "enter"),

  goTo("A6", "Jump to A6 (Row 3)"),
  typeCell("JIRA-999", "tab"),
  typeCell("Solar Flares", "tab"),
  typeCell("AI synergy overflow", "tab"),
  typeCell("Q5", "tab"),
  typeCell('=B6&" caused a "&C6&" (fixed by "&D6&")"', "tab"),
  typeCell("=RANDBETWEEN(15,98)/100", "tab"),
  typeCell('=IF(F6<0.35,"FIRED","PROMOTED")', "enter"),

  goTo("A7", "Jump to A7 (Row 4)"),
  typeCell("JIRA-1337", "tab"),
  typeCell("A Guitar Hero Controller", "tab"),
  typeCell("unplanned solo", "tab"),
  typeCell("after encore", "tab"),
  typeCell('=B7&" caused an "&C7&" (fixed "&D7&")"', "tab"),
  typeCell("=RANDBETWEEN(75,100)/100", "tab"),
  typeCell('=IF(F7<0.35,"FIRED","LEGEND")', "enter"),

  goTo("F4:F7", "Select F4:F7 (Believability %)"),
  comboStep(["ctrl", "shift", "5"], "Apply Percentage format (Ctrl+Shift+%)"),

  ...tableStep("A3:G7"),
  goTo("A3:A7", "Select Ticket column"),
  goTo("F3:F7", "Select Believability % for Chart"),
  comboStep(["alt", "f1"], "Insert embedded Column Chart (Alt+F1)"),
];

export const DEMO_SEQUENCES = [
  {
    id: "battle",
    name: "Battle of the Spreadsheet Bands",
    steps: BAND_BATTLE_STEPS,
  },
  {
    id: "boss",
    name: "Boss Fight: Clippy the Undead",
    steps: BOSS_FIGHT_STEPS,
  },
  {
    id: "excuses",
    name: "Automated Standup Excuse Generator",
    steps: EXCUSE_STEPS,
  },
  {
    id: "image",
    name: "Pixel Art (32x32): server/images (1).jpg",
    noLoop: true,
    steps: buildImageDemoSteps(),
  },
];

export const DEMO_STEPS = DEMO_SEQUENCES[0].steps;

export function findDemoSequenceIndex(query) {
  if (query === undefined || query === null || query === "") return 0;
  const num = Number(query);
  if (Number.isInteger(num) && num >= 1 && num <= DEMO_SEQUENCES.length) {
    return num - 1;
  }
  const q = String(query).trim().toLowerCase();
  const idx = DEMO_SEQUENCES.findIndex(
    (s) => s.id.toLowerCase() === q || s.name.toLowerCase().includes(q)
  );
  return idx >= 0 ? idx : 0;
}
