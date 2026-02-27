/**
 * DSP Worker 脚本
 * 将耗时的 DSP 计算从主线程移到 Worker 线程执行
 *
 * 支持的消息类型：
 *   - analyzePitch: 基频检测（YIN + 自相关）、RMS/峰值电平计算
 *   - analyzeSpectrum: 频谱峰值检测、THD 计算
 *
 * 注意：Worker 环境不支持 import/export，所有函数直接定义在此文件中
 */

// ===== 辅助函数 =====

/**
 * 修正的零阶贝塞尔函数 I0（Kaiser 窗使用）
 * @param {number} x
 * @returns {number}
 */
function besselI0(x) {
  let sum = 1
  let term = 1
  const halfX = x / 2

  for (let k = 1; k <= 20; k++) {
    term *= (halfX / k) * (halfX / k)
    sum += term
    if (term < 1e-10) break
  }

  return sum
}

/**
 * 将线性电平转换为 dB
 * @param {number} level - 线性电平 (0-1)
 * @returns {number} dB 值
 */
function levelToDb(level) {
  if (level <= 0) return -Infinity
  return 20 * Math.log10(level)
}

// ===== 音高识别 =====

/**
 * 音符名称表
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * 将频率转换为音符名称
 * @param {number} frequency - 频率 (Hz)
 * @param {number} a4Freq - A4 参考频率 (默认 440 Hz)
 * @returns {{note: string, octave: number, cents: number, frequency: number} | null}
 */
function frequencyToNote(frequency, a4Freq) {
  if (a4Freq === undefined) a4Freq = 440
  if (frequency <= 0) return null

  // 计算距离 A4 的半音数
  const semitones = 12 * Math.log2(frequency / a4Freq)
  const roundedSemitones = Math.round(semitones)

  // 计算音分偏差
  const cents = Math.round((semitones - roundedSemitones) * 100)

  // 计算音符索引和八度
  const noteIndex = ((roundedSemitones % 12) + 12 + 9) % 12 // A=9, 转换为 C=0
  const octave = Math.floor((roundedSemitones + 9) / 12) + 4

  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    cents,
    frequency: Math.round(frequency * 100) / 100
  }
}

// ===== 基频检测 =====

/**
 * YIN 基频检测算法
 * 时间复杂度 O(n²)，适合在 Worker 中运行
 * @param {Float32Array} buffer - PCM 音频数据
 * @param {number} sampleRate - 采样率
 * @param {number} threshold - YIN 阈值 (0-1，通常 0.1-0.2)
 * @param {number} minFreq - 最小检测频率
 * @param {number} maxFreq - 最大检测频率
 * @returns {number} 检测到的基频 (Hz)
 */
function detectPitchYIN(buffer, sampleRate, threshold, minFreq, maxFreq) {
  if (threshold === undefined) threshold = 0.15
  if (minFreq === undefined) minFreq = 50
  if (maxFreq === undefined) maxFreq = 2000

  const minPeriod = Math.floor(sampleRate / maxFreq)
  const maxPeriod = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(buffer.length / 2))

  // 步骤 1: 计算差分函数
  const diff = new Float32Array(maxPeriod + 1)
  for (let tau = 0; tau <= maxPeriod; tau++) {
    let sum = 0
    for (let i = 0; i < maxPeriod; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    diff[tau] = sum
  }

  // 步骤 2: 累积均值归一化差分函数 (CMNDF)
  const cmndf = new Float32Array(maxPeriod + 1)
  cmndf[0] = 1
  let runningSum = 0

  for (let tau = 1; tau <= maxPeriod; tau++) {
    runningSum += diff[tau]
    cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1
  }

  // 步骤 3: 绝对阈值
  let bestPeriod = 0
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    if (cmndf[tau] < threshold) {
      // 找到谷底
      while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
        tau++
      }
      bestPeriod = tau
      break
    }
  }

  // 如果没找到低于阈值的点，找最小值
  if (bestPeriod === 0) {
    let minVal = Infinity
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < minVal) {
        minVal = cmndf[tau]
        bestPeriod = tau
      }
    }
    // 如果最小值仍然太大，认为没有明确的音高
    if (minVal > 0.5) return 0
  }

  // 步骤 4: 抛物线插值
  if (bestPeriod > 0 && bestPeriod < maxPeriod) {
    const alpha = cmndf[bestPeriod - 1]
    const beta = cmndf[bestPeriod]
    const gamma = cmndf[bestPeriod + 1]
    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
    if (isFinite(p)) {
      bestPeriod = bestPeriod + p
    }
  }

  return bestPeriod > 0 ? sampleRate / bestPeriod : 0
}

