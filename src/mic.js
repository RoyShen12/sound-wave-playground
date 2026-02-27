/**
 * 麦克风分析入口文件
 * 捕获麦克风输入并进行实时可视化分析
 */

import { initHiDPICanvas, formatFrequency } from './utils.js'

const LEN = 800
const FFT_SIZE = 4096

/** @type {AudioContext | null} */
let audioContext = null
/** @type {number} */
let frequencyStep = 0

// Canvas 包装对象
const mainCanvas = { ctx: null, canvas: null }
const subCanvas = { ctx: null, canvas: null }
const freqCanvas = { ctx: null, canvas: null }

/**
 * 绘制采样点
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} amp - 振幅
 * @param {number} index - 采样索引
 * @param {number} total - 总采样数
 */
function drawPoint(ctx, amp, index, total) {
  const h = LEN / 4 + LEN / 4 * amp
  ctx.fillRect(LEN * (index / total), h, 1, 1)
}

/**
 * 清除画布
 */
function clearCanvases() {
  mainCanvas.ctx.clearRect(0, 0, LEN, LEN)
  subCanvas.ctx.clearRect(0, 0, LEN, LEN)
}

/**
 * 绘制频域刻度
 */
function drawFrequencyScale() {
  freqCanvas.ctx.fillStyle = '#000000'
  freqCanvas.ctx.font = '10px sans-serif'

  const binCount = FFT_SIZE / 2
  for (let i = 0; i < binCount; i++) {
    if (i % 16 === 0) {
      const hz = i * frequencyStep
      const x = i * 3
      freqCanvas.ctx.fillRect(x, LEN + 2, 1, 4)
      freqCanvas.ctx.fillText(formatFrequency(hz), x, LEN + 18)
    }
  }
}

/**
 * 绘制频域图
 * @param {AnalyserNode} analyser
 */
function drawFrequency(analyser) {
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  let x = 0
  const barWidth = 2

  freqCanvas.ctx.clearRect(0, 0, LEN, LEN)

  for (let i = 0; i < bufferLength; i++) {
    const power = dataArray[i]
    const barHeight = power * 3.137
    freqCanvas.ctx.fillStyle = `rgb(${power + 100},50,${i / bufferLength * 100 + 100})`
    freqCanvas.ctx.fillRect(x, LEN - barHeight, barWidth, barHeight)
    x += barWidth + 1
    if (x > LEN) break
  }

  requestAnimationFrame(() => drawFrequency(analyser))
}

/**
 * 准备麦克风输入
 */
function prepareMicInput() {
  const statusEl = document.getElementById('status')

  const analyser = audioContext.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.minDecibels = -90
  analyser.maxDecibels = -10

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaSource = audioContext.createMediaStreamSource(stream)
      const scriptProcessor = audioContext.createScriptProcessor(1024, 2, 2)

      mediaSource.connect(analyser)
      analyser.connect(scriptProcessor)
      scriptProcessor.connect(audioContext.destination)

      scriptProcessor.onaudioprocess = (audioEvt) => {
        const bufferL = audioEvt.inputBuffer.getChannelData(0)
        const bufferR = audioEvt.inputBuffer.getChannelData(1)

        const maxL = Math.max(...bufferL)
        const maxR = Math.max(...bufferR)
        statusEl.textContent = `您的音量值：L ${Math.round(maxL * 100)} R ${Math.round(maxR * 100)}`

        clearCanvases()
        bufferL.forEach((v, i) => drawPoint(mainCanvas.ctx, v, i, bufferL.length))
        bufferR.forEach((v, i) => drawPoint(subCanvas.ctx, v, i, bufferR.length))
      }

      drawFrequency(analyser)
    }).catch((error) => {
      statusEl.textContent = '获取音频时好像出了点问题。' + error
    })
  } else {
    statusEl.textContent = '不支持获取媒体接口'
  }
}

/**
 * 初始化应用
 */
function init() {
  mainCanvas.canvas = document.getElementById('main')
  mainCanvas.ctx = mainCanvas.canvas.getContext('2d')
  mainCanvas.ctx.fillStyle = '#f52311'

  mainCanvas.ctx.save()
  mainCanvas.ctx.font = '18px sans-serif'
  mainCanvas.ctx.textAlign = 'center'
  mainCanvas.ctx.fillText('请点击任意空白处来初始化', LEN / 2, LEN / 4)
  mainCanvas.ctx.restore()

  subCanvas.canvas = document.getElementById('mainSUB')
  subCanvas.ctx = subCanvas.canvas.getContext('2d')
  subCanvas.ctx.fillStyle = '#1123fe'

  freqCanvas.canvas = document.getElementById('frcy')
  freqCanvas.ctx = freqCanvas.canvas.getContext('2d')

  document.onclick = () => {
    document.onclick = null

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioContext = new AudioContextClass()
    frequencyStep = audioContext.sampleRate / 2 / (FFT_SIZE / 2)

    drawFrequencyScale()
    prepareMicInput()
  }
}

// 启动应用
init()
