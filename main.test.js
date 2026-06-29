/// <reference types="mocha" />
'use strict';

const { expect } = require('chai');
const { parseReading, parseStatus } = require('./lib/iometer-parser');

// Helpers to build test payloads
function makeReading(registers) {
	return { meter: { reading: { registers } } };
}

/**
 * @param {{ deviceId?: string, bridgeRssi?: number, bridgeVersion?: string, coreRssi?: number, coreVersion?: string, batteryLevel?: number, powerStatus?: string, attachmentStatus?: string, meterNumber?: string }} [opts]
 */
function makeStatus({ deviceId, bridgeRssi, bridgeVersion, coreRssi, coreVersion, batteryLevel, powerStatus, attachmentStatus, meterNumber } = {}) {
	return {
		device: {
			id: deviceId,
			bridge: { rssi: bridgeRssi, version: bridgeVersion },
			core:   { rssi: coreRssi, version: coreVersion, batteryLevel, powerStatus, attachmentStatus },
		},
		meter: { number: meterNumber },
	};
}

// ─── parseReading ────────────────────────────────────────────────────────────

describe('parseReading', () => {
	it('returns empty array for null input', () => {
		expect(parseReading(null)).to.deep.equal([]);
	});

	it('returns empty array when registers is missing', () => {
		expect(parseReading({ meter: {} })).to.deep.equal([]);
	});

	it('returns empty array for empty registers', () => {
		expect(parseReading(makeReading([]))).to.deep.equal([]);
	});

	describe('reading.power — total power', () => {
		it('uses sum OBIS (10.07.00) when present', () => {
			const data = makeReading([
				{ obis: '01-00:10.07.00*ff', value: 1500 },
				{ obis: '01-00:24.07.00*ff', value: 800 },
			]);
			const result = parseReading(data);
			const power = result.find((s) => s.id === 'reading.power');
			expect(power).to.exist;
			expect(power?.val).to.equal(1500);
		});

		it('falls back to phase 1 OBIS (24.07.00) when sum OBIS is absent', () => {
			const data = makeReading([{ obis: '01-00:24.07.00*ff', value: 800 }]);
			const result = parseReading(data);
			const power = result.find((s) => s.id === 'reading.power');
			expect(power).to.exist;
			expect(power?.val).to.equal(800);
		});

		it('omits reading.power when neither sum nor phase 1 OBIS is present', () => {
			const data = makeReading([{ obis: '01-00:38.07.00*ff', value: 400 }]);
			const result = parseReading(data);
			expect(result.find((s) => s.id === 'reading.power')).to.be.undefined;
		});
	});

	describe('phase power states', () => {
		it('sets power_phase1 from 24.07.00', () => {
			const data = makeReading([{ obis: '01-00:24.07.00*ff', value: 700 }]);
			const result = parseReading(data);
			expect(result.find((s) => s.id === 'reading.power_phase1')?.val).to.equal(700);
		});

		it('sets power_phase2 from 38.07.00', () => {
			const data = makeReading([{ obis: '01-00:38.07.00*ff', value: 500 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.power_phase2')?.val).to.equal(500);
		});

		it('sets power_phase3 from 4c.07.00', () => {
			const data = makeReading([{ obis: '01-00:4c.07.00*ff', value: 300 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.power_phase3')?.val).to.equal(300);
		});
	});

	describe('energy states — Wh → kWh conversion', () => {
		it('converts energy_imported from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.00*ff', value: 12345000 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.energy_imported')?.val).to.equal(12345);
		});

		it('converts energy_exported from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:02.08.00*ff', value: 5000 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.energy_exported')?.val).to.equal(5);
		});

		it('converts energy_imported_t1 from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.01*ff', value: 7000 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.energy_imported_t1')?.val).to.equal(7);
		});

		it('converts energy_imported_t2 from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.02*ff', value: 3000 }]);
			expect(parseReading(data).find((s) => s.id === 'reading.energy_imported_t2')?.val).to.equal(3);
		});
	});

	it('ignores unknown OBIS codes', () => {
		const data = makeReading([{ obis: '99-99:99.99.99*ff', value: 999 }]);
		expect(parseReading(data)).to.deep.equal([]);
	});

	it('handles a full 3-phase reading payload', () => {
		const data = makeReading([
			{ obis: '01-00:10.07.00*ff', value: 2100 },
			{ obis: '01-00:24.07.00*ff', value: 700 },
			{ obis: '01-00:38.07.00*ff', value: 700 },
			{ obis: '01-00:4c.07.00*ff', value: 700 },
			{ obis: '01-00:01.08.00*ff', value: 10000000 },
			{ obis: '01-00:02.08.00*ff', value: 500000  },
			{ obis: '01-00:01.08.01*ff', value: 6000000 },
			{ obis: '01-00:01.08.02*ff', value: 4000000 },
		]);
		const result = parseReading(data);
		const ids = result.map((s) => s.id);
		expect(ids).to.include.members([
			'reading.power',
			'reading.power_phase1',
			'reading.power_phase2',
			'reading.power_phase3',
			'reading.energy_imported',
			'reading.energy_exported',
			'reading.energy_imported_t1',
			'reading.energy_imported_t2',
		]);
		expect(result.find((s) => s.id === 'reading.power')?.val).to.equal(2100);
		expect(result.find((s) => s.id === 'reading.energy_imported')?.val).to.equal(10000);
	});
});

