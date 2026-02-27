/**
 * 应用入口文件
 * 初始化音频引擎、可视化器和 UI 控制器
 */

import { AudioEngine } from './AudioEngine.js'
import { Visualizer } from './Visualizer.js'
import { UIController } from './UIController.js'

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

// 显示初始化提示
visualizer.showInitMessage()

// 等待用户点击以初始化音频（浏览器自动播放策略）
const initAudioOnClick = () => {
  console.log('音频引擎初始化中...')

  setTimeout(() => {
    // 初始化音频引擎
    audioEngine.init()

    // 初始化脚本处理器
    audioEngine.initScriptProcessor(4096)

    // 设置音频处理回调：将 PCM 数据传递给可视化器绘制时域图
    audioEngine.onAudioProcess = (buffer) => {
      visualizer.drawTimeDomain(buffer)
    }

    // 初始化采样率选择器
    uiController.initSampleRateSelector()

    // 启动频域可视化
    visualizer.startFrequencyVisualization(audioEngine)

    // 绘制频域刻度
    visualizer.drawFrequencyScale(audioEngine.frequencyStep, audioEngine.fftSize)

    console.log('音频引擎初始化完成')
  }, 100)

  document.removeEventListener('mousedown', initAudioOnClick)
}

document.addEventListener('mousedown', initAudioOnClick)
