#pragma once

#include <stdbool.h>
#include "esp_err.h"
#include "bitmask.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*ble_led_cmd_cb_t)(xplorer_led_mode_t mode, void *user_ctx);

/**
 * @brief Initialize NimBLE GATT server for broadcasting X-Plorer bitmask frames.
 */
esp_err_t ble_server_init(ble_led_cmd_cb_t led_cb, void *user_ctx);

/**
 * @brief Broadcast a 12-byte bitmask packet via BLE GATT Notification (if subscribed).
 */
esp_err_t ble_server_send_packet(const xplorer_ble_packet_t *pkt);

/**
 * @brief Update the cached latest packet for GATT Read requests.
 */
void ble_server_update_cached_packet(const xplorer_ble_packet_t *pkt);

/**
 * @brief Returns true if a PC client is connected and subscribed to notifications.
 */
bool ble_server_is_subscribed(void);

#ifdef __cplusplus
}
#endif
