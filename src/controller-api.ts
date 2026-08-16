import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'

export interface ControllerConnection {
  device_id: string
  stable_key: string
  transport: string
  target: string
  port?: number | null
  unit_id: number
  usb_serial?: string | null
  usb_vid?: number | null
  usb_pid?: number | null
  status: string
  role: 'current' | 'previous'
  first_seen?: string | null
  last_seen?: string | null
  last_error?: string | null
}

export interface ControllerRecord {
  controller_uid: string
  controller_id: string
  identity_source: 'controller_serial' | 'usb_serial' | 'endpoint'
  identity_value?: string
  canonical_device_id?: string
  current_device_id: string
  history_device_ids?: string[]
  status: string
  vendor_name?: string
  product_code?: string
  profile: string
  family?: string
  model?: string
  serial_number?: string
  firmware?: string
  hardware_revision?: string
  confidence?: number | null
  first_seen?: string | null
  last_seen?: string | null
  connection_count: number
  active_connection_count: number
  current_connection: ControllerConnection
  connections: ControllerConnection[]
}

export interface ControllerInventoryGroups {
  primary: ControllerRecord[]
  unverifiedLegacy: ControllerRecord[]
}

export function partitionControllerInventory(
  records: ControllerRecord[] | undefined,
): ControllerInventoryGroups {
  const primary: ControllerRecord[] = []
  const unverifiedLegacy: ControllerRecord[] = []

  for (const controller of records ?? []) {
    if (controller.identity_source === 'endpoint' && controller.active_connection_count === 0) {
      unverifiedLegacy.push(controller)
    } else {
      primary.push(controller)
    }
  }

  return { primary, unverifiedLegacy }
}

export function preferredController(records: ControllerRecord[] | undefined): ControllerRecord | undefined {
  const { primary, unverifiedLegacy } = partitionControllerInventory(records)
  return (
    primary.find((controller) => controller.active_connection_count > 0) ??
    primary[0] ??
    unverifiedLegacy[0]
  )
}

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

export function useControllers() {
  return useQuery({
    queryKey: ['controllers'],
    queryFn: ({ signal }) => apiGet<ControllerRecord[]>('/v1/controllers', undefined, signal),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}
