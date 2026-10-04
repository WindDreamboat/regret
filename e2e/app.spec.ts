import { expect, test, type Page } from '@playwright/test'

const INPUT = 'input[placeholder="说点什么…"]'
const BUBBLES = 'main > div'

/** MockChatProvider 会把最后一条用户消息回显成这个格式 */
const replyTo = (text: string) => `我听到你说：${text}`

/** MockChatProvider 的主动开场文案 */
const WELCOME = '嗨，我在的，今天想聊点什么？'
const FOLLOW_UP = '你之前提到的那件事，后来怎么样了？'
const CONTINUATION_PREFIX = '（接着上次的话题）'

/** 存在风格设定段时 MockChatProvider 会给回复加的前缀 */
const STRATEGY_PREFIX = '（按你的设定）'

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator(INPUT)).toBeVisible()
  // 首次进入伴侣会自动说开场白。仅等文本出现不够：那是流式中的草稿，此时仍在生成，
  // 后续发送会被 generatingRef 静默丢弃；因此还要等「生成中」气泡消失。
  await expect(page.locator(BUBBLES).first()).toHaveText(WELCOME)
  await expect(page.getByTestId('pending-bubble')).toHaveCount(0)
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.fill(INPUT, text)
  await page.press(INPUT, 'Enter')
  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo(text))
  await settleAfterSend(page)
}

/** 只发送不断言：回复可能带风格前缀，期望值由调用方给出 */
async function sendRaw(page: Page, text: string): Promise<void> {
  await page.fill(INPUT, text)
  await page.press(INPUT, 'Enter')
  await settleAfterSend(page)
}

/**
 * 等一次生成真正结束。
 *
 * 助手气泡在流式结束时就显示完整文本，但落库与关系写入发生在其后、`isGenerating`
 * 复位之前；若不等，紧接着刷新页面或切走视图，未落库的那条就会丢。三个状态在同一个
 * `finally` 里复位，而「生成中」气泡是它唯一可见的表现，因此以它消失为准。
 */
async function settleAfterSend(page: Page): Promise<void> {
  await expect(page.getByTestId('pending-bubble')).toHaveCount(0)
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

  await expect(page.locator('header h1')).toHaveText('小满')
  await expect(page.locator(BUBBLES)).toHaveCount(1)
  await expect(page.locator(BUBBLES).first()).toHaveText(WELCOME)
  // 配置入口收成一个：人设已并入设置，对话页头部不再有「人设」按钮
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '人设' })).toHaveCount(0)
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
  await expect(bubbles).toHaveCount(5)

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
    WELCOME,
    '你好',
    replyTo('你好'),
    '今天怎么样',
    replyTo('今天怎么样'),
  ])
  expect(styles.map((style) => style.justify)).toEqual([
    'flex-start',
    'flex-end',
    'flex-start',
    'flex-end',
    'flex-start',
  ])

  const user = styles[1]
  const assistant = styles[2]
  // 区分靠「对齐 + 底色」：两边的字色刻意一致（同色字、不同底），加字色差异只是噪音
  expect(user?.background).not.toBe(assistant?.background)
  expect(user?.color).toBe(assistant?.color)
})

test('新消息自动跟随到底部，不需要手动滚动', async ({ page }) => {
  await gotoApp(page)

  // 连发几条把列表撑出屏幕；跟随失效的话最后一条会在视野外
  for (const text of ['一', '二', '三', '四', '五']) {
    await sendMessage(page, text)
  }

  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo('五'))
  await expect(page.locator(BUBBLES).last()).toBeInViewport()
})

test('刷新后消息从 IndexedDB 恢复', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')
  await sendMessage(page, '今天怎么样')

  await page.reload()

  const bubbles = page.locator(BUBBLES)
  await expect(bubbles).toHaveCount(5)
  await expect(bubbles.last()).toHaveText(replyTo('今天怎么样'))
})

