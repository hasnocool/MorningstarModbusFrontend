import { describe, expect, it } from 'vitest'
import {
  decodeDeviceId,
  encodeDeviceId,
  flattenRegisterDefinitions,
  formatBytes,
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
