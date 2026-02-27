/**
 * 音频引擎模块
 * 管理 AudioContext、振荡器、增益节点和分析器
 */

// 常量配置
const DEFAULT_FFT_SIZE = 1024
const DEFAULT_INIT_FREQUENCY = 450
const OSCILLATOR_COUNT = 5
const DEFAULT_ACTIVE_OSCILLATOR_COUNT = 1

export class AudioEngine {
  constructor() {
    /** @type {AudioContext | null} */
    this.audioContext = null

    /** @type {number} 频率分辨率步长 */
    this.frequencyStep = 0

    /** @type {number} FFT 大小 */
    this.fftSize = DEFAULT_FFT_SIZE

    /** @type {number} 初始频率 */
    this.initFrequency = DEFAULT_INIT_FREQUENCY

    /** @type {OscillatorNode[]} 振荡器数组 */
    this.oscillators = []

    /** @type {GainNode[]} 音量增益节点数组 */
    this.volumeGainNodes = []

    /** @type {GainNode[]} 开关增益节点数组 */
    this.switchGainNodes = []

    /** @type {GainNode | null} 主增益节点 */
    this.masterGain = null

    /** @type {AnalyserNode | null} 频域分析器 */
    this.frequencyAnalyser = null

    /** @type {AnalyserNode | null} 时域分析器 */
    this.timeDomainAnalyser = null

    /** @type {AudioBufferSourceNode | null} 白噪声源 */
    this.whiteNoiseSource = null

    /** @type {GainNode | null} 白噪声开关 */
    this.whiteNoiseEnable = null

    /** @type {GainNode | null} 白噪声音量 */
    this.whiteNoiseVolume = null

    /** @type {boolean} 是否正在播放 */
    this.isPlaying = false

    /** @type {AudioWorkletNode | ScriptProcessorNode | null} 音频处理节点 */
    this.processorNode = null

    /** @type {boolean} 是否使用 AudioWorklet */
    this.useWorklet = false

    /** @type {number} 当前缓冲区大小 */
    this.bufferSize = 4096

    /** @type {((buffer: Float32Array) => void) | null} 音频处理回调 */
    this.onAudioProcess = null

    /** @type {AudioBufferSourceNode | null} 外部音频源（文件播放） */
    this.externalSource = null

    /** @type {boolean} 是否已插入滤波器链 */
    this._filterChainInserted = false

    /** @type {DynamicsCompressorNode | null} 压缩器节点引用 */
    this._compressorNode = null

    /** @type {GainNode | null} 滤波器链输出节点引用 */
    this._filterOutputNode = null
  }

  /**
   * 初始化音频上下文和所有音频节点
   */
  async init() {
    // 创建音频上下文（兼容 Safari）
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    this.audioContext = new AudioContextClass()
    this.frequencyStep = this.audioContext.sampleRate / 2 / (this.fftSize / 2)

    // 创建主增益节点
    this.masterGain = this.audioContext.createGain()
    this.masterGain.gain.value = 0

    // 初始化振荡器
    this._initOscillators()

    // 初始化分析器
    this._initAnalysers()

    // 初始化白噪声
    this._initWhiteNoise()

    // 连接音频图
    this.masterGain.connect(this.frequencyAnalyser)
    this.masterGain.connect(this.timeDomainAnalyser)
    this.masterGain.connect(this.audioContext.destination)

    // 尝试加载 AudioWorklet
    await this._initAudioWorklet()
  }

  /**
   * 初始化振荡器组
   * @private
   */
  _initOscillators() {
    for (let i = 0; i < OSCILLATOR_COUNT; i++) {
      // 音量增益
      const volumeGain = this.audioContext.createGain()
      volumeGain.gain.value = 0.75

      // 开关增益
      const switchGain = this.audioContext.createGain()
      switchGain.gain.value = i < DEFAULT_ACTIVE_OSCILLATOR_COUNT ? 1 : 0

      // 创建振荡器
      const oscillator = this.audioContext.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = this.initFrequency + i * 20
      oscillator.start(0)

      // 连接：振荡器 → 音量 → 开关 → 主增益
      oscillator.connect(volumeGain)
      volumeGain.connect(switchGain)
      switchGain.connect(this.masterGain)

      this.oscillators.push(oscillator)
      this.volumeGainNodes.push(volumeGain)
      this.switchGainNodes.push(switchGain)
    }
  }

