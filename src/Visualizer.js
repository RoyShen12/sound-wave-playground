/**
 * 可视化模块
 * 管理 Canvas 渲染、时域图和频域图的绘制
 * 支持深色主题、自适应容器、峰值标注、dB 刻度
 */

import { initHiDPICanvas, formatFrequency } from './utils.js'
import {
  detectPeaks,
  detectPitchYIN,
  frequencyToNote,
  calculateRMS,
  calculatePeak,
  levelToDb,
  calculateTHD
} from './DSPAnalyzer.js'

// 时域绘图模式枚举
export const DrawMode = {
  POINTS: 0,
  FILLED: 1,
  WAVE: 2
}

export class Visualizer {
  /**
   * @param {HTMLCanvasElement} timeDomainCanvas - 时域 Canvas 元素
   * @param {HTMLCanvasElement} frequencyCanvas - 频域 Canvas 元素
   */
  constructor(timeDomainCanvas, frequencyCanvas) {
    this.tdCanvas = timeDomainCanvas
    this.fdCanvas = frequencyCanvas
    this.tdCtx = null
    this.fdCtx = null

    this.tdWidth = 0
    this.tdHeight = 0
    this.fdWidth = 0
    this.fdHeight = 0
    this.fdScaleHeight = 30
    this.fdDbLabelWidth = 35

    this.drawMode = DrawMode.WAVE
    this.frozen = false
    this._animFrameId = null
    this._resizeObserver = null

    // DSP 分析结果（每帧更新）
    this.dspInfo = {
      rmsDb: -Infinity,
      peakDb: -Infinity,
      pitch: 0,
      note: null,
      thd: 0,
      peaks: []
    }

    // 电平表衰减
    this._smoothRms = 0
    this._smoothPeak = 0
    this._peakHold = 0
    this._peakHoldTimer = 0
  }

  init() {
    this._setupCanvas(this.tdCanvas, 'td')
    this._setupCanvas(this.fdCanvas, 'fd')

    this._resizeObserver = new ResizeObserver(() => {
      this._setupCanvas(this.tdCanvas, 'td')
      this._setupCanvas(this.fdCanvas, 'fd')
    })

    if (this.tdCanvas.parentElement) {
      this._resizeObserver.observe(this.tdCanvas.parentElement)
    }
    if (this.fdCanvas.parentElement) {
      this._resizeObserver.observe(this.fdCanvas.parentElement)
    }
  }

  _setupCanvas(canvas, type) {
    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth || 800
    const height = type === 'td' ? 300 : 330

    if (type === 'td') {
      this.tdWidth = width
      this.tdHeight = height
      this.tdCtx = initHiDPICanvas(canvas, width, height)
    } else {
      this.fdWidth = width
      this.fdHeight = height
      this.fdCtx = initHiDPICanvas(canvas, width, height)
    }
  }

  /**
   * 绘制时域波形
   * @param {Float32Array} buffer - PCM 音频数据
   */
  drawTimeDomain(buffer) {
    if (this.frozen || !this.tdCtx) return

    // DSP 分析
    this._analyzeTimeDomain(buffer)

    this._clearTimeDomain()

    this.tdCtx.beginPath()
    const length = buffer.length
    for (let i = 0; i < length; i++) {
      const amp = buffer[i]
      switch (this.drawMode) {
        case DrawMode.POINTS:
          this._drawPoint(amp, i, length)
          break
        case DrawMode.FILLED:
          this._drawFilled(amp, i, length)
          break
        case DrawMode.WAVE:
          this._drawWave(amp, i, length)
          break
      }
    }

    if (this.drawMode === DrawMode.WAVE) {
      this.tdCtx.strokeStyle = '#e94560'
      this.tdCtx.lineWidth = 1.5
      this.tdCtx.stroke()
    } else {
      this.tdCtx.closePath()
      this.tdCtx.fillStyle = '#e94560'
      this.tdCtx.fill()
    }

    // 绘制 RMS/Peak 电平表
    this._drawLevelMeter()

    // 绘制音高信息
    this._drawPitchInfo()
  }

