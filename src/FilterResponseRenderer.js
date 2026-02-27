/**
 * FilterResponseRenderer.js
 * 滤波器频率响应曲线渲染器和压缩器特性曲线可视化
 */

import { initHiDPICanvas, formatFrequency } from './utils.js'

const BG_COLOR = '#1a1a2e'

export class FilterResponseRenderer {
  /**
   * @param {HTMLCanvasElement} responseCanvas - 频率响应曲线 Canvas
   * @param {HTMLCanvasElement} compressorCanvas - 压缩器特性曲线 Canvas
   */
  constructor(responseCanvas, compressorCanvas) {
    this.responseCanvas = responseCanvas
    this.compressorCanvas = compressorCanvas
    this.responseCtx = null
    this.compressorCtx = null

    this.responseWidth = 0
    this.responseHeight = 200

    this.compressorWidth = 0
    this.compressorHeight = 200
  }

  /**
   * 初始化 Canvas
   */
  init() {
    if (this.responseCanvas) {
      const container = this.responseCanvas.parentElement
      this.responseWidth = container ? container.clientWidth : 600
      this.responseCtx = initHiDPICanvas(
        this.responseCanvas,
        this.responseWidth,
        this.responseHeight
      )
    }

    if (this.compressorCanvas) {
      const container = this.compressorCanvas.parentElement
      this.compressorWidth = container ? container.clientWidth : 600
      this.compressorCtx = initHiDPICanvas(
        this.compressorCanvas,
        this.compressorWidth,
        this.compressorHeight
      )
    }
  }

  /**
   * 绘制滤波器频率响应曲线
   * 在对数频率轴上绘制幅度响应和相位响应
   *
   * @param {import('./AudioEffects.js').AudioEffects} audioEffects - 音频效果实例
   * @param {number} sampleRate - 采样率
   */
  drawFilterResponse(audioEffects, sampleRate) {
    if (!this.responseCtx || !audioEffects || !audioEffects.filterChain) return

    const ctx = this.responseCtx
    const w = this.responseWidth
    const h = this.responseHeight

    // 清除画布
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    // 生成对数分布的频率数组（20Hz ~ Nyquist）
    const numPoints = Math.min(w, 512)
    const nyquist = sampleRate / 2
    const minFreq = 20
    const frequencyArray = new Float32Array(numPoints)

    for (let i = 0; i < numPoints; i++) {
      const ratio = i / (numPoints - 1)
      frequencyArray[i] = minFreq * Math.pow(nyquist / minFreq, ratio)
    }

    // 绘制网格线
    this._drawFreqGrid(ctx, w, h, minFreq, nyquist)

    // 定义滤波器颜色映射
    const filterColors = {
      lowpass: '#22c55e',
      highpass: '#eab308',
      bandpass: '#0ea5e9',
      notch: '#e94560'
    }

    // 计算并绘制每个启用的滤波器的响应
    const filterTypes = ['lowpass', 'highpass', 'bandpass', 'notch']
    // 计算组合响应
    const combinedMagnitude = new Float32Array(numPoints).fill(1)

    for (const type of filterTypes) {
      if (!audioEffects.filterStates.get(type)) continue

      const response = audioEffects.getFilterResponse(type, frequencyArray)
      if (!response || response.magnitude.length === 0) continue

      // 单个滤波器曲线（半透明）
      ctx.beginPath()
      ctx.strokeStyle = filterColors[type]
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1

      for (let i = 0; i < numPoints; i++) {
        const x = (i / (numPoints - 1)) * w
        // 将幅度转为 dB 并映射到 canvas 高度
        const magnitudeDb = 20 * Math.log10(Math.max(response.magnitude[i], 0.0001))
        const y = this._dbToY(magnitudeDb, h)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)

        // 累积到组合响应
        combinedMagnitude[i] *= response.magnitude[i]
      }

      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

    // 绘制组合频率响应曲线
    ctx.beginPath()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * w
      const magnitudeDb = 20 * Math.log10(Math.max(combinedMagnitude[i], 0.0001))
      const y = this._dbToY(magnitudeDb, h)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.stroke()

    // 填充曲线下方区域
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.fill()
  }