  /**
   * 初始化分析器节点
   * @private
   */
  _initAnalysers() {
    this.frequencyAnalyser = this.audioContext.createAnalyser()
    this.frequencyAnalyser.fftSize = this.fftSize
    this.frequencyAnalyser.minDecibels = -90
    this.frequencyAnalyser.maxDecibels = -10

    this.timeDomainAnalyser = this.audioContext.createAnalyser()
    this.timeDomainAnalyser.fftSize = this.fftSize
  }

  /**
   * 初始化白噪声源
   * @private
   */
  _initWhiteNoise() {
    const bufferSize = 2 * this.audioContext.sampleRate
    const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    this.whiteNoiseSource = this.audioContext.createBufferSource()
    this.whiteNoiseSource.buffer = noiseBuffer
    this.whiteNoiseSource.loop = true
    this.whiteNoiseSource.start(0)

    this.whiteNoiseEnable = this.audioContext.createGain()
    this.whiteNoiseEnable.gain.value = 0

    this.whiteNoiseVolume = this.audioContext.createGain()
    this.whiteNoiseVolume.gain.value = 0.12

    // 连接：白噪声源 → 音量 → 开关 → 主增益
    this.whiteNoiseSource.connect(this.whiteNoiseVolume)
    this.whiteNoiseVolume.connect(this.whiteNoiseEnable)
    this.whiteNoiseEnable.connect(this.masterGain)
  }

  /**
   * 初始化 AudioWorklet（带 ScriptProcessorNode 回退）
   * @private
   */
  async _initAudioWorklet() {
    try {
      if (this.audioContext.audioWorklet) {
        await this.audioContext.audioWorklet.addModule('./audio-worklet-processor.js')
        this.useWorklet = true
        console.log('AudioWorklet 加载成功')
      }
    } catch (err) {
      console.warn('AudioWorklet 不可用，回退到 ScriptProcessorNode:', err)
      this.useWorklet = false
    }
  }

  /**
   * 初始化音频处理节点（用于时域数据获取）
   * 优先使用 AudioWorkletNode，不支持时回退到 ScriptProcessorNode
   * @param {number} bufferSize - 缓冲区大小
   */
  initProcessorNode(bufferSize = 4096) {
    this.bufferSize = bufferSize

    // 断开旧节点
    if (this.processorNode) {
      this.frequencyAnalyser.disconnect(this.processorNode)
      this.processorNode.disconnect()
      this.processorNode = null
    }

    if (this.useWorklet) {
      this._createWorkletNode(bufferSize)
    } else {
      this._createScriptProcessorNode(bufferSize)
    }
  }

  /**
   * 创建 AudioWorkletNode
   * @param {number} bufferSize - 缓冲区大小
   * @private
   */
  _createWorkletNode(bufferSize) {
    this.processorNode = new AudioWorkletNode(this.audioContext, 'time-domain-processor')
    this.frequencyAnalyser.connect(this.processorNode)
    this.processorNode.connect(this.audioContext.destination)

    // 设置缓冲区大小
    this.processorNode.port.postMessage({ type: 'setBufferSize', bufferSize })

    // 接收来自 Worklet 的音频数据
    this.processorNode.port.onmessage = (event) => {
      if (event.data.type === 'audioData' && this.onAudioProcess) {
        this.onAudioProcess(event.data.buffer)
      }
    }
  }

  /**
   * 创建 ScriptProcessorNode（回退方案）
   * @param {number} bufferSize - 缓冲区大小
   * @private
   */
  _createScriptProcessorNode(bufferSize) {
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
    this.frequencyAnalyser.connect(this.processorNode)
    // 连接到 destination 以解决 Chrome 的 bug
    this.processorNode.connect(this.audioContext.destination)

    this.processorNode.onaudioprocess = (audioEvt) => {
      if (this.onAudioProcess) {
        const buffer = audioEvt.inputBuffer.getChannelData(0)
        this.onAudioProcess(buffer)
      }
    }
  }

  /**
   * 切换播放/暂停状态
   * @returns {boolean} 当前是否正在播放
   */
  togglePlayback() {
    if (this.isPlaying) {
      this.masterGain.gain.value = 0
      this.isPlaying = false
    } else {
      this.masterGain.gain.value = 1
      this.isPlaying = true
    }
    return this.isPlaying
  }

  /**
   * 设置振荡器频率
   * @param {number} index - 振荡器索引
   * @param {number} frequency - 频率值（Hz）
   */
  setOscillatorFrequency(index, frequency) {
    if (index >= 0 && index < this.oscillators.length) {
      this.oscillators[index].frequency.value = frequency
    }
  }

