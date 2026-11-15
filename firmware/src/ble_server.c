#include "ble_server.h"

#include <string.h>
#include "esp_log.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble_server";
// 10-char name + 14-byte mfg data fits cleanly in 31-byte BLE Scan Response (28 bytes total)
static const char *DEVICE_NAME = "XPlorer-BT";

// Service UUID: 7a420001-9f3c-4b8e-a12d-6f8b3c1e9a00
static const ble_uuid128_t UUID_SVC_XPLORER = BLE_UUID128_INIT(
    0x00, 0x9a, 0x1e, 0x3c, 0x8b, 0x6f, 0x2d, 0xa1,
    0x8e, 0x4b, 0x3c, 0x9f, 0x01, 0x00, 0x42, 0x7a
);

// State Characteristic UUID (Read + Notify): 7a420002-9f3c-4b8e-a12d-6f8b3c1e9a00
static const ble_uuid128_t UUID_CHR_STATE = BLE_UUID128_INIT(
    0x00, 0x9a, 0x1e, 0x3c, 0x8b, 0x6f, 0x2d, 0xa1,
    0x8e, 0x4b, 0x3c, 0x9f, 0x02, 0x00, 0x42, 0x7a
);

// LED Mode Characteristic UUID (Write / Write-No-Rsp): 7a420003-9f3c-4b8e-a12d-6f8b3c1e9a00
static const ble_uuid128_t UUID_CHR_LED = BLE_UUID128_INIT(
    0x00, 0x9a, 0x1e, 0x3c, 0x8b, 0x6f, 0x2d, 0xa1,
    0x8e, 0x4b, 0x3c, 0x9f, 0x03, 0x00, 0x42, 0x7a
);

static struct {
    uint8_t              own_addr_type;
    uint16_t             conn_handle;
    uint16_t             state_val_handle;
    uint16_t             led_val_handle;
    volatile bool        notify_enabled;
    volatile bool        synced;
    xplorer_ble_packet_t cached_pkt;
    uint8_t              mfg_payload[2 + sizeof(xplorer_ble_packet_t)];
    portMUX_TYPE         pkt_spinlock;
    SemaphoreHandle_t    adv_lock;
    ble_led_cmd_cb_t     led_cb;
    void                *user_ctx;
} s_ble = {
    .conn_handle = BLE_HS_CONN_HANDLE_NONE,
    .pkt_spinlock = portMUX_INITIALIZER_UNLOCKED,
};

static void ble_app_advertise(void);

static int gatt_chr_access_cb(uint16_t conn_handle, uint16_t attr_handle,
                              struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)conn_handle;
    (void)attr_handle;
    (void)arg;

    if (ble_uuid_cmp(ctxt->chr->uuid, &UUID_CHR_STATE.u) == 0) {
        if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
            xplorer_ble_packet_t pkt_copy;
            portENTER_CRITICAL(&s_ble.pkt_spinlock);
            pkt_copy = s_ble.cached_pkt;
            portEXIT_CRITICAL(&s_ble.pkt_spinlock);
            int rc = os_mbuf_append(ctxt->om, &pkt_copy, sizeof(pkt_copy));
            return (rc == 0) ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (ble_uuid_cmp(ctxt->chr->uuid, &UUID_CHR_LED.u) == 0) {
        if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
            uint8_t mode_val = 0;
            uint16_t out_len = 0;
            int rc = ble_hs_mbuf_to_flat(ctxt->om, &mode_val, sizeof(mode_val), &out_len);
            if (rc != 0 || out_len < 1) {
                return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            }
            if (s_ble.led_cb) {
                s_ble.led_cb((xplorer_led_mode_t)mode_val, s_ble.user_ctx);
            }
            return 0;
        }
        return BLE_ATT_ERR_UNLIKELY;
    }

    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_svc_def gatt_svr_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &UUID_SVC_XPLORER.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &UUID_CHR_STATE.u,
                .access_cb = gatt_chr_access_cb,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
                .val_handle = &s_ble.state_val_handle,
            },
            {
                .uuid = &UUID_CHR_LED.u,
                .access_cb = gatt_chr_access_cb,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
                .val_handle = &s_ble.led_val_handle,
            },
            {
                0,
            }
        },
    },
    {
        0,
    },
};

