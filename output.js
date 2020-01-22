const WIDTH = 800
const HEIGHT = 400

const dpi = window.devicePixelRatio

const fftSize = 512
const initFrq = 450

const inlinearFx = v => Math.round(30.3826203132303 * Math.pow(Math.E, 0.0316768436278822 * v))

const oscillatorAmount = 5
const defaultDeactivatedoscillatorFromIndex = 2

let isPlaying = false

let TimeBaseDrawWay = 2

const audioContext = new window.AudioContext()

const frStep = audioContext.sampleRate / 2 / (fftSize / 2)

/**
 * @typedef {{ ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stasis: boolean }} CanvasWrapper
 */

/**
 * @type {AudioBufferSourceNode}
 */
let whiteNoise = null

/**
 * @type {GainNode}
 */
let whiteNoiseEnable = false

/**
 * @type {GainNode}
 */
let whiteNoiseVolum = null

/**
 * @type {WaveShaperNode}
 */
let distortion = null

/**
 * @type {OscillatorNode[]}
 */
const oscillators = []

/**
 * @type {GainNode[]}
 */
const volumeGainNodes = []

/**
 * @type {GainNode[]}
 */
const switchGainNodes = []

/**
 * @type {GainNode}
 */
let gainNode = null

/**
 * @type {AnalyserNode}
 */
let analyser = null

/**
 * @type {AnalyserNode}
 */
let tbAnalyzer = null

/**
 * @type {ScriptProcessorNode}
 */
let scriptProcessor = null

let toggleLabel = null

/**
 * @type {CanvasWrapper}
 */
let main = {
  ctx: null,
  canvas: null,
  stasis: false
}

/**
 * @type {CanvasWrapper}
 */
let sub = {
  ctx: null,
  canvas: null
}

function initAudio() {
  // The oscillator creates the sound waves.
  // As you can see on the canvas when drawing
  // the square wave, the wave is not perfectly
  // square. What you see is the Gibbs phenomenon
  // caused by the oscillator using Fourier series
  // to approximate the different wave types.
  // Controls the volume
  gainNode = audioContext.createGain()
  gainNode.gain.value = 0
  // init Oscillator
  for (let i = 0; i < oscillatorAmount; i++) {
    const vgn = audioContext.createGain()
    vgn.gain.value = .75
    const sgn = audioContext.createGain()
    if ((i + 1) < defaultDeactivatedoscillatorFromIndex) sgn.gain.value = 1
    else sgn.gain.value = 0
    switchGainNodes.push(sgn)
    volumeGainNodes.push(vgn)
    const oscillator_tmp_name = audioContext.createOscillator()
    oscillator_tmp_name.type = 'sine'
    oscillator_tmp_name.frequency.value = initFrq + i * 20
    oscillator_tmp_name.start(0)
    oscillator_tmp_name.connect(vgn)
    vgn.connect(sgn)
    sgn.connect(gainNode)
    oscillators.push(oscillator_tmp_name)
  }
  // link to gainNode
  // Provides info about the sound playing
  analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.minDecibels = -90
  analyser.maxDecibels = -10
  tbAnalyzer = audioContext.createAnalyser()
  // prepare Noises
  const bufferSize = 2 * audioContext.sampleRate
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
  const output = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1
  }
  whiteNoise = audioContext.createBufferSource()
  whiteNoise.buffer = noiseBuffer
  whiteNoise.loop = true
  whiteNoise.start(0)
  whiteNoiseEnable = audioContext.createGain()
  whiteNoiseEnable.gain.value = 0
  whiteNoiseVolum = audioContext.createGain()
  whiteNoiseVolum.gain.value = .12
  whiteNoise.connect(whiteNoiseVolum)
  whiteNoiseVolum.connect(whiteNoiseEnable)
  whiteNoiseEnable.connect(gainNode)
  // WaveShaper
  // distortion = audioContext.createWaveShaper()
  // distortion.curve = makeDistortionCurve(1e7)
  // distortion.oversample = 'none'
  // gainNode.connect(distortion)
  // Out Put to speaker
  gainNode.connect(analyser)
  gainNode.connect(tbAnalyzer)
  gainNode.connect(audioContext.destination)

  // 采样率选择器
  const scriptProcessorSelector = document.getElementById('spsv')
  scriptProcessorSelector.innerHTML = `
<option value="256">256&#12288;&#12288;${(256 / audioContext.sampleRate).toFixed(2)}秒/次</option>~
<option value="512">512&#12288;&#12288;${(512 / audioContext.sampleRate).toFixed(2)}秒/次</option>
<option value="1024">1024&#12288;&#12288;${(1024 / audioContext.sampleRate).toFixed(2)}秒/次</option>
<option value="2048">2048&#12288;&#12288;${(2048 / audioContext.sampleRate).toFixed(2)}秒/次</option>
<option value="4096" selected>4096&#12288;&#12288;${(4096 / audioContext.sampleRate).toFixed(2)}秒/次</option>
<option value="8192">8192&#12288;&#12288;${(8192 / audioContext.sampleRate).toFixed(2)}秒/次</option>
<option value="16384">16384&#12288;&#12288;${(16384 / audioContext.sampleRate).toFixed(2)}秒/次</option>`
  // 创建一个音频分析对象，采样的缓冲区大小为4096，输入和输出都是单声道
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)
  analyser.connect(scriptProcessor)
  // 此举无甚效果，仅仅是因为解决 Chrome 自身的 bug
  scriptProcessor.connect(audioContext.destination)
  // 开始处理音频、绘制时域图
  scriptProcessor.onaudioprocess = onSrciptProcessorAudioProcess
  scriptProcessorSelector.onchange = e => {
    const v = +e.target.value
    analyser.disconnect()
    scriptProcessor.disconnect()
    scriptProcessor = audioContext.createScriptProcessor(v, 1, 1)
    analyser.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)
    scriptProcessor.onaudioprocess = onSrciptProcessorAudioProcess
  }
  // 傅立叶分析和绘图
  drawFT(analyser)

  // Oscillator1 -- Gain1 -- + -- Gain -- WaveShaper -- + -- Out (speaker/phones)
  //                         |                          |
  // Oscillator2 -- Gain2 -- |                          |
  //                         |                          |- -- TimeBasedAnalyzer
  //                         |                          |
  //            ......       |                          |
  //                         |                          + -- Analyser -- ScriptProcessor
}

