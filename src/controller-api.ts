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
  controller_id: string
  identity_source: 'controller_serial' | 'usb_serial' | 'endpoint'
  current_device_id: string
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
