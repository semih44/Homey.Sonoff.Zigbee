# Zigbee2MQTT Feature Audit

Vergleich der zigbee2mqtt (z2m) Features mit unserer Homey-Implementierung.
Quelle: https://www.zigbee2mqtt.io/devices/{MODEL}.html

Legende:
- **Haben wir** = Feature ist implementiert
- **Fehlt** = Feature fehlt bei uns
- **N/A** = Nicht relevant/nicht sinnvoll für Homey
- **Homey-only** = Feature das nur wir haben (z.B. Homey-seitige Offsets)

---

## Sensoren & Buttons

### SNZB-01 (Button)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| action: single, double, long | enum | Flow Triggers: single_click, double_click, long_click | Haben wir |

**Ergebnis: Vollstandig**

---

### SNZB-01P (Round Button)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| action: single, double, long | enum | Flow Triggers: single_click, double_click, long_click | Haben wir |

**Ergebnis: Vollstandig**

---

### SNZB-01M (4-Button Remote)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| action: single/double/long/triple per button 1-4 | enum | Flow Triggers: single/double/long/triple per button 1-4 | Haben wir |

**Ergebnis: Vollstandig**

---

### SNZB-02 (Temp/Humidity Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| temperature | numeric | `measure_temperature` | Haben wir |
| humidity | numeric | `measure_humidity` | Haben wir |
| voltage | numeric | — | N/A |
| Option: temperature_calibration | z2m-seitig | — | N/A (z2m-Option, kein Geratefunktion) |
| Option: humidity_calibration | z2m-seitig | — | N/A (z2m-Option, kein Geratefunktion) |
| — | — | `temperature_offset` (Homey-seitig) | Homey-only |
| — | — | `humidity_offset` (Homey-seitig) | Homey-only |

**Ergebnis: Vollstandig** (z2m-Optionen sind nur z2m-seitige Offsets, keine Gerate-Writes)

---

### SNZB-02D (Temp/Humidity with Display)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| temperature | numeric | `measure_temperature` | Haben wir |
| humidity | numeric | `measure_humidity` | Haben wir |
| comfort_temperature_min | numeric (-10 bis 60) | — | **Fehlt** |
| comfort_temperature_max | numeric (-10 bis 60) | — | **Fehlt** |
| comfort_humidity_min | numeric (5-95) | — | **Fehlt** |
| comfort_humidity_max | numeric (5-95) | — | **Fehlt** |
| temperature_units | enum (celsius/fahrenheit) | — | **Fehlt** |
| temperature_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| humidity_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| — | — | `temperature_offset` (Homey-seitig) | Homey-only |
| — | — | `humidity_offset` (Homey-seitig) | Homey-only |

**Ergebnis: 7 Features fehlen** (Comfort-Thresholds, Units, Gerate-Kalibrierung)

---

### SNZB-02P (Round Temp/Humidity)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| temperature | numeric | `measure_temperature` | Haben wir |
| humidity | numeric | `measure_humidity` | Haben wir |
| temperature_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| humidity_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| — | — | `temperature_offset` (Homey-seitig) | Homey-only |
| — | — | `humidity_offset` (Homey-seitig) | Homey-only |

**Ergebnis: 2 Features fehlen** (Gerate-Kalibrierung)

---

### SNZB-02LD (Probe Temp Sensor with Display)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| temperature | numeric | `measure_temperature` | Haben wir |
| temperature_units | enum (celsius/fahrenheit) | `temperature_units` Setting | Haben wir |
| temperature_calibration | numeric (-50 bis 50, Gerate-Write) | `temperature_calibration` Setting | Haben wir |
| — | — | `temperature_offset` (Homey-seitig) | Homey-only |

**Ergebnis: Vollstandig**

---

### SNZB-02WD (Waterproof Temp/Humidity with Display)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| temperature | numeric | `measure_temperature` | Haben wir |
| humidity | numeric | `measure_humidity` | Haben wir |
| temperature_units | enum (celsius/fahrenheit) | — | **Fehlt** |
| temperature_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| humidity_calibration | numeric (-50 bis 50, Gerate-Write) | — | **Fehlt** |
| — | — | `temperature_offset` (Homey-seitig) | Homey-only |
| — | — | `humidity_offset` (Homey-seitig) | Homey-only |