/**
 * @param {AudioProcessingEvent} audioEvt
 */
function onSrciptProcessorAudioProcess(audioEvt) {
  if (main.stasis) return
  // 获得缓冲区的输入音频，转换为包含了PCM通道数据的32位浮点数组
  let buffer = audioEvt.inputBuffer.getChannelData(0)
  clearMain()
  main.ctx.beginPath()
  buffer.forEach((v, i) => {
    if (TimeBaseDrawWay === 0) drawPoint(main.ctx, v, i, buffer.length)
    else if (TimeBaseDrawWay === 1) drawLine(main.ctx, v, i, buffer.length)
    else if (TimeBaseDrawWay === 2) drawLink(main.ctx, v, i, buffer.length)
  })
  if (TimeBaseDrawWay === 2) {
    main.ctx.stroke()
  }
  else {
    main.ctx.closePath()
    main.ctx.fill()
  }
}

function clearMain() {
  main.ctx.clearRect(0, 0, WIDTH, HEIGHT)
}

function toggleSound () {
  if(isPlaying) {
    gainNode.gain.value = 0
    toggleLabel.innerHTML = 'Start!'
    isPlaying = false
  } else {
    gainNode.gain.value = 1
    toggleLabel.innerHTML = 'Stop!'
    isPlaying = true
  }
}

function initDom() {
  for (let i = -1; i < oscillatorAmount; i++) {
    const p = document.createElement('div')

    const descriptionNode = document.createElement('span')
    descriptionNode.textContent = i === -1 ? '噪声' : ('振荡器 #' + i)
    descriptionNode.style.display = 'inline-block'
    descriptionNode.style.width = '80px'

    const volumeTextNode = document.createElement('span')
    volumeTextNode.textContent = '音量'

    const volumeSlider = document.createElement('input')
    volumeSlider.type = 'range'
    volumeSlider.max = '100'
    volumeSlider.min = '0'
    volumeSlider.value = i === -1 ? 12 : 75
    volumeSlider.style.width = '50px'
    if (i === -1) {
      volumeSlider.onchange = e => {
        const v = +e.target.value
        volumeValueEle.textContent = v
        whiteNoiseVolum.gain.value = v / 100
      }
    }
    else {
      volumeSlider.onchange = e => {
        const v = +e.target.value
        volumeValueEle.textContent = v
        volumeGainNodes[i].gain.value = v / 100
      }
    }

    const volumeValueEle = document.createElement('span')
    volumeValueEle.textContent = i === -1 ? '12' : '75'
    volumeValueEle.style.display = 'inline-block'
    volumeValueEle.style.width = '60px'

    const frequencyTextNode = document.createElement('span')
    frequencyTextNode.textContent = '频率'
    
    // 非线性滑动条
    const frequencySlider = document.createElement('input')
    frequencySlider.type = 'range'
    frequencySlider.max = '24000'
    frequencySlider.min = '20'
    frequencySlider.value = initFrq + i * 20
    frequencySlider.onchange = e => {
      const v = +e.target.value
      // const v = Math.round(30.3826203132303 * Math.pow(Math.E, 0.0316768436278822 * iv))
      frequencyValueEle.textContent = v + ' Hz'
      oscillators[i].frequency.value = v
    }

    const frequencyValueEle = document.createElement('span')
    frequencyValueEle.textContent = initFrq + i * 20 + ' Hz'
    frequencyValueEle.style.display = 'inline-block'
    frequencyValueEle.style.width = '80px'

    const oscillatorEnable = document.createElement('input')
    oscillatorEnable.type = 'checkbox'
    if ((i + 1) < defaultDeactivatedoscillatorFromIndex) oscillatorEnable.checked = true
    if (i < 0) oscillatorEnable.checked = false
    oscillatorEnable.style.marginRight = '16px'
    if (i === -1) {
      oscillatorEnable.onchange = e => {
        if (e.target.checked) whiteNoiseEnable.gain.value = 1
        else whiteNoiseEnable.gain.value = 0
      }
    }
    else {
      oscillatorEnable.onchange = e => {
        if (e.target.checked) switchGainNodes[i].gain.value = 1
        else switchGainNodes[i].gain.value = 0
      }
    }

    p.appendChild(descriptionNode)
    p.appendChild(oscillatorEnable)
    p.appendChild(volumeTextNode)
    p.appendChild(volumeSlider)
    p.appendChild(volumeValueEle)
    if (i > -1) p.appendChild(frequencyTextNode)
    if (i > -1) p.appendChild(frequencySlider)
    if (i > -1) p.appendChild(frequencyValueEle)

    ;[['sine', '正弦波'], ['square', '方波'], ['sawtooth', '锯齿波'], ['triangle', '三角波']].forEach((v, j) => {
      const sT = document.createElement('input')
      sT.type = 'radio'
      sT.name = 'waveType_' + (i + 1)
      sT.value = v[0]
      if (j === 0) sT.checked = true
      const sTL = document.createElement('label')
      sTL.htmlFor = v[0]
      sTL.textContent = v[1]

      if (i > -1) p.appendChild(sT)
      if (i > -1) p.appendChild(sTL)
    })

    document.body.appendChild(p)

    $(`input[type=radio][name=waveType_${i + 1}]`).change(function() {
      oscillators[i].type = this.value
    })
  }

  toggleLabel = document.getElementById('toggleLabel')

  document.getElementById('toggleSound').addEventListener('click', toggleSound, false)

  $('input[type=radio][name=tb_draw_way]').change(function() {
    TimeBaseDrawWay = +this.value
  })

  document.getElementById('tb_fz').onclick = () => main.stasis = !main.stasis
}

