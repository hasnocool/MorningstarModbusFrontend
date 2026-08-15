import { describe, expect, it } from 'vitest'
import type { LatestSample } from '../api'
import {
  decodeDeviceId,
  encodeDeviceId,
  flattenRegisterDefinitions,
  formatBytes,
  metric,
  rangeForPreset,
} from '../lib'

describe('device URL encoding', () => {
  it('round-trips stable IDs containing slashes and punctuation', () => {
    const value = 'serial:/dev/ttyUSB0?unit=1'
    expect(decodeDeviceId(encodeDeviceId(value))).toBe(value)
  })
})

describe('history presets', () => {
  it('selects a coarser resolution for longer windows', () => {
    expect(rangeForPreset('1h').resolution).toBe('raw')
    expect(rangeForPreset('7d').resolution).toBe('15m')
    expect(rangeForPreset('30d').resolution).toBe('1h')
  })
})

describe('telemetry metric selection', () => {
  const sample: LatestSample = {
    id: 1,
    device_id: 'serial:/dev/ttyUSB0?unit=1',
    observed_at: '2026-08-15T03:30:00Z',
    latency_ms: 210,
    profile: 'tristar_mppt',
    values: [
      {
        register_name: 'battery_voltage',
        address: 0x0018,
        function: 'holding',
        numeric_value: 14.1,
        unit: 'V',
      },
      {
        register_name: 'battery_sense_voltage',
        address: 0x001a,
        function: 'holding',
        numeric_value: 13.92,
        unit: 'V',
      },
      {
        register_name: 'daily_charge_wh',
        address: 0x0044,
        function: 'holding',
        numeric_value: 2487,
        unit: 'Wh',
      },
    ],
  }

  it('keeps battery sense voltage distinct from terminal battery voltage', () => {
    expect(metric(sample, 'batteryVoltage')?.register_name).toBe('battery_voltage')
    expect(metric(sample, 'batterySenseVoltage')?.register_name).toBe('battery_sense_voltage')
  })

  it('uses the controller daily Wh counter for generated-today energy', () => {
    const generated = metric(sample, 'dailyChargeWh')
    expect(generated?.register_name).toBe('daily_charge_wh')
    expect(generated?.numeric_value).toBe(2487)
    expect(generated?.unit).toBe('Wh')
  })
})

describe('register map flattening', () => {
  it('finds register-shaped entries in nested catalog structures', () => {
    const rows = flattenRegisterDefinitions({
      blocks: [
        {
          registers: [
            {
              name: 'battery_voltage',
              address: 27,
              function: 'holding',
              unit: 'V',
            },
          ],
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'battery_voltage',
      address: 27,
      unit: 'V',
    })
  })
})

describe('formatting', () => {
  it('formats database sizes using binary units', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB')
  })
})