  /**
   * 分析时域缓冲区
   * @param {Float32Array} buffer
   * @private
   */
  _analyzeTimeDomain(buffer) {
    const rms = calculateRMS(buffer)
    const peak = calculatePeak(buffer)
    this.dspInfo.rmsDb = levelToDb(rms)
    this.dspInfo.peakDb = levelToDb(peak)

    // 使用 YIN 算法进行精确音高检测
    if (this._sampleRate && rms > 0.01) {
      const pitch = detectPitchYIN(buffer, this._sampleRate)
      if (pitch > 0) {
        this.dspInfo.pitch = pitch
        this.dspInfo.note = frequencyToNote(pitch)
      } else {
        this.dspInfo.note = null
      }
    } else {
      this.dspInfo.note = null
    }

    // 平滑衰减
    const decay = 0.85
    const attack = 0.3
    this._smoothRms = rms > this._smoothRms
      ? this._smoothRms + (rms - this._smoothRms) * attack
      : this._smoothRms * decay

    this._smoothPeak = peak > this._smoothPeak
      ? peak
      : this._smoothPeak * 0.95

    // 峰值保持
    if (peak > this._peakHold) {
      this._peakHold = peak
      this._peakHoldTimer = 30 // 约 0.5 秒保持
    } else if (this._peakHoldTimer > 0) {
      this._peakHoldTimer--
    } else {
      this._peakHold *= 0.95
    }
  }

  /**
   * 绘制电平表
   * @private
   */
  _drawLevelMeter() {
    const meterWidth = 6
    const meterHeight = this.tdHeight - 20
    const x = this.tdWidth - 25
    const y = 10

    // 背景
    this.tdCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.tdCtx.fillRect(x - 2, y - 2, meterWidth * 2 + 10, meterHeight + 4)

    // RMS 条
    const rmsHeight = Math.min(this._smoothRms, 1) * meterHeight
    const rmsGradient = this.tdCtx.createLinearGradient(0, y + meterHeight, 0, y)
    rmsGradient.addColorStop(0, '#22c55e')
    rmsGradient.addColorStop(0.6, '#eab308')
    rmsGradient.addColorStop(0.85, '#f97316')
    rmsGradient.addColorStop(1, '#ef4444')

    this.tdCtx.fillStyle = '#1e293b'
    this.tdCtx.fillRect(x, y, meterWidth, meterHeight)
    this.tdCtx.fillStyle = rmsGradient
    this.tdCtx.fillRect(x, y + meterHeight - rmsHeight, meterWidth, rmsHeight)

    // Peak 条
    const peakX = x + meterWidth + 3
    const peakHeight = Math.min(this._smoothPeak, 1) * meterHeight
    this.tdCtx.fillStyle = '#1e293b'
    this.tdCtx.fillRect(peakX, y, meterWidth, meterHeight)
    this.tdCtx.fillStyle = rmsGradient
    this.tdCtx.fillRect(peakX, y + meterHeight - peakHeight, meterWidth, peakHeight)

    // 峰值保持线
    if (this._peakHold > 0.001) {
      const holdY = y + meterHeight - this._peakHold * meterHeight
      this.tdCtx.fillStyle = '#ffffff'
      this.tdCtx.fillRect(peakX, holdY, meterWidth, 1)
    }

    // dB 刻度标签
    this.tdCtx.fillStyle = '#64748b'
    this.tdCtx.font = '8px -apple-system, sans-serif'
    this.tdCtx.textAlign = 'right'
    const dbMarks = [0, -6, -12, -24, -48]
    for (const db of dbMarks) {
      const markY = y + meterHeight * (1 - Math.pow(10, db / 20))
      if (markY >= y && markY <= y + meterHeight) {
        this.tdCtx.fillText(`${db}`, x - 4, markY + 3)
        this.tdCtx.fillStyle = 'rgba(255,255,255,0.1)'
        this.tdCtx.fillRect(x, markY, meterWidth * 2 + 3, 1)
        this.tdCtx.fillStyle = '#64748b'
      }
    }
    this.tdCtx.textAlign = 'left'
  }

