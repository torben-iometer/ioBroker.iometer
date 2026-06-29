'use strict';

// OBIS code → state mapping (reading.power handled separately with fallback)
const OBIS_MAP = [
	{ obis: '01-00:24.07.00*ff', id: 'reading.power_phase1',       factor: 1     },
	{ obis: '01-00:38.07.00*ff', id: 'reading.power_phase2',       factor: 1     },
	{ obis: '01-00:4c.07.00*ff', id: 'reading.power_phase3',       factor: 1     },
	{ obis: '01-00:01.08.00*ff', id: 'reading.energy_imported',    factor: 0.001 },
	{ obis: '01-00:02.08.00*ff', id: 'reading.energy_exported',    factor: 0.001 },
	{ obis: '01-00:01.08.01*ff', id: 'reading.energy_imported_t1', factor: 0.001 },
	{ obis: '01-00:01.08.02*ff', id: 'reading.energy_imported_t2', factor: 0.001 },
];

const OBIS_POWER_SUM   = '01-00:10.07.00*ff';
const OBIS_POWER_PHASE1 = '01-00:24.07.00*ff';

/**
 * Parse a readingEvent payload into a flat list of state updates.
 * Returns an empty array for invalid or missing data — never throws.
 *
 * @param {any} data - Parsed JSON from the SSE readingEvent
 * @returns {Array<{id: string, val: number}>}
 */
function parseReading(data) {
	const registers = data?.meter?.reading?.registers;
	if (!Array.isArray(registers)) return [];

	const obisValues = new Map(registers.map((r) => [r.obis, r.value]));
	const result = [];

	// Total power: prefer sum OBIS, fall back to Phase 1 (single-phase meters)
	const totalPower = obisValues.has(OBIS_POWER_SUM)
		? obisValues.get(OBIS_POWER_SUM)
		: obisValues.get(OBIS_POWER_PHASE1);
	if (totalPower !== undefined) {
		result.push({ id: 'reading.power', val: totalPower });
	}

	for (const { obis, id, factor } of OBIS_MAP) {
		const raw = obisValues.get(obis);
		if (raw !== undefined) {
			result.push({ id, val: raw * factor });
		}
	}

	return result;
}

/**
 * Parse a statusEvent payload into a flat list of state updates.
 * Returns an empty array for invalid or missing data — never throws.
 *
 * @param {any} data - Parsed JSON from the SSE statusEvent
 * @returns {Array<{id: string, val: string|number}>}
 */
function parseStatus(data) {
	const device = data?.device;
	if (!device) return [];

	const result = [];

	if (device.id !== undefined)                    result.push({ id: 'device.id',                val: device.id });
	if (device.bridge?.rssi !== undefined)           result.push({ id: 'device.bridge_rssi',       val: device.bridge.rssi });
	if (device.bridge?.version !== undefined)        result.push({ id: 'device.bridge_firmware',   val: device.bridge.version });
	if (device.core?.rssi !== undefined)             result.push({ id: 'device.core_rssi',         val: device.core.rssi });
	if (device.core?.version !== undefined)          result.push({ id: 'device.core_firmware',     val: device.core.version });
	if (device.core?.batteryLevel !== undefined)     result.push({ id: 'device.battery_level',     val: device.core.batteryLevel });
	if (device.core?.powerStatus !== undefined)      result.push({ id: 'device.power_status',      val: device.core.powerStatus });
	if (device.core?.attachmentStatus !== undefined) result.push({ id: 'device.attachment_status', val: device.core.attachmentStatus });
	if (data.meter?.number !== undefined)            result.push({ id: 'device.meter_number',      val: data.meter.number });

	return result;
}

module.exports = { parseReading, parseStatus, OBIS_MAP };
