/**
 * UI 控制器模块
 * 管理 DOM 交互、控制面板和用户输入
 * DAW 风格深色主题界面
 *
 * Phase 5 扩展：
 * - 音频文件导入与拖拽上传
 * - 录制与 WAV 导出
 * - 滤波器链控制面板
 * - 卷积混响（IR 加载）
 * - 动态压缩器控制
 * - 加法合成器谐波控制
 */

import { AudioFileManager, setupDragDrop } from './AudioFileManager.js'
import { AudioEffects, AdditiveSynthesizer } from './AudioEffects.js'

const WAVE_TYPES = [
  { value: 'sine', label: '正弦' },
  { value: 'square', label: '方波' },
  { value: 'sawtooth', label: '锯齿' },
  { value: 'triangle', label: '三角' }
]

const FILTER_TYPES = [
  { value: 'lowpass', label: '低通', defaultFreq: 20000 },
  { value: 'highpass', label: '高通', defaultFreq: 20 },
  { value: 'bandpass', label: '带通', defaultFreq: 1000 },
  { value: 'notch', label: '陷波', defaultFreq: 1000 }
]

export class UIController {
  /**
   * @param {import('./AudioEngine.js').AudioEngine} audioEngine - 音频引擎
   * @param {import('./Visualizer.js').Visualizer} visualizer - 可视化器
   */
  constructor(audioEngine, visualizer) {
    this.audioEngine = audioEngine
    this.visualizer = visualizer
    this.micInitialized = false

    /** @type {AudioFileManager|null} */
    this.fileManager = null

    /** @type {AudioEffects|null} */
    this.audioEffects = null

    /** @type {AdditiveSynthesizer|null} */
    this.additiveSynth = null

    /** @type {AudioBuffer|null} 当前加载的音频缓冲区 */
    this._loadedBuffer = null

    /** @type {boolean} 文件是否正在播放 */
    this._fileIsPlaying = false

    /** @type {MediaStream|null} 录制用的麦克风流 */
    this._recordStream = null

    /** @type {function|null} 滤波器响应绘制回调 */
    this.onFilterChanged = null

    /** @type {function|null} 压缩器参数变化回调 */
    this.onCompressorChanged = null

    /** @type {function|null} 加法合成参数变化回调 */
    this.onAdditiveSynthChanged = null
  }

  /**
   * 初始化所有 UI 控件
   */
  init() {
    this._bindTabNavigation()
    this._bindToggleButton()
    this._bindDrawModeButtons()
    this._bindFreezeButton()
  }

  /**
   * 初始化振荡器控制面板（在音频引擎初始化之后调用）
   */
  initControlPanel() {
    const panel = document.getElementById('controlPanel')
    panel.innerHTML = ''

    // 初始化 Phase 5 模块
    this._initPhase5Modules()

    // 采样设置面板
    this._createSampleRateSection(panel)

    // 音频文件导入面板
    this._createFileImportSection(panel)

    // 白噪声面板
    this._createNoiseSection(panel)

    // 振荡器面板
    for (let i = 0; i < this.audioEngine.oscillatorCount; i++) {
      this._createOscillatorSection(panel, i)
    }

    // 滤波器链面板
    this._createFilterSection(panel)

    // 压缩器面板
    this._createCompressorSection(panel)

    // 卷积混响面板
    this._createReverbSection(panel)

    // 加法合成面板
    this._createAdditiveSynthSection(panel)

    // 绑定文件导入和录制工具栏按钮
    this._bindFileImportButton()
    this._bindRecordButton()

    // 设置拖拽上传
    this._setupDragDrop()

    // 更新状态栏
    this._updateStatusBar()
  }

  /**
   * 初始化 Phase 5 模块实例
   * @private
   */
  _initPhase5Modules() {
    const ctx = this.audioEngine.audioContext
    this.fileManager = new AudioFileManager(ctx)
    this.audioEffects = new AudioEffects(ctx)
    this.additiveSynth = new AdditiveSynthesizer(ctx)

    // 初始化加法合成器的默认谐波（8 个谐波，只有基频有振幅）
    this.additiveSynth.setHarmonic(0, 0.5, 0)
    for (let i = 1; i < 8; i++) {
      this.additiveSynth.setHarmonic(i, 0, 0)
    }
  }

  // ===== Phase 1-4 原有方法 =====

