/**
 * 可视化模块
 * 管理 Canvas 渲染、时域图和频域图的绘制
 * 支持深色主题和自适应容器大小
 */

import { initHiDPICanvas, formatFrequency } from './utils.js'

// 时域绘图模式枚举
export const DrawMode = {
  POINTS: 0, // 采样点
  FILLED: 1, // 填充面积
  WAVE: 2 // 连续波形
}

export class Visualizer {
  /**
   * @param {HTMLCanvasElement} timeDomainCanvas - 时域 Canvas 元素
   * @param {HTMLCanvasElement} frequencyCanvas - 频域 Canvas 元素
   */
  constructor(timeDomainCanvas, frequencyCanvas) {
    /** @type {HTMLCanvasElement} */
    this.tdCanvas = timeDomainCanvas
    /** @type {HTMLCanvasElement} */
    this.fdCanvas = frequencyCanvas

    /** @type {CanvasRenderingContext2D} */
    this.tdCtx = null
    /** @type {CanvasRenderingContext2D} */
    this.fdCtx = null

    // 逻辑尺寸（将根据容器自适应）
    this.tdWidth = 0
    this.tdHeight = 0
    this.fdWidth = 0
    this.fdHeight = 0
    this.fdScaleHeight = 30

    /** @type {number} 当前绘图模式 */
    this.drawMode = DrawMode.WAVE

    /** @type {boolean} 是否冻结时域图 */
    this.frozen = false

    /** @type {number} 动画帧 ID */
    this._animFrameId = null

    /** @type {ResizeObserver} */
    this._resizeObserver = null
  }

  /**
   * 初始化 Canvas，自适应容器大小
   */
  init() {
    this._setupCanvas(this.tdCanvas, 'td')
    this._setupCanvas(this.fdCanvas, 'fd')

    // 监听容器大小变化
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

  /**
   * 设置单个 Canvas 的尺寸
   * @param {HTMLCanvasElement} canvas
   * @param {'td' | 'fd'} type
   * @private
   */
  _setupCanvas(canvas, type) {
    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth || 800
    const height = type === 'td' ? 300 : 330

    if (type === 'td') {
      this.tdWidth = width
      this.tdHeight = height
      this.tdCtx = initHiDPICanvas(canvas, width, height)
      this.tdCtx.fillStyle = '#e94560'
      this.tdCtx.strokeStyle = '#e94560'
      this.tdCtx.lineWidth = 1.5
    } else {
      this.fdWidth = width
      this.fdHeight = height
      this.fdCtx = initHiDPICanvas(canvas, width, height)
    }
  }

  /**
   * 绘制时域波形（从 PCM 缓冲区数据）
   * @param {Float32Array} buffer - PCM 音频数据
   */
  drawTimeDomain(buffer) {
    if (this.frozen || !this.tdCtx) return

    // 清除并绘制网格背景
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
  }

  /**
   * 启动频域可视化循环
   * @param {import('./AudioEngine.js').AudioEngine} audioEngine - 音频引擎实例
   */
  startFrequencyVisualization(audioEngine) {
    const draw = () => {
      const data = audioEngine.getFrequencyData()
      this._drawFrequencyBars(data)
      this._animFrameId = requestAnimationFrame(draw)
    }
    draw()
  }

  /**
   * 停止频域可视化循环
   */
  stopFrequencyVisualization() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
  }

  /**
   * 绘制频域刻度
   * @param {number} frequencyStep - 频率分辨率步长
   * @param {number} fftSize - FFT 大小
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

    for (let i = 0; i < binCount; i++) {
      if (i % 16 === 0) {
        const hz = i * frequencyStep
        const x = i * pixelsPerBin
        if (x > this.fdWidth) break
        this.fdCtx.fillStyle = '#475569'
        this.fdCtx.fillRect(x, scaleY + 2, 1, 4)
        this.fdCtx.fillStyle = '#94a3b8'
        this.fdCtx.fillText(formatFrequency(hz), x, scaleY + 18)
      }
    }
  }

  /**
   * 设置绘图模式
   * @param {number} mode - DrawMode 枚举值
   */
  setDrawMode(mode) {
    this.drawMode = mode
  }

  /**
   * 切换冻结状态
   */
  toggleFreeze() {
    this.frozen = !this.frozen
  }

  /**
   * 销毁可视化器
   */
  destroy() {
    this.stopFrequencyVisualization()
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
    }
  }

  // ===== 私有方法 =====

  /** 清除时域画布并绘制网格 */
  _clearTimeDomain() {
    this.tdCtx.fillStyle = '#1a1a2e'
    this.tdCtx.fillRect(0, 0, this.tdWidth, this.tdHeight)

    // 绘制中心参考线
    this.tdCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    this.tdCtx.lineWidth = 1
    this.tdCtx.beginPath()
    this.tdCtx.moveTo(0, this.tdHeight / 2)
    this.tdCtx.lineTo(this.tdWidth, this.tdHeight / 2)
    this.tdCtx.stroke()

    // 绘制网格线
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
   * 绘制频域柱状图
   * @param {Uint8Array} data - 频域数据
   * @private
   */
  _drawFrequencyBars(data) {
    if (!this.fdCtx) return
    const barAreaHeight = this.fdHeight - this.fdScaleHeight

    // 背景
    this.fdCtx.fillStyle = '#1a1a2e'
    this.fdCtx.fillRect(0, 0, this.fdWidth, barAreaHeight)

    let x = 0
    const barWidth = 2
    const barGap = 1

    for (let i = 0; i < data.length; i++) {
      const power = data[i]
      const height = (power / 255) * barAreaHeight

      // 渐变色：低频蓝色 → 中频绿色 → 高频红色
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
  }

  /**
   * 绘制采样点
   * @private
   */
  _drawPoint(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    this.tdCtx.rect(this.tdWidth * (index / total), h, 1, 1)
  }

  /**
   * 绘制填充面积
   * @private
   */
  _drawFilled(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    if (amp > 0) {
      this.tdCtx.rect(this.tdWidth * (index / total), this.tdHeight / 2, 1, amp * (this.tdHeight / 2))
    }
    if (amp < 0) {
      this.tdCtx.rect(this.tdWidth * (index / total), h, 1, -1 * amp * (this.tdHeight / 2))
    }
  }

  /**
   * 绘制连续波形线
   * @private
   */
  _drawWave(amp, index, total) {
    const h = this.tdHeight / 2 + (this.tdHeight / 2) * amp
    if (index === 0) {
      this.tdCtx.moveTo(0, h)
    } else {
      this.tdCtx.lineTo(this.tdWidth * (index / total), h)
    }
  }
}