  /**
   * 绘制压缩器特性曲线（输入/输出 dB 关系）
   *
   * @param {number} threshold - 阈值 (dB)
   * @param {number} knee - 拐点宽度 (dB)
   * @param {number} ratio - 压缩比
   * @param {number} reduction - 当前增益减少量 (dB)
   */
  drawCompressorCurve(threshold, knee, ratio, reduction) {
    if (!this.compressorCtx) return

    const ctx = this.compressorCtx
    const w = this.compressorWidth
    const h = this.compressorHeight

    // 清除画布
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    const dbMin = -60
    const dbMax = 0
    const dbRange = dbMax - dbMin
    const padding = 30

    const plotW = w - padding * 2
    const plotH = h - padding * 2

    // 绘制网格和标签
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.fillStyle = '#64748b'
    ctx.font = '9px -apple-system, sans-serif'

    const dbMarks = [-60, -48, -36, -24, -12, 0]
    for (const db of dbMarks) {
      const x = padding + ((db - dbMin) / dbRange) * plotW
      const y = padding + plotH - ((db - dbMin) / dbRange) * plotH

      // 垂直网格线
      ctx.beginPath()
      ctx.moveTo(x, padding)
      ctx.lineTo(x, padding + plotH)
      ctx.stroke()

      // 水平网格线
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(padding + plotW, y)
      ctx.stroke()

      // 标签
      ctx.textAlign = 'center'
      ctx.fillText(`${db}`, x, h - 8)
      ctx.textAlign = 'right'
      ctx.fillText(`${db}`, padding - 4, y + 3)
    }

    // 轴标签
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Input (dB)', w / 2, h - 1)

    ctx.save()
    ctx.translate(10, h / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Output (dB)', 0, 0)
    ctx.restore()

    // 绘制 1:1 参考线（无压缩）
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.moveTo(padding, padding + plotH)
    ctx.lineTo(padding + plotW, padding)
    ctx.stroke()
    ctx.setLineDash([])

    // 绘制压缩器特性曲线
    ctx.beginPath()
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2

    const halfKnee = knee / 2

    for (let inputDb = dbMin; inputDb <= dbMax; inputDb += 0.5) {
      let outputDb

      if (inputDb < threshold - halfKnee) {
        // 阈值以下：1:1 直通
        outputDb = inputDb
      } else if (inputDb > threshold + halfKnee) {
        // 阈值以上：按压缩比压缩
        outputDb = threshold + (inputDb - threshold) / ratio
      } else {
        // 拐点区域：平滑过渡
        const diff = inputDb - threshold + halfKnee
        outputDb = inputDb + (1 / ratio - 1) * (diff * diff) / (2 * knee)
      }

      const x = padding + ((inputDb - dbMin) / dbRange) * plotW
      const y = padding + plotH - ((outputDb - dbMin) / dbRange) * plotH

      if (inputDb === dbMin) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.stroke()

    // 绘制阈值线
    const threshX = padding + ((threshold - dbMin) / dbRange) * plotW
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.moveTo(threshX, padding)
    ctx.lineTo(threshX, padding + plotH)
    ctx.stroke()
    ctx.setLineDash([])

    // 显示增益减少量
    if (reduction < 0) {
      ctx.fillStyle = '#f97316'
      ctx.font = 'bold 12px var(--font-mono, monospace)'
      ctx.textAlign = 'right'
      ctx.fillText(`GR: ${reduction.toFixed(1)} dB`, w - padding, padding + 16)
    }
  }

  /**
   * 将 dB 值映射到 Canvas Y 坐标
   * @private
   */
  _dbToY(db, height) {
    // 范围：+12dB（顶部）到 -48dB（底部）
    const maxDb = 12
    const minDb = -48
    const normalized = (db - minDb) / (maxDb - minDb)
    return height * (1 - Math.max(0, Math.min(1, normalized)))
  }

  /**
   * 绘制频率网格线
   * @private
   */
  _drawFreqGrid(ctx, w, h, minFreq, maxFreq) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    ctx.fillStyle = '#64748b'
    ctx.font = '9px -apple-system, sans-serif'
    ctx.textAlign = 'center'

    // 频率标记点
    const freqMarks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

    for (const freq of freqMarks) {
      if (freq < minFreq || freq > maxFreq) continue
      const x = (Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq)) * w

      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()

      ctx.fillText(formatFrequency(freq), x, h - 4)
    }

    // dB 水平线
    const dbMarks = [-48, -36, -24, -12, 0, 12]
    ctx.textAlign = 'left'

    for (const db of dbMarks) {
      const y = this._dbToY(db, h)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()

      ctx.fillText(`${db}dB`, 4, y - 2)
    }
  }

  /**
   * 销毁
   */
  destroy() {
    this.responseCtx = null
    this.compressorCtx = null
  }
}
