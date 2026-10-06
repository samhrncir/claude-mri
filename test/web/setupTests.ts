// React Flow needs ResizeObserver, DOMMatrixReadOnly and element size getters that jsdom lacks.
import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock, writable: true })
}

if (!('DOMMatrixReadOnly' in globalThis)) {
  class DOMMatrixReadOnlyMock {
    m22 = 1
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1]
      this.m22 = scale === undefined ? 1 : Number(scale)
    }
  }
  Object.defineProperty(globalThis, 'DOMMatrixReadOnly', { value: DOMMatrixReadOnlyMock, writable: true })
}

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 100, configurable: true },
  offsetWidth: { get: () => 100, configurable: true },
})

if (typeof SVGElement !== 'undefined' && !('getBBox' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    configurable: true,
  })
}
