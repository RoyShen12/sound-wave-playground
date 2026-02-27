/**
 * EducationModule.js
 * 教育与理论模块
 *
 * 提供 DSP 理论交互式演示：
 * - 傅里叶变换与窗函数对频谱泄漏的影响
 * - 采样定理（Nyquist）与混叠现象
 * - Gibbs 现象演示
 * - 预设场景库
 * @module EducationModule
 */

import { initHiDPICanvas } from './utils.js'
import { generateWindow } from './DSPAnalyzer.js'

const BG_COLOR = '#1a1a2e'
const CANVAS_HEIGHT = 250

export class EducationModule {
  /**
   * @param {HTMLCanvasElement} demoCanvas - 教育演示 Canvas
   */
  constructor(demoCanvas) {
    this.canvas = demoCanvas
    this.ctx = null
    this.width = 0
    this.height = CANVAS_HEIGHT

    /** @type {string} 当前演示模式 */
    this.currentDemo = 'fourier'
  }

  /**
   * 初始化
   */
  init() {
    if (!this.canvas) return
    const container = this.canvas.parentElement
    this.width = container ? container.clientWidth : 700
    this.ctx = initHiDPICanvas(this.canvas, this.width, this.height)
  }

  /**
   * 切换演示模式
   * @param {'fourier'|'nyquist'|'gibbs'} mode
   */
  setDemo(mode) {
    this.currentDemo = mode
  }

  // ===== 傅里叶变换与窗函数演示 =====

  /**
   * 绘制窗函数对比演示
   * 展示不同窗函数的时域形状和对频谱泄漏的影响
   *
   * @param {string} selectedWindow - 选中的窗函数类型
   * @param {number} signalFreq - 信号频率 (Hz)
   * @param {number} sampleRate - 采样率
   */
  drawFourierDemo(selectedWindow, signalFreq, sampleRate) {
    if (!this.ctx) return
    const ctx = this.ctx
    const w = this.width
    const h = this.height

    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    const N = 256
    const halfW = w / 2 - 10

    // ===== 左侧：窗函数时域形状 =====
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('窗函数 (时域)', halfW / 2, 14)

    // 生成窗函数
    const windowCoeffs = generateWindow(selectedWindow, N)

    // 绘制窗函数
    const leftPad = 20
    const plotH = h - 50

    ctx.beginPath()
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 2

    for (let i = 0; i < N; i++) {
      const x = leftPad + (i / N) * (halfW - leftPad)
      const y = 30 + plotH * (1 - windowCoeffs[i])

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 窗函数名称标签
    ctx.fillStyle = '#0ea5e9'
    ctx.font = 'bold 11px var(--font-mono, monospace)'
    ctx.textAlign = 'left'
    ctx.fillText(selectedWindow.toUpperCase(), leftPad, h - 10)

    // ===== 右侧：加窗信号的频谱（展示泄漏）=====
    const rightStart = w / 2 + 10
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('频谱泄漏对比', rightStart + (halfW - 20) / 2, 14)

    // 生成正弦信号
    const signal = new Float32Array(N)
    const freqBin = (signalFreq / sampleRate) * N
    // 使信号频率略偏离整数 bin，以显示频谱泄漏
    const actualFreq = (freqBin + 0.5) / N * sampleRate

    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin(2 * Math.PI * actualFreq * i / sampleRate)
    }

    // 对加窗和未加窗信号做简单 DFT（只需要幅度谱）
    const rectSpectrum = this._simpleDFT(signal, N)
    const windowedSignal = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      windowedSignal[i] = signal[i] * windowCoeffs[i]
    }
    const windowedSpectrum = this._simpleDFT(windowedSignal, N)

    // 归一化
    const maxRect = Math.max(...rectSpectrum)
    const maxWindowed = Math.max(...windowedSpectrum)
    const maxVal = Math.max(maxRect, maxWindowed, 0.001)

    // 绘制矩形窗频谱（灰色，低透明度）
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
    ctx.lineWidth = 1