static int ble_gap_event_cb(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_ble.conn_handle = event->connect.conn_handle;
            s_ble.notify_enabled = false;
            ESP_LOGI(TAG, "BLE client connected (handle=%u)", s_ble.conn_handle);

            // Request low-latency connection interval (7.5 ms - 15 ms)
            struct ble_gap_upd_params upd = {
                .itvl_min = 6,
                .itvl_max = 12,
                .latency = 0,
                .supervision_timeout = 400,
                .min_ce_len = 0,
                .max_ce_len = 0,
            };
            ble_gap_update_params(s_ble.conn_handle, &upd);
        } else {
            ESP_LOGW(TAG, "BLE connect failed status=%d, restarting adv", event->connect.status);
            s_ble.conn_handle = BLE_HS_CONN_HANDLE_NONE;
            ble_app_advertise();
        }
        break;

    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "BLE client disconnected reason=%d", event->disconnect.reason);
        s_ble.conn_handle = BLE_HS_CONN_HANDLE_NONE;
        s_ble.notify_enabled = false;
        if (s_ble.led_cb) {
            s_ble.led_cb(XPLORER_LED_SEARCHING, s_ble.user_ctx);
        }
        ble_app_advertise();
        break;

    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_ble.state_val_handle) {
            s_ble.notify_enabled = (event->subscribe.cur_notify != 0);
            ESP_LOGI(TAG, "Notifications %s", s_ble.notify_enabled ? "ENABLED" : "DISABLED");
        }
        break;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        ble_app_advertise();
        break;

    default:
        break;
    }
    return 0;
}

static void ble_app_advertise(void)
{
    if (!s_ble.synced || s_ble.conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        return;
    }
    if (s_ble.adv_lock && xSemaphoreTake(s_ble.adv_lock, pdMS_TO_TICKS(50)) != pdTRUE) {
        return;
    }

    if (ble_gap_adv_active()) {
        ble_gap_adv_stop();
    }

    struct ble_hs_adv_fields fields;
    struct ble_hs_adv_fields rsp_fields;
    struct ble_gap_adv_params adv_params;
    int rc;

    memset(&fields, 0, sizeof(fields));
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128 = &UUID_SVC_XPLORER;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;

    rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_set_fields failed: %d", rc);
        if (s_ble.adv_lock) xSemaphoreGive(s_ble.adv_lock);
        return;
    }

    // Include 0xFFFF test manufacturer ID + latest 12-byte packet for connectionless beacon mode
    xplorer_ble_packet_t pkt_copy;
    portENTER_CRITICAL(&s_ble.pkt_spinlock);
    pkt_copy = s_ble.cached_pkt;
    portEXIT_CRITICAL(&s_ble.pkt_spinlock);
    s_ble.mfg_payload[0] = 0xFFU;
    s_ble.mfg_payload[1] = 0xFFU;
    memcpy(&s_ble.mfg_payload[2], &pkt_copy, sizeof(pkt_copy));

    memset(&rsp_fields, 0, sizeof(rsp_fields));
    rsp_fields.name = (uint8_t *)DEVICE_NAME;
    rsp_fields.name_len = (uint8_t)strlen(DEVICE_NAME);
    rsp_fields.name_is_complete = 1;
    rsp_fields.mfg_data = s_ble.mfg_payload;
    rsp_fields.mfg_data_len = sizeof(s_ble.mfg_payload);

    rc = ble_gap_adv_rsp_set_fields(&rsp_fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_rsp_set_fields failed: %d", rc);
        if (s_ble.adv_lock) xSemaphoreGive(s_ble.adv_lock);
        return;
    }

    memset(&adv_params, 0, sizeof(adv_params));
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    adv_params.itvl_min = 32;  // 20 ms fast beacon/discovery interval
    adv_params.itvl_max = 48;  // 30 ms

    rc = ble_gap_adv_start(s_ble.own_addr_type, NULL, BLE_HS_FOREVER,
                           &adv_params, ble_gap_event_cb, NULL);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGE(TAG, "ble_gap_adv_start failed: %d", rc);
    }

    if (s_ble.adv_lock) xSemaphoreGive(s_ble.adv_lock);
}

