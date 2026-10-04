import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** 距底部这么多像素内算「贴着底」，容下气泡间距与光标呼吸 */
const STICK_THRESHOLD_PX = 64

/**
 * 内容增长时让列表跟随到最新一条。
 *
 * 两条规则：
 * - **用户主动往上翻时不抢滚动**——读历史时被拽回底部是最恼人的体验之一；
 *   等他自己滚回贴底位置，跟随自动恢复。
 * - **键盘弹出/收起、字号重排等几何变化**同样按"是否贴底"决定跟不跟：
 *   这类变化不产生内容变更，若只盯着内容 key，贴底状态会在一次布局变化后悄悄失效。
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  contentKey: unknown,
): { stickToBottom: () => void } {
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
    if (element === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!stuckRef.current) return
      element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (element === null || !stuckRef.current) return
    // 逐字增长时按帧跟随，因此用瞬时定位而不是平滑滚动（平滑会互相打断）
    element.scrollTop = element.scrollHeight
  }, [ref, contentKey])

  /**
   * 强制回到最新一条，并把状态标回「贴底」。
   *
   * 给**用户自己的动作**用（发消息）：发消息意味着"我要看最新的一句"，
   * 就算他此刻正翻着历史，也应当回到底部——这条不该被"不抢滚动"拦下。
   */
  const stickToBottom = useCallback(() => {
    const element = ref.current
    if (element === null) return
    stuckRef.current = true
    element.scrollTop = element.scrollHeight
  }, [ref])

  return { stickToBottom }
}