  /**
   * 创建采样率设置面板
   * @private
   */
  _createSampleRateSection(container) {
    const section = this._createSection('采样设置', container)
    const content = section.querySelector('.panel-section-content')

    const sampleRate = this.audioEngine.sampleRate
    const info = document.createElement('div')
    info.className = 'control-row'
    info.innerHTML = `
      <span class="control-label">采样率</span>
      <span class="control-value">${sampleRate} Hz</span>
    `
    content.appendChild(info)

    const selectorRow = document.createElement('div')
    selectorRow.className = 'control-row'
    selectorRow.style.marginTop = 'var(--spacing-sm)'

    const selector = document.getElementById('spsv')
    const options = [256, 512, 1024, 2048, 4096, 8192, 16384]
    selector.innerHTML = options.map(size => {
      const timePerFrame = (size / sampleRate).toFixed(3)
      const selected = size === 4096 ? ' selected' : ''
      return `<option value="${size}"${selected}>${size} (${timePerFrame}s)</option>`
    }).join('')

    selector.onchange = (e) => {
      const bufferSize = +e.target.value
      this.audioEngine.initProcessorNode(bufferSize)
    }
  }

  /**
   * 创建白噪声控制面板
   * @private
   */
  _createNoiseSection(container) {
    const section = this._createSection('白噪声', container)
    const content = section.querySelector('.panel-section-content')

    const headerRow = document.createElement('div')
    headerRow.className = 'osc-header'

    const enableSwitch = document.createElement('input')
    enableSwitch.type = 'checkbox'
    enableSwitch.className = 'toggle-switch'
    enableSwitch.onchange = (e) => {
      this.audioEngine.setWhiteNoiseEnabled(e.target.checked)
    }

    const label = document.createElement('span')
    label.className = 'osc-label'
    label.textContent = '启用'

    headerRow.appendChild(label)
    headerRow.appendChild(enableSwitch)
    content.appendChild(headerRow)

    this._createSliderControl(content, '音量', 0, 100, 12, (v) => {
      this.audioEngine.setWhiteNoiseVolume(v / 100)
      return v
    })
  }

  /**
   * 创建单个振荡器控制面板
   * @private
   */
  _createOscillatorSection(container, index) {
    const section = this._createSection(`振荡器 #${index}`, container)
    const content = section.querySelector('.panel-section-content')

    const headerRow = document.createElement('div')
    headerRow.className = 'osc-header'

    const enableSwitch = document.createElement('input')
    enableSwitch.type = 'checkbox'
    enableSwitch.className = 'toggle-switch'
    enableSwitch.checked = index < 1
    enableSwitch.onchange = (e) => {
      this.audioEngine.setOscillatorEnabled(index, e.target.checked)
    }

    const label = document.createElement('span')
    label.className = 'osc-label'
    label.textContent = '启用'

    headerRow.appendChild(label)
    headerRow.appendChild(enableSwitch)
    content.appendChild(headerRow)

    this._createSliderControl(content, '音量', 0, 100, 75, (v) => {
      this.audioEngine.setOscillatorVolume(index, v / 100)
      return v
    })

    const initFreq = this.audioEngine.initFrequency + index * 20
    this._createSliderControl(content, '频率', 20, 24000, initFreq, (v) => {
      this.audioEngine.setOscillatorFrequency(index, v)
      return v + ' Hz'
    })

    const waveGroup = document.createElement('div')
    waveGroup.className = 'wave-type-group'
    waveGroup.style.marginTop = 'var(--spacing-sm)'

    WAVE_TYPES.forEach((wt, j) => {
      const btn = document.createElement('button')
      btn.className = 'wave-type-btn' + (j === 0 ? ' active' : '')
      btn.textContent = wt.label
      btn.dataset.type = wt.value

      btn.onclick = () => {
        waveGroup.querySelectorAll('.wave-type-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.audioEngine.setOscillatorType(index, wt.value)
      }

      waveGroup.appendChild(btn)
    })

    content.appendChild(waveGroup)
  }

  // ===== Phase 5: 音频文件导入 =====

  /**
   * 创建音频文件导入面板
   * @private
   */
  _createFileImportSection(container) {
    const section = this._createSection('音频文件', container)
    const content = section.querySelector('.panel-section-content')

    const hint = document.createElement('p')
    hint.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); margin-bottom: var(--spacing-sm);'
    hint.textContent = '支持 MP3/WAV/OGG，可拖拽到可视化区域'
    content.appendChild(hint)

    // 文件选择按钮
    const selectBtn = document.createElement('button')
    selectBtn.className = 'wave-type-btn active'
    selectBtn.style.cssText = 'width: 100%; border-radius: var(--radius-sm); padding: var(--spacing-sm);'
    selectBtn.textContent = '选择文件'
    selectBtn.onclick = () => {
      document.getElementById('audioFileInput').click()
    }
    content.appendChild(selectBtn)

    // 文件信息区域
    const fileInfoEl = document.createElement('div')
    fileInfoEl.id = 'panelFileInfo'
    fileInfoEl.style.cssText = 'margin-top: var(--spacing-sm); font-size: 0.7rem; color: var(--text-muted); display: none;'
    content.appendChild(fileInfoEl)
  }

