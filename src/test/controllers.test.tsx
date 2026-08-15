import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DevicesPage } from '../pages/core'
import { server } from './server'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DevicesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('controller inventory', () => {
  it('shows one physical controller with three connection records', async () => {
    server.use(
      http.get('/api/v1/controllers', () =>
        HttpResponse.json([
          {
            controller_id: 'morningstar:tristar_mppt:ts123456',
            identity_source: 'controller_serial',
            current_device_id: 'serial:/dev/ttyUSB2:unit:1',
            status: 'online',
            vendor_name: 'Morningstar Corp.',
            product_code: 'TS-MPPT-60',
            profile: 'tristar_mppt',
            family: 'TriStar MPPT 150V',
            model: 'TS-MPPT-60',
            serial_number: 'TS123456',
            firmware: '29',
            last_seen: new Date().toISOString(),
            connection_count: 3,
            active_connection_count: 1,
            current_connection: {
              device_id: 'serial:/dev/ttyUSB2:unit:1',
              stable_key: 'serial:/dev/ttyUSB2:unit:1',
              transport: 'serial',
              target: '/dev/ttyUSB2',
              unit_id: 1,
              status: 'online',
              role: 'current',
              last_seen: new Date().toISOString(),
            },
            connections: [
              {
                device_id: 'serial:/dev/ttyUSB2:unit:1',
                stable_key: 'serial:/dev/ttyUSB2:unit:1',
                transport: 'serial',
                target: '/dev/ttyUSB2',
                unit_id: 1,
                status: 'online',
                role: 'current',
                last_seen: new Date().toISOString(),
              },
              {
                device_id: 'serial:/dev/ttyUSB1:unit:1',
                stable_key: 'serial:/dev/ttyUSB1:unit:1',
                transport: 'serial',
                target: '/dev/ttyUSB1',
                unit_id: 1,
                status: 'offline',
                role: 'previous',
                last_seen: '2026-08-15T03:00:00Z',
              },
              {
                device_id: 'serial:/dev/ttyUSB0:unit:1',
                stable_key: 'serial:/dev/ttyUSB0:unit:1',
                transport: 'serial',
                target: '/dev/ttyUSB0',
                unit_id: 1,
                status: 'offline',
                role: 'previous',
                last_seen: '2026-08-14T22:00:00Z',
              },
            ],
          },
        ]),
      ),
      http.get('/api/v1/devices/latest', () =>
        HttpResponse.json({
          id: 10,
          device_id: 'serial:/dev/ttyUSB2:unit:1',
          observed_at: new Date().toISOString(),
          latency_ms: 180,
          profile: 'tristar_mppt',
          values: [
            {
              register_name: 'battery_voltage',
              address: 24,
              function: 'holding',
              numeric_value: 14.2,
              unit: 'V',
            },
            {
              register_name: 'daily_charge_wh',
              address: 68,
              function: 'holding',
              numeric_value: 2490,
              unit: 'Wh',
            },
            {
              register_name: 'output_power',
              address: 58,
              function: 'holding',
              numeric_value: 438,
              unit: 'W',
            },
            {
              register_name: 'charge_state',
              address: 50,
              function: 'holding',
              text_value: 'MPPT',
            },
          ],
        }),
      ),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Controllers' })).toBeInTheDocument()
    expect(screen.getByText('TS-MPPT-60')).toBeInTheDocument()
    expect(screen.getByText('Serial TS123456')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(await screen.findByText('2,490 Wh')).toBeInTheDocument()
    expect(screen.getByText('/dev/ttyUSB2')).toBeInTheDocument()
    expect(screen.getByText('3 known connections')).toBeInTheDocument()
  })
})
