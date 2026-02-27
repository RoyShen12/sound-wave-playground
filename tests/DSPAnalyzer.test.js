import { describe, it, expect } from 'vitest'
import {
  WindowType,
  generateWindow,
  applyWindow,
  amplitudeToDb,
  freqToLogX,
  logXToFreq,
  detectPeaks,
  detectPitchAutocorrelation,
  detectPitchYIN,
  frequencyToNote,
  calculateRMS,
  calculatePeak,
  levelToDb,
  calculateTHD
} from '../src/DSPAnalyzer.js'

// ===== 辅助函数 =====

/**
 * 生成纯正弦波测试数据
 * @param {number} frequency - 频率 (Hz)
 * @param {number} sampleRate - 采样率
 * @param {number} duration - 持续时间 (秒)
 * @returns {Float32Array} 正弦波数据
 */
function generateSineWave(frequency, sampleRate, duration) {
  const length = Math.floor(sampleRate * duration)
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  }
  return buffer
}

/**
 * 生成带谐波的信号
 * @param {number} fundamental - 基频
 * @param {number[]} harmonicAmplitudes - 谐波相对幅度（从二次谐波开始）
 * @param {number} sampleRate - 采样率
 * @param {number} duration - 持续时间
 * @returns {Float32Array}
 */
function generateHarmonicSignal(fundamental, harmonicAmplitudes, sampleRate, duration) {
  const length = Math.floor(sampleRate * duration)
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    // 基频
    buffer[i] = Math.sin((2 * Math.PI * fundamental * i) / sampleRate)
    // 谐波
    for (let h = 0; h < harmonicAmplitudes.length; h++) {
      buffer[i] +=
        harmonicAmplitudes[h] * Math.sin((2 * Math.PI * fundamental * (h + 2) * i) / sampleRate)
    }
  }
  return buffer
}

// ===== 窗函数测试 =====

describe('generateWindow - 窗函数生成', () => {
  const LENGTH = 256

  it('矩形窗：所有系数应为 1', () => {
    const win = generateWindow(WindowType.RECTANGULAR, LENGTH)
    expect(win.length).toBe(LENGTH)
    for (let i = 0; i < LENGTH; i++) {
      expect(win[i]).toBe(1)
    }
  })

  it('Hamming 窗：首尾值约 0.08，中间值约 1.0', () => {
    const win = generateWindow(WindowType.HAMMING, LENGTH)
    expect(win.length).toBe(LENGTH)
    // 首尾值约 0.08
    expect(win[0]).toBeCloseTo(0.08, 1)
    expect(win[LENGTH - 1]).toBeCloseTo(0.08, 1)
    // 中间值约 1.0
    const midIndex = Math.floor(LENGTH / 2)
    expect(win[midIndex]).toBeCloseTo(1.0, 1)
  })

  it('Hanning 窗：首尾值为 0，中间值为 1.0', () => {
    const win = generateWindow(WindowType.HANNING, LENGTH)
    expect(win.length).toBe(LENGTH)
    // 首尾值为 0
    expect(win[0]).toBeCloseTo(0, 5)
    expect(win[LENGTH - 1]).toBeCloseTo(0, 5)
    // 中间值为 1.0
    const midIndex = Math.floor(LENGTH / 2)
    expect(win[midIndex]).toBeCloseTo(1.0, 1)
  })

  it('Blackman 窗：首尾值接近 0', () => {
    const win = generateWindow(WindowType.BLACKMAN, LENGTH)
    expect(win.length).toBe(LENGTH)
    // 首尾值接近 0
    expect(Math.abs(win[0])).toBeLessThan(0.01)
    expect(Math.abs(win[LENGTH - 1])).toBeLessThan(0.01)
    // 中间值应接近 1
    const midIndex = Math.floor(LENGTH / 2)
    expect(win[midIndex]).toBeGreaterThan(0.9)
  })

  it('Kaiser 窗：首尾值小于中间值', () => {
    const win = generateWindow(WindowType.KAISER, LENGTH)
    expect(win.length).toBe(LENGTH)
    const midIndex = Math.floor(LENGTH / 2)
    expect(win[0]).toBeLessThan(win[midIndex])
    expect(win[LENGTH - 1]).toBeLessThan(win[midIndex])
    // 中间值应接近 1
    expect(win[midIndex]).toBeCloseTo(1.0, 1)
  })

  it('Kaiser 窗：beta 参数影响窗形状', () => {
    const winBeta3 = generateWindow(WindowType.KAISER, LENGTH, 3)
    const winBeta10 = generateWindow(WindowType.KAISER, LENGTH, 10)
    // 更大的 beta 应该使边缘衰减更大
    expect(winBeta10[0]).toBeLessThan(winBeta3[0])
  })

  it('未知窗类型应回退为矩形窗', () => {
    const win = generateWindow('unknown_type', LENGTH)
    for (let i = 0; i < LENGTH; i++) {
      expect(win[i]).toBe(1)
    }
  })

  it('不同长度的窗函数应返回正确长度', () => {
    const lengths = [16, 64, 128, 512, 1024]
    for (const len of lengths) {
      const win = generateWindow(WindowType.HAMMING, len)
      expect(win.length).toBe(len)
    }
  })

  it('所有窗函数的值应在 0-1 范围内', () => {
    const types = [
      WindowType.RECTANGULAR,
      WindowType.HAMMING,
      WindowType.HANNING,
      WindowType.BLACKMAN,
      WindowType.KAISER
    ]
    for (const type of types) {
      const win = generateWindow(type, LENGTH)
      for (let i = 0; i < LENGTH; i++) {
        expect(win[i]).toBeGreaterThanOrEqual(-0.001)
        expect(win[i]).toBeLessThanOrEqual(1.001)
      }
    }
  })
})

