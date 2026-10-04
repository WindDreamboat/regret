/**
 * 逐字铺开的节奏。
 *
 * 存在的理由：上游不一定逐字给。Mock 是逐字流，但真实厂商可能**整包返回**（实测
 * `gateway.example.com` 往返 4.9 s 一次给完），若照原样渲染，回复会"啪"地整段出现——
 * 这正是「打字机效果不行」的根源。这里把已经拿到的文本按节奏铺开，让两种情况的手感一致。
 *
 * 规则：基础 20 ms/字；积压越多越快（2×/3× 档），因此长回复不会拖成十几秒。
 * 上游一旦结束（`generating` 为 false），立即补齐，绝不让界面落后于真实状态。
 */

/** 基础字速：每字 20 ms，约 50 字/秒，接近正常阅读速度 */
const MS_PER_CHAR = 20

/** 积压超过这两档时加速铺开，避免长回复拖太久 */
const BACKLOG_CATCH_UP = 60
const BACKLOG_HURRY = 160

export interface RevealInput {
  /** 已经显示的字数 */
  shown: number
  /** 当前已知的总字数（流式过程中会增长） */
  total: number
  /** 距上一次推进的毫秒数 */
  elapsedMs: number
  /** 上游是否仍在生成；false 表示应立刻补齐 */
  generating: boolean
}

/** 返回下一帧应显示的字符数（单调不减，且不超过 total）。 */
export function nextRevealCount({ shown, total, elapsedMs, generating }: RevealInput): number {
  if (total <= shown) return total
  if (!generating) return total

  const backlog = total - shown
  const speedUp = backlog > BACKLOG_HURRY ? 3 : backlog > BACKLOG_CATCH_UP ? 2 : 1
  const advanced = Math.floor(elapsedMs / (MS_PER_CHAR / speedUp))

  return Math.min(total, shown + Math.max(0, advanced))
}