  /**
   * 绘制音高检测信息
   * @private
   */
  _drawPitchInfo() {
    const note = this.dspInfo.note
    if (!note) return

    this.tdCtx.save()
    this.tdCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    this.tdCtx.fillRect(8, 8, 120, 50)

    this.tdCtx.fillStyle = '#0ea5e9'
    this.tdCtx.font = 'bold 20px var(--font-mono, monospace)'
    this.tdCtx.textAlign = 'left'
    this.tdCtx.fillText(`${note.note}${note.octave}`, 14, 32)

    this.tdCtx.fillStyle = '#94a3b8'
    this.tdCtx.font = '11px var(--font-mono, monospace)'
    this.tdCtx.fillText(`${note.frequency} Hz`, 14, 50)

    // 音分偏差指示
    const cents = note.cents
    if (Math.abs(cents) > 0) {
      this.tdCtx.fillStyle = Math.abs(cents) < 10 ? '#22c55e' : '#eab308'
      this.tdCtx.fillText(`${cents > 0 ? '+' : ''}${cents}¢`, 80, 32)
    }

    this.tdCtx.restore()
  }

  /**
   * 启动频域可视化循环
   * @param {import('./AudioEngine.js').AudioEngine} audioEngine
   */
  startFrequencyVisualization(audioEngine) {
    const draw = () => {
      const data = audioEngine.getFrequencyData()
      this._drawFrequencyBars(data, audioEngine.frequencyStep)
      this._animFrameId = requestAnimationFrame(draw)
    }
    draw()
  }

