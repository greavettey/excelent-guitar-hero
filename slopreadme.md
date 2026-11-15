# Guitar Hero X-Plorer -> ESP32-S3 -> Node.js BLE -> Excel & Vim Controller

A complete hardware-to-PC bridge that reads a wired USB **Guitar Hero X-Plorer (Xbox 360 XInput)** controller on an **ESP32-S3**, encodes all controller inputs into a **17-bit hardware bitmask (55,295 non-zero permutations)** broadcast over **BLE** (both **GATT notifications** and **connectionless AirTag-style beacon advertisements**), and collapses those bit combinations in **Node.js** into keyboard inputs **exclusively for Microsoft Excel or Vim/Neovim** — complete with full Guitar Hero gameplay mechanics.

---

## Project Structure

- `firmware/` — **PlatformIO (`espidf`)** project for **Freenove ESP32-S3-WROOM** (`board = freenove_esp32_s3_wroom`)
  - `firmware/platformio.ini` — PlatformIO environment (`freenove_esp32_s3_wroom`, `espidf`, Octal PSRAM + QIO Flash)
  - `firmware/sdkconfig.defaults` — ESP-IDF target, 8MB QIO Flash, Octal PSRAM, NimBLE BLE, USB Host, UART0 console
  - `firmware/src/bitmask.h` — Shared 17-bit controller bitmask & 12-byte CRC-8 BLE frame definition
  - `firmware/src/xplorer_usb.c` — Native USB Host XInput driver (auto-calibrating Whammy & Tilt, 5 ms debounce, Xbox Guide Ring LED feedback)
  - `firmware/src/ble_server.c` — NimBLE GATT Server (`XPlorer-BT`) + live Scan Response Manufacturer Data beacon (`0xFFFF`)
  - `firmware/src/main.c` — USB Host + BLE dispatch coordinator + Freenove GPIO 2 status LED
- `server/` — **Node.js (ESM)** PC Bluetooth server & strict Excel/Vim keyboard injector
  - `server/src/protocol.js` — BLE GATT + AirTag beacon packet codec, CRC-8, bijective 55,296-state ranker
  - `server/src/windowGuard.js` — Strict Win32 foreground allowlist via `koffi` (`EXCEL.EXE` and `Vim`/`Neovim` only)
  - `server/src/keyInjector.js` — Win32 `SendInput` engine via `koffi` with per-step foreground re-verification
  - `server/src/mappingsExcel.js` — 55,295 unique Excel mappings (shortcuts, 300+ worksheet functions, Ribbon KeyTips, counted navigation, Go-To cells, range formulas)
  - `server/src/mappingsVim.js` — 55,295 unique Vim/Neovim mappings (motions, modes, text objects, Ex commands, marks/macros, char searches, line jumps, `[reg][count][op][target]` grammar)
  - `server/src/chaosEngine.js` — All 7 Guitar Hero gameplay mechanics
  - `server/src/mapper.js` — Chord-settling processor & CSV/JSON map exporter
  - `server/src/server.js` — CLI entry point (`@stoprocent/noble` BLE GATT + passive beacon scanner)
  - `server/tests/test_all.js` — Exhaustive `node --test` suite

---

## Baked-In Gameplay Mechanics

