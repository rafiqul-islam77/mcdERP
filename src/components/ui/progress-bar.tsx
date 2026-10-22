'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

interface ProgressBarContextType {
  start: () => void
  done: () => void
}

const ProgressBarContext = React.createContext<ProgressBarContextType | null>(null)

export function useProgressBar() {
  const ctx = React.useContext(ProgressBarContext)
  if (!ctx) {
    return {
      start: () => {},
      done: () => {},
    }
  }
  return ctx
}

export function GlobalProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [state, setState] = React.useState<'idle' | 'loading' | 'finishing'>('idle')
  const [progress, setProgress] = React.useState(0)
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = React.useCallback(() => {
    clearTimer()
    setState('loading')
    setProgress(20)

    // Simulate progress increments up to 85%
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          clearTimer()
          return 85
        }
        // As it approaches 85, increment slower
        const diff = 85 - prev
        const step = Math.max(1, Math.floor(diff * 0.15))
        return prev + step
      })
    }, 150)
  }, [])

  const done = React.useCallback(() => {
    clearTimer()
    setProgress(100)
    setState('finishing')

    setTimeout(() => {
      setState('idle')
      setProgress(0)
    }, 250)
  }, [])

  // Whenever pathname or searchParams change, navigation is complete
  React.useEffect(() => {
    if (state !== 'idle') {
      done()
    }
  }, [pathname, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global click interception on internal links
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = e.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return

      // Ignore external, hash, target blank, modified clicks (cmd, ctrl, shift)
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#') ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return
      }

      // Check if clicking current URL
      const currentFull = window.location.pathname + window.location.search
      if (href === currentFull || href === window.location.pathname) {
        return
      }

      // Start progress bar immediately
      start()
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
      clearTimer()
    }
  }, [start])

  if (state === 'idle') {
    return null
  }

  return (
    <ProgressBarContext.Provider value={{ start, done }}>
      <div
        className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none bg-transparent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="h-full bg-brand shadow-[0_0_10px_#2563eb,0_0_5px_#2563eb] transition-all duration-200 ease-out"
          style={{
            width: `${progress}%`,
            opacity: state === 'finishing' ? 0 : 1,
            transitionProperty: 'width, opacity',
            transitionDuration: state === 'finishing' ? '250ms' : '200ms',
          }}
        />
      </div>
    </ProgressBarContext.Provider>
  )
}