// ===== applyWindow 测试 =====

describe('applyWindow - 窗函数应用', () => {
  it('信号乘以全 1 窗后应保持不变', () => {
    const signal = new Float32Array([1, 2, 3, 4, 5])
    const win = new Float32Array([1, 1, 1, 1, 1])
    const result = applyWindow(signal, win)
    for (let i = 0; i < signal.length; i++) {
      expect(result[i]).toBe(signal[i])
    }
  })

  it('信号乘以全 0 窗后应全为 0', () => {
    const signal = new Float32Array([1, 2, 3, 4, 5])
    const win = new Float32Array([0, 0, 0, 0, 0])
    const result = applyWindow(signal, win)
    for (let i = 0; i < signal.length; i++) {
      expect(result[i]).toBe(0)
    }
  })

  it('信号和窗长度不同时应取最小长度', () => {
    const signal = new Float32Array([1, 2, 3, 4, 5])
    const win = new Float32Array([0.5, 0.5, 0.5])
    const result = applyWindow(signal, win)
    // 前 3 个被窗函数处理
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(1.0)
    expect(result[2]).toBeCloseTo(1.5)
    // 超出窗长度的部分为 0（未处理）
    expect(result[3]).toBe(0)
    expect(result[4]).toBe(0)
  })

  it('结果数组长度应与信号长度一致', () => {
    const signal = new Float32Array([1, 2, 3])
    const win = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5])
    const result = applyWindow(signal, win)
    expect(result.length).toBe(signal.length)
  })

  it('应正确逐元素相乘', () => {
    const signal = new Float32Array([2, 4, 6, 8])
    const win = new Float32Array([0.25, 0.5, 0.75, 1.0])
    const result = applyWindow(signal, win)
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(2.0)
    expect(result[2]).toBeCloseTo(4.5)
    expect(result[3]).toBeCloseTo(8.0)
  })
})

// ===== amplitudeToDb 测试 =====

