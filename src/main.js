/**
 * 应用入口文件
 * 初始化音频引擎、可视化器和 UI 控制器
 * Phase 5 扩展：集成滤波器响应渲染、压缩器可视化、加法合成可视化
 * @module main
 */

import { AudioEngine } from './AudioEngine.js'
import { Visualizer } from './Visualizer.js'
import { UIController } from './UIController.js'
import { SpectrogramRenderer } from './Spectrogram.js'
import { RadialVisualizer } from './RadialVisualizer.js'
import { FilterResponseRenderer } from './FilterResponseRenderer.js'
import { AdditiveSynthRenderer } from './AdditiveSynthRenderer.js'
import { EducationModule, PRESET_SCENES } from './EducationModule.js'
import './styles.css'

// 创建核心实例
const audioEngine = new AudioEngine()
const visualizer = new Visualizer(
  document.getElementById('main'),
  document.getElementById('sub')
)
const uiController = new UIController(audioEngine, visualizer)

// 高级可视化实例
const spectrogram = new SpectrogramRenderer(document.getElementById('spectrogram'))
const radialViz = new RadialVisualizer(
  document.getElementById('radial'),
  document.getElementById('lissajous')
)

// Phase 5 可视化实例
const filterRenderer = new FilterResponseRenderer(
  document.getElementById('filterResponse'),
  document.getElementById('compressorCanvas')
)
const additiveSynthRenderer = new AdditiveSynthRenderer(
  document.getElementById('additiveSynthCanvas')
)

// Phase 6 教育模块
const educationModule = new EducationModule(
  document.getElementById('educationCanvas')
)

// rAF 优化：跟踪动画帧 ID 和运行状态
let vizAnimFrameId = null
let isVisualizationRunning = false

// 初始化可视化器和 UI
visualizer.init()
spectrogram.init()
radialViz.init()
filterRenderer.init()
additiveSynthRenderer.init()
educationModule.init()
uiController.init()

// 绑定频谱图配色切换按钮
const colorBtns = document.querySelectorAll('.color-scheme-btn')
colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    colorBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    spectrogram.setColorScheme(btn.dataset.scheme)
  })
})

// 等待用户点击以初始化音频（浏览器自动播放策略）
const initOverlay = document.getElementById('initOverlay')

const initAudioOnClick = async () => {
  console.log('音频引擎初始化中...')

  // 隐藏初始化覆盖层
  if (initOverlay) {
    initOverlay.classList.add('hidden')
    setTimeout(() => {
      initOverlay.style.display = 'none'
    }, 500)
  }

  // 初始化音频引擎（异步加载 AudioWorklet）
  await audioEngine.init()

  // 设置音频参数给可视化器（用于 DSP 分析）
  visualizer.setAudioParams(audioEngine.sampleRate, audioEngine.frequencyStep)

  // 初始化音频处理节点
  audioEngine.initProcessorNode(4096)

  // 设置音频处理回调
  audioEngine.onAudioProcess = (buffer) => {
    visualizer.drawTimeDomain(buffer)

    // 更新李萨如图形（单声道模拟左右声道）
    radialViz.drawLissajous(buffer, buffer)

    // 更新 DSP 信息面板
    updateDSPInfoPanel(visualizer.dspInfo)
  }

  // 初始化控制面板（包含 Phase 5 模块）
  uiController.initControlPanel()

  // 设置 Phase 5 回调
  setupPhase5Callbacks()

  // 初始化 Phase 6 教育模块
  setupEducationModule()
  setupPresetScenes()

  // 启动频域可视化（含频谱图和圆形频谱）
  startAllVisualizations()

  // 绘制频域刻度
  visualizer.drawFrequencyScale(audioEngine.frequencyStep, audioEngine.fftSize)

  console.log('音频引擎初始化完成', audioEngine.useWorklet ? '(AudioWorklet)' : '(ScriptProcessor)')

  // 页面可见性优化：不可见时暂停渲染循环，可见时恢复
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAllVisualizations()
    } else if (audioEngine.isPlaying) {
      startAllVisualizations()
    }
  })

  document.removeEventListener('mousedown', initAudioOnClick)
}

document.addEventListener('mousedown', initAudioOnClick)

/**
 * 设置 Phase 5 相关的回调函数
 */