  /**
   * 绑定文件导入按钮
   * @private
   */
  _bindFileImportButton() {
    const importBtn = document.getElementById('tb_import')
    const fileInput = document.getElementById('audioFileInput')

    if (importBtn) {
      importBtn.onclick = () => fileInput.click()
    }

    if (fileInput) {
      fileInput.onchange = async (e) => {
        const file = e.target.files[0]
        if (file) {
          await this._handleAudioFile(file)
        }
        fileInput.value = ''
      }
    }
  }

  /**
   * 处理音频文件加载
   * @param {File} file
   * @private
   */
  async _handleAudioFile(file) {
    if (!this.fileManager) return

    try {
      // 停止之前的文件播放
      this.audioEngine.disconnectExternalSource()
      this._fileIsPlaying = false

      const { source, buffer } = await this.fileManager.loadAudioFile(file)
      this._loadedBuffer = buffer

      // 更新 UI
      const duration = buffer.duration.toFixed(1)
      const channels = buffer.numberOfChannels
      const sr = buffer.sampleRate

      const playbackBar = document.getElementById('filePlaybackBar')
      const fileNameEl = document.getElementById('fileName')
      const fileDurEl = document.getElementById('fileDuration')
      const panelInfo = document.getElementById('panelFileInfo')

      if (playbackBar) playbackBar.style.display = 'flex'
      if (fileNameEl) fileNameEl.textContent = file.name
      if (fileDurEl) fileDurEl.textContent = `${duration}s | ${channels}ch | ${sr}Hz`
      if (panelInfo) {
        panelInfo.style.display = 'block'
        panelInfo.textContent = `已加载: ${file.name} (${duration}s)`
      }

      // 绑定播放控制
      this._bindFilePlaybackControls(source, buffer)

      console.log(`音频文件已加载: ${file.name}, 时长: ${duration}s`)
    } catch (err) {
      console.error('音频文件加载失败:', err)
      const panelInfo = document.getElementById('panelFileInfo')
      if (panelInfo) {
        panelInfo.style.display = 'block'
        panelInfo.textContent = `加载失败: ${err.message}`
        panelInfo.style.color = 'var(--accent-primary)'
      }
    }
  }

  /**
   * 绑定文件播放控制按钮
   * @private
   */
  _bindFilePlaybackControls() {
    const playBtn = document.getElementById('filePlayBtn')
    const stopBtn = document.getElementById('fileStopBtn')
    const closeBtn = document.getElementById('fileCloseBtn')

    if (playBtn) {
      playBtn.onclick = () => {
        if (!this._loadedBuffer) return
        // 停止之前的播放
        this.audioEngine.disconnectExternalSource()

        // 创建新的 source（AudioBufferSourceNode 只能用一次）
        const source = this.audioEngine.audioContext.createBufferSource()
        source.buffer = this._loadedBuffer
        this.audioEngine.connectExternalSource(source)

        source.onended = () => {
          this._fileIsPlaying = false
          playBtn.textContent = '▶ 播放'
        }

        source.start(0)
        this._fileIsPlaying = true
        playBtn.textContent = '▶ 播放中...'
      }
    }

    if (stopBtn) {
      stopBtn.onclick = () => {
        this.audioEngine.disconnectExternalSource()
        this._fileIsPlaying = false
        if (playBtn) playBtn.textContent = '▶ 播放'
      }
    }

    if (closeBtn) {
      closeBtn.onclick = () => {
        this.audioEngine.disconnectExternalSource()
        this._fileIsPlaying = false
        this._loadedBuffer = null

        const playbackBar = document.getElementById('filePlaybackBar')
        if (playbackBar) playbackBar.style.display = 'none'

        const panelInfo = document.getElementById('panelFileInfo')
        if (panelInfo) panelInfo.style.display = 'none'
      }
    }
  }