// ─── parseStatus ─────────────────────────────────────────────────────────────

describe('parseStatus', () => {
	it('returns empty array for null input', () => {
		expect(parseStatus(null)).to.deep.equal([]);
	});

	it('returns empty array when device is missing', () => {
		expect(parseStatus({ meter: { number: '123' } })).to.deep.equal([]);
	});

	it('extracts device id', () => {
		const result = parseStatus(makeStatus({ deviceId: 'abc-123' }));
		expect(result.find((s) => s.id === 'device.id')?.val).to.equal('abc-123');
	});

	it('extracts bridge RSSI', () => {
		const result = parseStatus(makeStatus({ bridgeRssi: -65 }));
		expect(result.find((s) => s.id === 'device.bridge_rssi')?.val).to.equal(-65);
	});

	it('extracts bridge firmware version', () => {
		const result = parseStatus(makeStatus({ bridgeVersion: '1.2.3' }));
		expect(result.find((s) => s.id === 'device.bridge_firmware')?.val).to.equal('1.2.3');
	});

	it('extracts core RSSI', () => {
		const result = parseStatus(makeStatus({ coreRssi: -72 }));
		expect(result.find((s) => s.id === 'device.core_rssi')?.val).to.equal(-72);
	});

	it('extracts core firmware version', () => {
		const result = parseStatus(makeStatus({ coreVersion: '2.0.0' }));
		expect(result.find((s) => s.id === 'device.core_firmware')?.val).to.equal('2.0.0');
	});

	it('extracts battery level', () => {
		const result = parseStatus(makeStatus({ batteryLevel: 87 }));
		expect(result.find((s) => s.id === 'device.battery_level')?.val).to.equal(87);
	});

	it('extracts power status', () => {
		const result = parseStatus(makeStatus({ powerStatus: 'wired' }));
		expect(result.find((s) => s.id === 'device.power_status')?.val).to.equal('wired');
	});

	it('extracts attachment status', () => {
		const result = parseStatus(makeStatus({ attachmentStatus: 'attached' }));
		expect(result.find((s) => s.id === 'device.attachment_status')?.val).to.equal('attached');
	});

	it('extracts meter number', () => {
		const result = parseStatus(makeStatus({ meterNumber: 'MSN-0042' }));
		expect(result.find((s) => s.id === 'device.meter_number')?.val).to.equal('MSN-0042');
	});

	it('omits states whose values are undefined', () => {
		const result = parseStatus(makeStatus({ deviceId: 'x' }));
		const ids = result.map((s) => s.id);
		expect(ids).to.include('device.id');
		expect(ids).not.to.include('device.battery_level');
		expect(ids).not.to.include('device.bridge_rssi');
	});

	it('handles a complete status payload', () => {
		const result = parseStatus(makeStatus({
			deviceId:         'dev-001',
			bridgeRssi:       -60,
			bridgeVersion:    '1.0.0',
			coreRssi:         -75,
			coreVersion:      '2.1.0',
			batteryLevel:     95,
			powerStatus:      'battery',
			attachmentStatus: 'attached',
			meterNumber:      'MSN-9999',
		}));
		expect(result).to.have.length(9);
	});
});
