import { useEffect, useRef, type RefObject } from 'react'

/** 距底部这么多像素内算「贴着底」，容下气泡间距与光标呼吸 */
const STICK_THRESHOLD_PX = 64

/**
 * 内容增长时让列表跟随到最新一条。
 *
 * 关键取舍：**用户主动往上翻时不抢滚动**——读历史时被拽回底部是最恼人的体验之一；
 * 等他自己滚回贴底位置，跟随自动恢复。
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, contentKey: unknown): void {
  const stuckRef = useRef(true)

  useEffect(() => {
    const element = ref.current
    if (element === null) return

    const handleScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight
      stuckRef.current = distance <= STICK_THRESHOLD_PX
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (element === null || !stuckRef.current) return
    // 逐字增长时按帧跟随，因此用瞬时定位而不是平滑滚动（平滑会互相打断）
    element.scrollTop = element.scrollHeight
  }, [ref, contentKey])
}