1. **Connectionless "AirTag" BLE Mode (`--transport beacon`)**: Sniffs raw BLE advertising manufacturer-data packets from `XPlorer-BT` out of the air with zero pairing or connection (or use `--transport gatt` for connected notifications + bidirectional Guide Ring LED feedback).
2. **120 BPM Metronome & Streak Multiplier**: Hit strums within `±135 ms` of the beat to build a `1x → 2x → 3x → 4x` multiplier (multiplies `Up`/`Down`/`Left`/`Right`/`j`/`k`/`h`/`l`/`w`/`b`/`x`). Strum off-beat and Node sends a fumble penalty (`u` in Vim, `Esc` in Excel).
3. **ASCII Note Highway Riff Gate**: High-power macros (`PivotTable`, `XLOOKUP`, `VBA Editor`, `Goal Seek`, `Remove Duplicates`, `ggVG`, `:%s///gc`, `:q!`, `:bd`, `:sort`) spawn a 6-note scrolling ASCII highway (`G R Y B O`) that you must play cleanly before `SendInput` fires the macro. Miss a note and it sends `Esc`.
4. **Star Power Vertical Tilt Gate**: `Confirm / Enter`, `Save Workbook`, `Save As (F12)`, `:w`, `:wq`, `:wa`, and `:wqa` refuse to fire unless the guitar is tilted vertically (`>= 75°` / `T2`).
5. **Whammy Bar Vibrato Chaos**: Rapidly wiggling the whammy bar (`3+` reversals in `700 ms`, no frets held) pumps `Ctrl+a`/`Ctrl+x` (increment/decrement numbers) in Vim or Increase/Decrease Decimal in Excel.
6. **Rock Meter Shame Lockout**: Strumming while focused on any non-Excel/non-Vim window drops the Rock Meter `-15`. At `0`, you're **BOOED OFF STAGE** and locked out of *all* inputs until you focus Excel/Vim and complete a 5-strum recovery solo.
7. **5-Bit Binary "Baudot" Chord Typing**: Hold `GUIDE + frets (1..31) + STRUM_DOWN` to finger-spell arbitrary characters in 5-bit binary (`1..26` = `a..z` or `A..Z` with tilt, `27` = `=`, `28` = `(`, `29` = `:`, `30` = `/`, `31` = `)`).

Pass `--vanilla` to disable mechanics #2–#6 if you ever want pure un-gated controller input.

---

## Hardware Wiring (Freenove ESP32-S3-WROOM)

The **Freenove ESP32-S3-WROOM** board has **two USB-C ports**:
- **`UART` port** (CH343/CP2102 bridge): Plug this into your PC (or a 5V USB power supply) to **flash, monitor serial logs, and power the board**.
- **`USB` port** (native ESP32-S3 USB-OTG on `GPIO 19` / `GPIO 20`): Connect the **Guitar Hero X-Plorer** here using a USB-C-to-USB-A OTG adapter.

> **Important 5V VBUS Power Note:** On the Freenove ESP32-S3-WROOM, Schottky protection diodes between the `UART` and `USB` ports prevent backfeeding 5V out to bus-powered USB Host devices when powered only via `UART`. If the guitar's Xbox ring LEDs do not light up when plugged into the `USB` OTG port, use a **powered USB OTG Y-splitter** (or inject `+5V` / `GND` directly to the X-Plorer's USB VBUS/GND from the board's `5V` pin or an external 5V supply).

### Freenove Onboard Status LED (`GPIO 2`)
- **Fast blink (`150 ms`)**: Waiting for Guitar Hero X-Plorer on `USB` OTG port
- **Slow blink (`600 ms`)**: Guitar connected via USB, waiting for PC BLE connection (or broadcasting in AirTag beacon mode)
- **Solid ON**: Guitar connected + PC subscribed over BLE GATT

---

## Quick Start

### 1. Build & Flash to Freenove ESP32-S3-WROOM with PlatformIO
Open the `firmware/` directory in VS Code with the PlatformIO extension (plug your USB cable into the Freenove **`UART`** port), or run from the repo root:
```bash
pio run -d firmware -t upload
pio device monitor -d firmware
```
*(If upload stalls at `Connecting...`, hold the **BOOT** button on the Freenove board, tap **RST**, and release **BOOT** once flashing begins.)*

### 2. Run Node.js PC Server (Windows)
```bash
cd server
npm install
npm start
# or AirTag connectionless mode:
node src/server.js --transport beacon --verbose
# or interactive terminal simulator (no Bluetooth hardware needed):
node src/server.js --simulate
# or export all 55,295 Excel & Vim mappings:
node src/server.js --export-map ../mappings.csv --export-format csv
```

### 3. Run Tests
```bash
cd server
npm test
```