function run() {
  main.canvas = document.getElementById('main')
  main.ctx = main.canvas.getContext('2d')
  main.ctx.fillStyle = '#f52311'
  main.ctx.strokeStyle = '#f52311'

  sub.canvas = document.getElementById('sub')
  sub.ctx = sub.canvas.getContext('2d')

  initDom()
  initAudio()

  drawFTScale()
}

/**
 * @param {CanvasRenderingContext2D} canvas
 * @param {number} amp
 * @param {number} seq
 * @param {number} total
 */
function drawPoint(canvas, amp, seq, total) {
  const h = HEIGHT / 2 + HEIGHT / 2 * amp
  canvas.rect(WIDTH * (seq / total), h, 1, 1)
}
/**
 * @param {CanvasRenderingContext2D} canvas
 * @param {number} amp
 * @param {number} seq
 * @param {number} total
 */
function drawLine(canvas, amp, seq, total) {
  const h = HEIGHT / 2 + HEIGHT / 2 * amp
  if (amp > 0) canvas.rect(WIDTH * (seq / total), HEIGHT / 2, 1, amp * HEIGHT / 2)
  if (amp < 0) canvas.rect(WIDTH * (seq / total), h, 1, -1 * amp * HEIGHT / 2)
}
/**
 * @param {CanvasRenderingContext2D} canvas
 * @param {number} amp
 * @param {number} seq
 * @param {number} total
 */
function drawLink(canvas, amp, seq, total) {
  const h = HEIGHT / 2 + HEIGHT / 2 * amp
  if (seq === 0) {
    canvas.moveTo(0, h)
  }
  else {
    canvas.lineTo(WIDTH * (seq / total), h)
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

  sub.ctx.clearRect(0, 0, WIDTH, HEIGHT)

  for(let i = 0; i < bufferLengthAlt; i++) {
    const powerV = dataArrayAlt[i] // 0 - 255 -> 0 - HEIGHT
    const barHeight = powerV * (400 / 255)
    // sub.ctx.fillStyle = `rgb(${powerV + 100},50,${i / bufferLengthAlt * 100 + 100})`
    sub.ctx.fillStyle = `rgb(${powerV + 100},50,50)`
    sub.ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight)

    x += barWidth + 1
    if (x > WIDTH) break
  }

  requestAnimationFrame(() => drawFT(ana))
}

function drawFTScale () {
  sub.ctx.clearRect(0, HEIGHT + 2, WIDTH, 50)
  sub.ctx.fillStyle = '#000000'
  sub.ctx.font = '6px'

  for (let i = 0; i < fftSize / 2; i++) {
    let hz = Math.round(i * frStep * 10) / 10
    if (hz > 1000) hz = (Math.round(hz / 1000 * 10) / 10) + 'k'
    if (i % 16 === 0) {
      sub.ctx.fillRect(i * 3, HEIGHT + 2, 1, 4)

      sub.ctx.fillText(`${hz}Hz`, i * 3, HEIGHT + 18)
    }
  }
}

function makeDistortionCurve(amount) {
  var k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180,
    i = 0,
    x
  for ( ; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1
    curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) )
  }
  return curve
}