  /**
   * 设置拖拽上传
   * @private
   */
  _setupDragDrop() {
    const vizArea = document.getElementById('vizArea')
    const dragOverlay = document.getElementById('dragOverlay')
    if (!vizArea || !dragOverlay) return

    setupDragDrop(vizArea, async (file) => {
      dragOverlay.classList.remove('active')
      await this._handleAudioFile(file)
    })

    // 增强拖拽覆盖层显示
    vizArea.addEventListener('dragover', (e) => {
      e.preventDefault()
      dragOverlay.classList.add('active')
    })

    vizArea.addEventListener('dragleave', (e) => {
      e.preventDefault()
      // 只有当离开的是 vizArea 本身时才隐藏
      if (e.target === vizArea || !vizArea.contains(e.relatedTarget)) {
        dragOverlay.classList.remove('active')
      }
    })

    vizArea.addEventListener('drop', () => {
      dragOverlay.classList.remove('active')
    })
  }

  // ===== Phase 5: 录制与导出 =====

  /**
   * 绑定录制按钮
   * @private
   */
  _bindRecordButton() {
    const recordBtn = document.getElementById('tb_record')
    const downloadBtn = document.getElementById('tb_download')
    if (!recordBtn) return

    recordBtn.onclick = async () => {
      if (this.fileManager && this.fileManager.isRecording) {
        // 停止录制
        try {
          const wavBlob = await this.fileManager.stopRecording()
          recordBtn.classList.remove('recording')
          recordBtn.title = '录制音频'

          // 显示下载按钮
          if (downloadBtn) {
            downloadBtn.style.display = 'flex'
            downloadBtn.onclick = () => {
              const url = URL.createObjectURL(wavBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = `recording_${Date.now()}.wav`
              a.click()
              URL.revokeObjectURL(url)
            }
          }

          console.log('录制完成，WAV 文件已准备下载')
        } catch (err) {
          console.error('停止录制失败:', err)
          recordBtn.classList.remove('recording')
        }
      } else {
        // 开始录制
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          this._recordStream = stream
          this.fileManager.startRecording(stream)
          recordBtn.classList.add('recording')
          recordBtn.title = '停止录制'

          if (downloadBtn) downloadBtn.style.display = 'none'

          console.log('开始录制...')
        } catch (err) {
          console.error('无法访问麦克风:', err)
        }
      }
    }
  }

  // ===== Phase 5: 滤波器链 =====

  /**
   * 创建滤波器控制面板
   * @private
   */
  _createFilterSection(container) {
    const section = this._createSection('滤波器链', container)
    const content = section.querySelector('.panel-section-content')

    // 主启用开关
    const masterRow = document.createElement('div')
    masterRow.className = 'osc-header'

    const masterLabel = document.createElement('span')
    masterLabel.className = 'osc-label'
    masterLabel.textContent = '启用滤波器'

    const masterSwitch = document.createElement('input')
    masterSwitch.type = 'checkbox'
    masterSwitch.className = 'toggle-switch'
    masterSwitch.onchange = (e) => {
      if (e.target.checked) {
        // 创建并插入滤波器链
        const chain = this.audioEffects.createFilterChain()
        this.audioEngine.insertFilterChain(chain.input, chain.output)
        document.getElementById('filterResponseContainer').style.display = 'block'
      } else {
        this.audioEngine.removeFilterChain()
        this.audioEffects.destroy()
        this.audioEffects = new AudioEffects(this.audioEngine.audioContext)
        document.getElementById('filterResponseContainer').style.display = 'none'
      }
    }

    masterRow.appendChild(masterLabel)
    masterRow.appendChild(masterSwitch)
    content.appendChild(masterRow)

    // 各滤波器控制
    const filtersContainer = document.createElement('div')
    filtersContainer.className = 'filter-controls'
    filtersContainer.style.marginTop = 'var(--spacing-sm)'

    for (const ft of FILTER_TYPES) {
      this._createFilterItem(filtersContainer, ft)
    }

    content.appendChild(filtersContainer)
  }

