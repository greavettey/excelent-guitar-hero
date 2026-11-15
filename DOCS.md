# Guitar Hero X-Plorer → ESP32-S3 → Node.js Bridge Documentation

Reference documentation for the **ESP32-S3 firmware** (`firmware/`) and the **minimal Node.js BLE server** (`server/`).

---

## 1. System Overview

```
[X-Plorer USB Controller]
        │  USB 1.1/2.0 (GPIO 19 D-, GPIO 20 D+)
        ▼
[ESP32-S3 Firmware (ESP-IDF + NimBLE)]
        │  BLE GATT Notify (7a420002...) or Manufacturer Beacon (0xFFFF)
        │  12-byte CRC-8 protected frame
        ▼
[Node.js Server (server/src/server.js)]
        ├── protocol.js    (decode 12-byte packet + CRC-8 + bitmask helpers)
        ├── excelState.js  (Win32 focus class + UIA active cell helpers)
        └── keyInjector.js (Win32 SendInput keyboard + mouse injection)
```

---

## 2. Hardware & Firmware (`firmware/`)

Target board: **Freenove ESP32-S3-WROOM** (`board = freenove_esp32_s3_wroom`, PlatformIO `espidf`).

### GPIO & Port Pinout
| Function | Pin / Port | Notes |
|---|---|---|
| USB Host **D-** | **`GPIO 19`** | Fixed to internal ESP32-S3 USB PHY (`skip_phy_setup = false`), wired to the board's `USB` OTG port |
| USB Host **D+** | **`GPIO 20`** | Fixed to internal ESP32-S3 USB PHY, wired to the board's `USB` OTG port |
| Status LED | **`GPIO 2`** | Fast blink (`150 ms`): waiting for USB; Slow blink (`600 ms`): USB ready / waiting for BLE; Solid ON: USB + BLE subscribed |
| Serial Console | `UART0` | Connected to the board's `UART` USB-C port (`CONFIG_ESP_CONSOLE_UART_DEFAULT=y`) |

> **Power note:** When powering the ESP32-S3 only from the `UART` port, Schottky diodes may block 5V backfeed to the `USB` OTG port. If the guitar's ring LED does not light up, use a powered USB OTG Y-splitter or supply 5V to VBUS.

### Firmware Modules
- [`firmware/src/bitmask.h`](firmware/src/bitmask.h) — Shared 17-bit bitmask flags, `xplorer_led_mode_t` enum, 12-byte `xplorer_ble_packet_t` struct, and `xplorer_crc8()`.
- [`firmware/src/xplorer_usb.h`](firmware/src/xplorer_usb.h) / [`firmware/src/xplorer_usb.c`](firmware/src/xplorer_usb.c) — Native ESP-IDF USB Host XInput driver (`xplorer_usb_init`, `xplorer_usb_set_led`, `xplorer_usb_is_connected`).
  - **D-Pad Up / Down:** On the Xbox 360 X-Plorer hardware, the strum bar shares XInput bits `0x01` and `0x02` with D-Pad Up and Down (`XPLORER_BIT_STRUM_UP`, `XPLORER_BIT_STRUM_DOWN`).
- [`firmware/src/ble_server.h`](firmware/src/ble_server.h) / [`firmware/src/ble_server.c`](firmware/src/ble_server.c) — NimBLE GATT server (`ble_server_init`, `ble_server_send_packet`, `ble_server_is_subscribed`) + live Scan Response Manufacturer Data (`0xFFFF`).
  - Device name: `XPlorer-BT`
  - Service UUID: `7a420001-9f3c-4b8e-a12d-6f8b3c1e9a00`
  - State Char UUID (Read + Notify): `7a420002-9f3c-4b8e-a12d-6f8b3c1e9a00`
  - LED Char UUID (Write / Write-No-Rsp): `7a420003-9f3c-4b8e-a12d-6f8b3c1e9a00`
- [`firmware/src/main.c`](firmware/src/main.c) — FreeRTOS queue + BLE dispatch task (sends on state change + 1000 ms keepalive when subscribed) and `GPIO 2` status LED task.

### Build & Flash
```bash
pio run -d firmware -t upload
pio device monitor -d firmware
```

---

## 3. Wire Protocol (`bitmask.h` & `server/src/protocol.js`)

### 12-Byte BLE Packet (`xplorer_ble_packet_t`, little-endian)
| Offset | Size | Field | Description |
|---|---|---|---|
| `0` | 1 | `magic` | Always `0xA5` |
| `1` | 1 | `status_flags` | Bit `0`: USB connected; Bits `1..4`: active LED mode |
| `2` | 2 | `seq` | Rolling `uint16` sequence number |
| `4` | 4 | `bitmask` | 17-bit controller state bitmask (`uint32`) |
| `8` | 2 | `whammy_raw` | Raw XInput `sThumbRX` (`int16`) |
| `10` | 1 | `tilt_pct` | Normalized tilt `-100..100` (`int8`) |
| `11` | 1 | `crc8` | CRC-8 (`poly 0x07`, `init 0x00`) over bytes `0..10` |