/**
 * 自相关法基频检测
 * 时间复杂度 O(n²)，适合在 Worker 中运行
 * @param {Float32Array} buffer - PCM 音频数据
 * @param {number} sampleRate - 采样率
 * @param {number} minFreq - 最小检测频率 (Hz)
 * @param {number} maxFreq - 最大检测频率 (Hz)
 * @returns {number} 检测到的基频 (Hz)，如果未检测到返回 0
 */
function detectPitchAutocorrelation(buffer, sampleRate, minFreq, maxFreq) {
  if (minFreq === undefined) minFreq = 50
  if (maxFreq === undefined) maxFreq = 2000

  const minPeriod = Math.floor(sampleRate / maxFreq)
  const maxPeriod = Math.ceil(sampleRate / minFreq)
  const length = buffer.length

  // 计算 RMS，如果太小则认为没有信号
  let rms = 0
  for (let i = 0; i < length; i++) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / length)
  if (rms < 0.01) return 0

  let bestCorrelation = -1
  let bestPeriod = 0

  for (let period = minPeriod; period <= maxPeriod && period < length; period++) {
    let correlation = 0
    let normA = 0
    let normB = 0

    const correlationLength = Math.min(length - period, length / 2)

    for (let i = 0; i < correlationLength; i++) {
      correlation += buffer[i] * buffer[i + period]
      normA += buffer[i] * buffer[i]
      normB += buffer[i + period] * buffer[i + period]
    }

    const norm = Math.sqrt(normA * normB)
    if (norm > 0) {
      correlation /= norm
    }

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestPeriod = period
    }
  }

  // 相关系数阈值
  if (bestCorrelation < 0.5) return 0

  return sampleRate / bestPeriod
}

// ===== 电平计算 =====

/**
 * 计算 RMS 电平
 * @param {Float32Array} buffer - PCM 音频数据
 * @returns {number} RMS 值 (0-1)
 */
function calculateRMS(buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

/**
 * 计算峰值电平
 * @param {Float32Array} buffer - PCM 音频数据
 * @returns {number} 峰值 (0-1)
 */
function calculatePeak(buffer) {
  let peak = 0
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i])
    if (abs > peak) peak = abs
  }
  return peak
}

// ===== 频谱分析 =====

/**
 * 计算总谐波失真 (THD)
 * @param {Uint8Array} frequencyData - 频域数据
 * @param {number} frequencyStep - 频率分辨率
 * @param {number} fundamentalFreq - 基频 (Hz)
 * @returns {number} THD 百分比
 */
function calculateTHD(frequencyData, frequencyStep, fundamentalFreq) {
  if (fundamentalFreq <= 0) return 0

  const fundamentalBin = Math.round(fundamentalFreq / frequencyStep)
  if (fundamentalBin >= frequencyData.length) return 0

  // 基频幅度
  const fundamentalAmplitude = frequencyData[fundamentalBin]
  if (fundamentalAmplitude <= 0) return 0

  // 计算谐波幅度的平方和
  let harmonicPowerSum = 0
  for (let harmonic = 2; harmonic <= 10; harmonic++) {
    const harmonicBin = Math.round(fundamentalFreq * harmonic / frequencyStep)
    if (harmonicBin >= frequencyData.length) break

    // 在谐波频率附近寻找峰值（±2 bin）
    let maxVal = 0
    for (let offset = -2; offset <= 2; offset++) {
      const bin = harmonicBin + offset
      if (bin >= 0 && bin < frequencyData.length) {
        maxVal = Math.max(maxVal, frequencyData[bin])
      }
    }
    harmonicPowerSum += maxVal * maxVal
  }

  // THD = sqrt(sum of harmonic powers) / fundamental amplitude
  const thd = Math.sqrt(harmonicPowerSum) / fundamentalAmplitude * 100
  return Math.min(thd, 100) // 限制最大值
}

