/**
 * 32x32 Pixel-Art Excel demo generated from `server/images (1).jpg` (28 quantized RGB colors).
 * Every cell in A1:AF32 is painted exactly once (disjoint color chunks, zero refilling)
 * via Excel's Fill Cell command (F5 Go To + Alt->H->H->M More Colors) with Win32 dialog polling.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sendKey, sendCombo, sendText } from "./keyInjector.js";
import { getForegroundExcelInfo } from "./excelState.js";

const execFileAsync = promisify(execFile);

function chunkRuns(runs, maxLen = 75) {
  const chunks = [];
  let cur = "";
  for (const r of runs) {
    const next = cur ? `${cur},${r}` : r;
    if (next.length > maxLen && cur) {
      chunks.push(cur);
      cur = r;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const IMAGE_COLOR_GROUPS = [
  { rgb: [64, 64, 32], runs: ["P1", "B2", "D2", "F2:G2", "I2:J2", "L2:AD2", "AF2", "O3:S3", "X3", "AB3:AC3", "K4:R4", "W4:X4", "AB4", "B5", "F5:O5", "R5", "V5:X5", "Z5:AA5", "AD5:AF5", "A6:B6", "E6:AA6", "AC6", "AF6", "B7", "F7:N7", "V7", "X7:Y7", "AB7:AD7", "AF7", "A8:J8", "L8:M8", "AB8:AF8", "A9", "C9:I9", "Y9", "AC9:AF9", "A10:I10", "X10:AE10", "A11", "C11:J11", "Y11:AE11", "A12", "C12:E12", "I12", "S12", "V12", "AB12:AF12", "A13", "AC13:AD13", "V14", "AB14", "AD14:AE14", "V15", "AB15:AC15", "P16", "R16:S16", "V16", "AB16", "P17:Q17", "Q19", "W20:X20", "Q21", "S21", "U21", "W21", "N23", "T23", "X23", "S25"] },
  { rgb: [64, 32, 32], runs: ["E1:O1", "Q1:AD1", "AF1", "C2", "E2", "H2", "K2", "AE2", "A3:N3", "T3:W3", "Y3:AA3", "AD3:AF3", "A4:J4", "S4:V4", "Y4:AA4", "AC4:AF4", "A5", "C5:E5", "P5:Q5", "S5:U5", "Y5", "AB5:AC5", "C6:D6", "AB6", "AD6:AE6", "A7", "C7:E7", "O7", "T7:U7", "W7", "Z7:AA7", "AE7", "K8", "Y8:AA8", "Z9:AB9", "O12", "T12", "O13", "R13", "T13", "V17", "W18", "W19", "O20:P20", "V20", "P21", "R21", "M22", "O22:P22", "W22", "L23:M23", "P23:R23", "W23", "T24", "O25"] },
  { rgb: [64, 64, 64], runs: ["X8", "B9", "J9", "J10", "AF10", "B11", "X11", "AF11", "B12", "F12:H12", "J12", "X12:AA12", "B13:J13", "Q13", "X13:AB13", "AE13:AF13", "A14:J14", "X14:AA14", "AC14", "AF14", "A15:J15", "R15", "X15:AA15", "AD15:AF15", "A16:J16", "X16:AA16", "AC16:AF16", "A17:J17", "X17:AF17", "A18", "C18:G18", "I18:J18", "Y18:AF18", "M19:N19", "P19", "R19", "U19", "AD19:AE19", "R20", "U20", "L21:N21", "T21", "S23", "N24", "T25", "M29:O29"] },
  { rgb: [160, 160, 128], runs: ["B24", "F24:H24", "A25", "C25:E25", "G25", "I25", "K25:L25", "Q25:R25", "U25:V25", "A26", "C26:D26", "H26", "K26:N26", "P26:R26", "U26:Z26", "AF26", "A27", "C27:D27", "F27", "N27", "P27", "U27:Y27", "AF27", "A28", "C28:N28", "P28:R28", "B29:G29", "I29", "AF30", "B32", "Q32:R32", "X32", "AF32"] },
  { rgb: [96, 96, 64], runs: ["O8", "X9", "P13", "W14", "P15", "T15", "O16", "Q16", "T16", "M17:N17", "S17:T17", "K18:L18", "T18", "K19", "O19", "Y19", "B20:C20", "F20:H20", "Y20:Z20", "AB20", "AF20", "A21", "C21:I21", "X21:Y21", "AA21:AF21", "A22", "X22", "Y23", "V24", "Y24", "O28", "S28"] },
  { rgb: [128, 128, 96], runs: ["J21", "I22", "B23", "D23:I23", "Z23", "AB23", "L24:M24", "Q24", "Z24:AC24", "AE24:AF24", "N25", "AA25:AE25", "O26", "S26:T26", "S27", "V28:Y28", "L29", "U29", "W29:Z29", "AC29:AD29", "D30", "F30:G30", "I30:L30", "O30:R30", "U30", "W30", "AA30", "C31:D31", "F31:G31", "I31:S31"] },
  { rgb: [96, 64, 64], runs: ["N8", "Q12:R12", "L13", "N13", "S14", "Q15", "M16", "W16", "O17", "B18", "H18", "P18:Q18", "U18", "X18", "A19:J19", "L19", "S19:T19", "Z19:AC19", "AF19", "A20", "D20:E20", "I20", "Q20", "S20", "AA20", "AC20:AE20", "K21", "K22", "P24", "U24"] },
  { rgb: [128, 128, 128], runs: ["K24", "P25", "Y25:Z25", "AE26", "T27", "Z28:AE28", "K29", "AE29", "A30", "C30", "E30", "H30", "V30", "X30:Z30", "AB30:AE30", "A31", "E31", "H31", "T31:AE31", "A32", "C32", "H32", "J32:K32", "Z32:AA32", "AD32:AE32"] },
  { rgb: [160, 128, 128], runs: ["A24", "C24:E24", "H25", "W25", "AF25", "AA26:AD26", "Z27:AE27", "U28", "AF28", "A29", "H29", "J29", "AF29", "B30", "B31", "AF31", "D32:G32", "I32", "L32:P32", "S32:W32", "Y32", "AB32:AC32"] },
  { rgb: [128, 96, 64], runs: ["P8", "V8:W8", "T9", "W9", "T11:U11", "M12", "K13", "L14:N14", "P14:Q14", "L15:M15", "K16", "K17:L17", "U17", "M18", "O18", "S18", "J20", "J23", "J24", "W24", "X25", "O27"] },
  { rgb: [32, 32, 32], runs: ["A1:D1", "AE1", "A2", "P7:S7", "M13", "S15", "W17", "V18", "V19", "O21", "V21", "L22", "N22", "Q22:U22", "U23", "S24"] },
  { rgb: [128, 96, 96], runs: ["R14", "N18", "K20", "N20", "C23", "AA23", "AC23:AF23", "R24", "AD24", "P29:R29", "V29", "AA29:AB29", "M30:N30", "S30"] },
  { rgb: [96, 64, 32], runs: ["V9", "V10:W10", "N12", "P12", "W12", "V13:W13", "O14", "T14", "N16", "R17", "X19", "O23", "X24"] },
  { rgb: [96, 96, 96], runs: ["L20:M20", "T20", "B21", "Z21", "B22:H22", "Y22:AF22", "A23", "K23", "T28", "S29:T29", "T30"] },
  { rgb: [160, 128, 64], runs: ["S8:T8", "L9", "S9", "U9", "K10", "M10:P10", "S10:U10", "K11", "O11:P11", "K12:L12", "L16"] },
  { rgb: [160, 160, 160], runs: ["F25", "J25", "M25", "E26:G26", "I26:J26", "E27", "G27:M27", "Q27:R27"] },
  { rgb: [128, 128, 64], runs: ["Q8:R8", "U8", "K9", "K14", "U14", "K15", "R18"] },
  { rgb: [192, 160, 96], runs: ["N9:O9", "Q9:R9", "Q10:R10", "L11:N11", "R11"] },
  { rgb: [160, 128, 96], runs: ["M9", "S11", "J22", "I24"] },
  { rgb: [192, 160, 160], runs: ["B25", "B26", "B27", "B28"] },
  { rgb: [96, 96, 32], runs: ["V11:W11", "N15:O15", "W15", "U16"] },
  { rgb: [128, 96, 32], runs: ["U12", "U13", "U15"] },
  { rgb: [32, 0, 0], runs: ["V22", "O24"] },
  { rgb: [96, 32, 32], runs: ["S13"] },
  { rgb: [192, 128, 64], runs: ["P9"] },
  { rgb: [32, 32, 0], runs: ["V23"] },
  { rgb: [192, 160, 64], runs: ["L10"] },
  { rgb: [160, 160, 96], runs: ["Q11"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isExcelDialogClass(cls) {
  return cls === "#32770" || cls === "NUIDialog" || cls.startsWith("bosa_sdm_");
}

async function waitForDialog(titleFragment, timeoutMs = 1500) {
  const needle = titleFragment.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = getForegroundExcelInfo();
    if (
      isExcelDialogClass(info.foregroundClass) &&
      (!needle || info.title.toLowerCase().includes(needle))
    ) {
      return info;
    }
    await sleep(15);
  }
  return null;
}

async function waitForExcelMain(timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getForegroundExcelInfo().isExcel) return true;
    await sleep(15);
  }
  return false;
}

async function ensureExcelReady() {
  let info = getForegroundExcelInfo();
  if (isExcelDialogClass(info.foregroundClass)) {
    sendKey("esc");
    await waitForExcelMain(800);
    info = getForegroundExcelInfo();
  }
  if (!info.isExcel) {
    throw new Error(
      `Excel window is not focused (foreground="${info.foregroundClass}", title="${info.title}")`
    );
  }
}

async function selectRange(rangeStr) {
  sendKey("f5");
  const dlg = await waitForDialog("go to", 1200);
  if (!dlg) {
    throw new Error("Excel Go To dialog (F5) did not open");
  }
  await sleep(25);
  sendCombo(["ctrl", "a"]);
  await sleep(15);
  sendText(rangeStr);
  await sleep(15);
  sendKey("enter");
  await waitForExcelMain(1200);
}

async function sendRibbonSequence(keys, dialogTitle) {
  for (const k of keys) {
    sendKey(k);
    await sleep(60);
  }
  const dlg = await waitForDialog(dialogTitle, 2000);
  if (!dlg) {
    throw new Error(`Excel "${dialogTitle}" dialog did not open`);
  }
  return dlg;
}

async function resizePixelGrid(dryRun) {
  if (dryRun || process.platform !== "win32") return;
  await ensureExcelReady();

  await selectRange("A1:AF32");

  // Column Width = 2.5 (Alt -> H -> O -> W)
  await sendRibbonSequence(["alt", "h", "o", "w"], "column width");
  await sleep(25);
  sendCombo(["ctrl", "a"]);
  await sleep(15);
  sendText("2.5");
  await sleep(15);
  sendKey("enter");
  await waitForExcelMain(1200);

  // Row Height = 14 (Alt -> H -> O -> H)
  await sendRibbonSequence(["alt", "h", "o", "h"], "row height");
  await sleep(25);
  sendCombo(["ctrl", "a"]);
  await sleep(15);
  sendText("14");
  await sleep(15);
  sendKey("enter");
  await waitForExcelMain(1200);
}

const UIA_SELECT_CUSTOM_TAB = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$fg = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($null -eq $fg) { exit 0 }
$w = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$cur = $fg
while ($null -ne $cur -and $cur.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
  $cur = $w.GetParent($cur)
}
if ($null -eq $cur) { exit 0 }

$redCond = New-Object System.Windows.Automation.OrCondition(
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Red:")),
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Red"))
)
if ($null -ne $cur.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $redCond)) {
  Write-Output "ALREADY_CUSTOM"
  exit 0
}

$tabCond = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)),
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Custom"))
)
$tab = $cur.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
if ($null -ne $tab) {
  $pat = $null
  if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pat)) {
    $pat.Select()
    Write-Output "SELECTED_CUSTOM"
    exit 0
  }
  if ($tab.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) {
    $pat.Invoke()
    Write-Output "INVOKED_CUSTOM"
    exit 0
  }
}
Write-Output "NO_CUSTOM_TAB"
`;

let _colorsDialogLogged = false;

async function ensureCustomTabViaUia() {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", UIA_SELECT_CUSTOM_TAB],
      { timeout: 3000, windowsHide: true }
    );
    return stdout.trim();
  } catch {
    return "ERROR";
  }
}

async function replaceFieldText(text) {
  sendKey("home");
  await sleep(10);
  for (let i = 0; i < 4; i++) {
    sendKey("delete");
    await sleep(5);
  }
  sendText(String(text));
  await sleep(20);
}

async function fillRangeRgb(rangeStr, [r, g, b], dryRun) {
  if (dryRun || process.platform !== "win32") return;
  await ensureExcelReady();

  await selectRange(rangeStr);

  // Fill Color -> More Colors... (Alt -> H -> H -> M)
  const dlg = await sendRibbonSequence(["alt", "h", "h", "m"], "colors");
  await sleep(50);

  if (!_colorsDialogLogged) {
    _colorsDialogLogged = true;
    const nowInfo = getForegroundExcelInfo();
    console.log(
      `[IMAGE] Colors dialog detected: class="${dlg.foregroundClass}", title="${dlg.title}", focus="${nowInfo.focusClass}"`
    );
  }

  // Always ensure we are on the Custom tab (Excel resets Colors to Standard on reopen).
  const res = await ensureCustomTabViaUia();
  if (res === "NO_CUSTOM_TAB" || res === "ERROR") {
    sendCombo(["ctrl", "tab"]);
    await sleep(80);
  } else {
    await sleep(40);
  }

  sendCombo(["alt", "r"]);
  await sleep(40);
  await replaceFieldText(r);

  sendCombo(["alt", "g"]);
  await sleep(30);
  await replaceFieldText(g);

  sendCombo(["alt", "b"]);
  await sleep(30);
  await replaceFieldText(b);

  sendKey("enter");
  await waitForExcelMain(1500);
}

export function buildImageDemoSteps() {
  const steps = [
    {
      label: "Resize A1:AF32 into 32x32 square pixel grid (Col=2.5, Row=14)",
      run: (dryRun) => resizePixelGrid(dryRun),
    },
  ];

  for (const group of IMAGE_COLOR_GROUPS) {
    const chunks = chunkRuns(group.runs);
    const [r, g, b] = group.rgb;
    for (let i = 0; i < chunks.length; i++) {
      const rangeStr = chunks[i];
      steps.push({
        label: `Fill RGB(${r},${g},${b}) [${i + 1}/${chunks.length}] -> ${rangeStr}`,
        run: (dryRun) => fillRangeRgb(rangeStr, [r, g, b], dryRun),
      });
    }
  }

  return steps;
}