test('状态块从回复中剥离，不展示给用户也不落库', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')

  const bubble = page.locator(BUBBLES).last()
  await expect(bubble).toHaveText(replyTo('你好'))
  await expect(page.locator('body')).not.toContainText('<state>')
  await expect(page.locator('body')).not.toContainText('affection_delta')

  await page.reload()
  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo('你好'))
  await expect(page.locator('body')).not.toContainText('<state>')
})

test('关系状态条展示阶段、亲密度与情绪，并随回复更新', async ({ page }) => {
  await gotoApp(page)

  const bar = page.getByTestId('relation-bar')
  await expect(bar).toContainText('初识')
  await expect(bar).toContainText('亲密度 0')

  await sendMessage(page, '你好')

  await expect(bar).toContainText('亲密度 1')
  await expect(bar).toContainText('温和')
})

test('人设改动即时生效，刷新后保留', async ({ page }) => {
  await gotoApp(page)
  await expect(page.locator('header h1')).toHaveText('小满')

  await openSettings(page, '人设')
  for (const label of ['她的名字', '她对你的称呼', '性格', '背景故事']) {
    await expect(page.getByText(label)).toBeVisible()
  }

  // 没有保存按钮：改一个字符就已生效并落盘
  await page.getByPlaceholder('例如：小满').fill('阿念')
  await page.getByPlaceholder('例如：温和，爱吐槽，偶尔嘴硬').fill('温柔，话少')

  await backToChat(page)
  await expect(page.locator('header h1')).toHaveText('阿念')

  await page.reload()
  await expect(page.locator('header h1')).toHaveText('阿念')

  await openSettings(page, '人设')
  await expect(page.getByPlaceholder('例如：小满')).toHaveValue('阿念')
  await expect(page.getByPlaceholder('例如：温和，爱吐槽，偶尔嘴硬')).toHaveValue('温柔，话少')
})

/**
 * 播种「隔天重新打开」的场景：清空消息后写入一条 8 小时前的用户消息
 * 与一条已发生、未追问的事件事实。
 *
 * 必须先让应用打开数据库（等待开场白），再用原生 IndexedDB 写入，
 * 否则会以错误版本抢先创建库，破坏 Dexie schema。
 */
async function seedReturningUser(page: Page): Promise<void> {
  await gotoApp(page)
  await page.evaluate(async () => {
    const openReq = indexedDB.open('regret')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openReq.onsuccess = () => resolve(openReq.result)
      openReq.onerror = () => reject(openReq.error)
    })

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['messages', 'facts'], 'readwrite')
      const messages = tx.objectStore('messages')
      messages.clear()
      messages.add({
        sessionId: 'default',
        role: 'user',
        content: '我明天有个面试',
        ts: Date.now() - 8 * 60 * 60 * 1000,
      })
      tx.objectStore('facts').put({
        sessionId: 'default',
        key: 'user.interview',
        value: '面试',
        category: 'event',
        confidence: 0.9,
        eventAt: Date.now() - 60 * 60 * 1000,
        sourceMsgIds: [],
        firstSeenAt: 0,
        updatedAt: 0,
        status: 'confirmed',
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  await page.reload()
  // 重新打开后伴侣会主动追问；必须等这次生成结束，否则紧接着的发送会被丢弃
  await expect(page.locator(BUBBLES).last()).toHaveText(FOLLOW_UP)
  await settleAfterSend(page)
}

test('重新打开且存在到期事件时伴侣主动追问', async ({ page }) => {
  await seedReturningUser(page)

  const bubbles = page.locator(BUBBLES)
  await expect(bubbles).toHaveCount(2)
  await expect(bubbles.first()).toHaveText('我明天有个面试')
  await expect(bubbles.last()).toHaveText(FOLLOW_UP)
})

test('追问后下一条回复延续该话题，且重新打开不重复追问', async ({ page }) => {
  await seedReturningUser(page)
  await expect(page.locator(BUBBLES).last()).toHaveText(FOLLOW_UP)

  await sendRaw(page, '刚忙完，还行')
  await expect(page.locator(BUBBLES).last()).toHaveText(`${CONTINUATION_PREFIX}${replyTo('刚忙完，还行')}`)

  // 事件已标记追问过，再次打开不再重复追问，气泡数保持不变
  await page.reload()
  await expect(page.locator(BUBBLES)).toHaveCount(4)
  await expect(page.locator(BUBBLES).last()).toHaveText(`${CONTINUATION_PREFIX}${replyTo('刚忙完，还行')}`)
})

/**
 * 打开设置并切到指定分类。
 *
 * 设置按「要改的是什么」分成四类，一次只呈现一类；不传分类时停在默认的「人设」。
 */
const openSettings = async (
  page: Page,
  category?: '人设' | '说话方式' | '连接' | '数据',
): Promise<void> => {
  await page.getByRole('button', { name: '设置' }).click()
  if (category !== undefined) await page.getByRole('tab', { name: category }).click()
}
const backToChat = (page: Page) => page.getByRole('button', { name: '返回' }).click()

test('调整旋钮后回复带上风格设定，刷新后设置保留', async ({ page }) => {
  await gotoApp(page)

  // 全部默认时不注入风格段
  await sendMessage(page, '你好')
  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo('你好'))

  await openSettings(page, '说话方式')
  const humor = page.getByRole('slider', { name: '幽默感' })
  await expect(humor).toBeVisible()
  await humor.fill('0.8')

  await backToChat(page)
  await sendRaw(page, '在吗')
  await expect(page.locator(BUBBLES).last()).toHaveText(`${STRATEGY_PREFIX}${replyTo('在吗')}`)

  // 即时生效并持久化
  await page.reload()
  await openSettings(page, '说话方式')
  await expect(page.getByRole('slider', { name: '幽默感' })).toHaveValue('0.8')
})

