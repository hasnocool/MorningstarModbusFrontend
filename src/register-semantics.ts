import type { RegisterValue } from './api'
import {
  isRawRegisterName,
  semanticRegisterValues,
  type FlatRegisterDefinition,
} from './lib'

export interface ReservedRegisterRange {
  address: number
  count: number
  function: string
  description?: string
}

// Compatibility metadata for older MorningstarModbusAPI versions that do not
// yet publish reserved_ranges in /v1/devices/register-map. These spans come
// directly from the Morningstar TriStar MPPT MODBUS v11 document.
const LEGACY_RESERVED_RANGES: Record<string, ReservedRegisterRange[]> = {
  tristar_mppt: [
    {
      address: 0x0005,
      count: 0x0013,
      function: 'holding',
      description: 'Reserved RAM words 0x0005-0x0017.',
    },
    { address: 0x002d, count: 1, function: 'holding', description: 'Reserved status word.' },
    {
      address: 0x003f,
      count: 1,
      function: 'holding',
      description: 'Reserved word between MPPT and daily logger values.',
    },
    {
      address: 0x004a,
      count: 1,
      function: 'holding',
      description: 'Reserved daily-logger word.',
    },
    {
      address: 0xe0c4,
      count: 8,
      function: 'holding',
      description: 'Reserved factory metadata words between serial number and model flag.',
    },
  ],
}

function parseReservedRange(value: unknown): ReservedRegisterRange | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.address !== 'number') return null
  const count = typeof record.count === 'number' ? Math.max(1, Math.trunc(record.count)) : 1
  return {
    address: record.address,
    count,
    function: typeof record.function === 'string' ? record.function : 'holding',
    description: typeof record.description === 'string' ? record.description : undefined,
  }
}

export function reservedRegisterRanges(
  registerMap: unknown,
  profile?: string,
): ReservedRegisterRange[] {
  const record =
    registerMap && typeof registerMap === 'object'
      ? (registerMap as Record<string, unknown>)
      : undefined
  const published = Array.isArray(record?.reserved_ranges)
    ? record.reserved_ranges.map(parseReservedRange).filter((item): item is ReservedRegisterRange => item !== null)
    : []

  if (published.length) return published

  const profileName =
    profile ?? (typeof record?.profile === 'string' ? record.profile : undefined)
  return profileName ? (LEGACY_RESERVED_RANGES[profileName] ?? []) : []
}

function reservedAddressKeys(ranges: ReservedRegisterRange[]): Set<string> {
  const keys = new Set<string>()
  ranges.forEach((range) => {
    for (let offset = 0; offset < range.count; offset += 1) {
      keys.add(`${range.function}:${range.address + offset}`)
    }
  })
  return keys
}

export function semanticRegisterValuesForMap(
  values: RegisterValue[],
  definitions: FlatRegisterDefinition[],
  registerMap: unknown,
  profile?: string,
): RegisterValue[] {
  const reserved = reservedAddressKeys(reservedRegisterRanges(registerMap, profile))
  return semanticRegisterValues(values, definitions).filter((value) => {
    if (!isRawRegisterName(value.register_name)) return true
    return !reserved.has(`${value.function}:${value.address}`)
  })
}