describe('amplitudeToDb - 幅度转分贝', () => {
  it('幅度 0 应返回 minDb', () => {
    expect(amplitudeToDb(0)).toBe(-90)
    expect(amplitudeToDb(0, -100, 0)).toBe(-100)
  })

  it('负幅度应返回 minDb', () => {
    expect(amplitudeToDb(-1)).toBe(-90)
  })

  it('幅度 255 应返回 maxDb', () => {
    expect(amplitudeToDb(255)).toBeCloseTo(-10, 1)
    expect(amplitudeToDb(255, -100, 0)).toBeCloseTo(0, 1)
  })

  it('中间值应线性映射', () => {
    // amplitude=127.5 -> normalized=0.5 -> minDb + 0.5*(maxDb-minDb)
    const result = amplitudeToDb(127.5, -90, -10)
    expect(result).toBeCloseTo(-50, 0)
  })

  it('自定义 minDb/maxDb 应正确工作', () => {
    expect(amplitudeToDb(0, -120, -20)).toBe(-120)
    expect(amplitudeToDb(255, -120, -20)).toBeCloseTo(-20, 1)
  })
})

// ===== freqToLogX / logXToFreq 往返测试 =====

describe('freqToLogX - 频率到对数坐标转换', () => {
  const minFreq = 20
  const maxFreq = 20000
  const width = 1000

  it('最小频率应映射到 x=0', () => {
    const x = freqToLogX(minFreq, minFreq, maxFreq, width)
    expect(x).toBeCloseTo(0, 1)
  })

  it('最大频率应映射到 x=width', () => {
    const x = freqToLogX(maxFreq, minFreq, maxFreq, width)
    expect(x).toBeCloseTo(width, 1)
  })

  it('频率 <= 0 应返回 0', () => {
    expect(freqToLogX(0, minFreq, maxFreq, width)).toBe(0)
    expect(freqToLogX(-100, minFreq, maxFreq, width)).toBe(0)
  })

  it('minFreq <= 0 应返回 0', () => {
    expect(freqToLogX(100, 0, maxFreq, width)).toBe(0)
    expect(freqToLogX(100, -1, maxFreq, width)).toBe(0)
  })

  it('中间频率应给出合理的 x 位置', () => {
    const midFreq = Math.sqrt(minFreq * maxFreq) // 几何中点
    const x = freqToLogX(midFreq, minFreq, maxFreq, width)
    expect(x).toBeCloseTo(width / 2, 0)
  })
})

describe('logXToFreq - 对数坐标到频率转换', () => {
  const minFreq = 20
  const maxFreq = 20000
  const width = 1000

  it('x=0 应返回 minFreq', () => {
    const freq = logXToFreq(0, minFreq, maxFreq, width)
    expect(freq).toBeCloseTo(minFreq, 1)
  })

  it('x=width 应返回 maxFreq', () => {
    const freq = logXToFreq(width, minFreq, maxFreq, width)
    expect(freq).toBeCloseTo(maxFreq, 0)
  })
})

describe('freqToLogX / logXToFreq 往返一致性', () => {
  const minFreq = 20
  const maxFreq = 20000
  const width = 1000

  it('频率 -> x -> 频率 应返回原始频率', () => {
    const testFreqs = [20, 100, 440, 1000, 5000, 10000, 20000]
    for (const freq of testFreqs) {
      const x = freqToLogX(freq, minFreq, maxFreq, width)
      const recovered = logXToFreq(x, minFreq, maxFreq, width)
      expect(recovered).toBeCloseTo(freq, 0)
    }
  })

  it('x -> 频率 -> x 应返回原始 x', () => {
    const testXs = [0, 100, 250, 500, 750, 1000]
    for (const x of testXs) {
      const freq = logXToFreq(x, minFreq, maxFreq, width)
      const recovered = freqToLogX(freq, minFreq, maxFreq, width)
      expect(recovered).toBeCloseTo(x, 0)
    }
  })
})

// ===== detectPeaks 测试 =====

