#include "xplorer_usb.h"

#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "usb/usb_host.h"
#include "usb/usb_types_ch9.h"

static const char *TAG = "xplorer_usb";

// XInput vendor-specific interface identifiers (Xbox 360 wired controllers, incl. GH X-Plorer)
#define XINPUT_INTF_CLASS       0xFFU
#define XINPUT_INTF_SUBCLASS    0x5DU
#define XINPUT_INTF_PROTOCOL    0x01U

// Debounce window for mechanical switches (frets, strum bar, d-pad)
#define DEBOUNCE_US             5000LL

typedef struct {
    usb_host_client_handle_t client_hdl;
    usb_device_handle_t      dev_hdl;
    uint8_t                  dev_addr;
    uint8_t                  intf_num;
    uint8_t                  alt_setting;
    uint8_t                  ep_in_addr;
    uint16_t                 ep_in_mps;
    uint8_t                  ep_out_addr;
    uint16_t                 ep_out_mps;

    usb_transfer_t          *in_xfer;
    usb_transfer_t          *out_xfer;
    volatile bool            in_xfer_pending;
    volatile bool            out_xfer_pending;
    volatile bool            dev_connected;
    volatile bool            dev_gone;
    volatile bool            intf_claimed;

    xplorer_state_cb_t       state_cb;
    void                    *user_ctx;
    SemaphoreHandle_t        lock;

    // Calibration & debounce state
    bool                     calibrated;
    int32_t                  whammy_rest;
    int32_t                  tilt_rest;
    uint8_t                  whammy_level;
    uint8_t                  tilt_level;
    uint16_t                 stable_digital;
    uint16_t                 candidate_digital;
    int64_t                  bit_change_ts[12];
    uint32_t                 last_bitmask;
    xplorer_led_mode_t       pending_led;
} xplorer_usb_ctx_t;

static xplorer_usb_ctx_t s_usb = {
    .pending_led = XPLORER_LED_SEARCHING,
};

static uint8_t quantize_whammy_hysteresis(int16_t raw, uint8_t prev_level, int32_t *rest_io)
{
    if (raw < *rest_io) {
        *rest_io = raw;
    }
    int32_t span = 32000 - *rest_io;
    if (span < 4000) {
        span = 4000;
    }
    int32_t norm = ((int32_t)raw - *rest_io) * 1000 / span;
    if (norm < 0) norm = 0;
    if (norm > 1000) norm = 1000;

    static const int32_t thresholds[7] = {80, 210, 340, 470, 600, 730, 860};
    const int32_t hyst = 25;

    uint8_t level = prev_level;
    while (level < 7 && norm >= thresholds[level] + hyst) {
        level++;
    }
    while (level > 0 && norm < thresholds[level - 1] - hyst) {
        level--;
    }
    // Clean snap to 0 below deadzone
    if (norm < 40) {
        level = 0;
    }
    return level;
}

static uint8_t quantize_tilt_hysteresis(int16_t raw, uint8_t prev_level, int32_t tilt_rest, int8_t *out_pct)
{
    int32_t delta = (int32_t)raw - tilt_rest;
    int32_t abs_delta = delta < 0 ? -delta : delta;
    int32_t pct = (delta * 100) / 32767;
    if (pct > 100) pct = 100;
    if (pct < -100) pct = -100;
    *out_pct = (int8_t)pct;

    int32_t norm = (abs_delta * 1000) / 32000;
    if (norm > 1000) norm = 1000;

    uint8_t level = prev_level;
    if (level == 0) {
        if (norm >= 720) level = 2;
        else if (norm >= 320) level = 1;
    } else if (level == 1) {
        if (norm >= 720) level = 2;
        else if (norm < 240) level = 0;
    } else {
        if (norm < 240) level = 0;
        else if (norm < 640) level = 1;
    }
    return level;
}

