/**
 * UI 控制器模块
 * 管理 DOM 交互、控制面板和用户输入
 * DAW 风格深色主题界面
 */

const WAVE_TYPES = [
  { value: 'sine', label: '正弦' },
  { value: 'square', label: '方波' },
  { value: 'sawtooth', label: '锯齿' },
  { value: 'triangle', label: '三角' }
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

    // 采样设置面板
    this._createSampleRateSection(panel)

    // 白噪声面板
    this._createNoiseSection(panel)

    // 振荡器面板
    for (let i = 0; i < this.audioEngine.oscillatorCount; i++) {
      this._createOscillatorSection(panel, i)
    }

    // 更新状态栏
    this._updateStatusBar()
  }

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

    const label = document.createElement('span')
    label.className = 'control-label'
    label.textContent = '缓冲区'

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

    // 启用开关
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

    // 音量控制
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

    // 启用开关
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

    // 音量控制
    this._createSliderControl(content, '音量', 0, 100, 75, (v) => {
      this.audioEngine.setOscillatorVolume(index, v / 100)
      return v
    })

    // 频率控制
    const initFreq = this.audioEngine.initFrequency + index * 20
    this._createSliderControl(content, '频率', 20, 24000, initFreq, (v) => {
      this.audioEngine.setOscillatorFrequency(index, v)
      return v + ' Hz'
    })

    // 波形选择
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
        // 更新按钮状态
        tabBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        // 切换页面
        const tabName = btn.dataset.tab
        document.querySelectorAll('.tab-page').forEach(page => {
          page.classList.remove('active')
        })
        const targetPage = document.getElementById(`page-${tabName}`)
        if (targetPage) {
          targetPage.classList.add('active')
        }

        // 麦克风页面初始化
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

        // 频域绘制
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

      // 更新状态栏
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
