const LEN = 800

const fftSize = 4096

/** @type {AudioContext} */
let audioContext = null
/** @type {number} */
let frStep = null

/**
 * @typedef {{ ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement }} CanvasWrapper
 */

/**
 * @type {HTMLButtonElement}
 */
let btn = null

/**
 * @type {CanvasWrapper}
 */
let main = {
  ctx: null,
  canvas: null
}

/**
 * @type {CanvasWrapper}
 */
let sub = {
  ctx: null,
  canvas: null
}

/**
 * @type {CanvasWrapper}
 */
let fr = {
  ctx: null,
  canvas: null
}

function run() {
  main.canvas = document.getElementById('main')
  main.ctx = main.canvas.getContext('2d')
  main.ctx.fillStyle = '#f52311'

  main.ctx.save()
  main.ctx.font = '18px Times New Roman'
  main.ctx.textAlign = 'center'
  main.ctx.fillText('请点击任意空白处来初始化', LEN / 2, LEN / 4)
  main.ctx.restore()

  sub.canvas = document.getElementById('mainSUB')
  sub.ctx = sub.canvas.getContext('2d')
  sub.ctx.fillStyle = '#1123fe'

  fr.canvas = document.getElementById('frcy')
  fr.ctx = fr.canvas.getContext('2d')

  document.onclick = () => {
    document.onclick = null

    audioContext = new AudioContext()
    frStep = audioContext.sampleRate / 2 / (fftSize / 2)

    drawFTScale()

    prepareSound(v => console.log(v))
  }
}

/**
 * @param {CanvasRenderingContext2D} canvas
 * @param {number} amp
 * @param {number} seq
 * @param {number} total
 */
function drawPoint(canvas, amp, seq, total) {
  const h = LEN / 4 + LEN / 4 * amp
  canvas.fillRect(LEN * (seq / total), h, 1, 1)
}

function clearMain() {
  main.ctx.clearRect(0, 0, LEN, LEN)
  sub.ctx.clearRect(0, 0, LEN, LEN)
}

function prepareSound(volumeCallback) {
  let mystatus = document.getElementById('status')

  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.minDecibels = -90
  analyser.maxDecibels = -10
  // analyser.smoothingTimeConstant = 0.85

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // 获取用户的 media 信息
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      // 将麦克风的声音输入这个对象
      const mediaStreamSource = audioContext.createMediaStreamSource(stream) 
      // 创建一个音频分析对象，采样的缓冲区大小为1024，输入和输出都是单声道
      const scriptProcessor = audioContext.createScriptProcessor(1024, 2, 2)
      // 将该分析对象与麦克风音频进行连接
      mediaStreamSource.connect(analyser)
      analyser.connect(scriptProcessor)
      // 此举无甚效果，仅仅是因为解决 Chrome 自身的 bug
      scriptProcessor.connect(audioContext.destination)

      // 开始处理音频
      scriptProcessor.onaudioprocess = audioEvt => {
        // 获得缓冲区的输入音频，转换为包含了PCM通道数据的32位浮点数组
        let bufferL = audioEvt.inputBuffer.getChannelData(0)
        let bufferR = audioEvt.inputBuffer.getChannelData(1)

        // 获取缓冲区中最大的音量值
        let maxVal = [Math.max(...bufferL), Math.max(...bufferR)]
        // 显示音量值
        mystatus.innerHTML = `您的音量值：L ${Math.round(maxVal[0] * 100)} R ${Math.round(maxVal[1] * 100)}`

        clearMain()
        bufferL.forEach((v, i) => drawPoint(main.ctx, v, i, bufferL.length))
        bufferR.forEach((v, i) => drawPoint(sub.ctx, v, i, bufferR.length))

        // if (performance.now() > 3000) scriptProcessor.disconnect()
      }
      drawFT(analyser)
    }).catch((error) => {
      mystatus.innerHTML = '获取音频时好像出了点问题。' + error
    })
  } else {
    mystatus.innerHTML = '不支持获取媒体接口'
  }
}

function drawFTScale () {
  fr.ctx.fillStyle = '#000000'
  fr.ctx.font = '6px'
  // fr.ctx.textAlign = 'center'

  for (let i = 0; i < fftSize / 2; i++) {
    let hz = Math.round(i * frStep * 10) / 10
    if (hz > 1000) hz = (Math.round(hz / 1000 * 10) / 10) + 'k'
    if (i % 16 === 0) {
      fr.ctx.fillRect(i * 3, LEN + 2, 1, 4)

      fr.ctx.fillText(`${hz}Hz`, i * 3, LEN + 18)
    }
  }
}

/**
 * @param {AnalyserNode} ana
 */
function drawFT(ana) {
  const bufferLengthAlt = ana.frequencyBinCount
  const dataArrayAlt = new Uint8Array(bufferLengthAlt)
  ana.getByteFrequencyData(dataArrayAlt)

  let x = 0
  const barWidth = 2

  fr.ctx.clearRect(0, 0, LEN, LEN)

  for(let i = 0; i < bufferLengthAlt; i++) {
    const powerV = dataArrayAlt[i] // 0 - 255
    const barHeight = powerV * 3.137
    fr.ctx.fillStyle = `rgb(${powerV + 100},50,${i / bufferLengthAlt * 100 + 100})`
    fr.ctx.fillRect(x, LEN - barHeight, barWidth, barHeight)

    x += barWidth + 1
    if (x > LEN) break
  }

  requestAnimationFrame(() => drawFT(ana))
}
