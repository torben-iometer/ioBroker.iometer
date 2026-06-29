'use strict';

const utils = require('@iobroker/adapter-core');
const EventSource = require('eventsource');
const { parseReading, parseStatus, OBIS_MAP } = require('./lib/iometer-parser');

const OBIS_META = {
	power_phase1: { name: 'Power Phase 1', unit: 'W', role: 'value.power.active' },
	power_phase2: { name: 'Power Phase 2', unit: 'W', role: 'value.power.active' },
	power_phase3: { name: 'Power Phase 3', unit: 'W', role: 'value.power.active' },
	energy_imported: { name: 'Energy Imported Total', unit: 'kWh', role: 'value.energy.consumed' },
	energy_exported: { name: 'Energy Exported Total', unit: 'kWh', role: 'value.energy.produced' },
	energy_imported_t1: { name: 'Energy Imported Tariff 1', unit: 'kWh', role: 'value.energy.consumed' },
	energy_imported_t2: { name: 'Energy Imported Tariff 2', unit: 'kWh', role: 'value.energy.consumed' },
};

/** @type {Array<{id: string, name: string, type: 'string' | 'number', role: string, unit: string | undefined}>} */
const DEVICE_STATES = [
	{ id: 'id', name: 'Device ID', type: 'string', role: 'info.serial', unit: undefined },
	{ id: 'meter_number', name: 'Meter Number', type: 'string', role: 'info.serial', unit: undefined },
	{ id: 'bridge_rssi', name: 'Bridge WiFi RSSI', type: 'number', role: 'value.rssi', unit: 'dBm' },
	{ id: 'bridge_firmware', name: 'Bridge Firmware', type: 'string', role: 'info.firmware', unit: undefined },
	{ id: 'core_rssi', name: 'Core RSSI', type: 'number', role: 'value.rssi', unit: 'dBm' },
	{ id: 'core_firmware', name: 'Core Firmware', type: 'string', role: 'info.firmware', unit: undefined },
	{ id: 'battery_level', name: 'Battery Level', type: 'number', role: 'value.battery', unit: '%' },
	{ id: 'power_status', name: 'Power Status', type: 'string', role: 'info.status', unit: undefined },
	{ id: 'attachment_status', name: 'Attachment Status', type: 'string', role: 'info.status', unit: undefined },
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
		this._initializedMeters = new Set();
	}

	async onReady() {
		const ip = this.config.iometerIp;
		if (!ip) {
			this.log.error('No iometer IP address configured. Please set it in the adapter settings.');
			return;
		}

		await this.setState('info.connection', false, true);
		this._startReadingStream(ip);
		this._startStatusStream(ip);
	}

	/**
	 * Creates channel + state objects for a meter on first encounter.
	 * Subsequent calls for the same meterNumber are no-ops.
	 *
	 * @param {string} meterNumber
	 */
	async _ensureObjects(meterNumber) {
		if (this._initializedMeters.has(meterNumber)) {
			return;
		}
		this._initializedMeters.add(meterNumber);

		const readingChannel = `reading-${meterNumber}`;
		await this.setObjectNotExistsAsync(readingChannel, {
			type: 'channel',
			common: { name: `Meter Readings (${meterNumber})` },
			native: {},
		});
		await this.setObjectNotExistsAsync(`${readingChannel}.power`, {
			type: 'state',
			common: {
				name: 'Current Power',
				type: 'number',
				role: 'value.power.active',
				unit: 'W',
				read: true,
				write: false,
			},
			native: {},
		});
		for (const { id } of OBIS_MAP) {
			const stateKey = id.split('.')[1]; // e.g. "power_phase1"
			const meta = OBIS_META[stateKey];
			await this.setObjectNotExistsAsync(`${readingChannel}.${stateKey}`, {
				type: 'state',
				common: { name: meta.name, type: 'number', role: meta.role, unit: meta.unit, read: true, write: false },
				native: {},
			});
		}

		const deviceChannel = `device-${meterNumber}`;
		await this.setObjectNotExistsAsync(deviceChannel, {
			type: 'channel',
			common: { name: `Device Status (${meterNumber})` },
			native: {},
		});
		for (const def of DEVICE_STATES) {
			const common = { name: def.name, type: def.type, role: def.role, read: true, write: false };
			if (def.unit) {
				common.unit = def.unit;
			}
			await this.setObjectNotExistsAsync(`${deviceChannel}.${def.id}`, { type: 'state', common, native: {} });
		}

		this.log.info(`Objects created for meter ${meterNumber}`);
	}

	_startReadingStream(ip) {
		const url = `http://${ip}/v1/reading`;
		this.log.info(`Connecting to reading stream: ${url}`);

		this._readingSource = new EventSource(url);

		this._readingSource.addEventListener('readingEvent', async event => {
			try {
				const data = JSON.parse(event.data);
				const meterNumber = data.meter?.number || 'unknown';
				await this._ensureObjects(meterNumber);
				for (const { id, val } of parseReading(data, meterNumber)) {
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

		this._readingSource.onerror = err => {
			this.log.warn(`Reading stream error (will retry): ${JSON.stringify(err)}`);
			this.setState('info.connection', false, true);
		};
	}

	_startStatusStream(ip) {
		const url = `http://${ip}/v1/status`;
		this.log.info(`Connecting to status stream: ${url}`);

		this._statusSource = new EventSource(url);

		this._statusSource.addEventListener('statusEvent', async event => {
			try {
				const data = JSON.parse(event.data);
				const meterNumber = data.meter?.number || 'unknown';
				await this._ensureObjects(meterNumber);
				for (const { id, val } of parseStatus(data, meterNumber)) {
					this.setState(id, { val, ack: true });
				}
			} catch (err) {
				this.log.error(`Failed to process status event: ${err.message}`);
			}
		});

		this._statusSource.onopen = () => {
			this.log.info('Status stream connected');
		};

		this._statusSource.onerror = err => {
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
	module.exports = options => new Iometer(options);
} else {
	new Iometer();
}
