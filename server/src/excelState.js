/**
 * Excel focus & active-cell helpers for Windows.
 *
 * Fast Win32 FFI helpers (sub-millisecond):
 *   - getForegroundExcelInfo()
 *   - isExcelFocused()
 *   - isEditingExcelCell()
 *
 * UI Automation helpers (async, reads specific cell address e.g. "B4"):
 *   - getActiveExcelCell()
 *   - isTypingInExcelCell(targetCell?)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import koffi from "koffi";

const execFileAsync = promisify(execFile);

let _user32 = null;
let _GetForegroundWindow = null;
let _GetWindowThreadProcessId = null;
let _GetGUIThreadInfo = null;
let _GetClassNameW = null;
let _GetWindowTextW = null;
let _GUITHREADINFO = null;

function ensureWin32() {
  if (_GetForegroundWindow) return true;
  if (process.platform !== "win32") return false;

  _user32 = koffi.load("user32.dll");

  const RECT = koffi.struct("EXCEL_RECT", {
    left: "int32",
    top: "int32",
    right: "int32",
    bottom: "int32",
  });

  _GUITHREADINFO = koffi.struct("GUITHREADINFO", {
    cbSize: "uint32",
    flags: "uint32",
    hwndActive: "uintptr_t",
    hwndFocus: "uintptr_t",
    hwndCapture: "uintptr_t",
    hwndMenuOwner: "uintptr_t",
    hwndMoveSize: "uintptr_t",
    hwndCaret: "uintptr_t",
    rcCaret: RECT,
  });

  _GetForegroundWindow = _user32.func("uintptr_t __stdcall GetForegroundWindow()");
  _GetWindowThreadProcessId = _user32.func(
    "uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *lpdwProcessId)"
  );
  _GetGUIThreadInfo = _user32.func(
    "bool __stdcall GetGUIThreadInfo(uint32 idThread, _Inout_ GUITHREADINFO *pgui)"
  );
  _GetClassNameW = _user32.func(
    "int __stdcall GetClassNameW(uintptr_t hWnd, _Out_ uint16 *lpClassName, int nMaxCount)"
  );
  _GetWindowTextW = _user32.func(
    "int __stdcall GetWindowTextW(uintptr_t hWnd, _Out_ uint16 *lpString, int nMaxCount)"
  );

  return true;
}

function readClassName(hwnd) {
  if (!hwnd) return "";
  const buf = new Uint16Array(128);
  const len = _GetClassNameW(hwnd, buf, buf.length);
  if (len <= 0) return "";
  return Buffer.from(buf.buffer, 0, len * 2).toString("utf16le");
}

function readWindowText(hwnd) {
  if (!hwnd) return "";
  const buf = new Uint16Array(256);
  const len = _GetWindowTextW(hwnd, buf, buf.length);
  if (len <= 0) return "";
  return Buffer.from(buf.buffer, 0, len * 2).toString("utf16le");
}

/**
 * Pure classifier for Win32 window class names (easy to unit test).
 */
export function classifyExcelFocus(foregroundClass, focusClass, title = "") {
  const isExcel = foregroundClass === "XLMAIN";
  const isEditingCell = isExcel && focusClass === "EXCEL6";
  const isFormulaBar = isExcel && (focusClass === "EXCEL<" || focusClass.startsWith("RICHEDIT"));
  const isGrid = isExcel && focusClass === "EXCEL7";

  return {
    isExcel,
    isEditing: isEditingCell || isFormulaBar,
    isEditingCell,
    isFormulaBar,
    isGrid,
    foregroundClass,
    focusClass,
    title,
  };
}

/**
 * Fast synchronous check of whether Excel is focused and whether the user
 * is currently typing in a cell (EXCEL6) or formula bar (EXCEL<) vs navigating the grid (EXCEL7).
 */
