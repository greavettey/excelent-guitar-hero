#include <stdio.h>
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "bitmask.h"
#include "xplorer_usb.h"
#include "ble_server.h"

// Freenove ESP32-S3-WROOM onboard status LED (GPIO 2)
#define STATUS_LED_GPIO GPIO_NUM_2

static const char *TAG = "xplorer_main";

typedef struct {
    uint32_t bitmask;
    int16_t  whammy_raw;
    int8_t   tilt_pct;
    bool     usb_connected;
} controller_event_t;

static QueueHandle_t s_evt_queue = NULL;
static uint16_t s_seq = 0;
static volatile xplorer_led_mode_t s_active_led = XPLORER_LED_SEARCHING;

static void on_xplorer_state(uint32_t bitmask, int16_t whammy_raw, int8_t tilt_pct,
                             bool usb_connected, void *user_ctx)
{
    (void)user_ctx;
    if (!s_evt_queue) return;

    controller_event_t evt = {
        .bitmask = bitmask,
        .whammy_raw = whammy_raw,
        .tilt_pct = tilt_pct,
        .usb_connected = usb_connected,
    };

    if (xQueueSend(s_evt_queue, &evt, 0) != pdTRUE) {
        // Queue full: drop oldest item and enqueue freshest bitmask
        controller_event_t dummy;
        xQueueReceive(s_evt_queue, &dummy, 0);
        xQueueSend(s_evt_queue, &evt, 0);
    }
}

static void on_ble_led_cmd(xplorer_led_mode_t mode, void *user_ctx)
{
    (void)user_ctx;
    s_active_led = mode;
    xplorer_usb_set_led(mode);
}

static void ble_dispatch_task(void *arg)
{
    (void)arg;
    controller_event_t evt;
    controller_event_t last_evt = {0};

    while (1) {
        // Wait for controller state change; send periodic keepalive every 1000 ms while subscribed
        if (xQueueReceive(s_evt_queue, &evt, pdMS_TO_TICKS(1000)) == pdTRUE) {
            last_evt = evt;
        } else if (!ble_server_is_subscribed()) {
            continue;
        } else {
            evt = last_evt;
            evt.usb_connected = xplorer_usb_is_connected();
        }

        xplorer_ble_packet_t pkt = {
            .magic = XPLORER_PKT_MAGIC,
            .status_flags = (uint8_t)((evt.usb_connected ? XPLORER_STATUS_USB_CONN : 0U) |
                                      (((uint8_t)s_active_led & 0x0FU) << 1)),
            .seq = s_seq++,
            .bitmask = evt.bitmask,
            .whammy_raw = evt.whammy_raw,
            .tilt_pct = evt.tilt_pct,
            .crc8 = 0,
        };
        pkt.crc8 = xplorer_crc8((const uint8_t *)&pkt, sizeof(pkt) - 1U);

        esp_err_t err = ble_server_send_packet(&pkt);
        if (err == ESP_OK) {
            ESP_LOGD(TAG, "TX seq=%u mask=0x%05lX usb=%d",
                     pkt.seq, (unsigned long)pkt.bitmask, evt.usb_connected);
        }
    }
}

static void status_led_task(void *arg)
{
    (void)arg;
    const gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << STATUS_LED_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    bool level = false;
    while (1) {
        bool usb_ok = xplorer_usb_is_connected();
        bool ble_ok = ble_server_is_subscribed();
        if (usb_ok && ble_ok) {
            gpio_set_level(STATUS_LED_GPIO, 1);
            vTaskDelay(pdMS_TO_TICKS(250));
        } else {
            level = !level;
            gpio_set_level(STATUS_LED_GPIO, level ? 1 : 0);
            vTaskDelay(pdMS_TO_TICKS(usb_ok ? 600 : 150));
        }
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Starting Freenove ESP32-S3-WROOM Guitar Hero X-Plorer -> BLE Bridge");

    s_evt_queue = xQueueCreate(32, sizeof(controller_event_t));
    if (!s_evt_queue) {
        ESP_LOGE(TAG, "Failed to allocate event queue");
        return;
    }

    ESP_ERROR_CHECK(ble_server_init(on_ble_led_cmd, NULL));
    ESP_ERROR_CHECK(xplorer_usb_init(on_xplorer_state, NULL));

    xTaskCreatePinnedToCore(ble_dispatch_task, "ble_tx", 4096, NULL, 5, NULL, 1);
    xTaskCreatePinnedToCore(status_led_task, "status_led", 2048, NULL, 2, NULL, 1);
}
