'use strict';

const utils = require('@iobroker/adapter-core');
const EventSource = require('eventsource');
const { parseReading, parseStatus, OBIS_MAP } = require('./lib/iometer-parser');

// State metadata for object creation — name/unit/role per OBIS entry
const OBIS_META = {
	'reading.power_phase1':       { name: 'Power Phase 1',            unit: 'W',   role: 'value.power.active'    },
	'reading.power_phase2':       { name: 'Power Phase 2',            unit: 'W',   role: 'value.power.active'    },
	'reading.power_phase3':       { name: 'Power Phase 3',            unit: 'W',   role: 'value.power.active'    },
	'reading.energy_imported':    { name: 'Energy Imported Total',    unit: 'kWh', role: 'value.energy.consumed' },
	'reading.energy_exported':    { name: 'Energy Exported Total',    unit: 'kWh', role: 'value.energy.produced' },
	'reading.energy_imported_t1': { name: 'Energy Imported Tariff 1', unit: 'kWh', role: 'value.energy.consumed' },
	'reading.energy_imported_t2': { name: 'Energy Imported Tariff 2', unit: 'kWh', role: 'value.energy.consumed' },
};

/** @type {Array<{id: string, name: string, type: 'string' | 'number', role: string, unit: string | undefined}>} */
const DEVICE_STATES = [
	{ id: 'device.id',                name: 'Device ID',         type: 'string', role: 'info.serial',   unit: undefined },
	{ id: 'device.meter_number',      name: 'Meter Number',      type: 'string', role: 'info.serial',   unit: undefined },
	{ id: 'device.bridge_rssi',       name: 'Bridge WiFi RSSI',  type: 'number', role: 'value.rssi',    unit: 'dBm'     },
	{ id: 'device.bridge_firmware',   name: 'Bridge Firmware',   type: 'string', role: 'info.firmware', unit: undefined },
	{ id: 'device.core_rssi',         name: 'Core RSSI',         type: 'number', role: 'value.rssi',    unit: 'dBm'     },
	{ id: 'device.core_firmware',     name: 'Core Firmware',     type: 'string', role: 'info.firmware', unit: undefined },
	{ id: 'device.battery_level',     name: 'Battery Level',     type: 'number', role: 'value.battery', unit: '%'       },
	{ id: 'device.power_status',      name: 'Power Status',      type: 'string', role: 'info.status',   unit: undefined },
	{ id: 'device.attachment_status', name: 'Attachment Status', type: 'string', role: 'info.status',   unit: undefined },
];

class Iometer extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options]
	 */
	constructor(options) {
		super({ ...options, name: 'iometer' });
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this._readingSource = null;
		this._statusSource = null;
	}

	async onReady() {
		const ip = this.config.iometerIp;
		if (!ip) {
			this.log.error('No iometer IP address configured. Please set it in the adapter settings.');
			return;
		}

		await this._createObjects();
		await this.setState('info.connection', false, true);

		this._startReadingStream(ip);
		this._startStatusStream(ip);
	}

	async _createObjects() {
		await this.setObjectNotExistsAsync('reading', {
			type: 'channel',
			common: { name: 'Meter Readings' },
			native: {},
		});

		await this.setObjectNotExistsAsync('reading.power', {
			type: 'state',
			common: { name: 'Current Power', type: 'number', role: 'value.power.active', unit: 'W', read: true, write: false },
			native: {},
		});

		for (const { id } of OBIS_MAP) {
			const meta = OBIS_META[id];
			await this.setObjectNotExistsAsync(id, {
				type: 'state',
				common: { name: meta.name, type: 'number', role: meta.role, unit: meta.unit, read: true, write: false },
				native: {},
			});
		}

		await this.setObjectNotExistsAsync('device', {
			type: 'channel',
			common: { name: 'Device Status' },
			native: {},
		});

		for (const def of DEVICE_STATES) {
			const common = { name: def.name, type: def.type, role: def.role, read: true, write: false };
			if (def.unit) common.unit = def.unit;
			await this.setObjectNotExistsAsync(def.id, { type: 'state', common, native: {} });
		}
	}

	_startReadingStream(ip) {
		const url = `http://${ip}/v1/reading`;
		this.log.info(`Connecting to reading stream: ${url}`);

		this._readingSource = new EventSource(url);

		this._readingSource.addEventListener('readingEvent', (event) => {
			try {
				const data = JSON.parse(event.data);
				for (const { id, val } of parseReading(data)) {
					this.setState(id, { val, ack: true });
				}
				this.setState('info.connection', true, true);
			} catch (err) {
				this.log.error(`Failed to process reading event: ${err.message}`);
			}
		});

		this._readingSource.onopen = () => {
			this.log.info('Reading stream connected');
		};

		this._readingSource.onerror = (err) => {
			this.log.warn(`Reading stream error (will retry): ${JSON.stringify(err)}`);
			this.setState('info.connection', false, true);
		};
	}

	_startStatusStream(ip) {
		const url = `http://${ip}/v1/status`;
		this.log.info(`Connecting to status stream: ${url}`);

		this._statusSource = new EventSource(url);

		this._statusSource.addEventListener('statusEvent', (event) => {
			try {
				const data = JSON.parse(event.data);
				for (const { id, val } of parseStatus(data)) {
					this.setState(id, { val, ack: true });
				}
			} catch (err) {
				this.log.error(`Failed to process status event: ${err.message}`);
			}
		});

		this._statusSource.onopen = () => {
			this.log.info('Status stream connected');
		};

		this._statusSource.onerror = (err) => {
			this.log.warn(`Status stream error (will retry): ${JSON.stringify(err)}`);
		};
	}

	onUnload(callback) {
		try {
			if (this._readingSource) {
				this._readingSource.close();
				this._readingSource = null;
			}
			if (this._statusSource) {
				this._statusSource.close();
				this._statusSource = null;
			}
			callback();
		} catch (error) {
			this.log.error(`Error during unload: ${error.message}`);
			callback();
		}
	}
}

if (require.main !== module) {
	module.exports = (options) => new Iometer(options);
} else {
	new Iometer();
}