  /**
   * 创建单个滤波器控制项
   * @private
   */
  _createFilterItem(container, filterConfig) {
    const item = document.createElement('div')
    item.className = 'filter-item'

    // 头部：名称 + 启用开关
    const header = document.createElement('div')
    header.className = 'filter-header'

    const name = document.createElement('span')
    name.className = 'filter-name'
    name.textContent = filterConfig.label

    const enableSwitch = document.createElement('input')
    enableSwitch.type = 'checkbox'
    enableSwitch.className = 'toggle-switch'
    enableSwitch.onchange = (e) => {
      this.audioEffects.enableFilter(filterConfig.value, e.target.checked)
      if (this.onFilterChanged) this.onFilterChanged()
    }

    header.appendChild(name)
    header.appendChild(enableSwitch)
    item.appendChild(header)

    // 频率控制
    this._createSliderControl(item, '频率', 20, 20000, filterConfig.defaultFreq, (v) => {
      this.audioEffects.setFilterParams(filterConfig.value, v, undefined, undefined)
      if (this.onFilterChanged) this.onFilterChanged()
      return v + ' Hz'
    })

    // Q 值控制
    this._createSliderControl(item, 'Q', 1, 100, 10, (v) => {
      const qValue = v / 10
      this.audioEffects.setFilterParams(filterConfig.value, undefined, qValue, undefined)
      if (this.onFilterChanged) this.onFilterChanged()
      return qValue.toFixed(1)
    })

    container.appendChild(item)
  }

  // ===== Phase 5: 压缩器 =====

  /**
   * 创建压缩器控制面板
   * @private
   */
  _createCompressorSection(container) {
    const section = this._createSection('动态压缩器', container)
    const content = section.querySelector('.panel-section-content')

    // 启用开关
    const headerRow = document.createElement('div')
    headerRow.className = 'osc-header'

    const label = document.createElement('span')
    label.className = 'osc-label'
    label.textContent = '启用'

    const enableSwitch = document.createElement('input')
    enableSwitch.type = 'checkbox'
    enableSwitch.className = 'toggle-switch'
    enableSwitch.onchange = (e) => {
      const vizContainer = document.getElementById('compressorVizContainer')
      if (e.target.checked) {
        const compressor = this.audioEffects.createCompressor()
        this.audioEngine._compressorNode = compressor
        // 将压缩器插入信号链（连接到 masterGain 的输出）
        // 注意：简单地将 compressor 连接到 destination
        // 如果滤波器链启用了，需要在滤波器链输出后接入
        if (vizContainer) vizContainer.style.display = 'block'
      } else {
        if (this.audioEffects.compressor) {
          try { this.audioEffects.compressor.disconnect() } catch (_e) { /* 忽略 */ }
        }
        this.audioEngine._compressorNode = null
        if (vizContainer) vizContainer.style.display = 'none'
      }
    }

    headerRow.appendChild(label)
    headerRow.appendChild(enableSwitch)
    content.appendChild(headerRow)

    // 阈值
    this._createSliderControl(content, '阈值', -60, 0, -24, (v) => {
      this.audioEffects.setCompressorParams(v, undefined, undefined, undefined, undefined)
      if (this.onCompressorChanged) this.onCompressorChanged()
      return v + ' dB'
    })

    // 拐点
    this._createSliderControl(content, '拐点', 0, 40, 30, (v) => {
      this.audioEffects.setCompressorParams(undefined, v, undefined, undefined, undefined)
      if (this.onCompressorChanged) this.onCompressorChanged()
      return v + ' dB'
    })

    // 压缩比
    this._createSliderControl(content, '压缩比', 1, 20, 12, (v) => {
      this.audioEffects.setCompressorParams(undefined, undefined, v, undefined, undefined)
      if (this.onCompressorChanged) this.onCompressorChanged()
      return v + ':1'
    })

    // 起始时间
    this._createSliderControl(content, '起始', 0, 100, 3, (v) => {
      const attack = v / 1000
      this.audioEffects.setCompressorParams(undefined, undefined, undefined, attack, undefined)
      return v + ' ms'
    })

    // 释放时间
    this._createSliderControl(content, '释放', 10, 1000, 250, (v) => {
      const release = v / 1000
      this.audioEffects.setCompressorParams(undefined, undefined, undefined, undefined, release)
      return v + ' ms'
    })
  }

  // ===== Phase 5: 卷积混响 =====

  /**
   * 创建卷积混响控制面板
   * @private
   */
  _createReverbSection(container) {
    const section = this._createSection('卷积混响', container)
    const content = section.querySelector('.panel-section-content')

    const hint = document.createElement('p')
    hint.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); margin-bottom: var(--spacing-sm);'
    hint.textContent = '加载脉冲响应文件（IR）模拟真实空间混响'
    content.appendChild(hint)