test('不同意见滑块下限为 0.15', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '说话方式')

  const challenge = page.getByRole('slider', { name: '不同意见' })
  await expect(challenge).toHaveAttribute('min', '0.15')
  await challenge.fill('0.15')
  await expect(challenge).toHaveValue('0.15')
})

test('恢复默认后回复不再带风格设定', async ({ page }) => {
  await gotoApp(page)

  await openSettings(page, '说话方式')
  await page.getByRole('slider', { name: '幽默感' }).fill('0.8')
  await backToChat(page)
  await sendRaw(page, '在吗')
  await expect(page.locator(BUBBLES).last()).toHaveText(`${STRATEGY_PREFIX}${replyTo('在吗')}`)

  await openSettings(page, '说话方式')
  await page.getByRole('button', { name: '恢复默认' }).click()
  await backToChat(page)

  await sendMessage(page, '好些了吗')
})

test('界面不暴露参数名或 JSON 字面量', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '说话方式')
  await page.getByRole('slider', { name: '幽默感' }).fill('0.8')

  const text = await page.locator('body').innerText()
  expect(text).not.toContain('{')
  for (const key of ['proactivity', 'empathyDensity', 'humor', 'pace', 'verbosity', 'challenge']) {
    expect(text).not.toContain(key)
  }
})

test('导出记忆备份会触发下载，并把结果说出来', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')
  await openSettings(page, '数据')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出记忆备份' }).click()
  const download = await downloadPromise

  const fileName = download.suggestedFilename()
  expect(fileName).toMatch(/^regret-backup-\d{4}-\d{2}-\d{2}\.json$/)

  // 浏览器这条路落点不由我们决定，界面要把"去哪找"说清楚——
  // 真机上曾经点完毫无动静，用户无法分辨成功与失败
  await expect(page.getByText(`已导出 ${fileName}，可在「下载」里找到`)).toBeVisible()
})