### Bitmask Layout (`server/src/protocol.js`)
| Bits | Constant(s) | Meaning |
|---|---|---|
| `0..4` | `BIT_GREEN`, `BIT_RED`, `BIT_YELLOW`, `BIT_BLUE`, `BIT_ORANGE` | 5 fret buttons |
| `5..6` | `BIT_STRUM_UP`, `BIT_STRUM_DOWN` | Strum bar / D-Pad Up & Down |
| `7..8` | `BIT_DPAD_LEFT`, `BIT_DPAD_RIGHT` | D-Pad Left & Right |
| `9..11` | `BIT_START`, `BIT_BACK`, `BIT_GUIDE` | Start, Back, Xbox Guide |
| `12..14` | `WHAMMY_MASK` (`0x7 << 12`) | Quantized whammy level `0..7` |
| `15..16` | `TILT_MASK` (`0x3 << 15`) | Quantized tilt level `0..2` *(masked out in `server.js`)* |

---

## 4. Node.js Server (`server/`)

Dependencies: `@stoprocent/noble` (BLE) and `koffi` (Win32 FFI).

### Entry Point: [`server/src/server.js`](server/src/server.js)
- `MinimalBleClient` scans for `XPlorer-BT`, connects over GATT (or sniffs manufacturer data with `--transport beacon`), decodes the 12-byte packet, strips `TILT_MASK`, logs `[DATA]`, and calls `handleBitmask(bitmask)` whenever `bitmask` changes.
- **Current mappings in `handleBitmask(bitmask, prevMask)`**:
  - **Alphabet Mode (`whammy >= 2`)**: 5-bit binary fret chord (`1..26`) + Strum Down (`a..z`) or Strum Up (`A..Z`). See [Section 5](#5-alphabet-chords-whammy--frets--strum).
  - **Normal Mode (`W0` / `W1`, `WHAMMY_MASK` stripped)**:
    - `BIT_ORANGE | BIT_STRUM_DOWN` → `space`
    - `BIT_BLUE | BIT_ORANGE` → `tab`
    - `BIT_GREEN | BIT_YELLOW | BIT_ORANGE` → `esc`
    - `FRET_MASK` (`G+R+Y+B+O`) → `ctrl+s`, `ctrl+w`
    - `BIT_DPAD_LEFT` / `BIT_DPAD_RIGHT` → `left` / `right`
    - `BIT_STRUM_UP` / `BIT_STRUM_DOWN` → `up` / `down`
    - `BIT_BACK` / `BIT_START` → left / right mouse click
    - `BIT_GUIDE + ...` → Excel shortcuts & formulas. See [Section 6](#6-common-excel-shortcuts--formulas).
- **CLI flags**:
  - `--transport <gatt|beacon>` (default `gatt`)
  - `--changes-only` (only log when `bitmask` or `usbConnected` changes)
  - `--dry-run` (skip Win32 `SendInput` / `SetCursorPos`)
  - `--demo` (start in demo mode: any button/strum press advances through the active Excel sequence in [`server/src/demoSequence.js`](server/src/demoSequence.js))
  - `--demo-seq <name|1-4>` (select sequence: `battle`, `boss`, `excuses`, or `image`)
  - **Live Demo Toggle & Switching** (works even when launched normally without `--demo`):
    - Guitar: `GUIDE + START` toggles Demo Mode ON/OFF; `GUIDE + BACK` cycles between the 4 sequences (`battle` → `boss` → `excuses` → `image`)
    - Terminal: `d` + Enter toggles Demo Mode; `n` + Enter switches sequence; `r` + Enter resets step to 1

### Key & Mouse Injector: [`server/src/keyInjector.js`](server/src/keyInjector.js)
Uses `user32.dll` (`SendInput`, `SetCursorPos`) via `koffi`:
- `sendKey(key, { dryRun })` — tap a single key (`"a"`, `"enter"`, `"up"`, `"f5"`, etc.)
- `sendCombo(keys, { dryRun })` — press & release a chord (`["ctrl", "c"]`, `["alt", "tab"]`)
- `sendText(text, { dryRun })` — type arbitrary Unicode text
- `moveMouse(x, y, { dryRun })` — move cursor to screen pixel `(x, y)`
- `sendClick(button = "left", { x, y, count = 1, dryRun })` — `"left"`, `"right"`, or `"middle"` click(s)
- `releaseAllModifiers()` — releases `ctrl`, `shift`, `alt`, `win` (called on disconnect and `SIGINT`)

### Excel Focus & Cell Helpers: [`server/src/excelState.js`](server/src/excelState.js)
- **Fast synchronous Win32 helpers** (`GetForegroundWindow` + `GetGUIThreadInfo` + `GetClassNameW`):
  - `getForegroundExcelInfo()` → `{ isExcel, isEditing, isEditingCell, isFormulaBar, isGrid, foregroundClass, focusClass, title }`
    - `XLMAIN` = Excel window; `EXCEL6` = in-cell editor; `EXCEL<` / `RICHEDIT*` = formula bar; `EXCEL7` = worksheet grid
  - `isExcelFocused()` → `boolean`
  - `isEditingExcelCell()` → `boolean`
- **Async UI Automation helpers** (reads active cell address via PowerShell UIA):
  - `getActiveExcelCell({ timeoutMs })` → `{ cell, focusName, focusClass, title, isEditing } | null` (e.g. `cell: "B4"`)
  - `isTypingInExcelCell(targetCell?, opts?)` → `{ match, isExcel, isEditing, cell, focusClass, title }`
  - `normalizeCellRef(cell)` — normalizes `"$b$12"` → `"B12"`

### Run & Test
```bash
cd server
npm install
npm test
npm start
```

---

## 5. Alphabet Chords (`Whammy >= 2` + Frets + Strum)

Hold the **Whammy bar** (`W2..W7`) + hold a **5-bit binary fret chord** (`G=1, R=2, Y=4, B=8, O=16`):
- **Strum Down** (`BIT_STRUM_DOWN` edge) → lowercase **`a`–`z`**
- **Strum Up** (`BIT_STRUM_UP` edge) → uppercase **`A`–`Z`**

| Value | Binary (`O B Y R G`) | Fret Chord | Lowercase (SD) | Uppercase (SU) |
|---|---|---|---|---|
| `1` | `00001` | `G` | `a` | `A` |
| `2` | `00010` | `R` | `b` | `B` |
| `3` | `00011` | `G + R` | `c` | `C` |
| `4` | `00100` | `Y` | `d` | `D` |
| `5` | `00101` | `G + Y` | `e` | `E` |
| `6` | `00110` | `R + Y` | `f` | `F` |
| `7` | `00111` | `G + R + Y` | `g` | `G` |
| `8` | `01000` | `B` | `h` | `H` |
| `9` | `01001` | `G + B` | `i` | `I` |
| `10` | `01010` | `R + B` | `j` | `J` |
| `11` | `01011` | `G + R + B` | `k` | `K` |
| `12` | `01100` | `Y + B` | `l` | `L` |
| `13` | `01101` | `G + Y + B` | `m` | `M` |
| `14` | `01110` | `R + Y + B` | `n` | `N` |
| `15` | `01111` | `G + R + Y + B` | `o` | `O` |
| `16` | `10000` | `O` | `p` | `P` |
| `17` | `10001` | `G + O` | `q` | `Q` |
| `18` | `10010` | `R + O` | `r` | `R` |
| `19` | `10011` | `G + R + O` | `s` | `S` |
| `20` | `10100` | `Y + O` | `t` | `T` |
| `21` | `10101` | `G + Y + O` | `u` | `U` |
| `22` | `10110` | `R + Y + O` | `v` | `V` |
| `23` | `10111` | `G + R + Y + O` | `w` | `W` |
| `24` | `11000` | `B + O` | `x` | `X` |
| `25` | `11001` | `G + B + O` | `y` | `Y` |
| `26` | `11010` | `R + B + O` | `z` | `Z` |

---

## 6. Common Excel Shortcuts & Formulas (`GUIDE` Layer)

All Excel shortcuts and formulas are gated on **`BIT_GUIDE`** (with `whammy < 2`), so they never collide with existing neck mappings.

### Editing & Clipboard (`GUIDE` + Fret / D-Pad / Strum)
| Combo | Action | Description |
|---|---|---|
| `GUIDE + G` | `Enter` | Confirm cell / move down |
| `GUIDE + R` | `F2` | Edit active cell |
| `GUIDE + Y` | `Ctrl + Z` | Undo |
| `GUIDE + B` | `Ctrl + C` | Copy |
| `GUIDE + O` | `Ctrl + V` | Paste |
| `GUIDE + SU` | `Alt + =` | AutoSum |
| `GUIDE + SD` | `Ctrl + ;` | Insert today's date |
| `GUIDE + DL` | `Backspace` | Delete character left |
| `GUIDE + DR` | `Delete` | Clear cell / delete right |

### Common Excel Formulas (`GUIDE` + Fret + `Strum Down`)
| Combo | Text Typed | Purpose |
|---|---|---|
| `GUIDE + G + SD` | `=SUM(` | Sum a range |
| `GUIDE + R + SD` | `=AVERAGE(` | Average of a range |
| `GUIDE + Y + SD` | `=COUNT(` | Count numeric cells |
| `GUIDE + B + SD` | `=IF(` | Conditional logic |
| `GUIDE + O + SD` | `=XLOOKUP(` | Modern lookup formula |

