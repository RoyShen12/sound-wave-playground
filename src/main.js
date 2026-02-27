/**
 * 应用入口文件
 * 初始化音频引擎、可视化器和 UI 控制器
 */

import { AudioEngine } from './AudioEngine.js'
import { Visualizer } from './Visualizer.js'
import { UIController } from './UIController.js'
import { SpectrogramRenderer } from './Spectrogram.js'
import { RadialVisualizer } from './RadialVisualizer.js'
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

// 初始化可视化器和 UI
visualizer.init()
spectrogram.init()
radialViz.init()
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

  // 初始化控制面板
  uiController.initControlPanel()

  // 启动频域可视化（含频谱图和圆形频谱）
  startAllVisualizations()

  // 绘制频域刻度
  visualizer.drawFrequencyScale(audioEngine.frequencyStep, audioEngine.fftSize)

  console.log('音频引擎初始化完成', audioEngine.useWorklet ? '(AudioWorklet)' : '(ScriptProcessor)')

  document.removeEventListener('mousedown', initAudioOnClick)
}

document.addEventListener('mousedown', initAudioOnClick)

/**
 * 启动所有频域可视化
 */
function startAllVisualizations() {
  const draw = () => {
    const data = audioEngine.getFrequencyData()

    // 基础频域图由 Visualizer 内部的循环绘制
    // 这里启动频谱图和圆形频谱
    spectrogram.update(data, audioEngine.frequencyStep)
    radialViz.drawRadialSpectrum(data)

    requestAnimationFrame(draw)
  }

  // 基础频域可视化
  visualizer.startFrequencyVisualization(audioEngine)

  // 高级可视化
  draw()
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
