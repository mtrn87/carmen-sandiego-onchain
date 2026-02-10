// Polyfills para Web3Auth no Vite
const nextTickQueue = []
let nextTickScheduled = false

const flushNextTick = () => {
  nextTickScheduled = false
  while (nextTickQueue.length > 0) {
    const cb = nextTickQueue.shift()
    try {
      cb()
    } catch (e) {
      console.error('Error in nextTick callback:', e)
    }
  }
}

const processNextTick = (cb) => {
  nextTickQueue.push(cb)
  if (!nextTickScheduled) {
    nextTickScheduled = true
    Promise.resolve().then(flushNextTick)
  }
}

// Define global
if (typeof global === 'undefined') {
  window.global = window
}

// Define process com todas as propriedades necessárias
if (typeof process === 'undefined' || !process.nextTick) {
  window.process = {
    env: {},
    nextTick: processNextTick,
    browser: true,
    version: 'v22.0.0',
    versions: { node: '22.0.0' },
    platform: 'browser',
    arch: 'browser',
  }
}

// Garante que process.nextTick está disponível
if (!window.process.nextTick) {
  window.process.nextTick = processNextTick
}

// Define Buffer
if (typeof Buffer === 'undefined') {
  window.Buffer = {
    isBuffer: () => false,
    from: (data) => data,
    alloc: (size) => new Uint8Array(size),
  }
}

// Polyfill para stream
if (typeof require === 'undefined') {
  window.require = (module) => {
    if (module === 'process') {
      return window.process
    }
    if (module === 'buffer') {
      return window.Buffer
    }
    if (module === 'stream') {
      return {}
    }
    return {}
  }
}
