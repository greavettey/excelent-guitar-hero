#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "bitmask.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*xplorer_state_cb_t)(
    uint32_t bitmask,
    int16_t whammy_raw,
    int8_t tilt_pct,
    bool usb_connected,
    void *user_ctx
);

/**
 * @brief Initialize ESP32-S3 USB Host library and start X-Plorer polling tasks.
 */
esp_err_t xplorer_usb_init(xplorer_state_cb_t state_cb, void *user_ctx);

/**
 * @brief Set the Xbox 360 Guide ring LED pattern on the connected X-Plorer.
 */
esp_err_t xplorer_usb_set_led(xplorer_led_mode_t mode);

/**
 * @brief Returns true if an X-Plorer / XInput controller is currently attached.
 */
bool xplorer_usb_is_connected(void);

#ifdef __cplusplus
}
#endif