static uint16_t extract_raw_digital_bits(const uint8_t *report)
{
    // Standard 20-byte XInput gamepad packet:
    // report[2] = wButtons low byte, report[3] = wButtons high byte
    uint8_t b_lo = report[2];
    uint8_t b_hi = report[3];
    uint16_t bits = 0;

    // Frets on X-Plorer: Green=A(0x10), Red=B(0x20), Blue=X(0x40), Yellow=Y(0x80), Orange=LB(0x01)
    if (b_hi & 0x10U) bits |= XPLORER_BIT_GREEN;
    if (b_hi & 0x20U) bits |= XPLORER_BIT_RED;
    if (b_hi & 0x80U) bits |= XPLORER_BIT_YELLOW;
    if (b_hi & 0x40U) bits |= XPLORER_BIT_BLUE;
    if (b_hi & 0x01U) bits |= XPLORER_BIT_ORANGE;

    // Strum bar = D-Pad Up / Down
    if (b_lo & 0x01U) bits |= XPLORER_BIT_STRUM_UP;
    if (b_lo & 0x02U) bits |= XPLORER_BIT_STRUM_DOWN;

    // D-Pad Left / Right
    if (b_lo & 0x04U) bits |= XPLORER_BIT_DPAD_LEFT;
    if (b_lo & 0x08U) bits |= XPLORER_BIT_DPAD_RIGHT;

    // Start, Back (Select/Star Power), Xbox Guide
    if (b_lo & 0x10U) bits |= XPLORER_BIT_START;
    if (b_lo & 0x20U) bits |= XPLORER_BIT_BACK;
    if (b_hi & 0x04U) bits |= XPLORER_BIT_GUIDE;

    return bits;
}

static void process_xinput_report(const uint8_t *data, int len)
{
    // Ignore short status packets (e.g. LED/rumble acks 0x01/0x03/0x08)
    if (len < 20 || data[0] != 0x00U || data[1] != 0x14U) {
        return;
    }

    int64_t now = esp_timer_get_time();
    uint16_t raw_digital = extract_raw_digital_bits(data);

    int16_t whammy_raw = (int16_t)((uint16_t)data[10] | ((uint16_t)data[11] << 8));
    int16_t tilt_raw   = (int16_t)((uint16_t)data[12] | ((uint16_t)data[13] << 8));

    if (!s_usb.calibrated) {
        s_usb.calibrated = true;
        s_usb.whammy_rest = (whammy_raw > 16000) ? 0 : (int32_t)whammy_raw;
        s_usb.tilt_rest   = (abs((int)tilt_raw) < 12000) ? 0 : (int32_t)tilt_raw;
        s_usb.whammy_level = 0;
        s_usb.tilt_level = 0;
        s_usb.stable_digital = raw_digital;
        s_usb.candidate_digital = raw_digital;
        for (int i = 0; i < 12; ++i) {
            s_usb.bit_change_ts[i] = now;
        }
    }

    // Per-bit mechanical debounce
    for (int i = 0; i < 12; ++i) {
        uint16_t bit = (uint16_t)(1U << i);
        bool raw_on = (raw_digital & bit) != 0;
        bool cand_on = (s_usb.candidate_digital & bit) != 0;
        bool stab_on = (s_usb.stable_digital & bit) != 0;

        if (raw_on != cand_on) {
            s_usb.candidate_digital = (s_usb.candidate_digital & ~bit) | (raw_on ? bit : 0U);
            s_usb.bit_change_ts[i] = now;
        } else if (raw_on != stab_on && (now - s_usb.bit_change_ts[i]) >= DEBOUNCE_US) {
            s_usb.stable_digital = (s_usb.stable_digital & ~bit) | (raw_on ? bit : 0U);
        }
    }

    // Ensure physical mutual exclusion on Strum Up/Down and D-Pad Left/Right
    uint16_t clean_digital = s_usb.stable_digital;
    if ((clean_digital & (XPLORER_BIT_STRUM_UP | XPLORER_BIT_STRUM_DOWN)) ==
        (XPLORER_BIT_STRUM_UP | XPLORER_BIT_STRUM_DOWN)) {
        clean_digital &= ~XPLORER_BIT_STRUM_UP;
    }
    if ((clean_digital & (XPLORER_BIT_DPAD_LEFT | XPLORER_BIT_DPAD_RIGHT)) ==
        (XPLORER_BIT_DPAD_LEFT | XPLORER_BIT_DPAD_RIGHT)) {
        clean_digital &= ~XPLORER_BIT_DPAD_LEFT;
    }

    int8_t tilt_pct = 0;
    s_usb.whammy_level = quantize_whammy_hysteresis(whammy_raw, s_usb.whammy_level, &s_usb.whammy_rest);
    s_usb.tilt_level   = quantize_tilt_hysteresis(tilt_raw, s_usb.tilt_level, s_usb.tilt_rest, &tilt_pct);

    uint32_t bitmask = (uint32_t)clean_digital
                     | (((uint32_t)s_usb.whammy_level & 0x7UL) << XPLORER_WHAMMY_SHIFT)
                     | (((uint32_t)s_usb.tilt_level & 0x3UL) << XPLORER_TILT_SHIFT);

    if (bitmask != s_usb.last_bitmask) {
        s_usb.last_bitmask = bitmask;
        if (s_usb.state_cb) {
            s_usb.state_cb(bitmask, whammy_raw, tilt_pct, true, s_usb.user_ctx);
        }
    }
}

