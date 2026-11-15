/**
 * Strict Windows foreground-application guard via Koffi Win32 FFI:
 * Allows ONLY Microsoft Excel or Vim/Neovim.
 */

import path from "node:path";
import koffi from "koffi";

export const TargetApp = Object.freeze({
  NONE: "none",
  EXCEL: "excel",
  VIM: "vim",
});

export const EXCEL_EXES = new Set(["excel.exe"]);

export const DIRECT_VIM_EXES = new Set([
  "gvim.exe",
  "vim.exe",
  "nvim.exe",
  "nvim-qt.exe",
  "neovide.exe",
  "goneovim.exe",
  "fvim.exe",
  "vimr.exe",
]);

export const TERMINAL_HOST_EXES = new Set([
  "windowsterminal.exe",
  "conhost.exe",
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "alacritty.exe",
  "wezterm-gui.exe",
  "mintty.exe",
  "kitty.exe",
  "tabby.exe",
  "hyper.exe",
]);

const SINGLE_CONSOLE_EXES = new Set(["conhost.exe", "cmd.exe", "powershell.exe", "pwsh.exe"]);

const VIM_TITLE_RE =
  /(?:^|\s-\s)(?:N?VIM|GVIM)(?:\d+)?$|^(?:Administrator:\s+)?(?:n?vim|gvim)(?:\.exe)?(?:\s+.*)?$/i;

export function classifyWindow(processName, _className, title, hasVimChild = false) {
  const proc = (processName || "").trim().toLowerCase();
  const ttl = (title || "").trim();

  if (!proc) return TargetApp.NONE;
  if (EXCEL_EXES.has(proc)) return TargetApp.EXCEL;
  if (DIRECT_VIM_EXES.has(proc)) return TargetApp.VIM;

  if (TERMINAL_HOST_EXES.has(proc)) {
    if (VIM_TITLE_RE.test(ttl)) return TargetApp.VIM;
    if (SINGLE_CONSOLE_EXES.has(proc) && hasVimChild) return TargetApp.VIM;
    return TargetApp.NONE;
  }

  return TargetApp.NONE;
}

let winApi = null;

function initWinApi() {
  if (winApi || process.platform !== "win32") return winApi;

  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");

  const PROCESSENTRY32W = koffi.struct("PROCESSENTRY32W", {
    dwSize: "uint32",
    cntUsage: "uint32",
    th32ProcessID: "uint32",
    th32DefaultHeapID: "uintptr_t",
    th32ModuleID: "uint32",
    cntThreads: "uint32",
    th32ParentProcessID: "uint32",
    pcPriClassBase: "int32",
    dwFlags: "uint32",
    szExeFile: koffi.array("uint16", 260),
  });

  winApi = {
    GetForegroundWindow: user32.func("uintptr_t __stdcall GetForegroundWindow()"),
    GetWindowThreadProcessId: user32.func(
      "uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *lpdwProcessId)"
    ),
    GetWindowTextLengthW: user32.func("int __stdcall GetWindowTextLengthW(uintptr_t hWnd)"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(uintptr_t hWnd, _Out_ uint16 *lpString, int nMaxCount)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(uintptr_t hWnd, _Out_ uint16 *lpClassName, int nMaxCount)"),
    OpenProcess: kernel32.func("uintptr_t __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)"),
    CloseHandle: kernel32.func("int __stdcall CloseHandle(uintptr_t hObject)"),
    QueryFullProcessImageNameW: kernel32.func(
      "int __stdcall QueryFullProcessImageNameW(uintptr_t hProcess, uint32 dwFlags, _Out_ uint16 *lpExeName, _Inout_ uint32 *lpdwSize)"
    ),
    CreateToolhelp32Snapshot: kernel32.func("uintptr_t __stdcall CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)"),
    Process32FirstW: kernel32.func("int __stdcall Process32FirstW(uintptr_t hSnapshot, _Inout_ PROCESSENTRY32W *lppe)"),
    Process32NextW: kernel32.func("int __stdcall Process32NextW(uintptr_t hSnapshot, _Inout_ PROCESSENTRY32W *lppe)"),
    PROCESSENTRY32W,
  };
  return winApi;
}

function utf16ArrayToString(arr) {
  let end = arr.indexOf(0);
  if (end === -1) end = arr.length;
  return Buffer.from(arr.slice(0, end).buffer ? arr.slice(0, end) : Uint16Array.from(arr.slice(0, end))).toString("utf16le");
}

function uint16BufToString(u16, len) {
  const slice = u16.subarray(0, Math.max(0, len));
  return Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString("utf16le");
}

function getProcessName(pid) {
  const api = initWinApi();
  if (!api || !pid) return "";
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const hProc = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!hProc) return "";
  try {
    const buf = new Uint16Array(512);
    const sizeOut = [512];
    if (api.QueryFullProcessImageNameW(hProc, 0, buf, sizeOut)) {
      const fullPath = uint16BufToString(buf, sizeOut[0]);
      return path.basename(fullPath);
    }
    return "";
  } finally {
    api.CloseHandle(hProc);
  }
}