    const specLen = N / 2
    for (let i = 0; i < specLen; i++) {
      const x = rightStart + (i / specLen) * (halfW - 20)
      const dbVal = 20 * Math.log10(Math.max(rectSpectrum[i] / maxVal, 0.0001))
      const normalizedDb = Math.max(0, (dbVal + 80) / 80)
      const y = 30 + plotH * (1 - normalizedDb)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 绘制加窗后频谱（高亮）
    ctx.beginPath()
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2

    for (let i = 0; i < specLen; i++) {
      const x = rightStart + (i / specLen) * (halfW - 20)
      const dbVal = 20 * Math.log10(Math.max(windowedSpectrum[i] / maxVal, 0.0001))
      const normalizedDb = Math.max(0, (dbVal + 80) / 80)
      const y = 30 + plotH * (1 - normalizedDb)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 图例
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
    ctx.font = '9px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('矩形窗', rightStart, h - 22)
    ctx.fillStyle = '#22c55e'
    ctx.fillText(selectedWindow, rightStart, h - 10)
  }

  // ===== 采样定理（Nyquist）演示 =====

  /**
   * 绘制 Nyquist 采样定理演示
   * 展示信号采样和混叠现象
   *
   * @param {number} signalFreq - 原始信号频率 (Hz)
   * @param {number} sampleRate - 采样率 (Hz)
   */
  drawNyquistDemo(signalFreq, sampleRate) {
    if (!this.ctx) return
    const ctx = this.ctx
    const w = this.width
    const h = this.height

    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    const nyquist = sampleRate / 2
    const isAliased = signalFreq > nyquist

    // 标题
    ctx.fillStyle = isAliased ? '#e94560' : '#22c55e'
    ctx.font = 'bold 11px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      isAliased
        ? `混叠! 信号频率 ${signalFreq}Hz > Nyquist ${nyquist}Hz`
        : `正常采样: 信号频率 ${signalFreq}Hz < Nyquist ${nyquist}Hz`,
      w / 2,
      16
    )

    const padX = 40
    const padY = 30
    const plotW = w - padX * 2
    const plotH = h - padY * 2 - 20

    // 显示时间范围：2 个完整周期或至少 20 个采样点
    const periodsToShow = 2
    const duration = Math.max(periodsToShow / signalFreq, 20 / sampleRate)
    const numContinuousPoints = 500

    // 绘制中心线
    const centerY = padY + plotH / 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padX, centerY)
    ctx.lineTo(padX + plotW, centerY)
    ctx.stroke()

