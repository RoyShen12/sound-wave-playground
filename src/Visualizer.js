/**
 * 可视化模块
 * 管理 Canvas 渲染、时域图和频域图的绘制
 */

import { initHiDPICanvas, formatFrequency } from './utils.js'

// 时域绘图模式枚举
export const DrawMode = {
  POINTS: 0,    // 采样点
  FILLED: 1,    // 填充面积
  WAVE: 2       // 连续波形
}

export class Visualizer {
  /**
   * @param {HTMLCanvasElement} timeDomainCanvas - 时域 Canvas 元素
   * @param {HTMLCanvasElement} frequencyCanvas - 频域 Canvas 元素
   */
  constructor(timeDomainCanvas, frequencyCanvas) {
    // 时域画布配置
    this.tdWidth = 1000
    this.tdHeight = 400

    // 频域画布配置
    this.fdWidth = 1540
    this.fdHeight = 430
    this.fdScaleHeight = 30

    /** @type {CanvasRenderingContext2D} */
    this.tdCtx = null
    /** @type {HTMLCanvasElement} */
    this.tdCanvas = timeDomainCanvas
    /** @type {CanvasRenderingContext2D} */
    this.fdCtx = null
    /** @type {HTMLCanvasElement} */
    this.fdCanvas = frequencyCanvas

    /** @type {number} 当前绘图模式 */
    this.drawMode = DrawMode.WAVE

    /** @type {boolean} 是否冻结时域图 */
    this.frozen = false

    /** @type {number} 动画帧 ID */
    this._animFrameId = null
  }

  /**
   * 初始化 Canvas
   */
  init() {
    this.tdCtx = initHiDPICanvas(this.tdCanvas, this.tdWidth, this.tdHeight)
    this.tdCtx.fillStyle = '#f52311'
    this.tdCtx.strokeStyle = '#f52311'

    this.fdCtx = initHiDPICanvas(this.fdCanvas, this.fdWidth, this.fdHeight)
  }

  /**
   * 显示初始化提示文字
   */
  showInitMessage() {
    this.tdCtx.font = '26px sans-serif'
    this.tdCtx.textAlign = 'center'
    this.tdCtx.fillText('请点击任意空白处来初始化', this.tdWidth / 2, this.tdHeight / 2)
  }

  /**
   * 绘制时域波形（从 PCM 缓冲区数据）
   * @param {Float32Array} buffer - PCM 音频数据
   */
  drawTimeDomain(buffer) {
    if (this.frozen) return

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
      this.tdCtx.stroke()
    } else {
      this.tdCtx.closePath()
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
    const scaleY = this.fdHeight - this.fdScaleHeight
    this.fdCtx.clearRect(0, scaleY + 2, this.fdWidth, this.fdScaleHeight)
    this.fdCtx.fillStyle = '#000000'
    this.fdCtx.font = '10px sans-serif'

    const binCount = fftSize / 2
    for (let i = 0; i < binCount; i++) {
      if (i % 16 === 0) {
        const hz = i * frequencyStep
        const x = i * 3
        this.fdCtx.fillRect(x, scaleY + 2, 1, 4)
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

  // ===== 私有方法 =====

  /** 清除时域画布 */
  _clearTimeDomain() {
    this.tdCtx.clearRect(0, 0, this.tdWidth, this.tdHeight)
  }

  /**
   * 绘制频域柱状图
   * @param {Uint8Array} data - 频域数据
   * @private
   */
  _drawFrequencyBars(data) {
    const barHeight = this.fdHeight - this.fdScaleHeight
    this.fdCtx.clearRect(0, 0, this.fdWidth, barHeight)

    let x = 0
    const barWidth = 2

    for (let i = 0; i < data.length; i++) {
      const power = data[i]
      const height = power * (barHeight / 255)
      this.fdCtx.fillStyle = `rgb(${power + 100},50,50)`
      this.fdCtx.fillRect(x, barHeight - height, barWidth, height)
      x += barWidth + 1
      if (x > this.fdWidth) break
    }
  }

  /**
   * 绘制采样点
   * @private
   */
  _drawPoint(amp, index, total) {
    const h = this.tdHeight / 2 + this.tdHeight / 2 * amp
    this.tdCtx.rect(this.tdWidth * (index / total), h, 1, 1)
  }

  /**
   * 绘制填充面积
   * @private
   */
  _drawFilled(amp, index, total) {
    const h = this.tdHeight / 2 + this.tdHeight / 2 * amp
    if (amp > 0) {
      this.tdCtx.rect(this.tdWidth * (index / total), this.tdHeight / 2, 1, amp * this.tdHeight / 2)
    }
    if (amp < 0) {
      this.tdCtx.rect(this.tdWidth * (index / total), h, 1, -1 * amp * this.tdHeight / 2)
    }
  }

  /**
   * 绘制连续波形线
   * @private
   */
  _drawWave(amp, index, total) {
    const h = this.tdHeight / 2 + this.tdHeight / 2 * amp
    if (index === 0) {
      this.tdCtx.moveTo(0, h)
    } else {
      this.tdCtx.lineTo(this.tdWidth * (index / total), h)
    }
  }
}