    // IR 文件选择
    const irInput = document.createElement('input')
    irInput.type = 'file'
    irInput.accept = '.wav,.mp3,.ogg,audio/*'
    irInput.style.display = 'none'
    irInput.id = 'irFileInput'
    content.appendChild(irInput)

    const loadBtn = document.createElement('button')
    loadBtn.className = 'wave-type-btn'
    loadBtn.style.cssText = 'width: 100%; border-radius: var(--radius-sm); padding: var(--spacing-sm);'
    loadBtn.textContent = '加载 IR 文件'
    loadBtn.onclick = () => irInput.click()
    content.appendChild(loadBtn)

    const statusEl = document.createElement('div')
    statusEl.style.cssText = 'margin-top: var(--spacing-sm); font-size: 0.7rem; color: var(--text-muted);'
    statusEl.id = 'irStatus'
    content.appendChild(statusEl)

    irInput.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      try {
        statusEl.textContent = '正在加载 IR...'
        const arrayBuffer = await file.arrayBuffer()
        const irBuffer = await this.audioEngine.audioContext.decodeAudioData(arrayBuffer)
        this.audioEffects.createConvolver(irBuffer)

        statusEl.textContent = `已加载: ${file.name} (${irBuffer.duration.toFixed(1)}s)`
        statusEl.style.color = 'var(--accent-green)'
        loadBtn.textContent = '更换 IR 文件'
      } catch (err) {
        statusEl.textContent = `加载失败: ${err.message}`
        statusEl.style.color = 'var(--accent-primary)'
      }
    }
  }

  // ===== Phase 5: 加法合成 =====

  /**
   * 创建加法合成控制面板
   * @private
   */
  _createAdditiveSynthSection(container) {
    const section = this._createSection('加法合成', container)
    const content = section.querySelector('.panel-section-content')

    // 启用开关
    const headerRow = document.createElement('div')
    headerRow.className = 'osc-header'

    const label = document.createElement('span')
    label.className = 'osc-label'
    label.textContent = '启用'

    const enableSwitch = document.createElement('input')
    enableSwitch.type = 'checkbox'
    enableSwitch.className = 'toggle-switch'
    enableSwitch.onchange = (e) => {
      const synthContainer = document.getElementById('additiveSynthContainer')
      if (e.target.checked) {
        this.additiveSynth.connect(this.audioEngine.masterGain)
        this.additiveSynth.start()
        if (synthContainer) synthContainer.style.display = 'block'
        if (this.onAdditiveSynthChanged) this.onAdditiveSynthChanged()
      } else {
        this.additiveSynth.stop()
        if (synthContainer) synthContainer.style.display = 'none'
      }
    }

    headerRow.appendChild(label)
    headerRow.appendChild(enableSwitch)
    content.appendChild(headerRow)

    // 基频控制
    this._createSliderControl(content, '基频', 20, 2000, 440, (v) => {
      this.additiveSynth.setFundamentalFrequency(v)
      const fundamentalEl = document.getElementById('synthFundamental')
      if (fundamentalEl) fundamentalEl.textContent = `基频: ${v} Hz`
      if (this.onAdditiveSynthChanged) this.onAdditiveSynthChanged()
      return v + ' Hz'
    })

    // 谐波振幅滑块
    const harmonicsLabel = document.createElement('div')
    harmonicsLabel.style.cssText = 'font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--spacing-sm); margin-bottom: var(--spacing-xs);'
    harmonicsLabel.textContent = '谐波振幅'
    content.appendChild(harmonicsLabel)

    const harmonicsContainer = document.createElement('div')
    harmonicsContainer.className = 'harmonics-container'

    const harmonicCount = 8
    for (let i = 0; i < harmonicCount; i++) {
      const row = document.createElement('div')
      row.className = 'harmonic-row'

      const label = document.createElement('span')
      label.className = 'harmonic-label'
      label.textContent = `H${i + 1}`

      const slider = document.createElement('input')
      slider.type = 'range'
      slider.className = 'harmonic-slider'
      slider.min = '0'
      slider.max = '100'
      slider.value = i === 0 ? '50' : '0'

      const value = document.createElement('span')
      value.className = 'harmonic-value'
      value.textContent = i === 0 ? '0.50' : '0.00'

      const harmonicIndex = i
      slider.oninput = (e) => {
        const amp = +e.target.value / 100
        this.additiveSynth.setHarmonic(harmonicIndex, amp, 0)
        value.textContent = amp.toFixed(2)
        if (this.onAdditiveSynthChanged) this.onAdditiveSynthChanged()
      }

      row.appendChild(label)
      row.appendChild(slider)
      row.appendChild(value)
      harmonicsContainer.appendChild(row)
    }

    content.appendChild(harmonicsContainer)

    // 预设按钮
    const presetLabel = document.createElement('div')
    presetLabel.style.cssText = 'font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--spacing-sm); margin-bottom: var(--spacing-xs);'
    presetLabel.textContent = '预设波形'
    content.appendChild(presetLabel)

    const presetGroup = document.createElement('div')
    presetGroup.className = 'wave-type-group'

    const presets = [
      { label: '正弦', harmonics: [1, 0, 0, 0, 0, 0, 0, 0] },
      { label: '方波', harmonics: [1, 0, 0.33, 0, 0.2, 0, 0.14, 0] },
      { label: '锯齿', harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14, 0.12] },
      { label: '三角', harmonics: [1, 0, 0.11, 0, 0.04, 0, 0.02, 0] }
    ]

    presets.forEach(preset => {
      const btn = document.createElement('button')
      btn.className = 'wave-type-btn'
      btn.textContent = preset.label
      btn.onclick = () => {
        preset.harmonics.forEach((amp, idx) => {
          this.additiveSynth.setHarmonic(idx, amp * 0.5, 0)
          // 更新 slider
          const sliders = harmonicsContainer.querySelectorAll('input[type="range"]')
          const values = harmonicsContainer.querySelectorAll('.harmonic-value')
          if (sliders[idx]) sliders[idx].value = String(Math.round(amp * 50))
          if (values[idx]) values[idx].textContent = (amp * 0.5).toFixed(2)
        })
        if (this.onAdditiveSynthChanged) this.onAdditiveSynthChanged()
      }
      presetGroup.appendChild(btn)
    })

    content.appendChild(presetGroup)
  }

  // ===== 通用方法 =====

  /**
   * 创建面板区块
   * @private
   */
  _createSection(title, container) {
    const section = document.createElement('div')
    section.className = 'panel-section'

    section.innerHTML = `
      <div class="panel-section-header">
        <span class="panel-section-title">${title}</span>
      </div>
      <div class="panel-section-content"></div>
    `

    container.appendChild(section)
    return section
  }

  /**
   * 创建滑块控制组
   * @private
   */
  _createSliderControl(container, label, min, max, defaultValue, onChange) {
    const row = document.createElement('div')
    row.className = 'control-row'
    row.style.marginTop = 'var(--spacing-sm)'

    const labelEl = document.createElement('span')
    labelEl.className = 'control-label'
    labelEl.textContent = label

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(min)
    slider.max = String(max)
    slider.value = String(defaultValue)

    const valueEl = document.createElement('span')
    valueEl.className = 'control-value'
    valueEl.textContent = onChange(defaultValue)

    slider.oninput = (e) => {
      const v = +e.target.value
      valueEl.textContent = onChange(v)
    }

    row.appendChild(labelEl)
    row.appendChild(slider)
    row.appendChild(valueEl)
    container.appendChild(row)
  }

  /**
   * 绑定 Tab 导航
   * @private
   */
  _bindTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn')
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        const tabName = btn.dataset.tab
        document.querySelectorAll('.tab-page').forEach(page => {
          page.classList.remove('active')
        })
        const targetPage = document.getElementById(`page-${tabName}`)
        if (targetPage) {
          targetPage.classList.add('active')
        }

        if (tabName === 'microphone' && !this.micInitialized) {
          this._initMicrophone()
        }
      })
    })
  }

  /**
   * 初始化麦克风功能
   * @private
   */
  _initMicrophone() {
    const statusEl = document.getElementById('micStatus')
    const mainCanvas = document.getElementById('micMain')
    const subCanvas = document.getElementById('micSub')
    const freqCanvas = document.getElementById('micFreq')

    if (!mainCanvas || !subCanvas || !freqCanvas) return

    const mainCtx = mainCanvas.getContext('2d')
    const subCtx = subCanvas.getContext('2d')
    const freqCtx = freqCanvas.getContext('2d')

    mainCtx.fillStyle = 'var(--wave-color)'
    subCtx.fillStyle = 'var(--wave-color-alt)'

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new AudioContextClass()
    const fftSize = 4096
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = fftSize
    analyser.minDecibels = -90
    analyser.maxDecibels = -10

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = '正在请求麦克风权限...'
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        this.micInitialized = true
        const mediaSource = audioCtx.createMediaStreamSource(stream)
        const scriptProcessor = audioCtx.createScriptProcessor(1024, 2, 2)

        mediaSource.connect(analyser)
        analyser.connect(scriptProcessor)
        scriptProcessor.connect(audioCtx.destination)

        scriptProcessor.onaudioprocess = (audioEvt) => {
          const bufferL = audioEvt.inputBuffer.getChannelData(0)
          const bufferR = audioEvt.inputBuffer.getChannelData(1)

          const maxL = Math.max(...bufferL)
          const maxR = Math.max(...bufferR)
          statusEl.textContent = `L: ${Math.round(maxL * 100)}  R: ${Math.round(maxR * 100)}`

          mainCtx.clearRect(0, 0, 800, 400)
          subCtx.clearRect(0, 0, 800, 400)

          mainCtx.fillStyle = '#e94560'
          subCtx.fillStyle = '#0ea5e9'

          bufferL.forEach((v, i) => {
            const h = 200 + 200 * v
            mainCtx.fillRect(800 * (i / bufferL.length), h, 1, 1)
          })
          bufferR.forEach((v, i) => {
            const h = 200 + 200 * v
            subCtx.fillRect(800 * (i / bufferR.length), h, 1, 1)
          })
        }

        const drawFreq = () => {
          const data = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(data)

          freqCtx.clearRect(0, 0, 800, 400)
          let x = 0
          for (let i = 0; i < data.length; i++) {
            const power = data[i]
            const barHeight = power * (400 / 255)
            freqCtx.fillStyle = `rgb(${power + 100},50,${(i / data.length) * 100 + 100})`
            freqCtx.fillRect(x, 400 - barHeight, 2, barHeight)
            x += 3
            if (x > 800) break
          }
          requestAnimationFrame(drawFreq)
        }
        drawFreq()

        statusEl.textContent = '麦克风已连接'
      }).catch(err => {
        statusEl.textContent = '获取麦克风失败: ' + err.message
      })
    } else {
      statusEl.textContent = '浏览器不支持 getUserMedia'
    }
  }

  /**
   * 绑定播放/暂停按钮
   * @private
   */
  _bindToggleButton() {
    const toggleBtn = document.getElementById('toggleSound')

    toggleBtn.addEventListener('click', () => {
      const isPlaying = this.audioEngine.togglePlayback()
      toggleBtn.classList.toggle('active', isPlaying)
      toggleBtn.innerHTML = isPlaying ? '&#9632;' : '&#9654;'
      toggleBtn.title = isPlaying ? '暂停' : '播放'

      const statusDot = document.getElementById('statusDot')
      if (statusDot) {
        statusDot.classList.toggle('inactive', !isPlaying)
      }
    })
  }

  /**
   * 绑定绘图模式按钮
   * @private
   */
  _bindDrawModeButtons() {
    const buttons = document.querySelectorAll('.draw-mode-btn')
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.visualizer.setDrawMode(+btn.dataset.mode)
      })
    })
  }

  /**
   * 绑定冻结按钮
   * @private
   */
  _bindFreezeButton() {
    const freezeBtn = document.getElementById('tb_fz')
    freezeBtn.addEventListener('click', () => {
      this.visualizer.toggleFreeze()
      freezeBtn.classList.toggle('active')
    })
  }

  /**
   * 更新状态栏信息
   * @private
   */
  _updateStatusBar() {
    const statusText = document.getElementById('statusText')
    const sampleRateInfo = document.getElementById('sampleRateInfo')
    const processorInfo = document.getElementById('processorInfo')
    const statusDot = document.getElementById('statusDot')

    if (statusText) statusText.textContent = '已就绪'
    if (sampleRateInfo) sampleRateInfo.textContent = `采样率: ${this.audioEngine.sampleRate} Hz`
    if (processorInfo) {
      processorInfo.textContent = this.audioEngine.useWorklet ? 'AudioWorklet' : 'ScriptProcessor'
    }
    if (statusDot) statusDot.classList.remove('inactive')
  }
}
