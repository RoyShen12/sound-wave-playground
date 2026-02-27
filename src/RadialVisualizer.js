/**
 * 高级可视化模块
 * 提供圆形/径向频谱可视化和李萨如图形（立体声场显示）
 */

import { initHiDPICanvas } from './utils.js'

// Canvas 逻辑尺寸
const CANVAS_SIZE = 300

// 深色主题背景色
const BG_COLOR = '#1a1a2e'

export class RadialVisualizer {
  /**
   * @param {HTMLCanvasElement} radialCanvas - 圆形频谱 Canvas 元素
   * @param {HTMLCanvasElement} lissajousCanvas - 李萨如图形 Canvas 元素
   */
  constructor(radialCanvas, lissajousCanvas) {
    this.radialCanvas = radialCanvas
    this.lissajousCanvas = lissajousCanvas
    this.radialCtx = null
    this.lissajousCtx = null

    // 圆形频谱参数
    this.centerX = CANVAS_SIZE / 2
    this.centerY = CANVAS_SIZE / 2
    this.innerRadius = 40   // 内圈半径（频谱柱起始位置）
    this.maxBarLength = 90  // 频谱柱最大长度

    // 李萨如图形参数
    this.trailAlpha = 0.15  // 拖尾透明度，值越小拖尾越长
  }

  /**
   * 初始化两个 Canvas，使用 HiDPI 适配
   */
  init() {
    this.radialCtx = initHiDPICanvas(this.radialCanvas, CANVAS_SIZE, CANVAS_SIZE)
    this.lissajousCtx = initHiDPICanvas(this.lissajousCanvas, CANVAS_SIZE, CANVAS_SIZE)

    // 绘制初始背景
    this._clearRadial()
    this._clearLissajous()
  }

  /**
   * 绘制圆形频谱（中心向外辐射的极坐标条形图）
   * 每个频率 bin 对应一根从中心向外辐射的柱子，颜色随频率和振幅渐变
   * @param {Uint8Array} frequencyData - 频域数据（AnalyserNode.getByteFrequencyData 的输出）
   */
  drawRadialSpectrum(frequencyData) {
    if (!this.radialCtx) return

    const ctx = this.radialCtx
    const len = frequencyData.length

    // 清除画布
    this._clearRadial()

    // 绘制装饰性内圈
    this._drawInnerCircle(ctx)

    // 每根频谱柱对应的角度增量（完整一圈 2PI）
    const angleStep = (Math.PI * 2) / len

    for (let i = 0; i < len; i++) {
      const amplitude = frequencyData[i] / 255  // 归一化到 0~1
      const barLength = amplitude * this.maxBarLength

      // 当振幅过小时跳过绘制，避免视觉噪音
      if (barLength < 1) continue

      // 当前柱子的角度（从正上方开始，顺时针旋转）
      const angle = angleStep * i - Math.PI / 2

      // 计算柱子起点和终点坐标
      const startX = this.centerX + Math.cos(angle) * this.innerRadius
      const startY = this.centerY + Math.sin(angle) * this.innerRadius
      const endX = this.centerX + Math.cos(angle) * (this.innerRadius + barLength)
      const endY = this.centerY + Math.sin(angle) * (this.innerRadius + barLength)

      // 创建沿辐射方向的渐变色
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY)

      // 根据频率位置和振幅决定颜色
      // 低频偏蓝紫，中频偏青绿，高频偏橙红
      const hue = (i / len) * 270 + 200  // 色相范围：200(蓝) -> 470(映射回红)
      const saturation = 80 + amplitude * 20
      const lightnessStart = 40 + amplitude * 20
      const lightnessEnd = 60 + amplitude * 30

      gradient.addColorStop(0, `hsl(${hue % 360}, ${saturation}%, ${lightnessStart}%)`)
      gradient.addColorStop(1, `hsl(${(hue + 30) % 360}, ${saturation}%, ${lightnessEnd}%)`)

      // 绘制辐射柱
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.strokeStyle = gradient
      ctx.lineWidth = Math.max(1, (Math.PI * 2 * this.innerRadius) / len - 0.5)
      ctx.stroke()
    }