describe('detectPeaks - 频谱峰值检测', () => {
  it('应在已知峰值位置检测到峰值', () => {
    // 创建有明确峰值的频谱数据
    const data = new Uint8Array(256)
    data.fill(10) // 背景噪声
    // 在 index=50 处放一个峰值
    data[48] = 20
    data[49] = 40
    data[50] = 200
    data[51] = 40
    data[52] = 20
    // 在 index=100 处放另一个峰值
    data[98] = 20
    data[99] = 50
    data[100] = 150
    data[101] = 50
    data[102] = 20

    const frequencyStep = 10 // 10 Hz per bin
    const peaks = detectPeaks(data, frequencyStep, 30)

    expect(peaks.length).toBe(2)
    // 峰值应按幅度降序排序
    expect(peaks[0].amplitude).toBe(200)
    expect(peaks[1].amplitude).toBe(150)
  })

  it('无峰值数据应返回空数组', () => {
    const data = new Uint8Array(256)
    data.fill(10) // 所有值都低于阈值
    const peaks = detectPeaks(data, 10, 30)
    expect(peaks).toEqual([])
  })

  it('平坦数据（所有值相同且高于阈值）应返回空数组', () => {
    const data = new Uint8Array(256)
    data.fill(100) // 所有值都相同
    const peaks = detectPeaks(data, 10, 30)
    expect(peaks).toEqual([])
  })

  it('峰值应按幅度降序排序', () => {
    const data = new Uint8Array(256)
    data.fill(10)
    // 三个不同高度的峰值
    data[30] = 100
    data[60] = 200
    data[90] = 150
    // 确保邻居满足峰值条件
    data[29] = 50
    data[31] = 50
    data[59] = 80
    data[61] = 80
    data[89] = 70
    data[91] = 70

    const peaks = detectPeaks(data, 10, 30)
    expect(peaks[0].amplitude).toBe(200)
    expect(peaks[1].amplitude).toBe(150)
    expect(peaks[2].amplitude).toBe(100)
  })

  it('maxPeaks 参数应限制返回的峰值数量', () => {
    const data = new Uint8Array(256)
    data.fill(10)
    // 放置 5 个峰值
    const peakPositions = [30, 60, 90, 120, 150]
    for (const pos of peakPositions) {
      data[pos] = 200
      data[pos - 1] = 50
      data[pos + 1] = 50
    }

    const peaks = detectPeaks(data, 10, 30, 3)
    expect(peaks.length).toBe(3)
  })

  it('峰值频率应使用抛物线插值', () => {
    const data = new Uint8Array(256)
    data.fill(10)
    // 创建非对称峰值（偏右）
    data[48] = 20
    data[49] = 100
    data[50] = 200
    data[51] = 150 // 右侧更高
    data[52] = 20

    const frequencyStep = 10
    const peaks = detectPeaks(data, frequencyStep, 30)
    expect(peaks.length).toBe(1)
    // 由于右侧更高，插值后的频率应略大于 50*10=500
    expect(peaks[0].frequency).toBeGreaterThan(500)
  })
})

// ===== detectPitchAutocorrelation 测试 =====

describe('detectPitchAutocorrelation - 自相关法基频检测', () => {
  const sampleRate = 44100

  it('440Hz 正弦波应检测到约 440Hz（限定搜索范围）', () => {
    const buffer = generateSineWave(440, sampleRate, 0.1)
    // 限定搜索范围以避免子谐波干扰
    const pitch = detectPitchAutocorrelation(buffer, sampleRate, 400, 500)
    expect(pitch).toBeGreaterThan(430)
    expect(pitch).toBeLessThan(450)
  })

  it('220Hz 正弦波应检测到约 220Hz（限定搜索范围）', () => {
    const buffer = generateSineWave(220, sampleRate, 0.1)
    const pitch = detectPitchAutocorrelation(buffer, sampleRate, 200, 300)
    expect(pitch).toBeGreaterThan(210)
    expect(pitch).toBeLessThan(230)
  })

  it('静音信号应返回 0', () => {
    const buffer = new Float32Array(4410)
    buffer.fill(0)
    const pitch = detectPitchAutocorrelation(buffer, sampleRate)
    expect(pitch).toBe(0)
  })

  it('RMS 太低的信号应返回 0', () => {
    const buffer = new Float32Array(4410)
    // 极小幅度信号
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.001
    }
    const pitch = detectPitchAutocorrelation(buffer, sampleRate)
    expect(pitch).toBe(0)
  })

  it('1000Hz 正弦波应检测到约 1000Hz（限定搜索范围）', () => {
    const buffer = generateSineWave(1000, sampleRate, 0.1)
    const pitch = detectPitchAutocorrelation(buffer, sampleRate, 900, 1100)
    expect(pitch).toBeGreaterThan(980)
    expect(pitch).toBeLessThan(1020)
  })

  it('宽范围搜索应返回一个正数频率（可能是基频或子谐波）', () => {
    const buffer = generateSineWave(440, sampleRate, 0.1)
    const pitch = detectPitchAutocorrelation(buffer, sampleRate, 50, 2000)
    // 自相关法在宽范围搜索时可能返回子谐波，但应该返回正值
    expect(pitch).toBeGreaterThan(0)
  })
})