    // ===== 绘制连续信号（细线） =====
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)'
    ctx.lineWidth = 1

    for (let i = 0; i <= numContinuousPoints; i++) {
      const t = (i / numContinuousPoints) * duration
      const x = padX + (t / duration) * plotW
      const y = centerY - Math.sin(2 * Math.PI * signalFreq * t) * (plotH / 2 - 10)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // ===== 绘制采样点 =====
    const numSamples = Math.floor(duration * sampleRate)
    const samplePoints = []

    for (let i = 0; i <= numSamples; i++) {
      const t = i / sampleRate
      if (t > duration) break
      const x = padX + (t / duration) * plotW
      const y = centerY - Math.sin(2 * Math.PI * signalFreq * t) * (plotH / 2 - 10)
      samplePoints.push({ x, y, t })

      // 采样点的垂直线
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)'
      ctx.lineWidth = 1
      ctx.moveTo(x, centerY)
      ctx.lineTo(x, y)
      ctx.stroke()

      // 采样点圆
      ctx.beginPath()
      ctx.fillStyle = '#eab308'
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // ===== 绘制重建信号（混叠后的）=====
    if (isAliased) {
      // 计算混叠频率
      const aliasedFreq = Math.abs(signalFreq - sampleRate * Math.round(signalFreq / sampleRate))

      ctx.beginPath()
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])

      for (let i = 0; i <= numContinuousPoints; i++) {
        const t = (i / numContinuousPoints) * duration
        const x = padX + (t / duration) * plotW
        const y = centerY - Math.sin(2 * Math.PI * aliasedFreq * t) * (plotH / 2 - 10)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // 混叠频率标签
      ctx.fillStyle = '#e94560'
      ctx.font = '10px var(--font-mono, monospace)'
      ctx.textAlign = 'right'
      ctx.fillText(`混叠频率: ${aliasedFreq.toFixed(0)} Hz`, w - padX, h - 8)
    }

    // 图例
    ctx.font = '9px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(14, 165, 233, 0.7)'
    ctx.fillText(`原始信号 (${signalFreq} Hz)`, padX, h - 20)
    ctx.fillStyle = '#eab308'
    ctx.fillText(`采样点 (Fs = ${sampleRate} Hz)`, padX, h - 8)

    // 频率轴标签
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    ctx.fillText('时间 →', w / 2, h - 2)
  }

  // ===== Gibbs 现象演示 =====

  /**
   * 绘制 Gibbs 现象演示
   * 展示用有限项傅里叶级数逼近方波时的振铃现象
   *
   * @param {number} numTerms - 傅里叶级数项数
   */
  drawGibbsDemo(numTerms) {
    if (!this.ctx) return
    const ctx = this.ctx
    const w = this.width
    const h = this.height

    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    // 标题
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 11px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Gibbs 现象 — 方波傅里叶级数 (${numTerms} 项)`, w / 2, 16)

    const padX = 40
    const padY = 30
    const plotW = w - padX * 2
    const plotH = h - padY * 2 - 20
    const centerY = padY + plotH / 2
    const numPoints = 600

    // 绘制中心线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padX, centerY)
    ctx.lineTo(padX + plotW, centerY)
    ctx.stroke()

    // ===== 绘制理想方波 =====
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
    ctx.lineWidth = 1

    const periodsToShow = 2
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * periodsToShow
      const x = padX + (i / numPoints) * plotW
      // 方波：正半周期为 +1，负半周期为 -1
      const phase = t % 1
      const squareVal = phase < 0.5 ? 1 : -1
      const y = centerY - squareVal * (plotH / 2 - 15)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // ===== 绘制傅里叶级数逼近 =====
    ctx.beginPath()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2

    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * periodsToShow * 2 * Math.PI

      // 方波的傅里叶级数：sum_{k=0}^{N} (4/pi) * sin((2k+1)*t) / (2k+1)
      let sample = 0
      for (let k = 0; k < numTerms; k++) {
        const n = 2 * k + 1
        sample += Math.sin(n * t) / n
      }
      sample *= 4 / Math.PI

      const x = padX + (i / numPoints) * plotW
      const y = centerY - sample * (plotH / 2 - 15)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 标注过冲区域（Gibbs 现象）
    // Gibbs 过冲约 8.95% 不会随项数增加而消失
    const overshootPercent = 8.95
    ctx.fillStyle = 'rgba(233, 69, 96, 0.1)'
    const overshootY = centerY - (1 + overshootPercent / 100) * (plotH / 2 - 15)
    const normalY = centerY - 1 * (plotH / 2 - 15)
    ctx.fillRect(padX, overshootY, plotW, normalY - overshootY)

    // 过冲标注
    ctx.fillStyle = '#e94560'
    ctx.font = '9px var(--font-mono, monospace)'
    ctx.textAlign = 'right'
    ctx.fillText(`过冲 ≈ ${overshootPercent}%`, w - padX, overshootY + 10)

    // 图例
    ctx.font = '9px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
    ctx.fillText('理想方波', padX, h - 20)
    ctx.fillStyle = '#e94560'
    ctx.fillText(`傅里叶级数 (${numTerms} 项)`, padX, h - 8)

    ctx.fillStyle = '#64748b'
    ctx.font = '8px -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('增加项数不会消除过冲 (Gibbs 现象)', w - padX, h - 8)
  }

  // ===== 辅助方法 =====

  /**
   * 简单 DFT 实现（用于教育演示，非优化版本）
   * @param {Float32Array} signal - 时域信号
   * @param {number} N - 点数
   * @returns {Float32Array} 幅度谱（前 N/2 个点）
   * @private
   */
  _simpleDFT(signal, N) {
    const spectrum = new Float32Array(N / 2)

    for (let k = 0; k < N / 2; k++) {
      let real = 0
      let imag = 0
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N
        real += signal[n] * Math.cos(angle)
        imag += signal[n] * Math.sin(angle)
      }
      spectrum[k] = Math.sqrt(real * real + imag * imag) / N
    }

    return spectrum
  }

  /**
   * 销毁
   */
  destroy() {
    this.ctx = null
  }
}

/**
 * 预设场景库
 * 提供常见音频信号的预设参数
 */
export const PRESET_SCENES = [
  {
    id: 'sine440',
    name: '基础正弦波 A4',
    description: '440Hz 纯正弦波，用于验证音高检测',
    config: {
      oscillators: [
        { frequency: 440, type: 'sine', volume: 0.75, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'chord_major',
    name: '大三和弦 (C-E-G)',
    description: 'C4-E4-G4 大三和弦，展示泛音叠加',
    config: {
      oscillators: [
        { frequency: 261.63, type: 'sine', volume: 0.6, enabled: true },
        { frequency: 329.63, type: 'sine', volume: 0.6, enabled: true },
        { frequency: 392.00, type: 'sine', volume: 0.6, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'chord_minor',
    name: '小三和弦 (A-C-E)',
    description: 'A3-C4-E4 小三和弦',
    config: {
      oscillators: [
        { frequency: 220.00, type: 'sine', volume: 0.6, enabled: true },
        { frequency: 261.63, type: 'sine', volume: 0.6, enabled: true },
        { frequency: 329.63, type: 'sine', volume: 0.6, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'white_noise',
    name: '白噪声分析',
    description: '白噪声信号，频谱应呈平坦分布',
    config: {
      oscillators: [],
      noise: true,
      noiseVolume: 0.3
    }
  },
  {
    id: 'square_harmonics',
    name: '方波谐波',
    description: '方波含有奇次谐波 (1, 3, 5, 7...)',
    config: {
      oscillators: [
        { frequency: 220, type: 'square', volume: 0.5, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'sawtooth_harmonics',
    name: '锯齿波谐波',
    description: '锯齿波含有全部整数次谐波',
    config: {
      oscillators: [
        { frequency: 220, type: 'sawtooth', volume: 0.5, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'beat_frequency',
    name: '拍频现象',
    description: '两个接近频率的正弦波产生拍频 (440Hz + 444Hz)',
    config: {
      oscillators: [
        { frequency: 440, type: 'sine', volume: 0.5, enabled: true },
        { frequency: 444, type: 'sine', volume: 0.5, enabled: true }
      ],
      noise: false
    }
  },
  {
    id: 'octave',
    name: '八度音程',
    description: 'A3(220Hz) + A4(440Hz) 纯八度',
    config: {
      oscillators: [
        { frequency: 220, type: 'sine', volume: 0.6, enabled: true },
        { frequency: 440, type: 'sine', volume: 0.6, enabled: true }
      ],
      noise: false
    }
  }
]