**Ergebnis: 3 Features fehlen** (Units, Gerate-Kalibrierung)

---

### SNZB-03 (Motion Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| occupancy | binary | `alarm_motion` | Haben wir |
| battery_low | binary | — | N/A (Homey zeigt battery %) |

**Ergebnis: Vollstandig**

---

### SNZB-03P (Motion Sensor with Light)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| occupancy | binary | `alarm_motion` | Haben wir |
| motion_timeout | numeric (5-60s) | `occupied_to_unoccupied_delay` Setting | Haben wir |
| illumination | enum (dim/bright) | `sonoff_illuminance` Capability | Haben wir |

**Ergebnis: Vollstandig**

---

### SNZB-04 (Door/Window Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| contact | binary | `alarm_contact` | Haben wir |
| battery_low | binary | — | N/A |

**Ergebnis: Vollstandig**

---

### SNZB-04P (Door/Window with Tamper)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| contact | binary | `alarm_contact` | Haben wir |
| tamper | binary | `alarm_tamper` | Haben wir |
| battery_low | binary | — | N/A |

**Ergebnis: Vollstandig**

---

### SNZB-04PR2 (Door/Window with Tamper v2)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| voltage | numeric | — | N/A |
| contact | binary | `alarm_contact` | Haben wir |
| tamper | binary | `alarm_tamper` | Haben wir |
| battery_low | binary | — | N/A |

**Ergebnis: Vollstandig**

---

### SNZB-05 (Water Leak Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| water_leak | binary | `alarm_water` | Haben wir |
| battery_low | binary | — | N/A |

**Ergebnis: Vollstandig**

---

### SNZB-05P (Water Leak Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| battery | numeric | `measure_battery` | Haben wir |
| water_leak | binary | `alarm_water` | Haben wir |
| battery_low | binary | — | N/A |

**Ergebnis: Vollstandig**

---

### SNZB-06P (Presence Sensor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| occupancy | binary | `alarm_motion` | Haben wir |
| occupancy_timeout | numeric (15-65535) | `occupied_to_unoccupied_delay` Setting | Haben wir |
| occupancy_sensitivity | enum (low/medium/high) | `occupied_threshold` Setting | Haben wir |
| illumination | enum (dim/bright) | `sonoff_illuminance` Capability | Haben wir |

**Ergebnis: Vollstandig**

---

## Schalter & Steckdosen

### BASICZBR3 (Smart Switch)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | — | **Fehlt** |

**Hinweis:** z2m listet kein `power_on_behavior` als Expose, aber das Gerat unterstutzt es uber den OnOff-Cluster (`powerOnBehavior` Attribut). Andere ahnliche Gerate (ZBMINI, S31ZB) haben es auch nicht als z2m-Expose, trotzdem ist es ein Standard-ZCL-Feature.

**Ergebnis: 1 Feature fehlt** (power_on_behavior — Standard-ZCL, nicht z2m-Expose)

---

### ZBMINI (Inline Switch)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | — | **Fehlt** |

**Ergebnis: 1 Feature fehlt** (power_on_behavior — Standard-ZCL)

---

### ZBMINI-L (Inline Switch, No Neutral)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum (off/on/toggle/previous) | `power_on_behavior` Setting | Haben wir |

**Ergebnis: Vollstandig**

---

### ZBMINI-L2 (Inline Switch, No Neutral v2)

*Nicht in z2m vorhanden.* Unsere Implementierung basiert auf ZBMINI-L.

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | `power_on_behavior` Setting | Haben wir |

**Ergebnis: Vollstandig** (kein z2m-Referenz verfugbar)

---