// ===== detectPitchYIN 测试 =====

describe('detectPitchYIN - YIN 基频检测', () => {
  const sampleRate = 44100

  it('440Hz 正弦波应检测到约 440Hz (误差 +-5Hz)', () => {
    const buffer = generateSineWave(440, sampleRate, 0.1)
    const pitch = detectPitchYIN(buffer, sampleRate)
    expect(pitch).toBeGreaterThan(435)
    expect(pitch).toBeLessThan(445)
  })

  it('220Hz 正弦波应检测到约 220Hz', () => {
    const buffer = generateSineWave(220, sampleRate, 0.1)
    const pitch = detectPitchYIN(buffer, sampleRate)
    expect(pitch).toBeGreaterThan(215)
    expect(pitch).toBeLessThan(225)
  })

  it('静音信号应返回 0', () => {
    const buffer = new Float32Array(4410)
    buffer.fill(0)
    const pitch = detectPitchYIN(buffer, sampleRate)
    expect(pitch).toBe(0)
  })

  it('threshold 参数应影响检测结果', () => {
    const buffer = generateSineWave(440, sampleRate, 0.1)
    // 使用非常小的阈值（更严格）
    const pitchStrict = detectPitchYIN(buffer, sampleRate, 0.01)
    // 使用较大的阈值（更宽松）
    const pitchLoose = detectPitchYIN(buffer, sampleRate, 0.5)
    // 两种阈值都应该能检测到音高（纯正弦波信号质量高）
    expect(pitchStrict).toBeGreaterThan(0)
    expect(pitchLoose).toBeGreaterThan(0)
  })

  it('330Hz 正弦波应检测到约 330Hz', () => {
    const buffer = generateSineWave(330, sampleRate, 0.1)
    const pitch = detectPitchYIN(buffer, sampleRate)
    expect(pitch).toBeGreaterThan(325)
    expect(pitch).toBeLessThan(335)
  })

  it('高频 1500Hz 正弦波应检测到约 1500Hz', () => {
    const buffer = generateSineWave(1500, sampleRate, 0.1)
    const pitch = detectPitchYIN(buffer, sampleRate)
    expect(pitch).toBeGreaterThan(1490)
    expect(pitch).toBeLessThan(1510)
  })
})

// ===== frequencyToNote 测试 =====

describe('frequencyToNote - 频率转音符', () => {
  it('440Hz 应转为 A4, 0 cents', () => {
    const result = frequencyToNote(440)
    expect(result).not.toBeNull()
    expect(result.note).toBe('A')
    expect(result.octave).toBe(4)
    expect(result.cents).toBe(0)
  })

  it('261.63Hz 应转为 C4', () => {
    const result = frequencyToNote(261.63)
    expect(result).not.toBeNull()
    expect(result.note).toBe('C')
    expect(result.octave).toBe(4)
  })

  it('880Hz 应转为 A5', () => {
    const result = frequencyToNote(880)
    expect(result).not.toBeNull()
    expect(result.note).toBe('A')
    expect(result.octave).toBe(5)
    expect(result.cents).toBe(0)
  })

  it('0Hz 应返回 null', () => {
    expect(frequencyToNote(0)).toBeNull()
  })

  it('负频率应返回 null', () => {
    expect(frequencyToNote(-100)).toBeNull()
  })

  it('220Hz 应转为 A3', () => {
    const result = frequencyToNote(220)
    expect(result).not.toBeNull()
    expect(result.note).toBe('A')
    expect(result.octave).toBe(3)
  })

  it('329.63Hz 应转为 E4', () => {
    const result = frequencyToNote(329.63)
    expect(result).not.toBeNull()
    expect(result.note).toBe('E')
    expect(result.octave).toBe(4)
  })

  it('结果应包含 frequency 字段', () => {
    const result = frequencyToNote(440)
    expect(result.frequency).toBe(440)
  })

  it('自定义 A4 参考频率应正确工作', () => {
    // 如果 A4=442Hz，那么 442Hz 应该是 A4, 0 cents
    const result = frequencyToNote(442, 442)
    expect(result.note).toBe('A')
    expect(result.octave).toBe(4)
    expect(result.cents).toBe(0)
  })

  it('偏离标准音高应显示 cents 偏差', () => {
    // 略高于 440Hz 的频率
    const result = frequencyToNote(445)
    expect(result).not.toBeNull()
    expect(result.note).toBe('A')
    expect(result.cents).toBeGreaterThan(0)
  })
})