static void ble_on_reset(int reason)
{
    ESP_LOGW(TAG, "NimBLE reset reason=%d", reason);
}

static void ble_on_sync(void)
{
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_hs_util_ensure_addr failed: %d", rc);
        return;
    }

    rc = ble_hs_id_infer_auto(0, &s_ble.own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_hs_id_infer_auto failed: %d", rc);
        return;
    }

    uint8_t addr_val[6] = {0};
    ble_hs_id_copy_addr(s_ble.own_addr_type, addr_val, NULL);
    ESP_LOGI(TAG, "BLE Address: %02X:%02X:%02X:%02X:%02X:%02X",
             addr_val[5], addr_val[4], addr_val[3],
             addr_val[2], addr_val[1], addr_val[0]);

    s_ble.synced = true;
    ble_app_advertise();
}

static void nimble_host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

esp_err_t ble_server_init(ble_led_cmd_cb_t led_cb, void *user_ctx)
{
    s_ble.led_cb = led_cb;
    s_ble.user_ctx = user_ctx;
    s_ble.adv_lock = xSemaphoreCreateMutex();
    memset(&s_ble.cached_pkt, 0, sizeof(s_ble.cached_pkt));
    s_ble.cached_pkt.magic = XPLORER_PKT_MAGIC;
    s_ble.cached_pkt.crc8 = xplorer_crc8((const uint8_t *)&s_ble.cached_pkt,
                                         sizeof(s_ble.cached_pkt) - 1U);

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(nimble_port_init());

    ble_hs_cfg.reset_cb = ble_on_reset;
    ble_hs_cfg.sync_cb = ble_on_sync;
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;

    ble_svc_gap_init();
    ble_svc_gatt_init();

    int rc = ble_svc_gap_device_name_set(DEVICE_NAME);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_svc_gap_device_name_set failed: %d", rc);
        return ESP_FAIL;
    }

    rc = ble_gatts_count_cfg(gatt_svr_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg failed: %d", rc);
        return ESP_FAIL;
    }

    rc = ble_gatts_add_svcs(gatt_svr_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs failed: %d", rc);
        return ESP_FAIL;
    }

    nimble_port_freertos_init(nimble_host_task);
    return ESP_OK;
}

void ble_server_update_cached_packet(const xplorer_ble_packet_t *pkt)
{
    if (!pkt) return;
    portENTER_CRITICAL(&s_ble.pkt_spinlock);
    s_ble.cached_pkt = *pkt;
    portEXIT_CRITICAL(&s_ble.pkt_spinlock);
}

esp_err_t ble_server_send_packet(const xplorer_ble_packet_t *pkt)
{
    if (!pkt) return ESP_ERR_INVALID_ARG;
    ble_server_update_cached_packet(pkt);

    // If not GATT-connected, broadcast updated bitmask packet via BLE beacon advertising
    if (s_ble.conn_handle == BLE_HS_CONN_HANDLE_NONE) {
        ble_app_advertise();
        return ESP_OK;
    }
    if (!s_ble.notify_enabled) {
        return ESP_ERR_INVALID_STATE;
    }

    struct os_mbuf *om = ble_hs_mbuf_from_flat(pkt, sizeof(*pkt));
    if (!om) {
        return ESP_ERR_NO_MEM;
    }

    int rc = ble_gatts_notify_custom(s_ble.conn_handle, s_ble.state_val_handle, om);
    return (rc == 0) ? ESP_OK : ESP_FAIL;
}

bool ble_server_is_subscribed(void)
{
    return (s_ble.conn_handle != BLE_HS_CONN_HANDLE_NONE) && s_ble.notify_enabled;
}
