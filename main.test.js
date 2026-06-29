/// <reference types="mocha" />
'use strict';

const { expect } = require('chai');
const { parseReading, parseStatus } = require('./lib/iometer-parser');

const METER = '1ISK04051904';

function makeReading(registers) {
	return { meter: { number: METER, reading: { registers } } };
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
		meter: { number: meterNumber ?? METER },
	};
}

// ─── parseReading ────────────────────────────────────────────────────────────

describe('parseReading', () => {
	it('returns empty array for null input', () => {
		expect(parseReading(null, METER)).to.deep.equal([]);
	});

	it('returns empty array when registers is missing', () => {
		expect(parseReading({ meter: {} }, METER)).to.deep.equal([]);
	});

	it('returns empty array for empty registers', () => {
		expect(parseReading(makeReading([]), METER)).to.deep.equal([]);
	});

	describe('reading.power — total power', () => {
		it('uses sum OBIS (10.07.00) when present', () => {
			const data = makeReading([
				{ obis: '01-00:10.07.00*ff', value: 1500 },
				{ obis: '01-00:24.07.00*ff', value: 800 },
			]);
			const result = parseReading(data, METER);
			const power = result.find((s) => s.id === `reading-${METER}.power`);
			expect(power).to.exist;
			expect(power?.val).to.equal(1500);
		});

		it('falls back to phase 1 OBIS (24.07.00) when sum OBIS is absent', () => {
			const data = makeReading([{ obis: '01-00:24.07.00*ff', value: 800 }]);
			const result = parseReading(data, METER);
			const power = result.find((s) => s.id === `reading-${METER}.power`);
			expect(power).to.exist;
			expect(power?.val).to.equal(800);
		});

		it('omits reading.power when neither sum nor phase 1 OBIS is present', () => {
			const data = makeReading([{ obis: '01-00:38.07.00*ff', value: 400 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.power`)).to.be.undefined;
		});
	});

	describe('phase power states', () => {
		it('sets power_phase1 from 24.07.00', () => {
			const data = makeReading([{ obis: '01-00:24.07.00*ff', value: 700 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.power_phase1`)?.val).to.equal(700);
		});

		it('sets power_phase2 from 38.07.00', () => {
			const data = makeReading([{ obis: '01-00:38.07.00*ff', value: 500 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.power_phase2`)?.val).to.equal(500);
		});

		it('sets power_phase3 from 4c.07.00', () => {
			const data = makeReading([{ obis: '01-00:4c.07.00*ff', value: 300 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.power_phase3`)?.val).to.equal(300);
		});
	});

	describe('energy states — Wh → kWh conversion', () => {
		it('converts energy_imported from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.00*ff', value: 12345000 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.energy_imported`)?.val).to.equal(12345);
		});

		it('converts energy_exported from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:02.08.00*ff', value: 5000 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.energy_exported`)?.val).to.equal(5);
		});

		it('converts energy_imported_t1 from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.01*ff', value: 7000 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.energy_imported_t1`)?.val).to.equal(7);
		});

		it('converts energy_imported_t2 from Wh to kWh', () => {
			const data = makeReading([{ obis: '01-00:01.08.02*ff', value: 3000 }]);
			expect(parseReading(data, METER).find((s) => s.id === `reading-${METER}.energy_imported_t2`)?.val).to.equal(3);
		});
	});

	it('ignores unknown OBIS codes', () => {
		const data = makeReading([{ obis: '99-99:99.99.99*ff', value: 999 }]);
		expect(parseReading(data, METER)).to.deep.equal([]);
	});

	it('state IDs are prefixed with the meter number', () => {
		const data = makeReading([{ obis: '01-00:10.07.00*ff', value: 100 }]);
		const ids = parseReading(data, METER).map((s) => s.id);
		expect(ids.every((id) => id.startsWith(`reading-${METER}.`))).to.be.true;
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
		const result = parseReading(data, METER);
		const ids = result.map((s) => s.id);
		expect(ids).to.include.members([
			`reading-${METER}.power`,
			`reading-${METER}.power_phase1`,
			`reading-${METER}.power_phase2`,
			`reading-${METER}.power_phase3`,
			`reading-${METER}.energy_imported`,
			`reading-${METER}.energy_exported`,
			`reading-${METER}.energy_imported_t1`,
			`reading-${METER}.energy_imported_t2`,
		]);
		expect(result.find((s) => s.id === `reading-${METER}.power`)?.val).to.equal(2100);
		expect(result.find((s) => s.id === `reading-${METER}.energy_imported`)?.val).to.equal(10000);
	});
});

// ─── parseStatus ─────────────────────────────────────────────────────────────

describe('parseStatus', () => {
	it('returns empty array for null input', () => {
		expect(parseStatus(null, METER)).to.deep.equal([]);
	});

	it('returns empty array when device is missing', () => {
		expect(parseStatus({ meter: { number: METER } }, METER)).to.deep.equal([]);
	});

	it('extracts device id', () => {
		const result = parseStatus(makeStatus({ deviceId: 'abc-123' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.id`)?.val).to.equal('abc-123');
	});

	it('extracts bridge RSSI', () => {
		const result = parseStatus(makeStatus({ bridgeRssi: -65 }), METER);
		expect(result.find((s) => s.id === `device-${METER}.bridge_rssi`)?.val).to.equal(-65);
	});

	it('extracts bridge firmware version', () => {
		const result = parseStatus(makeStatus({ bridgeVersion: '1.2.3' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.bridge_firmware`)?.val).to.equal('1.2.3');
	});

	it('extracts core RSSI', () => {
		const result = parseStatus(makeStatus({ coreRssi: -72 }), METER);
		expect(result.find((s) => s.id === `device-${METER}.core_rssi`)?.val).to.equal(-72);
	});

	it('extracts core firmware version', () => {
		const result = parseStatus(makeStatus({ coreVersion: '2.0.0' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.core_firmware`)?.val).to.equal('2.0.0');
	});

	it('extracts battery level', () => {
		const result = parseStatus(makeStatus({ batteryLevel: 87 }), METER);
		expect(result.find((s) => s.id === `device-${METER}.battery_level`)?.val).to.equal(87);
	});

	it('extracts power status', () => {
		const result = parseStatus(makeStatus({ powerStatus: 'wired' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.power_status`)?.val).to.equal('wired');
	});

	it('extracts attachment status', () => {
		const result = parseStatus(makeStatus({ attachmentStatus: 'attached' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.attachment_status`)?.val).to.equal('attached');
	});

	it('extracts meter number', () => {
		const result = parseStatus(makeStatus({ meterNumber: 'MSN-0042' }), METER);
		expect(result.find((s) => s.id === `device-${METER}.meter_number`)?.val).to.equal('MSN-0042');
	});

	it('state IDs are prefixed with the meter number', () => {
		const result = parseStatus(makeStatus({ deviceId: 'x' }), METER);
		expect(result.every((s) => s.id.startsWith(`device-${METER}.`))).to.be.true;
	});

	it('omits states whose values are undefined', () => {
		const result = parseStatus(makeStatus({ deviceId: 'x' }), METER);
		const ids = result.map((s) => s.id);
		expect(ids).to.include(`device-${METER}.id`);
		expect(ids).not.to.include(`device-${METER}.battery_level`);
		expect(ids).not.to.include(`device-${METER}.bridge_rssi`);
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
		}), METER);
		expect(result).to.have.length(9);
	});
});