function hasVimDescendant(rootPid) {
  const api = initWinApi();
  if (!api || !rootPid) return false;
  const TH32CS_SNAPPROCESS = 0x00000002;
  const snap = api.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  const invalidHandle = process.arch === "x64" ? 0xffffffffffffffffn : 0xffffffff;
  if (!snap || BigInt(snap) === BigInt(invalidHandle)) return false;

  try {
    const children = new Map();
    const entry = {
      dwSize: koffi.sizeof(api.PROCESSENTRY32W),
      cntUsage: 0,
      th32ProcessID: 0,
      th32DefaultHeapID: 0,
      th32ModuleID: 0,
      cntThreads: 0,
      th32ParentProcessID: 0,
      pcPriClassBase: 0,
      dwFlags: 0,
      szExeFile: new Array(260).fill(0),
    };
    let ok = api.Process32FirstW(snap, entry);
    while (ok) {
      const exe = utf16ArrayToString(entry.szExeFile).toLowerCase();
      if (!children.has(entry.th32ParentProcessID)) {
        children.set(entry.th32ParentProcessID, []);
      }
      children.get(entry.th32ParentProcessID).push([entry.th32ProcessID, exe]);
      ok = api.Process32NextW(snap, entry);
    }

    const stack = [rootPid];
    const visited = new Set();
    while (stack.length > 0) {
      const cur = stack.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const [childPid, exe] of children.get(cur) || []) {
        if (exe === "vim.exe" || exe === "nvim.exe") return true;
        stack.push(childPid);
      }
    }
    return false;
  } finally {
    api.CloseHandle(snap);
  }
}

export function getForegroundWindowInfo() {
  if (process.platform !== "win32") {
    return { target: TargetApp.NONE, hwnd: 0, pid: 0, processName: "", className: "", title: "" };
  }
  const api = initWinApi();
  const hwnd = api.GetForegroundWindow();
  if (!hwnd) {
    return { target: TargetApp.NONE, hwnd: 0, pid: 0, processName: "", className: "", title: "" };
  }

  const pidOut = [0];
  api.GetWindowThreadProcessId(hwnd, pidOut);
  const pid = pidOut[0];
  const processName = getProcessName(pid);

  const clsBuf = new Uint16Array(256);
  const clsLen = api.GetClassNameW(hwnd, clsBuf, 256);
  const className = uint16BufToString(clsBuf, clsLen);

  const titleLen = api.GetWindowTextLengthW(hwnd);
  let title = "";
  if (titleLen > 0) {
    const titleBuf = new Uint16Array(titleLen + 2);
    const copied = api.GetWindowTextW(hwnd, titleBuf, titleLen + 2);
    title = uint16BufToString(titleBuf, copied);
  }

  let vimChild = false;
  if (SINGLE_CONSOLE_EXES.has(processName.toLowerCase()) && !VIM_TITLE_RE.test(title)) {
    vimChild = hasVimDescendant(pid);
  }

  const target = classifyWindow(processName, className, title, vimChild);
  return { target, hwnd: Number(hwnd), pid, processName, className, title };
}
