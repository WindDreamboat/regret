import { expect, test, type Page } from '@playwright/test'

const INPUT = 'input[placeholder="说点什么…"]'
const BUBBLES = 'main > div'

/** MockChatProvider 会把最后一条用户消息回显成这个格式 */
const replyTo = (text: string) => `我听到你说：${text}`

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator(INPUT)).toBeVisible()
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.fill(INPUT, text)
  await page.press(INPUT, 'Enter')
  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo(text))
}

/**
 * 用 MutationObserver 记录助手气泡出现过的每一个不同文本。
 * 比轮询可靠：不会因为采样间隔漏掉中间态。
 */
async function trackBubbleTexts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = []
    Object.assign(window, { __bubbleTexts: seen })

    const main = document.querySelector('main')
    if (!main) return

    new MutationObserver(() => {
      const bubbles = main.querySelectorAll(':scope > div')
      const last = bubbles[bubbles.length - 1]
      if (!last) return
      const text = last.textContent ?? ''
      if (seen[seen.length - 1] !== text) seen.push(text)
    }).observe(main, { childList: true, subtree: true, characterData: true })
  })
}

test('首屏渲染应用外壳', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await gotoApp(page)

  await expect(page.locator('header h1')).toHaveText('虚拟伴侣')
  await expect(page.getByText('还没有对话，先打个招呼吧')).toBeVisible()
  await expect(page.getByRole('button', { name: '人设' })).toBeVisible()
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible()

  expect(consoleErrors).toEqual([])
})

test('助手回复是逐字流式出现的', async ({ page }) => {
  await gotoApp(page)
  await trackBubbleTexts(page)

  await sendMessage(page, '你好')

  const observed = await page.evaluate(
    () => (window as unknown as { __bubbleTexts: string[] }).__bubbleTexts,
  )
  const final = replyTo('你好')

  // 只保留「比最终文本短、且是它前缀」的取值 —— 那才是逐字增长的中间态。
  // 用户气泡「你好」与 pending 占位「…」都不满足前缀关系，会被排除。
  // 若 delayMs 退回 0，助手气泡会一步到位，这里只剩 0 个中间态，测试即失败。
  const partials = observed.filter((text) => text !== '' && text !== final && final.startsWith(text))

  expect(partials.length).toBeGreaterThan(1)
  expect(observed.at(-1)).toBe(final)
})

test('消息按发送方分列且配色不同', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')
  await sendMessage(page, '今天怎么样')

  const bubbles = page.locator(BUBBLES)
  await expect(bubbles).toHaveCount(4)

  const styles = await bubbles.evaluateAll((elements) =>
    elements.map((element) => {
      const inner = element.firstElementChild as HTMLElement
      const computed = getComputedStyle(inner)
      return {
        text: element.textContent ?? '',
        justify: getComputedStyle(element).justifyContent,
        background: computed.backgroundColor,
        color: computed.color,
      }
    }),
  )

  expect(styles.map((style) => style.text)).toEqual([
    '你好',
    replyTo('你好'),
    '今天怎么样',
    replyTo('今天怎么样'),
  ])
  expect(styles.map((style) => style.justify)).toEqual([
    'flex-end',
    'flex-start',
    'flex-end',
    'flex-start',
  ])

  const [user, assistant] = styles
  expect(user?.background).not.toBe(assistant?.background)
  expect(user?.color).not.toBe(assistant?.color)
})

test('刷新后消息从 IndexedDB 恢复', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')
  await sendMessage(page, '今天怎么样')

  await page.reload()

  const bubbles = page.locator(BUBBLES)
  await expect(bubbles).toHaveCount(4)
  await expect(bubbles.last()).toHaveText(replyTo('今天怎么样'))
})

test('人设保存后标题变化且刷新后保留', async ({ page }) => {
  await gotoApp(page)
  await expect(page.locator('header h1')).toHaveText('虚拟伴侣')

  await page.getByRole('button', { name: '人设' }).click()
  await expect(page.getByText('人设配置')).toBeVisible()
  for (const label of ['伴侣的名字', '她对你的称呼', '性格', '背景故事']) {
    await expect(page.getByText(label)).toBeVisible()
  }

  await page.getByPlaceholder('例如：小满').fill('小满')
  await page.getByPlaceholder('例如：温和，爱吐槽，偶尔嘴硬').fill('温和，爱吐槽')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.locator('header h1')).toHaveText('小满')

  await page.reload()
  await expect(page.locator('header h1')).toHaveText('小满')

  await page.getByRole('button', { name: '人设' }).click()
  await expect(page.getByPlaceholder('例如：小满')).toHaveValue('小满')
  await expect(page.getByPlaceholder('例如：温和，爱吐槽，偶尔嘴硬')).toHaveValue('温和，爱吐槽')
})