  /**
   * 设置振荡器波形类型
   * @param {number} index - 振荡器索引
   * @param {string} type - 波形类型 (sine, square, sawtooth, triangle)
   */
  setOscillatorType(index, type) {
    if (index >= 0 && index < this.oscillators.length) {
      this.oscillators[index].type = type
    }
  }

  /**
   * 设置振荡器音量
   * @param {number} index - 振荡器索引
   * @param {number} volume - 音量 0-1
   */
  setOscillatorVolume(index, volume) {
    if (index >= 0 && index < this.volumeGainNodes.length) {
      this.volumeGainNodes[index].gain.value = volume
    }
  }

  /**
   * 启用/禁用振荡器
   * @param {number} index - 振荡器索引
   * @param {boolean} enabled - 是否启用
   */
  setOscillatorEnabled(index, enabled) {
    if (index >= 0 && index < this.switchGainNodes.length) {
      this.switchGainNodes[index].gain.value = enabled ? 1 : 0
    }
  }

  /**
   * 设置白噪声音量
   * @param {number} volume - 音量 0-1
   */
  setWhiteNoiseVolume(volume) {
    if (this.whiteNoiseVolume) {
      this.whiteNoiseVolume.gain.value = volume
    }
  }

  /**
   * 启用/禁用白噪声
   * @param {boolean} enabled - 是否启用
   */
  setWhiteNoiseEnabled(enabled) {
    if (this.whiteNoiseEnable) {
      this.whiteNoiseEnable.gain.value = enabled ? 1 : 0
    }
  }

  /**
   * 获取频域数据
   * @returns {Uint8Array} 频域数据数组
   */
  getFrequencyData() {
    const bufferLength = this.frequencyAnalyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    this.frequencyAnalyser.getByteFrequencyData(dataArray)
    return dataArray
  }

  /**
   * 获取时域数据
   * @returns {Uint8Array} 时域数据数组
   */
  getTimeDomainData() {
    const bufferLength = this.timeDomainAnalyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    this.timeDomainAnalyser.getByteTimeDomainData(dataArray)
    return dataArray
  }

  /** 振荡器数量 */
  get oscillatorCount() {
    return OSCILLATOR_COUNT
  }

  /** 采样率 */
  get sampleRate() {
    return this.audioContext ? this.audioContext.sampleRate : 0
  }

  /**
   * 连接外部音频源（如文件播放的 AudioBufferSourceNode）到信号链
   * @param {AudioBufferSourceNode} sourceNode - 外部音频源节点
   */
  connectExternalSource(sourceNode) {
    this.externalSource = sourceNode
    sourceNode.connect(this.masterGain)
  }

  /**
   * 断开并释放外部音频源
   */
  disconnectExternalSource() {
    if (this.externalSource) {
      try {
        this.externalSource.stop()
        this.externalSource.disconnect()
      } catch (_e) {
        // 忽略已停止/断开的节点
      }
      this.externalSource = null
    }
  }

  /**
   * 在信号链中插入滤波器链
   * 将 masterGain 的输出路由到 filterInput，filterOutput 再连接到分析器和目标
   * @param {GainNode} filterInput - 滤波器链的输入节点
   * @param {GainNode} filterOutput - 滤波器链的输出节点
   */
  insertFilterChain(filterInput, filterOutput) {
    // 先断开 masterGain 的所有连接
    this.masterGain.disconnect()

    // masterGain → filterInput → [filter chain] → filterOutput → analysers + destination
    this.masterGain.connect(filterInput)
    filterOutput.connect(this.frequencyAnalyser)
    filterOutput.connect(this.timeDomainAnalyser)
    filterOutput.connect(this.audioContext.destination)

    this._filterChainInserted = true
    this._filterOutputNode = filterOutput

    // 重新初始化处理节点
    this.initProcessorNode(this.bufferSize)
  }

  /**
   * 移除滤波器链，恢复直连
   */
  removeFilterChain() {
    if (!this._filterChainInserted) return

    this.masterGain.disconnect()
    if (this._filterOutputNode) {
      this._filterOutputNode.disconnect()
    }

    this.masterGain.connect(this.frequencyAnalyser)
    this.masterGain.connect(this.timeDomainAnalyser)
    this.masterGain.connect(this.audioContext.destination)

    this._filterChainInserted = false
    this._filterOutputNode = null

    this.initProcessorNode(this.bufferSize)
  }

  /**
   * 获取压缩器增益减少量（用于压缩器可视化）
   * @returns {number} 增益减少量 (dB)，无压缩器时返回 0
   */
  getCompressorReduction() {
    if (this._compressorNode) {
      return this._compressorNode.reduction
    }
    return 0
  }
}