### ZBMINIR2 (Inline Switch Enhanced)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum (off/on/toggle/previous) | `power_on_behavior` Setting | Haben wir |
| network_indicator | binary | `network_led` Setting | Haben wir |
| turbo_mode | binary | `turbo_mode` Setting | Haben wir |
| delayed_power_on_state | binary | `power_on_delay_state` Setting | Haben wir |
| delayed_power_on_time | numeric (0.5-3599.5s) | `power_on_delay_time` Setting | Haben wir |
| detach_relay_mode | binary | `detach_mode` Setting | Haben wir |
| external_trigger_mode | enum (edge/pulse/following) | `switch_mode` Setting | Haben wir |
| inching_control_set | composite | `inching_enabled/time/mode` Settings | Haben wir |
| action: toggle | enum | Flow Trigger: click | Haben wir |

**Ergebnis: Vollstandig**

---

### ZBMicro (USB Repeater with Switch)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum (off/on/toggle/previous) | `power_on_behavior` Setting | Haben wir |
| rf_turbo_mode | binary | `turbo_mode` Setting | Haben wir |
| inching_control_set | composite | `inching_enabled/time/mode` Settings | Haben wir |
| network_indicator | binary | `network_led` Setting | Haben wir |

**Ergebnis: Vollstandig**

---

### S31ZB (Smart Plug US)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | — | **Fehlt** |

**Ergebnis: 1 Feature fehlt** (power_on_behavior — Standard-ZCL)

---

### S40ZBTPB (Smart Plug 15A)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | — | **Fehlt** |

**Ergebnis: 1 Feature fehlt** (power_on_behavior — Standard-ZCL)

---

### MINI-ZBDIM (Smart Dimmer)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| light (state + brightness) | binary+numeric | `onoff` + `dim` | Haben wir |
| power_on_behavior | enum | `power_on_behavior` Setting | Haben wir |
| current | numeric (A) | `measure_current` | Haben wir |
| voltage | numeric (V) | `measure_voltage` | Haben wir |
| power | numeric (W) | `measure_power` | Haben wir |
| delayed_power_on_state | binary | `delayed_power_on_state` Setting | Haben wir |
| delayed_power_on_time | numeric (0.5-3599.5s) | `delayed_power_on_time` Setting | Haben wir |
| inching_control_set | composite | `inching_enabled/time/mode` Settings | Haben wir |
| external_trigger_mode | enum (edge/pulse/double/triple) | `external_trigger_mode` Setting | Haben wir |
| calibration_action | enum (start/stop/clear) | `calibration_action` Setting | Haben wir |
| calibration_status | enum | `calibration_status` Setting | Haben wir |
| calibration_progress | numeric (0-100%) | — | **Fehlt** |
| min_brightness_threshold | numeric (1-50%) | `min_brightness` Setting | Haben wir |
| transition_time | numeric (0-5s) | `transition_time` Setting | Haben wir |
| dimming_light_rate | enum (1x-5x) | `dimming_rate` Setting | Haben wir |

**Ergebnis: 1 Feature fehlt** (calibration_progress — read-only, niedrige Prioritat)

---

### MINI-ZB2GS (2-Channel Inline Switch)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2 | binary | `onoff` + `onoff.channel_2` | Haben wir |
| power_on_behavior l1/l2 | enum | `power_on_behavior_l1/l2` Settings | Haben wir |
| delayed_power_on_state l1/l2 | binary | — | **Fehlt** |
| delayed_power_on_time l1/l2 | numeric | — | **Fehlt** |
| external_trigger_mode l1/l2 | enum | `external_trigger_mode_l1/l2` Settings | Haben wir |
| detach_relay_mode | composite (outlet1/2) | `detach_relay_1/2` Settings | Haben wir |
| inching_control l1/l2 | composite | `inching_enabled/time/mode` Settings | Haben wir (nur 1 Kanal?) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| turbo_mode | binary | `turbo_mode` Setting | Haben wir |
| programmable_stepper_seq 1-4 | composite | — | **Fehlt** |
| action: toggle_l1/l2 | enum | Flow Triggers: toggle_l1/l2 | Haben wir |

**Ergebnis: 3 Features fehlen** (delayed_power_on per channel, programmable_stepper)

---

