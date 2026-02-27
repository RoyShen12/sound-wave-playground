/**
 * DSP Worker 管理器
 * 负责创建和管理 DSP Web Worker，将耗时的音频分析计算移到后台线程
 * 当 Worker 不可用时自动回退到主线程同步计算
 * @module DSPWorkerManager
 */

import {
  detectPitchYIN,
  detectPitchAutocorrelation,
  frequencyToNote,
  calculateRMS,
  calculatePeak,
  levelToDb,
  detectPeaks,
  calculateTHD
} from './DSPAnalyzer.js'

export class DSPWorkerManager {
  constructor() {
    /** @type {Worker | null} Worker 实例 */
    this.worker = null
    /** @type {Map<number, Function>} 回调函数映射，按请求 ID 索引 */
    this._callbacks = new Map()
    /** @type {number} 自增的请求 ID */
    this._nextId = 0
    /** @type {boolean} 当前环境是否支持 Web Worker */
    this._supported = typeof Worker !== 'undefined'
  }

  /**
   * 初始化 Worker
   * 创建 Worker 实例并设置消息和错误处理
   * @returns {boolean} 是否初始化成功
   */
  init() {
    if (!this._supported) return false

    try {
      this.worker = new Worker('./dsp-worker.js')

      this.worker.onmessage = (e) => this._handleMessage(e.data)

      this.worker.onerror = (err) => {
        console.warn('DSP Worker 错误，回退到主线程:', err)
        this._supported = false
        // 拒绝所有待处理的回调，让它们在主线程重试
        this._rejectAllPending('Worker 发生错误')
      }

      return true
    } catch (_e) {
      console.warn('DSP Worker 创建失败，将使用主线程:', _e)
      this._supported = false
      return false
    }
  }

  /**
   * Worker 是否可用
   * @returns {boolean}
   */
  get isAvailable() {
    return this._supported && this.worker !== null
  }

  /**
   * 分析音高（基频检测 + 电平计算）
   * 如果 Worker 可用则在后台线程执行，否则在主线程同步计算
   * @param {Float32Array} buffer - PCM 音频数据
   * @param {number} sampleRate - 采样率
   * @returns {Promise<{pitch: number, note: object|null, rms: number, rmsDb: number, peak: number, peakDb: number}>}
   */
  analyzePitch(buffer, sampleRate) {
    if (this.isAvailable) {
      return this._postMessage({
        type: 'analyzePitch',
        buffer: buffer,
        sampleRate: sampleRate
      })
    }

    // 回退到主线程同步计算
    return Promise.resolve(this._analyzePitchSync(buffer, sampleRate))
  }

  /**
   * 分析频谱（峰值检测 + THD 计算）
   * 如果 Worker 可用则在后台线程执行，否则在主线程同步计算
   * @param {Uint8Array} frequencyData - 频域数据
   * @param {number} frequencyStep - 频率分辨率
   * @returns {Promise<{peaks: Array, thd: number}>}
   */
  analyzeSpectrum(frequencyData, frequencyStep) {
    if (this.isAvailable) {
      return this._postMessage({
        type: 'analyzeSpectrum',
        frequencyData: frequencyData,
        frequencyStep: frequencyStep
      })
    }

    // 回退到主线程同步计算
    return Promise.resolve(this._analyzeSpectrumSync(frequencyData, frequencyStep))
  }

  /**
   * 主线程同步音高分析（Worker 不可用时的回退逻辑）
   * @param {Float32Array} buffer - PCM 音频数据
   * @param {number} sampleRate - 采样率
   * @returns {{pitch: number, note: object|null, rms: number, rmsDb: number, peak: number, peakDb: number}}
   * @private
   */
  _analyzePitchSync(buffer, sampleRate) {
    // 优先使用 YIN 算法，回退到自相关法
    let pitch = detectPitchYIN(buffer, sampleRate)
    if (pitch <= 0) {
      pitch = detectPitchAutocorrelation(buffer, sampleRate)
    }

    const note = pitch > 0 ? frequencyToNote(pitch) : null
    const rms = calculateRMS(buffer)
    const peak = calculatePeak(buffer)

    return {
      type: 'pitchResult',
      pitch,
      note,
      rms,
      rmsDb: levelToDb(rms),
      peak,
      peakDb: levelToDb(peak)
    }
  }

  /**
   * 主线程同步频谱分析（Worker 不可用时的回退逻辑）
   * @param {Uint8Array} frequencyData - 频域数据
   * @param {number} frequencyStep - 频率分辨率
   * @returns {{peaks: Array, thd: number}}
   * @private
   */
  _analyzeSpectrumSync(frequencyData, frequencyStep) {
    const peaks = detectPeaks(frequencyData, frequencyStep)
    let thd = 0
    if (peaks.length > 0) {
      thd = calculateTHD(frequencyData, frequencyStep, peaks[0].frequency)
    }

    return {
      type: 'spectrumResult',
      peaks,
      thd
    }
  }

  /**
   * 处理 Worker 返回的消息
   * 根据消息 ID 找到对应的回调并执行
   * @param {Object} data - Worker 返回的数据
   * @private
   */
  _handleMessage(data) {
    const cb = this._callbacks.get(data.id)
    if (cb) {
      this._callbacks.delete(data.id)
      cb.resolve(data)
    }
  }

  /**
   * 向 Worker 发送消息
   * 使用 Transferable 传递 ArrayBuffer 以避免拷贝开销
   * @param {Object} msg - 要发送的消息
   * @returns {Promise} Worker 返回结果的 Promise
   * @private
   */
  _postMessage(msg) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++
      msg.id = id
      this._callbacks.set(id, { resolve, reject })

      try {
        // 传递 buffer 时复制一份再使用 Transferable，避免影响调用者的原始数据
        if (msg.buffer) {
          const copy = new Float32Array(msg.buffer)
          msg.buffer = copy
          this.worker.postMessage(msg, [copy.buffer])
        } else if (msg.frequencyData) {
          const copy = new Uint8Array(msg.frequencyData)
          msg.frequencyData = copy
          this.worker.postMessage(msg, [copy.buffer])
        } else {
          this.worker.postMessage(msg)
        }
      } catch (err) {
        this._callbacks.delete(id)
        // 发送失败时回退到主线程
        console.warn('Worker postMessage 失败，回退到主线程:', err)
        if (msg.type === 'analyzePitch') {
          resolve(this._analyzePitchSync(msg.buffer, msg.sampleRate))
        } else if (msg.type === 'analyzeSpectrum') {
          resolve(this._analyzeSpectrumSync(msg.frequencyData, msg.frequencyStep))
        } else {
          reject(err)
        }
      }
    })
  }

  /**
   * 拒绝所有待处理的回调
   * 在 Worker 发生不可恢复错误时调用
   * @param {string} reason - 拒绝原因
   * @private
   */
  _rejectAllPending(reason) {
    for (const [_id, cb] of this._callbacks) {
      cb.reject(new Error(reason))
    }
    this._callbacks.clear()
  }

  /**
   * 销毁 Worker 并清理资源
   * 终止 Worker 线程并清空所有待处理的回调
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    // 拒绝所有尚未完成的回调
    this._rejectAllPending('Worker 已销毁')
  }
}