static void out_transfer_cb(usb_transfer_t *transfer)
{
    s_usb.out_xfer_pending = false;
    if (transfer->status != USB_TRANSFER_STATUS_COMPLETED &&
        transfer->status != USB_TRANSFER_STATUS_CANCELED) {
        ESP_LOGW(TAG, "OUT transfer status=%d", transfer->status);
    }
}

static void in_transfer_cb(usb_transfer_t *transfer)
{
    if (transfer->status == USB_TRANSFER_STATUS_COMPLETED) {
        process_xinput_report(transfer->data_buffer, transfer->actual_num_bytes);
    } else if (transfer->status != USB_TRANSFER_STATUS_CANCELED &&
               transfer->status != USB_TRANSFER_STATUS_NO_DEVICE) {
        ESP_LOGW(TAG, "IN transfer status=%d", transfer->status);
    }

    if (s_usb.dev_connected && !s_usb.dev_gone) {
        esp_err_t err = usb_host_transfer_submit(transfer);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "Resubmit IN transfer failed: %s", esp_err_to_name(err));
            s_usb.in_xfer_pending = false;
        }
    } else {
        s_usb.in_xfer_pending = false;
    }
}

static bool parse_xinput_endpoints(const usb_config_desc_t *cfg)
{
    const uint8_t *p = (const uint8_t *)cfg;
    const uint8_t *end = p + cfg->wTotalLength;

    bool found_xinput_intf = false;
    bool in_target_intf = false;
    uint8_t best_intf = 0;
    uint8_t best_alt = 0;
    uint8_t best_ep_in = 0;
    uint16_t best_ep_in_mps = 32;
    uint8_t best_ep_out = 0;
    uint16_t best_ep_out_mps = 32;

    uint8_t fb_intf = 0;
    uint8_t fb_alt = 0;
    uint8_t fb_ep_in = 0;
    uint16_t fb_ep_in_mps = 32;
    uint8_t fb_ep_out = 0;
    uint16_t fb_ep_out_mps = 32;
    bool in_fb_intf = false;

    while (p + sizeof(usb_standard_desc_t) <= end) {
        const usb_standard_desc_t *desc = (const usb_standard_desc_t *)p;
        if (desc->bLength == 0 || p + desc->bLength > end) {
            break;
        }

        if (desc->bDescriptorType == USB_B_DESCRIPTOR_TYPE_INTERFACE &&
            desc->bLength >= sizeof(usb_intf_desc_t)) {
            const usb_intf_desc_t *intf = (const usb_intf_desc_t *)p;
            in_target_intf = (intf->bInterfaceClass == XINPUT_INTF_CLASS &&
                              intf->bInterfaceSubClass == XINPUT_INTF_SUBCLASS &&
                              intf->bInterfaceProtocol == XINPUT_INTF_PROTOCOL);
            if (in_target_intf && !found_xinput_intf) {
                found_xinput_intf = true;
                best_intf = intf->bInterfaceNumber;
                best_alt = intf->bAlternateSetting;
            }
            in_fb_intf = (intf->bInterfaceNumber == 0 && intf->bAlternateSetting == 0);
            if (in_fb_intf) {
                fb_intf = intf->bInterfaceNumber;
                fb_alt = intf->bAlternateSetting;
            }
        } else if (desc->bDescriptorType == USB_B_DESCRIPTOR_TYPE_ENDPOINT &&
                   desc->bLength >= sizeof(usb_ep_desc_t)) {
            const usb_ep_desc_t *ep = (const usb_ep_desc_t *)p;
            if ((ep->bmAttributes & USB_BM_ATTRIBUTES_XFERTYPE_MASK) == USB_BM_ATTRIBUTES_XFER_INT) {
                bool is_in = (ep->bEndpointAddress & USB_B_ENDPOINT_ADDRESS_EP_DIR_MASK) != 0;
                uint16_t mps = ep->wMaxPacketSize > 0 ? ep->wMaxPacketSize : 32;
                if (in_target_intf) {
                    if (is_in && best_ep_in == 0) {
                        best_ep_in = ep->bEndpointAddress;
                        best_ep_in_mps = mps;
                    } else if (!is_in && best_ep_out == 0) {
                        best_ep_out = ep->bEndpointAddress;
                        best_ep_out_mps = mps;
                    }
                } else if (in_fb_intf) {
                    if (is_in && fb_ep_in == 0) {
                        fb_ep_in = ep->bEndpointAddress;
                        fb_ep_in_mps = mps;
                    } else if (!is_in && fb_ep_out == 0) {
                        fb_ep_out = ep->bEndpointAddress;
                        fb_ep_out_mps = mps;
                    }
                }
            }
        }

        p += desc->bLength;
    }

    if (found_xinput_intf && best_ep_in != 0) {
        s_usb.intf_num = best_intf;
        s_usb.alt_setting = best_alt;
        s_usb.ep_in_addr = best_ep_in;
        s_usb.ep_in_mps = best_ep_in_mps;
        s_usb.ep_out_addr = best_ep_out;
        s_usb.ep_out_mps = best_ep_out_mps;
        return true;
    }
    if (fb_ep_in != 0) {
        s_usb.intf_num = fb_intf;
        s_usb.alt_setting = fb_alt;
        s_usb.ep_in_addr = fb_ep_in;
        s_usb.ep_in_mps = fb_ep_in_mps;
        s_usb.ep_out_addr = fb_ep_out;
        s_usb.ep_out_mps = fb_ep_out_mps;
        return true;
    }
    return false;
}