    // 在中心绘制平均振幅指示圆
    this._drawAmplitudeIndicator(ctx, frequencyData)
  }

  /**
   * 绘制李萨如图形（XY 立体声场显示）
   * X 轴为左声道，Y 轴为右声道，用于可视化立体声相位关系
   * - 单声道信号呈现为 45 度斜线
   * - 完全反相信号呈现为 -45 度斜线
   * - 立体声信号呈现为椭圆或复杂图形
   * @param {Float32Array} leftChannel - 左声道时域数据
   * @param {Float32Array} rightChannel - 右声道时域数据
   */
  drawLissajous(leftChannel, rightChannel) {
    if (!this.lissajousCtx) return

    const ctx = this.lissajousCtx
    const len = Math.min(leftChannel.length, rightChannel.length)

    // 使用半透明背景覆盖实现拖尾效果
    ctx.fillStyle = `rgba(26, 26, 46, ${this.trailAlpha})`
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 绘制坐标轴参考线
    this._drawLissajousAxes(ctx)

    // 声场显示区域的缩放比例（留出边距）
    const scale = CANVAS_SIZE * 0.4

    // 绘制李萨如轨迹
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'  // 绿色线条
    ctx.lineWidth = 1

    let hasMovedTo = false

    for (let i = 0; i < len; i++) {
      // 将左右声道映射到 XY 坐标
      // 左声道控制 X 轴，右声道控制 Y 轴
      const x = this.centerX + leftChannel[i] * scale
      const y = this.centerY - rightChannel[i] * scale  // Y 轴翻转，正值向上

      if (!hasMovedTo) {
        ctx.moveTo(x, y)
        hasMovedTo = true
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()

    // 在最新采样点位置绘制亮点
    if (len > 0) {
      const lastX = this.centerX + leftChannel[len - 1] * scale
      const lastY = this.centerY - rightChannel[len - 1] * scale
      ctx.beginPath()
      ctx.arc(lastX, lastY, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 255, 100, 1)'
      ctx.fill()
    }
  }

  /**
   * 销毁可视化器，释放资源
   */
  destroy() {
    // 清除画布内容
    if (this.radialCtx) {
      this.radialCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      this.radialCtx = null
    }
    if (this.lissajousCtx) {
      this.lissajousCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      this.lissajousCtx = null
    }
  }

  // ===== 私有方法 =====

  /**
   * 清除圆形频谱画布并绘制背景
   * @private
   */
  _clearRadial() {
    const ctx = this.radialCtx
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  }

  /**
   * 清除李萨如画布并绘制背景
   * @private
   */
  _clearLissajous() {
    const ctx = this.lissajousCtx
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 初始时绘制坐标轴
    this._drawLissajousAxes(ctx)
  }

  /**
   * 绘制装饰性内圈（频谱柱的起始边界）
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _drawInnerCircle(ctx) {
    ctx.beginPath()
    ctx.arc(this.centerX, this.centerY, this.innerRadius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  /**
   * 绘制中心振幅指示圆
   * 根据频谱数据的平均振幅改变内圈发光效果
   * @param {CanvasRenderingContext2D} ctx
   * @param {Uint8Array} frequencyData
   * @private
   */
  _drawAmplitudeIndicator(ctx, frequencyData) {
    // 计算平均振幅
    let sum = 0
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i]
    }
    const avgAmplitude = sum / frequencyData.length / 255

    // 根据平均振幅绘制发光的中心圆
    const glowRadius = this.innerRadius * 0.8
    const gradient = ctx.createRadialGradient(
      this.centerX, this.centerY, 0,
      this.centerX, this.centerY, glowRadius
    )

    const alpha = 0.1 + avgAmplitude * 0.4
    gradient.addColorStop(0, `rgba(100, 200, 255, ${alpha})`)
    gradient.addColorStop(0.6, `rgba(60, 100, 200, ${alpha * 0.5})`)
    gradient.addColorStop(1, 'rgba(26, 26, 46, 0)')

    ctx.beginPath()
    ctx.arc(this.centerX, this.centerY, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }

  /**
   * 绘制李萨如图形的坐标轴参考线
   * 包括中心十字线和 +/- 标记
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _drawLissajousAxes(ctx) {
    const half = CANVAS_SIZE / 2

    // 中心十字参考线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1

    // 水平轴（左声道）
    ctx.beginPath()
    ctx.moveTo(20, half)
    ctx.lineTo(CANVAS_SIZE - 20, half)
    ctx.stroke()

    // 垂直轴（右声道）
    ctx.beginPath()
    ctx.moveTo(half, 20)
    ctx.lineTo(half, CANVAS_SIZE - 20)
    ctx.stroke()

    // 轴标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('L', 12, half + 4)           // 左声道标记
    ctx.fillText('R', CANVAS_SIZE - 12, half + 4) // 右声道标记（此处 X 轴末端）
    ctx.fillText('+R', half, 14)              // 右声道正方向
    ctx.fillText('-R', half, CANVAS_SIZE - 6) // 右声道负方向
  }
}
