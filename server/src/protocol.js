/**
 * Shared BLE protocol (GATT + Connectionless AirTag Beacon), bitmask definitions,
 * and bijective 55,296-state permutation ranker.
 */

export const SERVICE_UUID = "7a4200019f3c4b8ea12d6f8b3c1e9a00";
export const SERVICE_UUID_DASHED = "7a420001-9f3c-4b8e-a12d-6f8b3c1e9a00";
export const STATE_CHAR_UUID = "7a4200029f3c4b8ea12d6f8b3c1e9a00";
export const LED_CHAR_UUID = "7a4200039f3c4b8ea12d6f8b3c1e9a00";
export const DEVICE_NAME = "XPlorer-BT";
export const MFG_COMPANY_ID = 0xffff;

// 17-bit controller bitmask flags (must match firmware/main/bitmask.h)
export const BIT_GREEN = 1 << 0;
export const BIT_RED = 1 << 1;
export const BIT_YELLOW = 1 << 2;
export const BIT_BLUE = 1 << 3;
export const BIT_ORANGE = 1 << 4;

export const BIT_STRUM_UP = 1 << 5;
export const BIT_STRUM_DOWN = 1 << 6;
export const BIT_DPAD_LEFT = 1 << 7;
export const BIT_DPAD_RIGHT = 1 << 8;

export const BIT_START = 1 << 9;
export const BIT_BACK = 1 << 10;
export const BIT_GUIDE = 1 << 11;

export const WHAMMY_SHIFT = 12;
export const WHAMMY_MASK = 0x7 << WHAMMY_SHIFT;

export const TILT_SHIFT = 15;
export const TILT_MASK = 0x3 << TILT_SHIFT;

export const FRET_MASK = BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE | BIT_ORANGE;
export const STRUM_MASK = BIT_STRUM_UP | BIT_STRUM_DOWN;
export const DPAD_LR_MASK = BIT_DPAD_LEFT | BIT_DPAD_RIGHT;
export const SYS_MASK = BIT_START | BIT_BACK | BIT_GUIDE;

// Xbox 360 Guide Ring LED codes
export const LED_OFF = 0x00;
export const LED_SEARCHING = 0x01;
export const LED_EXCEL = 0x06;
export const LED_VIM = 0x07;
export const LED_BLOCKED = 0x0a;

export const PKT_MAGIC = 0xa5;
export const PKT_SIZE = 12;
export const STATUS_USB_CONN = 1 << 0;

// 32 frets * 3 strum * 3 dpad_lr * 8 sys * 8 whammy * 3 tilt = 55,296 (55,295 non-zero)
export const TOTAL_VALID_STATES = 32 * 3 * 3 * 8 * 8 * 3;
export const TOTAL_NONZERO_STATES = TOTAL_VALID_STATES - 1;

export function crc8(buf) {
  let crc = 0x00;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let b = 0; b < 8; b++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc;
}

export function decodePacket(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }
  if (buf.length !== PKT_SIZE) {
    throw new Error(`Expected ${PKT_SIZE} bytes, got ${buf.length}`);
  }
  const magic = buf.readUInt8(0);
  if (magic !== PKT_MAGIC) {
    throw new Error(`Invalid magic 0x${magic.toString(16).padStart(2, "0")}`);
  }
  const expectedCrc = crc8(buf.subarray(0, PKT_SIZE - 1));
  const actualCrc = buf.readUInt8(PKT_SIZE - 1);
  if (actualCrc !== expectedCrc) {
    throw new Error(`CRC mismatch: got 0x${actualCrc.toString(16)}, expected 0x${expectedCrc.toString(16)}`);
  }
  const statusFlags = buf.readUInt8(1);
  return {
    magic,
    statusFlags,
    usbConnected: Boolean(statusFlags & STATUS_USB_CONN),
    seq: buf.readUInt16LE(2),
    bitmask: buf.readUInt32LE(4),
    whammyRaw: buf.readInt16LE(8),
    tiltPct: buf.readInt8(10),
    crc: actualCrc,
  };
}

export function encodePacket({
  bitmask = 0,
  seq = 0,
  usbConnected = true,
  ledMode = LED_SEARCHING,
  whammyRaw = 0,
  tiltPct = 0,
} = {}) {
  const buf = Buffer.alloc(PKT_SIZE);
  const statusFlags = (usbConnected ? STATUS_USB_CONN : 0) | ((ledMode & 0x0f) << 1);
  buf.writeUInt8(PKT_MAGIC, 0);
  buf.writeUInt8(statusFlags & 0xff, 1);
  buf.writeUInt16LE(seq & 0xffff, 2);
  buf.writeUInt32LE(bitmask >>> 0, 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, whammyRaw)), 8);
  buf.writeInt8(Math.max(-100, Math.min(100, tiltPct)), 10);
  buf.writeUInt8(crc8(buf.subarray(0, PKT_SIZE - 1)), 11);
  return buf;
}