### MINI-ZB2GS-L (2-Channel, No Neutral)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2 | binary | `onoff` + `onoff.channel_2` | Haben wir |
| power_on_behavior l1/l2 | enum | `power_on_behavior_l1/l2` Settings | Haben wir |
| delayed_power_on_state l1/l2 | binary | `delayed_power_on_state_l1/l2` Settings | Haben wir |
| delayed_power_on_time l1/l2 | numeric | `delayed_power_on_time_l1/l2` Settings | Haben wir |
| external_trigger_mode l1/l2 | enum | `external_trigger_mode_l1/l2` Settings | Haben wir |
| detach_relay_mode | composite (outlet1/2) | `detach_relay_1/2` Settings | Haben wir |
| action: toggle_l1/l2 | enum | Flow Triggers: toggle_l1/l2 | Haben wir |

**Ergebnis: Vollstandig**

---

## Wandschalter (ZBM5 Serie)

### ZBM5-1C-80/86 (1-Channel Wall Switch EU)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | `power_on_behavior` Setting | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio, read-only Info) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite | `detach_relay` Setting | Haben wir |
| action: toggle | enum | Flow Trigger: click | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only, niedrige Prioritat)

---

### ZBM5-1C-120 (1-Channel Wall Switch US)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| power_on_behavior | enum | `power_on_behavior` Setting | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite | `detach_relay` Setting | Haben wir |
| action: toggle | enum | Flow Trigger: click | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only)

---

### ZBM5-2C-80/86 (2-Channel Wall Switch EU)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2 | binary | `onoff` + `onoff.channel_2` | Haben wir |
| power_on_behavior l1/l2 | enum | `power_on_behavior_l1/l2` Settings | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite (outlet1/2) | `detach_relay_1/2` Settings | Haben wir |
| action: toggle_l1/l2 | enum | Flow Triggers: toggle_l1/l2 | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only)

---

### ZBM5-2C-120 (2-Channel Wall Switch US)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2 | binary | `onoff` + `onoff.channel_2` | Haben wir |
| power_on_behavior l1/l2 | enum | `power_on_behavior_l1/l2` Settings | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite (outlet1/2) | `detach_relay_1/2` Settings | Haben wir |
| action: toggle_l1/l2 | enum | Flow Triggers: toggle_l1/l2 | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only)

---

### ZBM5-3C-80/86 (3-Channel Wall Switch EU)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2/l3 | binary | `onoff` + `onoff.channel_2` + `onoff.channel_3` | Haben wir |
| power_on_behavior l1/l2/l3 | enum | `power_on_behavior_l1/l2/l3` Settings | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite (outlet1/2/3) | `detach_relay_1/2/3` Settings | Haben wir |
| action: toggle_l1/l2/l3 | enum | Flow Triggers: toggle_l1/l2/l3 | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only)

---

### ZBM5-3C-120 (3-Channel Wall Switch US)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch l1/l2/l3 | binary | `onoff` + `onoff.channel_2` + `onoff.channel_3` | Haben wir |
| power_on_behavior l1/l2/l3 | enum | `power_on_behavior_l1/l2/l3` Settings | Haben wir |
| device_work_mode | enum (read-only) | — | **Fehlt** (niedrige Prio) |
| network_indicator | binary | `network_led` Setting | Haben wir |
| detach_relay_mode | composite (outlet1/2/3) | `detach_relay_1/2/3` Settings | Haben wir |
| action: toggle_l1/l2/l3 | enum | Flow Triggers: toggle_l1/l2/l3 | Haben wir |

**Ergebnis: 1 Feature fehlt** (device_work_mode — read-only)

---

## Rollladen & Vorhange

### ZBCurtain (Curtain Motor)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| cover (state: OPEN/CLOSE/STOP) | enum | `windowcoverings_state` | Haben wir |
| cover (position: 0-100) | numeric | `windowcoverings_set` | Haben wir |
| battery | numeric | `measure_battery` | Haben wir |
| Option: invert_cover | boolean | — | N/A (Homey hat eigene Inversion) |

**Ergebnis: Vollstandig**

---

