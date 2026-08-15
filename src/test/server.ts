import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      version: '0.3.0-test',
    }),
  ),
  http.get('/api/v1/devices', () => HttpResponse.json([])),
]

export const server = setupServer(...handlers)
