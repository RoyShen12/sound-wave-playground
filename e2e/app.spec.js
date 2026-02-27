import { test, expect } from '@playwright/test'

test.describe('Sound Wave Playground - 核心用户流程', () => {
  test('页面加载 - 应显示初始化覆盖层', async ({ page }) => {
    await page.goto('/')
    // 初始化覆盖层应可见
    const overlay = page.locator('#initOverlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText('Sound Wave Playground')
  })

  test('点击初始化 - 应隐藏覆盖层并显示主界面', async ({ page }) => {
    await page.goto('/')
    // 点击覆盖层初始化音频引擎
    await page.click('#initOverlay')
    // 覆盖层添加 hidden 类（opacity 过渡动画）
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })
    // 控制面板应该可见（tab-page.active 使用 display:contents，内部元素直接参与布局）
    await expect(page.locator('#controlPanel')).toBeVisible()
  })

  test('Tab 切换 - 应在振荡器和麦克风页面间切换', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })

    // 默认应在振荡器页面（tab-page 使用 display:contents，不能用 toBeVisible，需检查 active 类）
    await expect(page.locator('#page-oscillator')).toHaveClass(/active/)
    await expect(page.locator('#page-microphone')).not.toHaveClass(/active/)

    // 点击麦克风标签
    await page.click('[data-tab="microphone"]')
    await expect(page.locator('#page-microphone')).toHaveClass(/active/)
    await expect(page.locator('#page-oscillator')).not.toHaveClass(/active/)

    // 切回振荡器
    await page.click('[data-tab="oscillator"]')
    await expect(page.locator('#page-oscillator')).toHaveClass(/active/)
    await expect(page.locator('#page-microphone')).not.toHaveClass(/active/)
  })

  test('播放按钮 - 应切换播放状态', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    // 等待音频引擎完全初始化（状态栏显示"已就绪"表示异步初始化完成）
    await expect(page.locator('#statusText')).toHaveText('已就绪', { timeout: 10000 })

    const toggleBtn = page.locator('#toggleSound')
    await expect(toggleBtn).toBeVisible()
    // 初始化后按钮默认不在播放状态
    await expect(toggleBtn).not.toHaveClass(/active/)

    // 点击播放
    await toggleBtn.click()
    await expect(toggleBtn).toHaveClass(/active/)

    // 再次点击暂停
    await toggleBtn.click()
    await expect(toggleBtn).not.toHaveClass(/active/)
  })

  test('频谱图配色切换 - 应切换配色方案按钮状态', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })

    // 默认热力图应该是 active
    const heatmapBtn = page.locator('.color-scheme-btn[data-scheme="heatmap"]')
    await expect(heatmapBtn).toHaveClass(/active/)

    // 点击灰度
    const grayscaleBtn = page.locator('.color-scheme-btn[data-scheme="grayscale"]')
    await grayscaleBtn.click()
    await expect(grayscaleBtn).toHaveClass(/active/)
    await expect(heatmapBtn).not.toHaveClass(/active/)

    // 点击彩虹
    const rainbowBtn = page.locator('.color-scheme-btn[data-scheme="rainbow"]')
    await rainbowBtn.click()
    await expect(rainbowBtn).toHaveClass(/active/)
    await expect(grayscaleBtn).not.toHaveClass(/active/)
  })

  test('绘图模式切换 - 应切换绘图模式按钮状态', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })

    // 默认波形模式（data-mode="2"）应该是 active
    const waveBtn = page.locator('.draw-mode-btn[data-mode="2"]')
    await expect(waveBtn).toHaveClass(/active/)

    // 点击点模式（data-mode="0"）
    const pointBtn = page.locator('.draw-mode-btn[data-mode="0"]')
    await pointBtn.click()
    await expect(pointBtn).toHaveClass(/active/)
    await expect(waveBtn).not.toHaveClass(/active/)

    // 点击面模式（data-mode="1"）
    const filledBtn = page.locator('.draw-mode-btn[data-mode="1"]')
    await filledBtn.click()
    await expect(filledBtn).toHaveClass(/active/)
    await expect(pointBtn).not.toHaveClass(/active/)
  })

  test('教育演示切换 - 应切换演示模式和对应控件', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })

    // 默认窗函数（fourier）应该是 active
    const fourierBtn = page.locator('.edu-demo-btn[data-demo="fourier"]')
    await expect(fourierBtn).toHaveClass(/active/)
    // 窗函数控件可见
    await expect(page.locator('#fourierControls')).toBeVisible()
    // Nyquist 控件隐藏
    await expect(page.locator('#nyquistControls')).toBeHidden()

    // 点击采样定理（Nyquist）按钮
    const nyquistBtn = page.locator('.edu-demo-btn[data-demo="nyquist"]')
    await nyquistBtn.click()
    await expect(nyquistBtn).toHaveClass(/active/)
    await expect(fourierBtn).not.toHaveClass(/active/)

    // Nyquist 控件可见
    await expect(page.locator('#nyquistControls')).toBeVisible()
    // 窗函数控件隐藏
    await expect(page.locator('#fourierControls')).toBeHidden()

    // 点击 Gibbs 按钮
    const gibbsBtn = page.locator('.edu-demo-btn[data-demo="gibbs"]')
    await gibbsBtn.click()
    await expect(gibbsBtn).toHaveClass(/active/)
    await expect(page.locator('#gibbsControls')).toBeVisible()
    await expect(page.locator('#nyquistControls')).toBeHidden()
  })

  test('预设场景 - 初始化后应动态生成预设卡片', async ({ page }) => {
    await page.goto('/')
    await page.click('#initOverlay')
    await expect(page.locator('#initOverlay')).toHaveClass(/hidden/, { timeout: 2000 })
    // 等待预设卡片动态生成
    await page.waitForTimeout(500)

    // 预设网格应有至少 3 张卡片
    const presetCards = page.locator('.preset-card')
    await expect(presetCards.first()).toBeVisible()
    const count = await presetCards.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('Canvas 存在性 - 所有核心 canvas 元素应存在于 DOM 中', async ({ page }) => {
    await page.goto('/')

    // 检查所有核心 canvas 元素（无需点击初始化，这些元素在 HTML 中静态声明）
    await expect(page.locator('#main')).toBeAttached()
    await expect(page.locator('#sub')).toBeAttached()
    await expect(page.locator('#spectrogram')).toBeAttached()
    await expect(page.locator('#radial')).toBeAttached()
    await expect(page.locator('#lissajous')).toBeAttached()
    await expect(page.locator('#educationCanvas')).toBeAttached()
  })

  test('状态栏 - 应显示版本信息', async ({ page }) => {
    await page.goto('/')
    const statusBar = page.locator('.status-bar')
    await expect(statusBar).toContainText('Sound Wave Playground')
  })

  test('MIC 页面 - 应正常加载且包含核心 canvas 元素', async ({ page }) => {
    await page.goto('/MIC.html')
    // MIC.html 中的三个 canvas 元素
    await expect(page.locator('#main')).toBeAttached()
    await expect(page.locator('#mainSUB')).toBeAttached()
    await expect(page.locator('#frcy')).toBeAttached()
  })
})
