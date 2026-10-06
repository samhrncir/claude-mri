// The only component that subscribes to zoom: sets data-zoom and --counter on the wrapper so CSS does semantic zoom.
import { useStore } from '@xyflow/react'
import { useEffect, type RefObject } from 'react'
import type { ZoomBucket } from '../../store/types.js'

export function bucketFor(zoom: number): ZoomBucket {
  return zoom < 0.4 ? 'far' : zoom < 0.9 ? 'mid' : 'near'
}

export function ZoomClass({ wrapper }: { wrapper: RefObject<HTMLDivElement | null> }) {
  const zoom = useStore((s) => s.transform[2])
  const bucket = bucketFor(zoom)
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    el.setAttribute('data-zoom', bucket)
    el.style.setProperty('--counter', String(Math.min(3, Math.max(1, 0.5 / Math.max(zoom, 0.08)))))
  }, [bucket, zoom, wrapper])
  return null
}