test('清除对话与记忆后回到开场，人设与说话方式保留', async ({ page }) => {
  await gotoApp(page)

  // 先留下数据：改人设、调旋钮、发一条消息
  await openSettings(page, '人设')
  await page.getByPlaceholder('例如：小满').fill('阿念')
  await page.getByRole('tab', { name: '说话方式' }).click()
  await page.getByRole('slider', { name: '幽默感' }).fill('0.8')
  await backToChat(page)
  await sendRaw(page, '你好')
  await expect(page.getByTestId('relation-bar')).toContainText('亲密度 1')

  await openSettings(page, '数据')
  await page.getByRole('button', { name: '清除对话与记忆' }).click()
  await page.getByRole('button', { name: '确认清除' }).click()

  // 重载后开场逻辑会重新写回一条欢迎语；关系状态与记忆回到初始
  await expect(page.locator(BUBBLES)).toHaveCount(1)
  await expect(page.locator(BUBBLES).first()).toHaveText(WELCOME)
  await expect(page.getByTestId('relation-bar')).toContainText('初识')
  await expect(page.getByTestId('relation-bar')).toContainText('亲密度 0')

  // 人设与旋钮不受影响
  await expect(page.locator('header h1')).toHaveText('阿念')
  await openSettings(page, '说话方式')
  await expect(page.getByRole('slider', { name: '幽默感' })).toHaveValue('0.8')
})

test('恢复出厂设置会清掉人设与说话方式', async ({ page }) => {
  await gotoApp(page)

  await openSettings(page, '人设')
  await page.getByPlaceholder('例如：小满').fill('阿念')
  await backToChat(page)
  await expect(page.locator('header h1')).toHaveText('阿念')

  await openSettings(page, '说话方式')
  await page.getByRole('slider', { name: '幽默感' }).fill('0.8')
  await page.getByRole('tab', { name: '数据' }).click()
  await page.getByRole('button', { name: '恢复出厂设置' }).click()
  await page.getByRole('button', { name: '确认恢复' }).click()

  // 回到默认人设与默认旋钮
  await expect(page.locator('header h1')).toHaveText('小满')
  await openSettings(page, '说话方式')
  await expect(page.getByRole('slider', { name: '幽默感' })).toHaveValue('0.5')
})

test('危险操作可就地取消，不会清除数据', async ({ page }) => {
  await gotoApp(page)
  await sendMessage(page, '你好')

  await openSettings(page, '数据')
  await page.getByRole('button', { name: '清除对话与记忆' }).click()
  await page.getByRole('button', { name: '取消' }).click()
  await backToChat(page)

  await expect(page.locator(BUBBLES)).toHaveCount(3)
  await expect(page.locator(BUBBLES).last()).toHaveText(replyTo('你好'))
})

test('设置页填写的连接配置刷新后保留', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '连接')

  // provider 保持演示模式，其余字段只做持久化验证，不发起真实请求
  await page.getByLabel('代理地址').fill('/api/chat')
  await page.getByLabel('API Key').fill('sk-local')
  await page.getByLabel('网关地址').fill('https://gw.example.com/v1')
  await page.getByLabel('模型名').fill('flash')

  await page.reload()
  await openSettings(page, '连接')

  await expect(page.getByLabel('代理地址')).toHaveValue('/api/chat')
  await expect(page.getByLabel('API Key')).toHaveValue('sk-local')
  await expect(page.getByLabel('网关地址')).toHaveValue('https://gw.example.com/v1')
  await expect(page.getByLabel('模型名')).toHaveValue('flash')
})