### MINI-ZBRBS (Roller Blind Module)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| cover (state: OPEN/CLOSE/STOP) | enum | `windowcoverings_state` | Haben wir |
| cover (position: 0-100) | numeric | `windowcoverings_set` | Haben wir |
| motor_travel_calibration_action | enum (start_auto/start_manual/clear/manual_2/3) | `motor_calibration_action` Setting | Haben wir |
| motor_travel_calibration_status | enum (Uncalibrated/Calibrated) | `motor_calibration_status` Setting | Haben wir |
| motor_run_status | enum (Stop/Forward/Reverse) | — | **Fehlt** (read-only Info) |
| external_trigger_mode | enum (edge/pulse/following) | — | **Fehlt** |
| Option: invert_cover | boolean | `invert_cover` Setting | Haben wir |
| turbo_mode | binary | `turbo_mode` Setting | Haben wir |
| network_indicator | binary | `network_led` Setting | Haben wir |
| switch_mode | — | `switch_mode` Setting | Haben wir |

**Ergebnis: 2 Features fehlen** (motor_run_status, external_trigger_mode)

---

## Thermostat

### TRVZB (Thermostatic Radiator Valve)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| occupied_heating_setpoint | numeric (4-35C) | `target_temperature` | Haben wir |
| local_temperature | numeric | `measure_temperature` | Haben wir |
| local_temperature_calibration | numeric (-12.7 bis 12.7) | `localTemperatureCalibration` Setting | Haben wir |
| system_mode | enum (off/auto/heat) | `onoff` (off/heat) | Haben wir (teilweise — kein "auto" Modus) |
| running_state | enum (idle/heat) | — | **Fehlt** (read-only Info) |
| battery | numeric | `measure_battery` | Haben wir |
| child_lock | binary | `child_lock` Setting | Haben wir |
| open_window | binary | `open_window` Setting | Haben wir |
| frost_protection_temperature | numeric (4-35C) | `frost_protection_temperature` Setting | Haben wir |
| timer_mode_target_temp | numeric (4-35C) | — | **Fehlt** |
| temporary_mode_duration | numeric (0-1440 min) | — | **Fehlt** |
| temporary_mode_select | enum (boost/timer) | — | **Fehlt** |
| temperature_sensor_select | enum (internal/external/external_2/3) | — | **Fehlt** |
| external_temperature_input | numeric (0-99.9C) | — | **Fehlt** |
| smart_temperature_control | binary | — | **Fehlt** |
| idle_steps | numeric (read-only) | — | **Fehlt** (read-only Diagnose) |
| closing_steps | numeric (read-only) | — | **Fehlt** (read-only Diagnose) |
| valve_opening_limit_voltage | numeric (read-only) | — | **Fehlt** (read-only Diagnose) |
| valve_closing_limit_voltage | numeric (read-only) | — | **Fehlt** (read-only Diagnose) |
| valve_motor_running_voltage | numeric (read-only) | — | **Fehlt** (read-only Diagnose) |
| valve_opening_degree | numeric (0-100%) | — | **Fehlt** |
| valve_closing_degree | numeric (0-100%) | — | **Fehlt** |
| temperature_accuracy | numeric (-1 bis -0.2) | — | **Fehlt** |
| weekly_schedule_sunday..saturday | text (6 transitions) | — | **Fehlt** |

**Ergebnis: Viele Features fehlen** — Der TRVZB hat das grosste Delta. Prioritaten:
- **Hoch**: temperature_sensor_select, external_temperature_input (fur externe Sensoren)
- **Hoch**: weekly_schedule (7 Tage Zeitplan)
- **Mittel**: timer_mode_target_temp, temporary_mode_duration/select (Boost/Timer)
- **Mittel**: smart_temperature_control, valve_opening/closing_degree
- **Niedrig**: Diagnose-Werte (idle_steps, voltages), temperature_accuracy

---

## Wasserventile

### SWV (Smart Water Valve)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| battery | numeric | `measure_battery` | Haben wir |
| flow | numeric (m3/h) | — | **Fehlt** |
| current_device_status | enum (normal/shortage/leakage/both) | `alarm_water` (nur leakage) | Teilweise |
| auto_close_when_water_shortage | binary | `lack_water_close_valve_timeout` Setting | Haben wir |
| cyclic_timed_irrigation | composite | — | **Fehlt** (komplex) |
| cyclic_quantitative_irrigation | composite | — | **Fehlt** (komplex) |