static void cleanup_usb_device(void)
{
    if (!s_usb.dev_hdl) {
        return;
    }

    if (s_usb.intf_claimed) {
        if (s_usb.ep_in_addr) {
            usb_host_endpoint_halt(s_usb.dev_hdl, s_usb.ep_in_addr);
            usb_host_endpoint_flush(s_usb.dev_hdl, s_usb.ep_in_addr);
        }
        if (s_usb.ep_out_addr) {
            usb_host_endpoint_halt(s_usb.dev_hdl, s_usb.ep_out_addr);
            usb_host_endpoint_flush(s_usb.dev_hdl, s_usb.ep_out_addr);
        }
    }

    // Drain callbacks for halted transfers before freeing
    for (int i = 0; i < 20 && (s_usb.in_xfer_pending || s_usb.out_xfer_pending); ++i) {
        usb_host_client_handle_events(s_usb.client_hdl, pdMS_TO_TICKS(10));
    }

    if (s_usb.in_xfer) {
        usb_host_transfer_free(s_usb.in_xfer);
        s_usb.in_xfer = NULL;
    }
    xSemaphoreTake(s_usb.lock, portMAX_DELAY);
    s_usb.dev_connected = false;
    if (s_usb.out_xfer) {
        usb_host_transfer_free(s_usb.out_xfer);
        s_usb.out_xfer = NULL;
    }
    xSemaphoreGive(s_usb.lock);
    if (s_usb.intf_claimed) {
        usb_host_interface_release(s_usb.client_hdl, s_usb.dev_hdl, s_usb.intf_num);
        s_usb.intf_claimed = false;
    }
    usb_host_device_close(s_usb.client_hdl, s_usb.dev_hdl);
    s_usb.dev_hdl = NULL;
    s_usb.dev_addr = 0;
    s_usb.dev_gone = false;
    s_usb.calibrated = false;
    s_usb.last_bitmask = 0;
    s_usb.stable_digital = 0;
    s_usb.candidate_digital = 0;
    s_usb.whammy_level = 0;
    s_usb.tilt_level = 0;

    if (s_usb.state_cb) {
        s_usb.state_cb(0, 0, 0, false, s_usb.user_ctx);
    }
    ESP_LOGI(TAG, "X-Plorer disconnected and cleaned up");
}

