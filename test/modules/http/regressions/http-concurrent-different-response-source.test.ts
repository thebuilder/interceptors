import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { httpGet } from '../../../helpers'
import { sleep } from '../../../../test/helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/', async (req, res) => {
    await sleep(300)
    res.status(200).send('original-response')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', async (request) => {
  if (request.headers.get('x-bypass')) {
    return
  }

  await sleep(250)

  request.respondWith(new Response('mocked-response', { status: 201 }))
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles concurrent requests with different response sources', async () => {
  const requests = await Promise.all([
    httpGet(httpServer.http.url('/')),
    httpGet(httpServer.http.url('/'), {
      headers: {
        'x-bypass': 'yes',
      },
    }),
  ])

  expect(requests[0].res.statusCode).toEqual(201)
  expect(requests[0].resBody).toEqual('mocked-response')

  expect(requests[1].res.statusCode).toEqual(200)
  expect(requests[1].resBody).toEqual('original-response')
})