export function encodeBeaconMfgData(opts = {}) {
  const pkt = encodePacket(opts);
  const mfg = Buffer.alloc(2 + PKT_SIZE);
  mfg.writeUInt16LE(MFG_COMPANY_ID, 0);
  pkt.copy(mfg, 2);
  return mfg;
}

export function decodeBeaconMfgData(mfgBuf) {
  if (!Buffer.isBuffer(mfgBuf)) {
    mfgBuf = Buffer.from(mfgBuf);
  }
  if (mfgBuf.length !== 2 + PKT_SIZE) {
    throw new Error(`Invalid beacon length ${mfgBuf.length}`);
  }
  const companyId = mfgBuf.readUInt16LE(0);
  if (companyId !== MFG_COMPANY_ID) {
    throw new Error(`Unexpected company ID 0x${companyId.toString(16)}`);
  }
  return decodePacket(mfgBuf.subarray(2));
}

export function whammyBits(level) {
  return (Math.max(0, Math.min(7, level)) & 0x7) << WHAMMY_SHIFT;
}

export function tiltBits(level) {
  return (Math.max(0, Math.min(2, level)) & 0x3) << TILT_SHIFT;
}

export function getWhammyLevel(mask) {
  return (mask >> WHAMMY_SHIFT) & 0x7;
}

export function getTiltLevel(mask) {
  return Math.min((mask >> TILT_SHIFT) & 0x3, 2);
}

export function normalizeBitmask(mask) {
  const frets = mask & 0x1f;
  let strum = mask & STRUM_MASK;
  if (strum === STRUM_MASK) strum = BIT_STRUM_DOWN;
  let dpad = mask & DPAD_LR_MASK;
  if (dpad === DPAD_LR_MASK) dpad = BIT_DPAD_RIGHT;
  const sysBits = mask & SYS_MASK;
  const whammy = (mask >> WHAMMY_SHIFT) & 0x7;
  const tilt = Math.min((mask >> TILT_SHIFT) & 0x3, 2);
  return frets | strum | dpad | sysBits | (whammy << WHAMMY_SHIFT) | (tilt << TILT_SHIFT);
}

export function rankBitmask(mask) {
  const m = normalizeBitmask(mask);
  const frets = m & 0x1f;
  const strum = m & BIT_STRUM_UP ? 1 : m & BIT_STRUM_DOWN ? 2 : 0;
  const dpad = m & BIT_DPAD_LEFT ? 1 : m & BIT_DPAD_RIGHT ? 2 : 0;
  const sysVal = (m >> 9) & 0x07;
  const whammy = (m >> WHAMMY_SHIFT) & 0x07;
  const tilt = (m >> TILT_SHIFT) & 0x03;
  return ((((frets * 3 + strum) * 3 + dpad) * 8 + sysVal) * 8 + whammy) * 3 + tilt;
}

export function unrankBitmask(rank) {
  if (rank < 0 || rank >= TOTAL_VALID_STATES) {
    throw new RangeError(`Rank ${rank} out of range [0, ${TOTAL_VALID_STATES})`);
  }
  const tilt = rank % 3;
  let q = Math.floor(rank / 3);
  const whammy = q % 8;
  q = Math.floor(q / 8);
  const sysVal = q % 8;
  q = Math.floor(q / 8);
  const dpad = q % 3;
  q = Math.floor(q / 3);
  const strum = q % 3;
  const frets = Math.floor(q / 3);

  let mask = frets;
  if (strum === 1) mask |= BIT_STRUM_UP;
  else if (strum === 2) mask |= BIT_STRUM_DOWN;
  if (dpad === 1) mask |= BIT_DPAD_LEFT;
  else if (dpad === 2) mask |= BIT_DPAD_RIGHT;
  mask |= sysVal << 9;
  mask |= whammy << WHAMMY_SHIFT;
  mask |= tilt << TILT_SHIFT;
  return mask;
}

export function* iterAllValidBitmasks() {
  for (let r = 1; r < TOTAL_VALID_STATES; r++) {
    yield unrankBitmask(r);
  }
}

export function formatBitmask(mask) {
  if (mask === 0) return "IDLE";
  const parts = [];
  const names = [
    [BIT_GREEN, "G"],
    [BIT_RED, "R"],
    [BIT_YELLOW, "Y"],
    [BIT_BLUE, "B"],
    [BIT_ORANGE, "O"],
    [BIT_STRUM_UP, "SU"],
    [BIT_STRUM_DOWN, "SD"],
    [BIT_DPAD_LEFT, "DL"],
    [BIT_DPAD_RIGHT, "DR"],
    [BIT_START, "START"],
    [BIT_BACK, "BACK"],
    [BIT_GUIDE, "GUIDE"],
  ];
  for (const [bit, name] of names) {
    if (mask & bit) parts.push(name);
  }
  const w = getWhammyLevel(mask);
  if (w) parts.push(`W${w}`);
  const t = getTiltLevel(mask);
  if (t) parts.push(`T${t}`);
  return parts.join("+");
}