**Ergebnis: 3 Features fehlen** (flow measurement, cyclic irrigation Modi)

---

### SWV-ZNE (Smart Water Valve Advanced)

| z2m Feature | Typ | Unsere Implementierung | Status |
|---|---|---|---|
| switch (state) | binary | `onoff` | Haben wir |
| battery | numeric | `measure_battery` | Haben wir |
| child_lock | binary | `child_lock` Setting | Haben wir |
| valve_abnormal_state | enum | `alarm_water` (nur leakage) | Teilweise |
| manual_default_settings | composite | — | **Fehlt** |
| irrigation_plan_settings | composite (6 Plane) | — | **Fehlt** |
| irrigation_plan_report | composite (read-only) | — | **Fehlt** |
| irrigation_plan_remove | numeric | — | **Fehlt** |
| irrigation_schedule_status | composite (read-only) | — | **Fehlt** |
| rain_delay | text | — | **Fehlt** |
| seasonal_watering_adjustment | composite (12 Monate) | — | **Fehlt** |
| valve_alarm_settings | composite | — | **Fehlt** |
| realtime_irrigation_duration | numeric (read-only) | — | **Fehlt** |
| realtime_irrigation_volume | numeric (read-only) | — | **Fehlt** |
| hour/daily_irrigation_volume/duration | numeric (read-only) | — | **Fehlt** |
| 24h/30d/180d records | text (read-only) | — | **Fehlt** |
| read_irrigation_history | composite (write-only) | — | **Fehlt** |
| longitude/latitude | numeric | — | **Fehlt** |
| weather_based_adjustment | composite | — | **Fehlt** |

**Ergebnis: Viele Features fehlen** — Das sind grosstenteils komplexe Bewasserungsplanungs-Features. Die meisten Nutzer werden diese uber die eWeLink-App konfigurieren. Fur Homey sind die wichtigsten:
- **Mittel**: valve_alarm_settings (Leck-/Frostschutz-Konfiguration)
- **Mittel**: realtime_irrigation_duration/volume (Live-Status)
- **Niedrig**: Bewasserungsplane, Wetteranpassung, GPS (eWeLink-App besser geeignet)

---

### SWV-ZFE (Smart Water Valve Advanced EU)

Identisch mit SWV-ZNE — gleiche z2m-Features, gleiche Implementierung.
**Ergebnis: Gleich wie SWV-ZNE**

---

### SWV-ZFU (Smart Water Valve Advanced US)

Identisch mit SWV-ZNE — gleiche z2m-Features, gleiche Implementierung.
**Ergebnis: Gleich wie SWV-ZNE**

---

## Zusammenfassung

### Vollstandige Gerate (keine fehlenden Features)

| Gerat | Kategorie |
|---|---|
| SNZB-01 | Button |
| SNZB-01P | Button |
| SNZB-01M | 4-Button Remote |
| SNZB-02 | Temp/Humidity |
| SNZB-02LD | Probe Temp |
| SNZB-03 | Motion |
| SNZB-03P | Motion + Light |
| SNZB-04 | Door/Window |
| SNZB-04P | Door/Window + Tamper |
| SNZB-04PR2 | Door/Window + Tamper |
| SNZB-05 | Water Leak |
| SNZB-05P | Water Leak |
| SNZB-06P | Presence |
| ZBMINI-L | Inline Switch |
| ZBMINI-L2 | Inline Switch |
| ZBMINIR2 | Inline Switch Enhanced |
| ZBMicro | USB Switch |
| ZBCurtain | Curtain Motor |
| MINI-ZB2GS-L | 2-Ch Switch |

### Gerate mit fehlenden Features

