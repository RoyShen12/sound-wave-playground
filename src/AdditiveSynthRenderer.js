/**
 * AdditiveSynthRenderer.js
 * 加法合成谐波可视化渲染器
 * 显示各谐波的振幅柱状图和合成波形预览
 */

import { initHiDPICanvas } from './utils.js'

const BG_COLOR = '#1a1a2e'

export class AdditiveSynthRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - 加法合成可视化 Canvas
   */
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = null
    this.width = 0
    this.height = 250
  }

  /**
   * 初始化 Canvas
   */
  init() {
    if (!this.canvas) return
    const container = this.canvas.parentElement
    this.width = container ? container.clientWidth : 600
    this.ctx = initHiDPICanvas(this.canvas, this.width, this.height)
  }

  /**
   * 绘制谐波振幅柱状图和合成波形
   *
   * @param {Array<{index: number, frequency: number, amplitude: number, phase: number}>} harmonics
   * @param {number} fundamentalFreq - 基频 (Hz)
   */
  draw(harmonics, fundamentalFreq) {
    if (!this.ctx || !harmonics || harmonics.length === 0) return

    const ctx = this.ctx
    const w = this.width
    const h = this.height

    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    // 上半部分：谐波柱状图
    const barAreaH = h * 0.5
    // 下半部分：合成波形预览
    const waveAreaY = h * 0.55
    const waveAreaH = h * 0.4

    // ===== 绘制谐波柱状图 =====
    const maxHarmonics = harmonics.length
    const barPadding = 8
    const totalBarWidth = w - barPadding * 2
    const barWidth = Math.min(40, (totalBarWidth / maxHarmonics) * 0.7)
    const barGap = (totalBarWidth - barWidth * maxHarmonics) / Math.max(1, maxHarmonics - 1)

    for (let i = 0; i < maxHarmonics; i++) {
      const amplitude = harmonics[i].amplitude
      const barHeight = amplitude * (barAreaH - 30)
      const x = barPadding + i * (barWidth + barGap)
      const y = barAreaH - barHeight - 5

      // 渐变色柱子
      if (barHeight > 0) {
        const gradient = ctx.createLinearGradient(x, barAreaH, x, y)
        const hue = (i / maxHarmonics) * 200 + 180
        gradient.addColorStop(0, `hsla(${hue}, 70%, 40%, 0.8)`)
        gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 1.0)`)

        ctx.fillStyle = gradient
        ctx.fillRect(x, y, barWidth, barHeight)

        // 振幅值标签
        if (amplitude > 0.01) {
          ctx.fillStyle = '#e2e8f0'
          ctx.font = '8px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(amplitude.toFixed(2), x + barWidth / 2, y - 4)
        }
      }

      // 谐波标号
      ctx.fillStyle = '#64748b'
      ctx.font = '9px var(--font-mono, monospace)'
      ctx.textAlign = 'center'
      ctx.fillText(`H${i + 1}`, x + barWidth / 2, barAreaH + 12)

      // 频率标签
      ctx.fillStyle = '#475569'
      ctx.font = '7px var(--font-mono, monospace)'
      ctx.fillText(
        `${Math.round(harmonics[i].frequency)}`,
        x + barWidth / 2,
        barAreaH + 22
      )
    }

    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, waveAreaY - 10)
    ctx.lineTo(w, waveAreaY - 10)
    ctx.stroke()

    // ===== 绘制合成波形预览 =====
    const waveCenterY = waveAreaY + waveAreaH / 2
    const waveAmplitude = waveAreaH / 2 - 5

    // 中心线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.beginPath()
    ctx.moveTo(0, waveCenterY)
    ctx.lineTo(w, waveCenterY)
    ctx.stroke()

    // 计算合成波形（显示 2 个周期）
    const numSamples = w
    const periodsToShow = 2
    const samplesPerPeriod = numSamples / periodsToShow

    ctx.beginPath()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 1.5

    for (let i = 0; i < numSamples; i++) {
      const t = (i / samplesPerPeriod) * 2 * Math.PI
      let sample = 0

      for (let h = 0; h < maxHarmonics; h++) {
        const amp = harmonics[h].amplitude
        const phase = harmonics[h].phase || 0
        sample += amp * Math.sin(t * (h + 1) + phase)
      }

      // 归一化
      const maxAmp = harmonics.reduce((sum, h) => sum + h.amplitude, 0)
      if (maxAmp > 0) {
        sample /= maxAmp
      }

      const x = i
      const y = waveCenterY - sample * waveAmplitude

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.stroke()

    // 波形标签
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`基频: ${fundamentalFreq} Hz`, 8, waveAreaY + 2)
  }

  destroy() {
    this.ctx = null
  }
}