/**
 * 频谱峰值检测
 * @param {Uint8Array | Float32Array} data - 频谱数据
 * @param {number} frequencyStep - 频率分辨率
 * @param {number} threshold - 检测阈值 (0-255)
 * @param {number} maxPeaks - 最大峰值数量
 * @returns {Array<{index: number, frequency: number, amplitude: number}>} 峰值列表
 */
function detectPeaks(data, frequencyStep, threshold, maxPeaks) {
  if (threshold === undefined) threshold = 30
  if (maxPeaks === undefined) maxPeaks = 10

  const peaks = []

  for (let i = 2; i < data.length - 2; i++) {
    const current = data[i]
    // 峰值条件：大于阈值，且大于左右邻居
    if (
      current > threshold &&
      current > data[i - 1] &&
      current > data[i + 1] &&
      current >= data[i - 2] &&
      current >= data[i + 2]
    ) {
      // 抛物线插值以获得更精确的峰值位置
      const alpha = data[i - 1]
      const beta = data[i]
      const gamma = data[i + 1]
      const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
      const interpolatedIndex = i + (isFinite(p) ? p : 0)

      peaks.push({
        index: i,
        frequency: interpolatedIndex * frequencyStep,
        amplitude: current
      })
    }
  }

  // 按幅度排序并取前 N 个
  peaks.sort(function (a, b) { return b.amplitude - a.amplitude })
  return peaks.slice(0, maxPeaks)
}

// ===== Worker 消息处理 =====

/**
 * 处理来自主线程的消息
 * 根据消息类型分发到对应的分析函数
 */
self.onmessage = function (e) {
  const msg = e.data

  switch (msg.type) {
    case 'analyzePitch':
      handleAnalyzePitch(msg)
      break

    case 'analyzeSpectrum':
      handleAnalyzeSpectrum(msg)
      break

    default:
      console.warn('[DSP Worker] 未知的消息类型:', msg.type)
  }
}

/**
 * 处理音高分析请求
 * 使用 YIN 算法进行基频检测，如果 YIN 失败则回退到自相关法
 * 同时计算 RMS 和峰值电平
 * @param {Object} msg - 消息对象
 * @param {number} msg.id - 请求 ID
 * @param {Float32Array} msg.buffer - PCM 音频数据
 * @param {number} msg.sampleRate - 采样率
 */
function handleAnalyzePitch(msg) {
  var buffer = msg.buffer
  var sampleRate = msg.sampleRate
  var id = msg.id

  // 优先使用 YIN 算法，回退到自相关法
  var pitch = detectPitchYIN(buffer, sampleRate)
  if (pitch <= 0) {
    pitch = detectPitchAutocorrelation(buffer, sampleRate)
  }

  // 计算音符信息
  var note = pitch > 0 ? frequencyToNote(pitch) : null

  // 计算电平
  var rms = calculateRMS(buffer)
  var peak = calculatePeak(buffer)

  self.postMessage({
    type: 'pitchResult',
    id: id,
    pitch: pitch,
    note: note,
    rms: rms,
    rmsDb: levelToDb(rms),
    peak: peak,
    peakDb: levelToDb(peak)
  })
}

/**
 * 处理频谱分析请求
 * 检测频谱峰值并计算 THD（如果检测到基频峰值）
 * @param {Object} msg - 消息对象
 * @param {number} msg.id - 请求 ID
 * @param {Uint8Array} msg.frequencyData - 频域数据
 * @param {number} msg.frequencyStep - 频率分辨率
 */
function handleAnalyzeSpectrum(msg) {
  var frequencyData = msg.frequencyData
  var frequencyStep = msg.frequencyStep
  var id = msg.id

  // 检测频谱峰值
  var peaks = detectPeaks(frequencyData, frequencyStep)

  // 如果找到峰值，用最大峰值的频率计算 THD
  var thd = 0
  if (peaks.length > 0) {
    thd = calculateTHD(frequencyData, frequencyStep, peaks[0].frequency)
  }

  self.postMessage({
    type: 'spectrumResult',
    id: id,
    peaks: peaks,
    thd: thd
  })
}