function setupPhase5Callbacks() {
  // 滤波器参数变化回调 -> 重绘频率响应曲线
  uiController.onFilterChanged = () => {
    if (uiController.audioEffects) {
      filterRenderer.drawFilterResponse(
        uiController.audioEffects,
        audioEngine.sampleRate
      )
    }
  }

  // 压缩器参数变化回调 -> 重绘压缩器特性曲线
  uiController.onCompressorChanged = () => {
    if (uiController.audioEffects && uiController.audioEffects.compressor) {
      const comp = uiController.audioEffects.compressor
      const reduction = audioEngine.getCompressorReduction()
      filterRenderer.drawCompressorCurve(
        comp.threshold.value,
        comp.knee.value,
        comp.ratio.value,
        reduction
      )
    }
  }

  // 加法合成参数变化回调 -> 重绘谐波可视化
  uiController.onAdditiveSynthChanged = () => {
    if (uiController.additiveSynth) {
      const harmonics = uiController.additiveSynth.getHarmonics()
      additiveSynthRenderer.draw(harmonics, uiController.additiveSynth.fundamentalFrequency)
    }
  }
}

/**
 * 启动所有频域可视化
 * 使用 isVisualizationRunning 标志防止重复启动
 */
function startAllVisualizations() {
  if (isVisualizationRunning) return
  isVisualizationRunning = true

  const draw = () => {
    if (!isVisualizationRunning) return

    const data = audioEngine.getFrequencyData()

    // 基础频域图由 Visualizer 内部的循环绘制
    // 这里启动频谱图和圆形频谱
    spectrogram.update(data, audioEngine.frequencyStep)
    radialViz.drawRadialSpectrum(data)

    // 压缩器增益减少量实时更新
    updateCompressorReduction()

    vizAnimFrameId = requestAnimationFrame(draw)
  }

  // 基础频域可视化
  visualizer.startFrequencyVisualization(audioEngine)

  // 高级可视化
  draw()
}

/**
 * 停止所有频域可视化
 * 取消 rAF 循环，释放渲染资源
 */
function stopAllVisualizations() {
  isVisualizationRunning = false
  if (vizAnimFrameId) {
    cancelAnimationFrame(vizAnimFrameId)
    vizAnimFrameId = null
  }
  visualizer.stopFrequencyVisualization()
}

/**
 * 更新压缩器增益减少量显示
 */
function updateCompressorReduction() {
  const reductionEl = document.getElementById('compressorReduction')
  if (!reductionEl) return

  const reduction = audioEngine.getCompressorReduction()
  if (reduction < 0) {
    reductionEl.textContent = `GR: ${reduction.toFixed(1)} dB`
  } else {
    reductionEl.textContent = ''
  }
}

/**
 * 更新 DSP 信息面板
 * @param {object} dspInfo
 */
function updateDSPInfoPanel(dspInfo) {
  const thdEl = document.getElementById('thdValue')
  if (thdEl && dspInfo.thd > 0) {
    thdEl.textContent = `THD: ${dspInfo.thd.toFixed(1)}%`
  }
}

/**
 * 初始化教育演示模块
 */
