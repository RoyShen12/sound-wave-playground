/**
 * UI 控制器模块
 * 管理 DOM 交互、控制面板和用户输入
 */

const WAVE_TYPES = [
  { value: 'sine', label: '正弦波' },
  { value: 'square', label: '方波' },
  { value: 'sawtooth', label: '锯齿波' },
  { value: 'triangle', label: '三角波' }
]

export class UIController {
  /**
   * @param {import('./AudioEngine.js').AudioEngine} audioEngine - 音频引擎
   * @param {import('./Visualizer.js').Visualizer} visualizer - 可视化器
   */
  constructor(audioEngine, visualizer) {
    this.audioEngine = audioEngine
    this.visualizer = visualizer
    this.toggleLabel = null
  }

  /**
   * 初始化所有 UI 控件
   */
  init() {
    this._createOscillatorControls()
    this._bindToggleButton()
    this._bindDrawModeRadios()
    this._bindFreezeButton()
  }

  /**
   * 初始化采样率选择器（需要在音频初始化之后调用）
   */
  initSampleRateSelector() {
    const sampleRate = this.audioEngine.sampleRate
    const selector = document.getElementById('spsv')

    const options = [256, 512, 1024, 2048, 4096, 8192, 16384]
    selector.innerHTML = options.map(size => {
      const timePerFrame = (size / sampleRate).toFixed(2)
      const selected = size === 4096 ? ' selected' : ''
      return `<option value="${size}"${selected}>${size}\u3000\u3000${timePerFrame}秒/次</option>`
    }).join('')

    selector.onchange = (e) => {
      const bufferSize = +e.target.value
      this.audioEngine.initScriptProcessor(bufferSize)
    }
  }

  /**
   * 创建振荡器控制面板
   * @private
   */
  _createOscillatorControls() {
    const container = document.body

    // 噪声控制 (index = -1)
    this._createSingleOscillatorControl(container, -1)

    // 振荡器控制
    for (let i = 0; i < this.audioEngine.oscillatorCount; i++) {
      this._createSingleOscillatorControl(container, i)
    }
  }

  /**
   * 创建单个振荡器/噪声的控制行
   * @param {HTMLElement} container - 容器元素
   * @param {number} index - 索引，-1 表示白噪声
   * @private
   */
  _createSingleOscillatorControl(container, index) {
    const isNoise = index === -1
    const row = document.createElement('div')

    // 描述标签
    const desc = document.createElement('span')
    desc.textContent = isNoise ? '噪声' : `振荡器 #${index}`
    desc.style.display = 'inline-block'
    desc.style.width = '80px'

    // 启用/禁用复选框
    const enableCheckbox = document.createElement('input')
    enableCheckbox.type = 'checkbox'
    enableCheckbox.style.marginRight = '16px'
    if (isNoise) {
      enableCheckbox.checked = false
      enableCheckbox.onchange = (e) => {
        this.audioEngine.setWhiteNoiseEnabled(e.target.checked)
      }
    } else {
      enableCheckbox.checked = index < 1 // 默认只启用第一个振荡器
      enableCheckbox.onchange = (e) => {
        this.audioEngine.setOscillatorEnabled(index, e.target.checked)
      }
    }

    // 音量控制
    const volumeLabel = document.createElement('span')
    volumeLabel.textContent = '音量'

    const volumeSlider = document.createElement('input')
    volumeSlider.type = 'range'
    volumeSlider.max = '100'
    volumeSlider.min = '0'
    volumeSlider.value = isNoise ? '12' : '75'
    volumeSlider.style.width = '50px'

    const volumeValue = document.createElement('span')
    volumeValue.textContent = isNoise ? '12' : '75'
    volumeValue.style.display = 'inline-block'
    volumeValue.style.width = '60px'

    volumeSlider.oninput = (e) => {
      const v = +e.target.value
      volumeValue.textContent = v
      if (isNoise) {
        this.audioEngine.setWhiteNoiseVolume(v / 100)
      } else {
        this.audioEngine.setOscillatorVolume(index, v / 100)
      }
    }

    // 组装基础控件
    row.appendChild(desc)
    row.appendChild(enableCheckbox)
    row.appendChild(volumeLabel)
    row.appendChild(volumeSlider)
    row.appendChild(volumeValue)

    // 振荡器专有控件：频率和波形
    if (!isNoise) {
      const freqLabel = document.createElement('span')
      freqLabel.textContent = '频率'

      const freqSlider = document.createElement('input')
      freqSlider.type = 'range'
      freqSlider.max = '24000'
      freqSlider.min = '20'
      freqSlider.value = String(this.audioEngine.initFrequency + index * 20)

      const freqValue = document.createElement('span')
      freqValue.textContent = `${this.audioEngine.initFrequency + index * 20} Hz`
      freqValue.style.display = 'inline-block'
      freqValue.style.width = '80px'

      freqSlider.oninput = (e) => {
        const v = +e.target.value
        freqValue.textContent = v + ' Hz'
        this.audioEngine.setOscillatorFrequency(index, v)
      }

      row.appendChild(freqLabel)
      row.appendChild(freqSlider)
      row.appendChild(freqValue)

      // 波形选择
      const radioName = `waveType_${index}`
      WAVE_TYPES.forEach((wt, j) => {
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = radioName
        radio.value = wt.value
        radio.id = `${radioName}_${wt.value}`
        if (j === 0) radio.checked = true

        radio.onchange = () => {
          this.audioEngine.setOscillatorType(index, wt.value)
        }

        const label = document.createElement('label')
        label.htmlFor = radio.id
        label.textContent = wt.label

        row.appendChild(radio)
        row.appendChild(label)
      })
    }

    container.appendChild(row)
  }

  /**
   * 绑定播放/暂停按钮
   * @private
   */
  _bindToggleButton() {
    this.toggleLabel = document.getElementById('toggleLabel')
    const toggleBtn = document.getElementById('toggleSound')

    toggleBtn.addEventListener('click', () => {
      const isPlaying = this.audioEngine.togglePlayback()
      this.toggleLabel.textContent = isPlaying ? 'Stop!' : 'Start!'
    })
  }

  /**
   * 绑定绘图模式单选按钮
   * @private
   */
  _bindDrawModeRadios() {
    const radios = document.querySelectorAll('input[type=radio][name=tb_draw_way]')
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.visualizer.setDrawMode(+e.target.value)
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
    })
  }
}