  stopFrequencyVisualization() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
  }

  /**
   * 绘制频域刻度
   */
  drawFrequencyScale(frequencyStep, fftSize) {
    if (!this.fdCtx) return
    const scaleY = this.fdHeight - this.fdScaleHeight
    this.fdCtx.clearRect(0, scaleY + 2, this.fdWidth, this.fdScaleHeight)
    this.fdCtx.fillStyle = '#94a3b8'
    this.fdCtx.font = '10px -apple-system, sans-serif'

    const binCount = fftSize / 2
    const barWidth = 2
    const barGap = 1
    const pixelsPerBin = barWidth + barGap
    const offsetX = this.fdDbLabelWidth

    for (let i = 0; i < binCount; i++) {
      if (i % 16 === 0) {
        const hz = i * frequencyStep
        const x = offsetX + i * pixelsPerBin
        if (x > this.fdWidth) break
        this.fdCtx.fillStyle = '#475569'
        this.fdCtx.fillRect(x, scaleY + 2, 1, 4)
        this.fdCtx.fillStyle = '#94a3b8'
        this.fdCtx.fillText(formatFrequency(hz), x, scaleY + 18)
      }
    }
  }

  setDrawMode(mode) {
    this.drawMode = mode
  }

  toggleFreeze() {
    this.frozen = !this.frozen
  }

  /**
   * 设置音频引擎的采样率和频率步长（用于时域 DSP 分析）
   */
  setAudioParams(sampleRate, frequencyStep) {
    this._sampleRate = sampleRate
    this._frequencyStep = frequencyStep
  }

  destroy() {
    // 取消 rAF 循环
    this.stopFrequencyVisualization()
    // 断开 ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }
    // 清空 Canvas 上下文引用
    this.tdCtx = null
    this.fdCtx = null
  }

  // ===== 私有方法 =====

  _clearTimeDomain() {
    this.tdCtx.fillStyle = '#1a1a2e'
    this.tdCtx.fillRect(0, 0, this.tdWidth, this.tdHeight)

    this.tdCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    this.tdCtx.lineWidth = 1
    this.tdCtx.beginPath()
    this.tdCtx.moveTo(0, this.tdHeight / 2)
    this.tdCtx.lineTo(this.tdWidth, this.tdHeight / 2)
    this.tdCtx.stroke()

    this.tdCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
    for (let i = 1; i < 4; i++) {
      const y = (this.tdHeight / 4) * i
      this.tdCtx.beginPath()
      this.tdCtx.moveTo(0, y)
      this.tdCtx.lineTo(this.tdWidth, y)
      this.tdCtx.stroke()
    }
  }

  /**
   * 绘制频域柱状图（带峰值标注和 dB 刻度）
   * @param {Uint8Array} data
   * @param {number} frequencyStep
   * @private
   */
  _drawFrequencyBars(data, frequencyStep) {
    if (!this.fdCtx) return
    const barAreaHeight = this.fdHeight - this.fdScaleHeight
    const offsetX = this.fdDbLabelWidth

    // 背景
    this.fdCtx.fillStyle = '#1a1a2e'
    this.fdCtx.fillRect(0, 0, this.fdWidth, barAreaHeight)

    // dB 刻度
    this._drawDbScale(barAreaHeight)

    let x = offsetX
    const barWidth = 2
    const barGap = 1

    for (let i = 0; i < data.length; i++) {
      const power = data[i]
      const height = (power / 255) * barAreaHeight

      const ratio = i / data.length
      let r, g, b
      if (ratio < 0.33) {
        r = 30 + power * 0.3
        g = 50
        b = 150 + power * 0.4
      } else if (ratio < 0.66) {
        r = 50 + power * 0.4
        g = 100 + power * 0.5
        b = 50
      } else {
        r = 150 + power * 0.4
        g = 50
        b = 50
      }

      this.fdCtx.fillStyle = `rgb(${r},${g},${b})`
      this.fdCtx.fillRect(x, barAreaHeight - height, barWidth, height)

      x += barWidth + barGap
      if (x > this.fdWidth) break
    }

    // 峰值检测和标注
    if (frequencyStep > 0) {
      const peaks = detectPeaks(data, frequencyStep, 40, 5)
      this.dspInfo.peaks = peaks
      this._drawPeakLabels(peaks, frequencyStep, barAreaHeight, offsetX)

      // THD 计算（基于频域峰值数据）
      if (peaks.length > 0) {
        this.dspInfo.thd = calculateTHD(data, frequencyStep, peaks[0].frequency)
      }
    }
  }

  /**
   * 绘制 dB 刻度
   * @private
   */
  _drawDbScale(barAreaHeight) {
    this.fdCtx.fillStyle = '#64748b'
    this.fdCtx.font = '9px -apple-system, sans-serif'
    this.fdCtx.textAlign = 'right'

    const dbValues = [-10, -20, -30, -40, -50, -60, -70, -80, -90]
    const minDb = -90
    const maxDb = -10
    const dbRange = maxDb - minDb

    for (const db of dbValues) {
      const normalized = (db - minDb) / dbRange
      const y = barAreaHeight * (1 - normalized)
      this.fdCtx.fillStyle = '#475569'
      this.fdCtx.fillRect(this.fdDbLabelWidth - 4, y, 4, 1)
      this.fdCtx.fillStyle = '#64748b'
      this.fdCtx.fillText(`${db}`, this.fdDbLabelWidth - 6, y + 3)
    }

    this.fdCtx.textAlign = 'left'
  }

  /**
   * 绘制峰值标注
   * @private
   */
  _drawPeakLabels(peaks, frequencyStep, barAreaHeight, offsetX) {
    const barWidth = 2
    const barGap = 1
    const pixelsPerBin = barWidth + barGap

    this.fdCtx.font = '9px -apple-system, sans-serif'
    this.fdCtx.textAlign = 'center'

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i]
      const x = offsetX + peak.index * pixelsPerBin
      const height = (peak.amplitude / 255) * barAreaHeight
      const y = barAreaHeight - height

      // 标注三角形
      this.fdCtx.fillStyle = i === 0 ? '#e94560' : '#eab308'
      this.fdCtx.beginPath()
      this.fdCtx.moveTo(x, y - 2)
      this.fdCtx.lineTo(x - 4, y - 8)
      this.fdCtx.lineTo(x + 4, y - 8)
      this.fdCtx.closePath()
      this.fdCtx.fill()

      // 频率标签
      if (y > 20) {
        this.fdCtx.fillStyle = i === 0 ? '#e94560' : '#eab308'
        const freqText = formatFrequency(peak.frequency)
        this.fdCtx.fillText(freqText, x, y - 12)
      }
    }
  }

  _drawPoint(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    this.tdCtx.rect(this.tdWidth * (index / total), h, 1, 1)
  }

  _drawFilled(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    if (amp > 0) {
      this.tdCtx.rect(
        this.tdWidth * (index / total),
        this.tdHeight / 2,
        1,
        amp * (this.tdHeight / 2)
      )
    }
    if (amp < 0) {
      this.tdCtx.rect(this.tdWidth * (index / total), h, 1, -1 * amp * (this.tdHeight / 2))
    }
  }

  _drawWave(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    if (index === 0) {
      this.tdCtx.moveTo(0, h)
    } else {
      this.tdCtx.lineTo(this.tdWidth * (index / total), h)
    }
  }
}
