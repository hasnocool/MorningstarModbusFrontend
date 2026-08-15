import { describe, expect, it } from 'vitest'
import type { RegisterValue } from '../api'
import { flattenRegisterDefinitions, semanticRegisterValues } from '../lib'
import {
  reservedRegisterRanges,
  semanticRegisterValuesForMap,
} from '../register-semantics'

function raw(address: number): RegisterValue {
  return {
    register_name: `holding_0x${address.toString(16).padStart(4, '0').toUpperCase()}`,
    address,
    function: 'holding',
    numeric_value: address,
  }
}

describe('reserved register classification', () => {
  it('uses reserved ranges published by the backend register map', () => {
    const registerMap = {
      profile: 'tristar_mppt',
      reserved_ranges: [
        { address: 0x002d, count: 1, function: 'holding', description: 'Reserved status word.' },
      ],
      registers: [
        { name: 'faults', address: 0x002c, function: 'holding', words: 1 },
        { name: 'alarms', address: 0x002e, function: 'holding', words: 2 },
      ],
    }
    const definitions = flattenRegisterDefinitions(registerMap)
    const values: RegisterValue[] = [
      raw(0x002d),
      raw(0x0060),
      {
        register_name: 'faults',
        address: 0x002c,
        function: 'holding',
        text_value: 'NONE',
      },
    ]

    expect(
      semanticRegisterValuesForMap(values, definitions, registerMap, 'tristar_mppt').map(
        (item) => item.register_name,
      ),
    ).toEqual(['holding_0x0060', 'faults'])
  })

  it('lets the shared live-page filter suppress published reserved words', () => {
    const registerMap = {
      profile: 'tristar_mppt',
      reserved_ranges: [{ address: 0x002d, count: 1, function: 'holding' }],
      registers: [{ name: 'faults', address: 0x002c, function: 'holding' }],
    }
    const definitions = flattenRegisterDefinitions(registerMap)

    expect(semanticRegisterValues([raw(0x002d), raw(0x0060)], definitions).map((item) => item.address)).toEqual([
      0x0060,
    ])
  })

  it('falls back to the documented TriStar MPPT v11 reserved spans for older APIs', () => {
    const registerMap = {
      profile: 'tristar_mppt',
      registers: [{ name: 'battery_voltage', address: 0x0018, function: 'holding' }],
    }
    const ranges = reservedRegisterRanges(registerMap, 'tristar_mppt')
    const definitions = flattenRegisterDefinitions(registerMap)
    const values = [
      raw(0x0005),
      raw(0x0017),
      raw(0x002d),
      raw(0x003f),
      raw(0x004a),
      raw(0xe0c4),
      raw(0xe0cb),
      raw(0x0060),
    ]

    expect(ranges).toHaveLength(5)
    expect(
      semanticRegisterValuesForMap(values, definitions, registerMap, 'tristar_mppt').map(
        (item) => item.address,
      ),
    ).toEqual([0x0060])
  })

  it('does not hide genuinely unknown raw addresses for other profiles', () => {
    const registerMap = { profile: 'generic', registers: [] }
    const values = [raw(0x002d)]

    expect(
      semanticRegisterValuesForMap(values, [], registerMap, 'generic').map(
        (item) => item.register_name,
      ),
    ).toEqual(['holding_0x002D'])
  })
})
