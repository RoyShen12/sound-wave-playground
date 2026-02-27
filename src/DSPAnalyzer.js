/**
 * DSP 分析模块
 * 提供窗函数、频谱分析、音高检测、电平计算等 DSP 功能
 */

// ===== 窗函数 =====

/**
 * 窗函数类型枚举
 */
export const WindowType = {
  RECTANGULAR: 'rectangular',
  HAMMING: 'hamming',
  HANNING: 'hanning',
  BLACKMAN: 'blackman',
  KAISER: 'kaiser'
}

/**
 * 生成窗函数系数数组
 * @param {string} type - 窗函数类型
 * @param {number} length - 窗长度
 * @param {number} beta - Kaiser 窗的 beta 参数
 * @returns {Float32Array} 窗函数系数
 */
export function generateWindow(type, length, beta = 5) {
  const window = new Float32Array(length)
  const N = length - 1

  switch (type) {
    case WindowType.RECTANGULAR:
      window.fill(1)
      break

    case WindowType.HAMMING:
      for (let i = 0; i < length; i++) {
        window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / N)
      }
      break

    case WindowType.HANNING:
      for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N))
      }
      break

    case WindowType.BLACKMAN:
      for (let i = 0; i < length; i++) {
        window[i] =
          0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N)
      }
      break

    case WindowType.KAISER:
      for (let i = 0; i < length; i++) {
        const arg = beta * Math.sqrt(1 - Math.pow((2 * i) / N - 1, 2))
        window[i] = besselI0(arg) / besselI0(beta)
      }
      break

    default:
      window.fill(1)
  }

  return window
}

/**
 * 将窗函数应用到信号
 * @param {Float32Array} signal - 输入信号
 * @param {Float32Array} window - 窗函数系数
 * @returns {Float32Array} 加窗后的信号
 */
export function applyWindow(signal, window) {
  const result = new Float32Array(signal.length)
  const len = Math.min(signal.length, window.length)
  for (let i = 0; i < len; i++) {
    result[i] = signal[i] * window[i]
  }
  return result
}

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

// ===== 频谱分析 =====

/**
 * 将线性幅度转换为 dB
 * @param {number} amplitude - 线性幅度值 (0-255 for Uint8 data)
 * @param {number} minDb - 最小 dB 值
 * @param {number} maxDb - 最大 dB 值
 * @returns {number} dB 值
 */
export function amplitudeToDb(amplitude, minDb = -90, maxDb = -10) {
  if (amplitude <= 0) return minDb
  const normalized = amplitude / 255
  return minDb + normalized * (maxDb - minDb)
}

/**
 * 将频率值转换为对数刻度位置
 * @param {number} freq - 频率 (Hz)
 * @param {number} minFreq - 最小频率
 * @param {number} maxFreq - 最大频率
 * @param {number} width - 画布宽度
 * @returns {number} x 坐标位置
 */
export function freqToLogX(freq, minFreq, maxFreq, width) {
  if (freq <= 0 || minFreq <= 0) return 0
  const logMin = Math.log10(minFreq)
  const logMax = Math.log10(maxFreq)
  const logFreq = Math.log10(freq)
  return ((logFreq - logMin) / (logMax - logMin)) * width
}

/**
 * 将对数刻度 x 坐标转换为频率
 * @param {number} x - x 坐标
 * @param {number} minFreq - 最小频率
 * @param {number} maxFreq - 最大频率
 * @param {number} width - 画布宽度
 * @returns {number} 频率 (Hz)
 */
export function logXToFreq(x, minFreq, maxFreq, width) {
  const logMin = Math.log10(minFreq)
  const logMax = Math.log10(maxFreq)
  const logFreq = logMin + (x / width) * (logMax - logMin)
  return Math.pow(10, logFreq)
}

// ===== 峰值检测 =====

/**
 * 频谱峰值检测
 * @param {Uint8Array | Float32Array} data - 频谱数据
 * @param {number} frequencyStep - 频率分辨率
 * @param {number} threshold - 检测阈值 (0-255)
 * @param {number} maxPeaks - 最大峰值数量
 * @returns {Array<{index: number, frequency: number, amplitude: number}>} 峰值列表
 */
export function detectPeaks(data, frequencyStep, threshold = 30, maxPeaks = 10) {
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
  peaks.sort((a, b) => b.amplitude - a.amplitude)
  return peaks.slice(0, maxPeaks)
}

// ===== 基频检测 =====

/**
 * 自相关法基频检测
 * @param {Float32Array} buffer - PCM 音频数据
 * @param {number} sampleRate - 采样率
 * @param {number} minFreq - 最小检测频率 (Hz)
 * @param {number} maxFreq - 最大检测频率 (Hz)
 * @returns {number} 检测到的基频 (Hz)，如果未检测到返回 0
 */
export function detectPitchAutocorrelation(buffer, sampleRate, minFreq = 50, maxFreq = 2000) {
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

/**
 * YIN 基频检测算法
 * @param {Float32Array} buffer - PCM 音频数据
 * @param {number} sampleRate - 采样率
 * @param {number} threshold - YIN 阈值 (0-1，通常 0.1-0.2)
 * @param {number} minFreq - 最小检测频率
 * @param {number} maxFreq - 最大检测频率
 * @returns {number} 检测到的基频 (Hz)
 */
export function detectPitchYIN(buffer, sampleRate, threshold = 0.15, minFreq = 50, maxFreq = 2000) {
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
export function frequencyToNote(frequency, a4Freq = 440) {
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

// ===== 电平计算 =====

/**
 * 计算 RMS 电平
 * @param {Float32Array} buffer - PCM 音频数据
 * @returns {number} RMS 值 (0-1)
 */
export function calculateRMS(buffer) {
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
export function calculatePeak(buffer) {
  let peak = 0
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i])
    if (abs > peak) peak = abs
  }
  return peak
}

/**
 * 将线性电平转换为 dB
 * @param {number} level - 线性电平 (0-1)
 * @returns {number} dB 值
 */
export function levelToDb(level) {
  if (level <= 0) return -Infinity
  return 20 * Math.log10(level)
}

// ===== THD 计算 =====

/**
 * 计算总谐波失真 (THD)
 * @param {Uint8Array} frequencyData - 频域数据
 * @param {number} frequencyStep - 频率分辨率
 * @param {number} fundamentalFreq - 基频 (Hz)
 * @returns {number} THD 百分比
 */
export function calculateTHD(frequencyData, frequencyStep, fundamentalFreq) {
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
