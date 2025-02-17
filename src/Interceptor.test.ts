import { describe, vi, it, expect, afterEach } from 'vitest'
import {
  Interceptor,
  getGlobalSymbol,
  deleteGlobalSymbol,
  InterceptorReadyState,
} from './Interceptor'
import { nextTickAsync } from './utils/nextTick'

const symbol = Symbol('test')

afterEach(() => {
  deleteGlobalSymbol(symbol)
})

it('does not set a maximum listeners limit', () => {
  const interceptor = new Interceptor(symbol)
  expect(interceptor['emitter'].getMaxListeners()).toBe(0)
})

describe('persistence', () => {
  it('stores global reference to the applied interceptor', () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()

    expect(getGlobalSymbol(symbol)).toEqual(interceptor)
  })

  it('deletes global reference when the interceptor is disposed', () => {
    const interceptor = new Interceptor(symbol)

    interceptor.apply()
    interceptor.dispose()

    expect(getGlobalSymbol(symbol)).toBeUndefined()
  })
})

describe('readyState', () => {
  it('sets the state to "INACTIVE" when the interceptor is created', () => {
    const interceptor = new Interceptor(symbol)
    expect(interceptor.readyState).toBe(InterceptorReadyState.INACTIVE)
  })

  it('leaves state as "INACTIVE" if the interceptor failed the environment check', async () => {
    class MyInterceptor extends Interceptor<any> {
      protected checkEnvironment(): boolean {
        return false
      }
    }
    const interceptor = new MyInterceptor(symbol)
    interceptor.apply()

    expect(interceptor.readyState).toBe(InterceptorReadyState.INACTIVE)

    await nextTickAsync(() => {
      expect(interceptor.readyState).toBe(InterceptorReadyState.INACTIVE)
    })
  })

  it('perfroms state transition when the interceptor is applying', async () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()

    expect(interceptor.readyState).toBe(InterceptorReadyState.APPLYING)

    await nextTickAsync(() => {
      expect(interceptor.readyState).toBe(InterceptorReadyState.APPLIED)
    })
  })

  it('perfroms state transition when disposing of the interceptor', async () => {
    const interceptor = new Interceptor(symbol)
    interceptor.apply()
    interceptor.dispose()

    expect(interceptor.readyState).toBe(InterceptorReadyState.DISPOSING)

    await nextTickAsync(() => {
      expect(interceptor.readyState).toBe(InterceptorReadyState.DISPOSED)
    })
  })
})

describe('apply', () => {
  it('does not apply the same interceptor multiple times', () => {
    const interceptor = new Interceptor(symbol)
    const setupSpy = vi.spyOn(
      interceptor,
      // @ts-expect-error Protected property spy.
      'setup'
    )

    // Intentionally apply the same interceptor multiple times.
    interceptor.apply()
    interceptor.apply()
    interceptor.apply()

    // The "setup" must not be called repeatedly.
    expect(setupSpy).toHaveBeenCalledTimes(1)

    expect(getGlobalSymbol(symbol)).toEqual(interceptor)
  })

  it('does not call "apply" if the interceptor fails environment check', () => {
    class MyInterceptor extends Interceptor<{}> {
      checkEnvironment() {
        return false
      }
    }

    const interceptor = new MyInterceptor(Symbol('test'))
    const setupSpy = vi.spyOn(
      interceptor,
      // @ts-expect-error Protected property spy.
      'setup'
    )
    interceptor.apply()

    expect(setupSpy).not.toHaveBeenCalled()
  })

  it('proxies listeners from new interceptor to already running interceptor', () => {
    const firstInterceptor = new Interceptor(symbol)
    const secondInterceptor = new Interceptor(symbol)

    firstInterceptor.apply()
    const firstListener = vi.fn()
    firstInterceptor.on('test', firstListener)

    secondInterceptor.apply()
    const secondListener = vi.fn()
    secondInterceptor.on('test', secondListener)

    // Emitting event in the first interceptor will bubble to the second one.
    firstInterceptor['emitter'].emit('test', 'hello world')

    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(firstListener).toHaveBeenCalledWith('hello world')

    expect(secondListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledWith('hello world')

    expect(secondInterceptor['emitter'].listenerCount('test')).toBe(0)
  })
})

describe('dispose', () => {
  it('removes all listeners when the interceptor is disposed', async () => {
    const interceptor = new Interceptor(symbol)

    interceptor.apply()
    const listener = vi.fn()
    interceptor.on('test', listener)
    interceptor.dispose()

    // Even after emitting an event, the listener must not get called.
    interceptor['emitter'].emit('test')
    expect(listener).not.toHaveBeenCalled()

    // The listener must not be called on the next tick either.
    await nextTickAsync(() => {
      interceptor['emitter'].emit('test')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