// ===== calculateRMS 测试 =====

describe('calculateRMS - RMS 电平计算', () => {
  it('全 0 信号应返回 0', () => {
    const buffer = new Float32Array(100)
    buffer.fill(0)
    expect(calculateRMS(buffer)).toBe(0)
  })

  it('全 1 信号应返回 1', () => {
    const buffer = new Float32Array(100)
    buffer.fill(1)
    expect(calculateRMS(buffer)).toBeCloseTo(1, 5)
  })

  it('全 -1 信号应返回 1', () => {
    const buffer = new Float32Array(100)
    buffer.fill(-1)
    expect(calculateRMS(buffer)).toBeCloseTo(1, 5)
  })

  it('纯正弦波的 RMS 应约为 1/sqrt(2) ≈ 0.707', () => {
    const buffer = generateSineWave(440, 44100, 1)
    const rms = calculateRMS(buffer)
    expect(rms).toBeCloseTo(1 / Math.sqrt(2), 1)
  })

  it('已知信号的 RMS 应正确计算', () => {
    // [1, -1, 1, -1] -> RMS = sqrt((1+1+1+1)/4) = 1
    const buffer = new Float32Array([1, -1, 1, -1])
    expect(calculateRMS(buffer)).toBeCloseTo(1, 5)
  })

  it('缩放信号的 RMS 应等比例缩放', () => {
    const buffer1 = generateSineWave(440, 44100, 0.1)
    const buffer2 = new Float32Array(buffer1.length)
    for (let i = 0; i < buffer1.length; i++) {
      buffer2[i] = buffer1[i] * 0.5
    }
    const rms1 = calculateRMS(buffer1)
    const rms2 = calculateRMS(buffer2)
    expect(rms2).toBeCloseTo(rms1 * 0.5, 2)
  })
})

// ===== calculatePeak 测试 =====

describe('calculatePeak - 峰值电平计算', () => {
  it('全 0 信号应返回 0', () => {
    const buffer = new Float32Array(100)
    buffer.fill(0)
    expect(calculatePeak(buffer)).toBe(0)
  })

  it('已知峰值应正确检测', () => {
    const buffer = new Float32Array([0.1, 0.5, -0.8, 0.3, 0.2])
    expect(calculatePeak(buffer)).toBeCloseTo(0.8, 5)
  })

  it('正弦波峰值应约为 1.0', () => {
    const buffer = generateSineWave(440, 44100, 0.1)
    const peak = calculatePeak(buffer)
    expect(peak).toBeCloseTo(1.0, 1)
  })

  it('负值的绝对值也应被考虑', () => {
    const buffer = new Float32Array([0.1, 0.2, -0.9, 0.3])
    expect(calculatePeak(buffer)).toBeCloseTo(0.9, 5)
  })

  it('全为负值时应返回最大绝对值', () => {
    const buffer = new Float32Array([-0.1, -0.5, -0.3])
    expect(calculatePeak(buffer)).toBeCloseTo(0.5, 5)
  })
})

// ===== levelToDb 测试 =====