test('切到直连后直接请求厂商接口，配置刷新后保留', async ({ page }) => {
  const posts: Array<{
    url: string
    authorization?: string
    body: Record<string, unknown>
    chatHeaders: string[]
  }> = []

  // 直连模式会真的打到厂商域名，这里拦下来并补上跨源头，避免测试依赖外网
  await page.route('https://api.deepseek.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      })
      return
    }

    const headers = request.headers()
    posts.push({
      url: request.url(),
      ...(headers['authorization'] !== undefined ? { authorization: headers['authorization'] } : {}),
      body: JSON.parse(request.postData() ?? '{}') as Record<string, unknown>,
      chatHeaders: Object.keys(headers).filter((name) => name.startsWith('x-chat-')),
    })
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' },
      body: 'data: {"choices":[{"delta":{"content":"直连成功"}}]}\n\ndata: [DONE]\n\n',
    })
  })

  await gotoApp(page)
  await openSettings(page, '连接')

  // 演示模式与走代理都展示代理侧字段
  await expect(page.getByLabel('代理地址')).toBeVisible()
  await expect(page.getByLabel('网关地址')).toBeVisible()

  await page.getByLabel('对话服务').selectOption('direct')
  // 逐字输入：地址字段每敲一个字都会过一遍规范化，不能把还没敲完的前缀当场抹掉
  // （真机实测曾把 "https:" 吃掉，输入框里只剩 "//…"）
  await page.getByLabel('接口地址').pressSequentially('https://api.deepseek.com/v1/chat/completions')
  await page.getByLabel('API Key').fill('sk-direct')
  await page.getByLabel('模型名').fill('deepseek-reasoner')

  // 「网关地址」是代理侧概念，直连时不再出现
  await expect(page.getByLabel('网关地址')).toHaveCount(0)
  await expect(page.getByLabel('接口地址')).toHaveValue(
    'https://api.deepseek.com/v1/chat/completions',
  )

  await backToChat(page)
  await sendRaw(page, '在吗')
  await expect(page.locator(BUBBLES).last()).toHaveText('直连成功')

  // 中间没有自建代理：模型名与流式开关由客户端写进请求体，也不带 X-Chat-* 约定头
  expect(posts).toHaveLength(1)
  expect(posts[0]?.url).toBe('https://api.deepseek.com/v1/chat/completions')
  expect(posts[0]?.authorization).toBe('Bearer sk-direct')
  expect(posts[0]?.body).toMatchObject({ model: 'deepseek-reasoner', stream: true })
  expect(Array.isArray(posts[0]?.body['messages'])).toBe(true)
  expect(posts[0]?.chatHeaders).toEqual([])

  await page.reload()
  await openSettings(page, '连接')

  await expect(page.getByLabel('对话服务')).toHaveValue('direct')
  await expect(page.getByLabel('接口地址')).toHaveValue(
    'https://api.deepseek.com/v1/chat/completions',
  )
  await expect(page.getByLabel('API Key')).toHaveValue('sk-direct')
  await expect(page.getByLabel('模型名')).toHaveValue('deepseek-reasoner')
})

test('地址字段填了非法值时给出提示', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '连接')

  const warning = page.getByText('这个地址没生效：只能以 http(s):// 或 / 开头')

  await page.getByLabel('代理地址').fill('ftp://proxy.example.com/api/chat')
  await expect(warning).toBeVisible()

  await page.getByLabel('代理地址').fill('https://proxy.example.com/api/chat')
  await expect(warning).toHaveCount(0)
})

test('直连只填到网关时，提示实际请求地址', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '连接')
  await page.getByLabel('对话服务').selectOption('direct')

  // 真机上有人这么填过：厂商把它 307 跳到别处，界面只回一句状态码，无从改起
  await page.getByLabel('接口地址').fill('https://gateway.example.com/api/v1')
  await expect(
    page.getByText('实际请求：https://gateway.example.com/api/v1/chat/completions'),
  ).toBeVisible()

  // 已经是完整地址就不再重复提示
  await page.getByLabel('接口地址').fill('https://api.deepseek.com/v1/chat/completions')
  await expect(page.getByText(/^实际请求：/)).toHaveCount(0)
})

test('恢复出厂设置会清掉连接配置', async ({ page }) => {
  await gotoApp(page)
  await openSettings(page, '连接')

  await page.getByLabel('对话服务').selectOption('deepseek')
  await page.getByLabel('代理地址').fill('/api/chat')
  await page.getByLabel('模型名').fill('flash')

  await page.getByRole('tab', { name: '数据' }).click()
  await page.getByRole('button', { name: '恢复出厂设置' }).click()
  await page.getByRole('button', { name: '确认恢复' }).click()

  await expect(page.locator('header h1')).toHaveText('小满')
  await openSettings(page, '连接')
  await expect(page.getByLabel('对话服务')).toHaveValue('mock')
  await expect(page.getByLabel('代理地址')).toHaveValue('')
  await expect(page.getByLabel('模型名')).toHaveValue('')
})