| Gerat | Fehlend | Prioritat |
|---|---|---|
| **TRVZB** | ~15 Features (Zeitplan, ext. Sensor, Boost/Timer, Ventilsteuerung) | **Hoch** |
| **SWV-ZNE/ZFE/ZFU** | ~18 Features (Bewasserungsplane, Wetter, Statistiken) | Mittel-Niedrig |
| **SWV** | 3 Features (flow, cyclic irrigation) | Mittel |
| **SNZB-02D** | 7 Features (comfort thresholds, units, calibration) | Mittel |
| **SNZB-02WD** | 3 Features (units, calibration) | Mittel |
| **SNZB-02P** | 2 Features (calibration) | Mittel |
| **MINI-ZB2GS** | 3 Features (delayed_power_on, programmable_stepper) | Mittel |
| **MINI-ZBRBS** | 2 Features (motor_run_status, external_trigger_mode) | Mittel |
| **MINI-ZBDIM** | 1 Feature (calibration_progress) | Niedrig |
| **BASICZBR3** | 1 Feature (power_on_behavior) | Mittel |
| **ZBMINI** | 1 Feature (power_on_behavior) | Mittel |
| **S31ZB** | 1 Feature (power_on_behavior) | Mittel |
| **S40ZBTPB** | 1 Feature (power_on_behavior) | Mittel |
| **ZBM5-1C-80** | 1 Feature (device_work_mode) | Niedrig |
| **ZBM5-1C-120** | 1 Feature (device_work_mode) | Niedrig |
| **ZBM5-2C-80** | 1 Feature (device_work_mode) | Niedrig |
| **ZBM5-2C-120** | 1 Feature (device_work_mode) | Niedrig |
| **ZBM5-3C-80** | 1 Feature (device_work_mode) | Niedrig |
| **ZBM5-3C-120** | 1 Feature (device_work_mode) | Niedrig |

### Gerate die in z2m existieren aber bei uns fehlen

| Modell | Beschreibung | z2m Features | Aufwand |
|---|---|---|---|
| **S26R2ZB** | Smart Plug | switch, power_on_behavior | Gering |
| **S60ZBTPF** | Energy Monitoring Plug EU | switch, power/voltage/current/energy, power_on_behavior | Mittel |
| **S60ZBTPG** | Energy Monitoring Plug US | switch, power/voltage/current/energy, power_on_behavior | Mittel |
| **SA-028-1 / SA-029-1** | Smart Plug | switch, power_on_behavior | Gering |
| **SNZB-02DR2** | Temp/Hum Display + Relay | temp, humidity, comfort thresholds, relay | Mittel |
| **SNZB-02B** | Temp/Hum Sensor | temp, humidity, comfort thresholds, hourly stats | Mittel |
| **MG1_5RZ** | 5.8GHz Radar Sensor | occupancy, sensitivity, delay | Mittel |
| **SWV-ZNU** | Water Valve US | wie SWV-ZNE | Gering |

### Empfohlene Implementierungsreihenfolge

**Phase 1 — Quick Wins (wenig Aufwand, hoher Nutzen):**
1. `power_on_behavior` fur BASICZBR3, ZBMINI, S31ZB, S40ZBTPB
2. `external_trigger_mode` fur MINI-ZBRBS
3. `delayed_power_on` per Channel fur MINI-ZB2GS

**Phase 2 — Temperatur-Sensoren erweitern:**
4. SNZB-02D: comfort thresholds, temperature_units, Gerate-Kalibrierung
5. SNZB-02WD: temperature_units, Gerate-Kalibrierung
6. SNZB-02P: Gerate-Kalibrierung

**Phase 3 — TRVZB (komplex, aber hoher Nutzen):**
7. temperature_sensor_select + external_temperature_input
8. weekly_schedule (7 Tage)
9. Boost/Timer Modi
10. smart_temperature_control, valve degrees

**Phase 4 — Neue Gerate:**
11. S26R2ZB, SA-028/029 (einfache Plugs)
12. S60ZBTPF/G (Energy Monitoring)
13. SWV-ZNU (Water Valve)
14. SNZB-02DR2, SNZB-02B
15. MG1_5RZ (Radar)

**Phase 5 — Optionale erweiterte Features:**
16. SWV erweiterte Bewasserungs-Features
17. device_work_mode fur ZBM5-Serie (read-only Info)
18. MINI-ZB2GS programmable_stepper