static void open_new_device(uint8_t dev_addr)
{
    if (s_usb.dev_hdl != NULL) {
        ESP_LOGW(TAG, "Ignoring additional USB device at addr %u", dev_addr);
        return;
    }

    esp_err_t err = usb_host_device_open(s_usb.client_hdl, dev_addr, &s_usb.dev_hdl);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "usb_host_device_open(%u) failed: %s", dev_addr, esp_err_to_name(err));
        return;
    }
    s_usb.dev_addr = dev_addr;

    const usb_config_desc_t *cfg = NULL;
    err = usb_host_get_active_config_descriptor(s_usb.dev_hdl, &cfg);
    if (err != ESP_OK || cfg == NULL || !parse_xinput_endpoints(cfg)) {
        ESP_LOGE(TAG, "Failed to find XInput endpoints on USB device");
        cleanup_usb_device();
        return;
    }

    ESP_LOGI(TAG, "Claiming intf=%u alt=%u ep_in=0x%02X(mps=%u) ep_out=0x%02X(mps=%u)",
             s_usb.intf_num, s_usb.alt_setting,
             s_usb.ep_in_addr, s_usb.ep_in_mps,
             s_usb.ep_out_addr, s_usb.ep_out_mps);

    err = usb_host_interface_claim(s_usb.client_hdl, s_usb.dev_hdl, s_usb.intf_num, s_usb.alt_setting);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "usb_host_interface_claim failed: %s", esp_err_to_name(err));
        cleanup_usb_device();
        return;
    }
    s_usb.intf_claimed = true;

    size_t in_buf_sz = s_usb.ep_in_mps < 32 ? 32 : s_usb.ep_in_mps;
    err = usb_host_transfer_alloc(in_buf_sz, 0, &s_usb.in_xfer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "usb_host_transfer_alloc(IN) failed: %s", esp_err_to_name(err));
        cleanup_usb_device();
        return;
    }
    s_usb.in_xfer->device_handle = s_usb.dev_hdl;
    s_usb.in_xfer->bEndpointAddress = s_usb.ep_in_addr;
    s_usb.in_xfer->callback = in_transfer_cb;
    s_usb.in_xfer->context = &s_usb;
    s_usb.in_xfer->num_bytes = in_buf_sz;

    if (s_usb.ep_out_addr != 0) {
        size_t out_buf_sz = s_usb.ep_out_mps < 32 ? 32 : s_usb.ep_out_mps;
        if (usb_host_transfer_alloc(out_buf_sz, 0, &s_usb.out_xfer) == ESP_OK) {
            s_usb.out_xfer->device_handle = s_usb.dev_hdl;
            s_usb.out_xfer->bEndpointAddress = s_usb.ep_out_addr;
            s_usb.out_xfer->callback = out_transfer_cb;
            s_usb.out_xfer->context = &s_usb;
        }
    }

    s_usb.dev_connected = true;
    s_usb.dev_gone = false;
    s_usb.in_xfer_pending = true;
    err = usb_host_transfer_submit(s_usb.in_xfer);
    if (err != ESP_OK) {
        s_usb.in_xfer_pending = false;
        ESP_LOGE(TAG, "Initial IN transfer submit failed: %s", esp_err_to_name(err));
        cleanup_usb_device();
        return;
    }

    // Set initial Xbox 360 Ring LED pattern (stops flashing all 4 quadrants)
    xplorer_usb_set_led(s_usb.pending_led);
    if (s_usb.state_cb) {
        s_usb.state_cb(0, 0, 0, true, s_usb.user_ctx);
    }
    ESP_LOGI(TAG, "Guitar Hero X-Plorer connected and active!");
}

