<img src="admin/iometer.png" width="128" alt="IOmeter Logo" />

# ioBroker.iometer

[![NPM version](https://img.shields.io/npm/v/iobroker.iometer.svg)](https://www.npmjs.com/package/iobroker.iometer)
[![Downloads](https://img.shields.io/npm/dm/iobroker.iometer.svg)](https://www.npmjs.com/package/iobroker.iometer)
![Number of Installations](https://iobroker.live/badges/iometer-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/iometer-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.iometer.png?downloads=true)](https://nodei.co/npm/iobroker.iometer/)

**Tests:** ![Test and Release](https://github.com/torben-iometer/ioBroker.iometer/workflows/Test%20and%20Release/badge.svg)

## iometer adapter for ioBroker

**_This adapter requires at least Node.js 20.x!_**

Connects ioBroker to the [IOmeter](https://www.iometer.de) smart metering device and provides real-time electricity readings via Server-Sent Events (SSE). Meter readings and device status are updated live as soon as the device reports them.

## Install

Install this adapter via ioBroker Admin:

1. Open the adapter list and search for **IOmeter**
2. Click **Install**
3. Create an instance of the IOmeter adapter
4. Enter the IP address of your IOmeter device and save
5. The connection to the device is established automatically and the data is stored in the corresponding chanels

## Configuration

### IOmeter IP Address

The local IP address of your IOmeter device (e.g. `192.168.1.100`). This can be found in the device infos in the IOmeter app.

The adapter connects to `http://<ip>/v1/reading` and `http://<ip>/v1/status` via SSE. Both streams reconnect automatically if the connection is lost.

## States

The adapter creates state objects dynamically on the first received event. The meter number reported by the device is used as a channel prefix to distinguish in case of multiple instances for diiferent meters.

State IDs follow the format:

```
iometer.<instance>.<channel>-<meterNumber>.<state>
```

- `<instance>` — ioBroker adapter instance index (usually `0`)
- `<channel>` — either `reading` (meter data), `device` (hardware status) or `info` (connection status)
- `<meterNumber>` — the meter serial number as reported by the device (e.g. `1ISK04051904`)
- `<state>` — the individual data point (see below)

### Reading channel (`reading-<meterNumber>`)

Populated from the `/v1/reading` SSE stream (event type `readingEvent`).

| State | Type | Unit | Role | Description |
|---|---|---|---|---|
| `power` | number | W | `value.power.active` | Current total active power. Uses the sum OBIS value when available, falls back to Phase 1 for single-phase meters. |
| `power_phase1` | number | W | `value.power.active` | Active power on Phase L1 |
| `power_phase2` | number | W | `value.power.active` | Active power on Phase L2 |
| `power_phase3` | number | W | `value.power.active` | Active power on Phase L3 |
| `energy_imported` | number | kWh | `value.energy.consumed` | Total imported energy |
| `energy_exported` | number | kWh | `value.energy.produced` | Total exported energy |
| `energy_imported_t1` | number | kWh | `value.energy.consumed` | Imported energy — Tariff 1 |
| `energy_imported_t2` | number | kWh | `value.energy.consumed` | Imported energy — Tariff 2 |

### Device channel (`device-<meterNumber>`)

Populated from the `/v1/status` SSE stream (event type `statusEvent`).

| State | Type | Unit | Role | Description |
|---|---|---|---|---|
| `id` | string | — | `info.serial` | Unique device ID |
| `meter_number` | string | — | `info.serial` | Meter serial number |
| `bridge_rssi` | number | dBm | `value.rssi` | WiFi signal strength of the bridge module |
| `bridge_firmware` | string | — | `info.firmware` | Firmware version of the bridge module |
| `core_rssi` | number | dBm | `value.rssi` | RF signal strength between core and bridge |
| `core_firmware` | string | — | `info.firmware` | Firmware version of the core module |
| `battery_level` | number | % | `value.battery` | Battery level of the core module |
| `power_status` | string | — | `info.status` | Power supply status (e.g. `wired`, `battery`) |
| `attachment_status` | string | — | `info.status` | Attachment status of the core module |

### Connection state

| State | Description |
|---|---|
| `info.connection` | `true` when the reading stream is receiving data, `false` otherwise |

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (torben-iometer) initial release

## License

MIT License

Copyright (c) 2026 torben-iometer <torben@iometer.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