describe('levelToDb - 线性电平转分贝', () => {
  it('1.0 应返回 0 dB', () => {
    expect(levelToDb(1.0)).toBeCloseTo(0, 5)
  })

  it('0.5 应返回约 -6 dB', () => {
    const result = levelToDb(0.5)
    expect(result).toBeCloseTo(-6.02, 1)
  })

  it('0 应返回 -Infinity', () => {
    expect(levelToDb(0)).toBe(-Infinity)
  })

  it('负值应返回 -Infinity', () => {
    expect(levelToDb(-1)).toBe(-Infinity)
  })

  it('0.1 应返回 -20 dB', () => {
    expect(levelToDb(0.1)).toBeCloseTo(-20, 1)
  })

  it('0.01 应返回 -40 dB', () => {
    expect(levelToDb(0.01)).toBeCloseTo(-40, 1)
  })

  it('2.0 应返回约 6 dB', () => {
    expect(levelToDb(2.0)).toBeCloseTo(6.02, 1)
  })
})

// ===== calculateTHD 测试 =====

describe('calculateTHD - 总谐波失真', () => {
  it('纯正弦波（只有基频）应 THD ≈ 0', () => {
    const frequencyStep = 10
    const data = new Uint8Array(256)
    data.fill(0)
    // 只在基频 bin 有信号
    const fundamentalFreq = 440
    const fundamentalBin = Math.round(fundamentalFreq / frequencyStep)
    data[fundamentalBin] = 200
    const thd = calculateTHD(data, frequencyStep, fundamentalFreq)
    expect(thd).toBeCloseTo(0, 0)
  })

  it('有谐波的信号应 THD > 0', () => {
    const frequencyStep = 10
    const data = new Uint8Array(1024)
    data.fill(0)
    const fundamentalFreq = 100
    const fundamentalBin = Math.round(fundamentalFreq / frequencyStep)
    data[fundamentalBin] = 200 // 基频
    // 添加谐波
    data[Math.round((200) / frequencyStep)] = 100 // 二次谐波
    data[Math.round((300) / frequencyStep)] = 50 // 三次谐波

    const thd = calculateTHD(data, frequencyStep, fundamentalFreq)
    expect(thd).toBeGreaterThan(0)
  })

  it('fundamentalFreq <= 0 应返回 0', () => {
    const data = new Uint8Array(256)
    data.fill(100)
    expect(calculateTHD(data, 10, 0)).toBe(0)
    expect(calculateTHD(data, 10, -100)).toBe(0)
  })

  it('基频幅度为 0 时应返回 0', () => {
    const data = new Uint8Array(256)
    data.fill(0)
    expect(calculateTHD(data, 10, 440)).toBe(0)
  })

  it('基频超出数据范围应返回 0', () => {
    const data = new Uint8Array(256)
    data.fill(100)
    // frequencyStep=10, data.length=256, 所以最大频率=2550
    expect(calculateTHD(data, 10, 3000)).toBe(0)
  })

  it('THD 应不超过 100%', () => {
    const frequencyStep = 10
    const data = new Uint8Array(1024)
    data.fill(0)
    const fundamentalFreq = 100
    const fundamentalBin = Math.round(fundamentalFreq / frequencyStep)
    data[fundamentalBin] = 10 // 很小的基频
    // 大量强谐波
    for (let h = 2; h <= 10; h++) {
      const bin = Math.round((fundamentalFreq * h) / frequencyStep)
      if (bin < data.length) {
        data[bin] = 255
      }
    }
    const thd = calculateTHD(data, frequencyStep, fundamentalFreq)
    expect(thd).toBeLessThanOrEqual(100)
  })
})

// ===== WindowType 常量测试 =====

describe('WindowType - 窗函数类型枚举', () => {
  it('应包含所有预期的窗函数类型', () => {
    expect(WindowType.RECTANGULAR).toBe('rectangular')
    expect(WindowType.HAMMING).toBe('hamming')
    expect(WindowType.HANNING).toBe('hanning')
    expect(WindowType.BLACKMAN).toBe('blackman')
    expect(WindowType.KAISER).toBe('kaiser')
  })
})
