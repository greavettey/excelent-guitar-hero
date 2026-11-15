#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Guitar Hero X-Plorer Controller -> 32-bit Bitmask Specification
// ============================================================================
// Bits 0..4   : 5 Fret Buttons (32 combinations)
// Bits 5..6   : Strum Bar Up / Down (3 physical states: none, up, down)
// Bits 7..8   : D-Pad Left / Right (3 physical states: none, left, right)
// Bits 9..11  : Start, Back (Star Power), Xbox Guide (8 combinations)
// Bits 12..14 : Quantized Whammy Bar level 0..7 (8 states)
// Bits 15..16 : Quantized Tilt Sensor level 0..2 (3 states: level, 45deg, 90deg)
//
// Total distinct simultaneous valid hardware permutations:
//   32 * 3 * 3 * 8 * 8 * 3 = 55,296 states (55,295 non-zero states)
// ============================================================================

#define XPLORER_BIT_GREEN       (1UL << 0)
#define XPLORER_BIT_RED         (1UL << 1)
#define XPLORER_BIT_YELLOW      (1UL << 2)
#define XPLORER_BIT_BLUE        (1UL << 3)
#define XPLORER_BIT_ORANGE      (1UL << 4)

#define XPLORER_BIT_STRUM_UP    (1UL << 5)
#define XPLORER_BIT_STRUM_DOWN  (1UL << 6)
#define XPLORER_BIT_DPAD_LEFT   (1UL << 7)
#define XPLORER_BIT_DPAD_RIGHT  (1UL << 8)

#define XPLORER_BIT_START       (1UL << 9)
#define XPLORER_BIT_BACK        (1UL << 10)
#define XPLORER_BIT_GUIDE       (1UL << 11)

#define XPLORER_WHAMMY_SHIFT    12U
#define XPLORER_WHAMMY_MASK     (0x7UL << XPLORER_WHAMMY_SHIFT)

#define XPLORER_TILT_SHIFT      15U
#define XPLORER_TILT_MASK       (0x3UL << XPLORER_TILT_SHIFT)

// BLE Packet Protocol Constants
#define XPLORER_PKT_MAGIC       0xA5U
#define XPLORER_STATUS_USB_CONN (1U << 0)

// Xbox 360 Ring LED Modes (written by PC server over BLE to indicate target app)
typedef enum {
    XPLORER_LED_OFF         = 0x00, // Off
    XPLORER_LED_SEARCHING   = 0x01, // All blinking (waiting for BLE / USB)
    XPLORER_LED_EXCEL       = 0x06, // Player 1 solid (Excel active)
    XPLORER_LED_VIM         = 0x07, // Player 2 solid (Vim active)
    XPLORER_LED_BLOCKED     = 0x0A, // Rotating / alternating (non-Excel/Vim blocked)
} xplorer_led_mode_t;

// 12-byte packed BLE notification frame (little-endian)
typedef struct __attribute__((packed)) {
    uint8_t  magic;        // Always 0xA5
    uint8_t  status_flags; // Bit 0: USB controller connected, bits 1..4: active LED code
    uint16_t seq;          // Rolling sequence number
    uint32_t bitmask;      // 17-bit controller state bitmask
    int16_t  whammy_raw;   // Raw XInput sThumbRX
    int8_t   tilt_pct;     // Normalized tilt (-100..100)
    uint8_t  crc8;         // CRC-8 (poly 0x07, init 0x00) over bytes [0..10]
} xplorer_ble_packet_t;

_Static_assert(sizeof(xplorer_ble_packet_t) == 12, "xplorer_ble_packet_t must be 12 bytes");

static inline uint8_t xplorer_crc8(const uint8_t *data, size_t len)
{
    uint8_t crc = 0x00;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int b = 0; b < 8; ++b) {
            if (crc & 0x80) {
                crc = (uint8_t)((crc << 1) ^ 0x07U);
            } else {
                crc = (uint8_t)(crc << 1);
            }
        }
    }
    return crc;
}

#ifdef __cplusplus
}
#endif