function setupEducationModule() {
  // 演示模式切换按钮
  const demoBtns = document.querySelectorAll('.edu-demo-btn')
  demoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      demoBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const demoMode = btn.dataset.demo
      educationModule.setDemo(demoMode)

      // 切换控制面板
      document.getElementById('fourierControls').style.display = demoMode === 'fourier' ? 'flex' : 'none'
      document.getElementById('nyquistControls').style.display = demoMode === 'nyquist' ? 'flex' : 'none'
      document.getElementById('gibbsControls').style.display = demoMode === 'gibbs' ? 'flex' : 'none'

      // 绘制初始状态
      updateEducationDemo(demoMode)
    })
  })

  // 傅里叶/窗函数控制
  const windowSelect = document.getElementById('eduWindowType')
  const signalFreqSlider = document.getElementById('eduSignalFreq')
  const signalFreqVal = document.getElementById('eduSignalFreqVal')

  const updateFourier = () => {
    const windowType = windowSelect.value
    const freq = +signalFreqSlider.value
    signalFreqVal.textContent = freq + ' Hz'
    educationModule.drawFourierDemo(windowType, freq, audioEngine.sampleRate || 44100)
  }

  if (windowSelect) windowSelect.onchange = updateFourier
  if (signalFreqSlider) signalFreqSlider.oninput = updateFourier

  // Nyquist 控制
  const nyquistFreqSlider = document.getElementById('eduNyquistFreq')
  const nyquistFreqVal = document.getElementById('eduNyquistFreqVal')
  const sampleRateSlider = document.getElementById('eduSampleRate')
  const sampleRateVal = document.getElementById('eduSampleRateVal')

  const updateNyquist = () => {
    const freq = +nyquistFreqSlider.value
    const sr = +sampleRateSlider.value
    nyquistFreqVal.textContent = freq + ' Hz'
    sampleRateVal.textContent = sr + ' Hz'
    educationModule.drawNyquistDemo(freq, sr)
  }

  if (nyquistFreqSlider) nyquistFreqSlider.oninput = updateNyquist
  if (sampleRateSlider) sampleRateSlider.oninput = updateNyquist

  // Gibbs 控制
  const gibbsTermsSlider = document.getElementById('eduGibbsTerms')
  const gibbsTermsVal = document.getElementById('eduGibbsTermsVal')

  const updateGibbs = () => {
    const terms = +gibbsTermsSlider.value
    gibbsTermsVal.textContent = String(terms)
    educationModule.drawGibbsDemo(terms)
  }

  if (gibbsTermsSlider) gibbsTermsSlider.oninput = updateGibbs

  // 初始绘制
  updateFourier()
}

/**
 * 根据演示模式更新绘制
 */
function updateEducationDemo(mode) {
  switch (mode) {
    case 'fourier': {
      const windowType = document.getElementById('eduWindowType').value
      const freq = +document.getElementById('eduSignalFreq').value
      educationModule.drawFourierDemo(windowType, freq, audioEngine.sampleRate || 44100)
      break
    }
    case 'nyquist': {
      const freq = +document.getElementById('eduNyquistFreq').value
      const sr = +document.getElementById('eduSampleRate').value
      educationModule.drawNyquistDemo(freq, sr)
      break
    }
    case 'gibbs': {
      const terms = +document.getElementById('eduGibbsTerms').value
      educationModule.drawGibbsDemo(terms)
      break
    }
  }
}

/**
 * 初始化预设场景库
 */
function setupPresetScenes() {
  const grid = document.getElementById('presetGrid')
  if (!grid) return

  PRESET_SCENES.forEach(preset => {
    const card = document.createElement('div')
    card.className = 'preset-card'

    const name = document.createElement('div')
    name.className = 'preset-card-name'
    name.textContent = preset.name

    const desc = document.createElement('div')
    desc.className = 'preset-card-desc'
    desc.textContent = preset.description

    card.appendChild(name)
    card.appendChild(desc)

    card.onclick = () => {
      applyPreset(preset.config)
    }

    grid.appendChild(card)
  })
}

/**
 * 应用预设场景配置到音频引擎
 * @param {object} config - 预设配置
 */
function applyPreset(config) {
  // 先禁用所有振荡器
  for (let i = 0; i < audioEngine.oscillatorCount; i++) {
    audioEngine.setOscillatorEnabled(i, false)
  }

  // 设置白噪声
  audioEngine.setWhiteNoiseEnabled(!!config.noise)
  if (config.noiseVolume !== undefined) {
    audioEngine.setWhiteNoiseVolume(config.noiseVolume)
  }

  // 设置振荡器
  if (config.oscillators) {
    config.oscillators.forEach((osc, i) => {
      if (i < audioEngine.oscillatorCount) {
        audioEngine.setOscillatorFrequency(i, osc.frequency)
        audioEngine.setOscillatorType(i, osc.type)
        audioEngine.setOscillatorVolume(i, osc.volume)
        audioEngine.setOscillatorEnabled(i, osc.enabled)
      }
    })
  }

  // 确保正在播放
  if (!audioEngine.isPlaying) {
    audioEngine.togglePlayback()
    const toggleBtn = document.getElementById('toggleSound')
    if (toggleBtn) {
      toggleBtn.classList.add('active')
      toggleBtn.innerHTML = '&#9632;'
    }
  }

  console.log('已应用预设场景')
}
