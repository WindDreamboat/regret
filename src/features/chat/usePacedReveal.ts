import { useEffect, useRef, useState } from 'react'
import { nextRevealCount } from './pacing'

/** 用户在系统里关掉了动效就直给，不做逐字铺开（无障碍优先，也避免测试抖） */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * 把「已经拿到的文本」按节奏铺开显示，返回当前该显示的部分。
 *
 * 上游逐字给时它只是跟着走；上游整包给时（原生回退路径）它把节奏补回来，
 * 于是两种传输在屏幕上长得一样。上游一结束就立即补齐——界面永远不落后于真实状态。
 */
export function usePacedReveal(full: string, isGenerating: boolean): string {
  const [shown, setShown] = useState(full.length)
  const shownRef = useRef(full.length)
  const lastTickRef = useRef(0)

  // 新的一轮开始：文本被清空则归零重来（同一轮里 full 只会增长）
  useEffect(() => {
    if (full.length < shownRef.current) {
      shownRef.current = 0
      lastTickRef.current = 0
      setShown(0)
    }
  }, [full])

  useEffect(() => {
    const flush = () => {
      if (shownRef.current === full.length) return
      shownRef.current = full.length
      lastTickRef.current = 0
      setShown(full.length)
    }

    if (prefersReducedMotion() || !isGenerating) {
      flush()
      return
    }

    let frame = requestAnimationFrame(function tick(now) {
      if (lastTickRef.current === 0) lastTickRef.current = now

      const next = nextRevealCount({
        shown: shownRef.current,
        total: full.length,
        elapsedMs: now - lastTickRef.current,
        generating: isGenerating,
      })

      if (next !== shownRef.current) {
        shownRef.current = next
        lastTickRef.current = now
        setShown(next)
      }
      if (shownRef.current < full.length) frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [full, isGenerating])

  return full.slice(0, shown)
}
