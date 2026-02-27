/**
 * 应用入口文件
 * 初始化音频引擎、可视化器和 UI 控制器
 */

import { AudioEngine } from './AudioEngine.js'
import { Visualizer } from './Visualizer.js'
import { UIController } from './UIController.js'
import './styles.css'

// 创建核心实例
const audioEngine = new AudioEngine()
const visualizer = new Visualizer(
  document.getElementById('main'),
  document.getElementById('sub')
)
const uiController = new UIController(audioEngine, visualizer)

// 初始化可视化器和 UI
visualizer.init()
uiController.init()

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

  // 初始化音频处理节点
  audioEngine.initProcessorNode(4096)

  // 设置音频处理回调：将 PCM 数据传递给可视化器绘制时域图
  audioEngine.onAudioProcess = (buffer) => {
    visualizer.drawTimeDomain(buffer)
  }

  // 初始化控制面板（需要音频引擎的数据）
  uiController.initControlPanel()

  // 启动频域可视化
  visualizer.startFrequencyVisualization(audioEngine)

  // 绘制频域刻度
  visualizer.drawFrequencyScale(audioEngine.frequencyStep, audioEngine.fftSize)

  console.log('音频引擎初始化完成', audioEngine.useWorklet ? '(AudioWorklet)' : '(ScriptProcessor)')

  document.removeEventListener('mousedown', initAudioOnClick)
}

document.addEventListener('mousedown', initAudioOnClick)