static void client_event_cb(const usb_host_client_event_msg_t *event_msg, void *arg)
{
    (void)arg;
    switch (event_msg->event) {
    case USB_HOST_CLIENT_EVENT_NEW_DEV:
        ESP_LOGI(TAG, "USB device connected at addr=%u", event_msg->new_dev.address);
        open_new_device(event_msg->new_dev.address);
        break;
    case USB_HOST_CLIENT_EVENT_DEV_GONE:
        ESP_LOGI(TAG, "USB device removed");
        s_usb.dev_gone = true;
        break;
    default:
        break;
    }
}

static void usb_lib_daemon_task(void *arg)
{
    (void)arg;
    while (1) {
        uint32_t event_flags = 0;
        esp_err_t err = usb_host_lib_handle_events(portMAX_DELAY, &event_flags);
        if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
            ESP_LOGW(TAG, "usb_host_lib_handle_events: %s", esp_err_to_name(err));
        }
    }
}

static void usb_client_task(void *arg)
{
    (void)arg;
    while (1) {
        usb_host_client_handle_events(s_usb.client_hdl, pdMS_TO_TICKS(20));
        if (s_usb.dev_gone && s_usb.dev_hdl != NULL) {
            cleanup_usb_device();
        }
    }
}

esp_err_t xplorer_usb_init(xplorer_state_cb_t state_cb, void *user_ctx)
{
    s_usb.state_cb = state_cb;
    s_usb.user_ctx = user_ctx;
    s_usb.lock = xSemaphoreCreateMutex();
    if (!s_usb.lock) {
        return ESP_ERR_NO_MEM;
    }

    const usb_host_config_t host_cfg = {
        .skip_phy_setup = false,
        .intr_flags = ESP_INTR_FLAG_LEVEL1,
    };
    ESP_ERROR_CHECK(usb_host_install(&host_cfg));

    const usb_host_client_config_t client_cfg = {
        .is_synchronous = false,
        .max_num_event_msg = 8,
        .async = {
            .client_event_callback = client_event_cb,
            .callback_arg = &s_usb,
        },
    };
    ESP_ERROR_CHECK(usb_host_client_register(&client_cfg, &s_usb.client_hdl));

    xTaskCreatePinnedToCore(usb_lib_daemon_task, "usb_lib", 4096, NULL, 6, NULL, 0);
    xTaskCreatePinnedToCore(usb_client_task, "usb_client", 4096, NULL, 5, NULL, 0);

    ESP_LOGI(TAG, "USB Host initialized (waiting for Guitar Hero X-Plorer)");
    return ESP_OK;
}

esp_err_t xplorer_usb_set_led(xplorer_led_mode_t mode)
{
    s_usb.pending_led = mode;
    if (!s_usb.dev_connected || s_usb.dev_gone || !s_usb.out_xfer) {
        return ESP_ERR_INVALID_STATE;
    }
    if (s_usb.out_xfer_pending) {
        return ESP_ERR_INVALID_STATE;
    }
    if (xSemaphoreTake(s_usb.lock, pdMS_TO_TICKS(20)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    // Xbox 360 wired LED command: {0x01, 0x03, <pattern>}
    s_usb.out_xfer->data_buffer[0] = 0x01U;
    s_usb.out_xfer->data_buffer[1] = 0x03U;
    s_usb.out_xfer->data_buffer[2] = (uint8_t)mode;
    s_usb.out_xfer->num_bytes = 3;
    s_usb.out_xfer_pending = true;

    esp_err_t err = usb_host_transfer_submit(s_usb.out_xfer);
    if (err != ESP_OK) {
        s_usb.out_xfer_pending = false;
    }
    xSemaphoreGive(s_usb.lock);
    return err;
}

bool xplorer_usb_is_connected(void)
{
    return s_usb.dev_connected && !s_usb.dev_gone;
}
