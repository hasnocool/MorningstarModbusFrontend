import type { LatestSample, RegisterValue } from './api'

export type Theme = 'dark' | 'light' | 'high-contrast'

export function encodeDeviceId(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeDeviceId(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

export function valueOf(register?: RegisterValue): number | string | null {
  if (!register) return null
  if (register.value !== undefined && register.value !== null) return register.value
  if (register.numeric_value !== undefined && register.numeric_value !== null) return register.numeric_value
  if (register.text_value !== undefined && register.text_value !== null) return register.text_value
  return null
}

export function numericValue(register?: RegisterValue): number | null {
  const value = valueOf(register)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function registerIndex(sample?: LatestSample): Map<string, RegisterValue> {
  return new Map((sample?.values ?? []).map((value) => [value.register_name.toLowerCase(), value]))
}

export function findRegister(
  sample: LatestSample | undefined,
  candidates: string[],
  fuzzyTerms: string[] = [],
): RegisterValue | undefined {
  const index = registerIndex(sample)
  for (const candidate of candidates) {
    const exact = index.get(candidate.toLowerCase())
    if (exact) return exact
  }
  if (fuzzyTerms.length) {
    return sample?.values.find((value) => {
      const name = value.register_name.toLowerCase()
      return fuzzyTerms.every((term) => name.includes(term.toLowerCase()))
    })
  }
  return undefined
}

export const TELEMETRY_CANDIDATES = {
  batteryVoltage: {
    names: ['battery_voltage', 'battery_terminal_voltage', 'voltage_battery', 'vb'],
    fuzzy: ['battery', 'voltage'],
  },
  batterySenseVoltage: {
    names: ['battery_sense_voltage', 'battery_remote_sense_voltage', 'sense_voltage'],
    fuzzy: ['battery', 'sense', 'voltage'],
  },
  arrayVoltage: {
    names: ['array_voltage', 'solar_voltage', 'pv_voltage', 'va'],
    fuzzy: ['array', 'voltage'],
  },
  chargeCurrent: {
    names: ['battery_charge_current', 'charge_current', 'battery_current', 'ib'],
    fuzzy: ['battery', 'current'],
  },
  arrayCurrent: {
    names: ['array_current', 'solar_current', 'pv_current', 'ia'],
    fuzzy: ['array', 'current'],
  },
  outputPower: {
    names: ['output_power', 'battery_power', 'power_out'],
    fuzzy: ['output', 'power'],
  },
  inputPower: {
    names: ['input_power', 'array_power', 'solar_power', 'power_in'],
    fuzzy: ['input', 'power'],
  },
  dailyChargeWh: {
    names: ['daily_charge_wh', 'daily_energy_wh', 'today_charge_wh', 'today_energy_wh'],
    fuzzy: ['daily', 'wh'],
  },
  chargeState: {
    names: ['charge_state', 'charge_stage', 'charging_state'],
    fuzzy: ['charge', 'state'],
  },
  targetVoltage: {
    names: ['target_voltage', 'voltage_target', 'v_target'],
    fuzzy: ['target', 'voltage'],
  },
  batteryTemperature: {
    names: ['battery_temperature', 'battery_temp'],
    fuzzy: ['battery', 'temp'],
  },
  heatsinkTemperature: {
    names: ['heatsink_temperature', 'heatsink_temp'],
    fuzzy: ['heatsink', 'temp'],
  },
} as const

export function metric(sample: LatestSample | undefined, key: keyof typeof TELEMETRY_CANDIDATES) {
  const candidate = TELEMETRY_CANDIDATES[key]
  return findRegister(sample, [...candidate.names], [...candidate.fuzzy])
}

export function formatValue(value: unknown, unit?: string | null, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') {
    const formatted = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: Math.abs(value) < 10 ? Math.min(1, digits) : 0,
    }).format(value)
    return unit ? `${formatted} ${unit}` : formatted
  }
  return String(value)
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return 'never'
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms)) return value
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`
  return `${(seconds / 86400).toFixed(1)} days`
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function rangeForPreset(preset: string): { from: string; to: string; resolution: string } {
  const to = new Date()
  const durations: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }
  const duration = durations[preset] ?? durations['24h']
  const from = new Date(to.getTime() - duration)
  const resolution =
    preset === '1h' ? 'raw' : preset === '6h' ? '1m' : preset === '24h' ? '5m' : preset === '7d' ? '15m' : '1h'
  return { from: from.toISOString(), to: to.toISOString(), resolution }
}

export function freshnessState(observedAt?: string): 'fresh' | 'stale' | 'old' {
  if (!observedAt) return 'old'
  const age = Date.now() - new Date(observedAt).getTime()
  if (age < 10_000) return 'fresh'
  if (age < 60_000) return 'stale'
  return 'old'
}

export interface FlatRegisterDefinition {
  name: string
  address?: number
  function?: string
  words?: number
  description?: string
  unit?: string
  scale?: unknown
  firmware?: string
  raw: Record<string, unknown>
}

const REGISTER_LABEL_OVERRIDES: Record<string, string> = {
  battery_voltage: 'Battery voltage',
  battery_terminal_voltage: 'Battery terminal voltage',
  battery_sense_voltage: 'Battery sense voltage',
  battery_voltage_1m: 'Battery voltage (1-minute filtered)',
  charge_current_1m: 'Charge current (1-minute filtered)',
  battery_charge_current: 'Battery charge current',
  array_voltage: 'Solar array voltage',
  array_current: 'Solar array current',
  target_voltage: 'Charge target voltage',
  output_power: 'Charging output power',
  input_power: 'Solar array input power',
  operating_hours: 'Controller operating hours',
  dip_switches: 'DIP switch positions',
  led_state: 'Front-panel LED state',
  charge_state: 'Charge stage',
  charge_ah_resettable: 'Charge amp-hours since reset',
  charge_ah_total: 'Lifetime charge amp-hours',
  charge_kwh_resettable: 'Charge energy since reset',
  charge_kwh_total: 'Lifetime charge energy',
  sweep_max_power: 'Last MPPT sweep maximum power',
  sweep_vmp: 'Last MPPT sweep Vmp',
  sweep_voc: 'Last MPPT sweep Voc',
  daily_charge_ah: 'Charge amp-hours today',
  daily_charge_wh: 'Generated today',
  daily_output_power_max: 'Maximum charging power today',
  daily_absorption_seconds: 'Time in Absorption today',
  daily_equalize_seconds: 'Time in Equalize today',
  daily_float_seconds: 'Time in Float today',
  rts_temp: 'Remote battery temperature sensor',
  heatsink_temp: 'Controller heatsink temperature',
  battery_temp: 'Battery regulation temperature',
}

const WORD_LABELS: Record<string, string> = {
  ah: 'Ah',
  kwh: 'kWh',
  wh: 'Wh',
  mppt: 'MPPT',
  rts: 'RTS',
  dip: 'DIP',
  led: 'LED',
  vmp: 'Vmp',
  voc: 'Voc',
}

export function isRawRegisterName(name: string): boolean {
  return /^(holding|input)_0x[0-9a-f]{4}$/i.test(name)
}

export function plainRegisterLabel(name: string): string {
  const override = REGISTER_LABEL_OVERRIDES[name.toLowerCase()]
  if (override) return override
  const raw = /^(holding|input)_0x([0-9a-f]{4})$/i.exec(name)
  if (raw) return `Unmapped ${raw[1].toLowerCase()} register 0x${raw[2].toUpperCase()}`

  const words = name.split('_').filter(Boolean)
  const text = words
    .map((word) => WORD_LABELS[word.toLowerCase()] ?? word.toLowerCase())
    .join(' ')
  return text ? text[0].toUpperCase() + text.slice(1) : name
}

export function flattenRegisterDefinitions(input: unknown): FlatRegisterDefinition[] {
  const output: FlatRegisterDefinition[] = []
  const seen = new Set<object>()

  function visit(value: unknown, keyHint?: string) {
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      if (keyHint === 'reserved_ranges') {
        value.forEach((item) => {
          if (!item || typeof item !== 'object') return
          const record = item as Record<string, unknown>
          if (typeof record.address !== 'number') return
          const fn = typeof record.function === 'string' ? record.function : 'holding'
          const count =
            typeof record.count === 'number' ? Math.max(1, Math.trunc(record.count)) : 1
          for (let offset = 0; offset < count; offset += 1) {
            const address = record.address + offset
            output.push({
              name: `__reserved_${fn}_0x${address.toString(16).padStart(4, '0')}`,
              address,
              function: fn,
              words: 1,
              description:
                typeof record.description === 'string'
                  ? record.description
                  : 'Manufacturer-reserved register.',
              raw: { ...record, reserved: true },
            })
          }
        })
        return
      }
      value.forEach((item) => visit(item))
      return
    }

    const record = value as Record<string, unknown>
    const name =
      typeof record.name === 'string'
        ? record.name
        : typeof record.register_name === 'string'
          ? record.register_name
          : keyHint

    const looksLikeRegister =
      name &&
      (typeof record.address === 'number' ||
        typeof record.function === 'string' ||
        'scale' in record ||
        'unit' in record)

    if (looksLikeRegister) {
      output.push({
        name,
        address: typeof record.address === 'number' ? record.address : undefined,
        function: typeof record.function === 'string' ? record.function : undefined,
        words: typeof record.words === 'number' ? record.words : 1,
        description: typeof record.description === 'string' ? record.description : undefined,
        unit: typeof record.unit === 'string' ? record.unit : undefined,
        scale: record.scale,
        firmware:
          typeof record.since_firmware === 'string'
            ? `since ${record.since_firmware}`
            : typeof record.until_firmware === 'string'
              ? `until ${record.until_firmware}`
              : undefined,
        raw: record,
      })
    }

    Object.entries(record).forEach(([key, child]) => {
      if (child && typeof child === 'object') visit(child, key)
    })
  }

  visit(input)
  return [...new Map(output.map((item) => [item.name, item])).values()].sort((a, b) => {
    if (a.address !== undefined && b.address !== undefined) return a.address - b.address
    return a.name.localeCompare(b.name)
  })
}

export function semanticRegisterValues(
  values: RegisterValue[],
  definitions: FlatRegisterDefinition[],
): RegisterValue[] {
  const documentedAddresses = new Set<string>()
  definitions.forEach((definition) => {
    if (definition.address === undefined) return
    const fn = definition.function ?? 'holding'
    for (let offset = 0; offset < (definition.words ?? 1); offset += 1) {
      documentedAddresses.add(`${fn}:${definition.address + offset}`)
    }
  })

  const namedAddresses = new Set(
    values
      .filter((value) => !isRawRegisterName(value.register_name))
      .map((value) => `${value.function}:${value.address}`),
  )

  return values.filter((value) => {
    if (!isRawRegisterName(value.register_name)) return true
    const key = `${value.function}:${value.address}`
    return !documentedAddresses.has(key) && !namedAddresses.has(key)
  })
}

export function loadTheme(): Theme {
  const saved = localStorage.getItem('ms-theme')
  if (saved === 'light' || saved === 'high-contrast' || saved === 'dark') return saved
  return 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('ms-theme', theme)
}