export function getForegroundExcelInfo() {
  if (!ensureWin32()) {
    return classifyExcelFocus("", "", "");
  }

  const hwnd = _GetForegroundWindow();
  if (!hwnd) {
    return classifyExcelFocus("", "", "");
  }

  const foregroundClass = readClassName(hwnd);
  const title = readWindowText(hwnd);

  const pidOut = [0];
  const tid = _GetWindowThreadProcessId(hwnd, pidOut);
  let focusClass = "";

  if (tid) {
    const info = {
      cbSize: koffi.sizeof(_GUITHREADINFO),
      flags: 0,
      hwndActive: 0,
      hwndFocus: 0,
      hwndCapture: 0,
      hwndMenuOwner: 0,
      hwndMoveSize: 0,
      hwndCaret: 0,
      rcCaret: { left: 0, top: 0, right: 0, bottom: 0 },
    };
    if (_GetGUIThreadInfo(tid, info) && info.hwndFocus) {
      focusClass = readClassName(info.hwndFocus);
    }
  }

  return classifyExcelFocus(foregroundClass, focusClass, title);
}

export function isExcelFocused() {
  return getForegroundExcelInfo().isExcel;
}

export function isEditingExcelCell() {
  return getForegroundExcelInfo().isEditing;
}

const UIA_CELL_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$fg = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($null -eq $fg) { exit 0 }

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$win = $fg
while ($null -ne $win -and $win.Current.ClassName -ne 'XLMAIN') {
  $win = $walker.GetParent($win)
}
if ($null -eq $win) { exit 0 }

$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty, 'Name Box'
)
$nameBox = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
$cell = ''
if ($null -ne $nameBox) {
  $vp = $null
  if ($nameBox.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
    $cell = $vp.Current.Value
  } else {
    $editCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit
    )
    $edit = $nameBox.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCond)
    if ($null -ne $edit -and $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
      $cell = $vp.Current.Value
    }
  }
}

@{
  cell = $cell
  focusName = $fg.Current.Name
  focusClass = $fg.Current.ClassName
  title = $win.Current.Name
} | ConvertTo-Json -Compress
`;

/**
 * Normalize cell references like "$B$4" or "b4" -> "B4".
 */
export function normalizeCellRef(cell) {
  return String(cell || "")
    .replace(/\$/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Query the active Excel cell address (e.g., "B4") via Windows UI Automation.
 * Returns null if Excel is not in the foreground or UIA cannot read it.
 */
export async function getActiveExcelCell({ timeoutMs = 1500 } = {}) {
  if (process.platform !== "win32") return null;

  const fg = getForegroundExcelInfo();
  if (!fg.isExcel) return null;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", UIA_CELL_SCRIPT],
      { timeout: timeoutMs, windowsHide: true }
    );
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    const data = JSON.parse(trimmed);
    return {
      cell: normalizeCellRef(data.cell),
      focusName: data.focusName || "",
      focusClass: data.focusClass || fg.focusClass,
      title: data.title || fg.title,
      isEditing: fg.isEditing,
    };
  } catch {
    return null;
  }
}

/**
 * Check if Excel is focused, actively typing in a cell (or formula bar),
 * and optionally whether that cell matches `targetCell` (e.g. "B4").
 */
export async function isTypingInExcelCell(targetCell = null, opts = {}) {
  const fg = getForegroundExcelInfo();
  if (!fg.isExcel || !fg.isEditing) {
    return {
      match: false,
      isExcel: fg.isExcel,
      isEditing: fg.isEditing,
      cell: null,
      focusClass: fg.focusClass,
      title: fg.title,
    };
  }

  if (!targetCell) {
    return {
      match: true,
      isExcel: true,
      isEditing: true,
      cell: null,
      focusClass: fg.focusClass,
      title: fg.title,
    };
  }

  const active = await getActiveExcelCell(opts);
  const expected = normalizeCellRef(targetCell);
  const actual = active ? active.cell : "";

  return {
    match: Boolean(actual && actual === expected),
    isExcel: true,
    isEditing: true,
    cell: actual || null,
    focusClass: fg.focusClass,
    title: fg.title,
  };
}
