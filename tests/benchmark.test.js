import { describe, it, expect } from 'vitest'
import {
  generateWindow,
  applyWindow,
  detectPitchYIN,
  detectPitchAutocorrelation,
  detectPeaks,
  calculateRMS,
  calculatePeak,
  calculateTHD,
  WindowType
} from '../src/DSPAnalyzer.js'

// 生成正弦波测试数据
function generateSineWave(frequency, sampleRate, length) {
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  return buffer
}

// 生成假的频域数据
function generateFrequencyData(length) {
  const data = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    data[i] = Math.floor(Math.random() * 256)
  }
  // 设置一些峰值
  data[Math.floor(length * 0.1)] = 200
  data[Math.floor(length * 0.2)] = 150
  return data
}

// 测量执行时间
function benchmark(fn, iterations = 100) {
  // 预热
  for (let i = 0; i < 10; i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const elapsed = performance.now() - start
  return {
    total: elapsed,
    average: elapsed / iterations,
    iterations
  }
}

describe('性能基准测试', () => {
  const sampleRate = 44100
  const fftSizes = [512, 1024, 2048, 4096, 8192]

  describe('窗函数生成性能', () => {
    for (const size of fftSizes) {
      it(`generateWindow (Hamming, ${size} 样本) 应在合理时间内完成`, () => {
        const result = benchmark(() => generateWindow(WindowType.HAMMING, size))
        console.log(`  Hamming ${size}: ${result.average.toFixed(3)}ms/次 (${result.iterations}次)`)
        expect(result.average).toBeLessThan(10) // 每次不超过 10ms
      })
    }
  })

  describe('窗函数应用性能', () => {
    for (const size of fftSizes) {
      it(`applyWindow (${size} 样本) 应在合理时间内完成`, () => {
        const signal = generateSineWave(440, sampleRate, size)
        const win = generateWindow(WindowType.HAMMING, size)
        const result = benchmark(() => applyWindow(signal, win))
        console.log(`  applyWindow ${size}: ${result.average.toFixed(3)}ms/次`)
        expect(result.average).toBeLessThan(10)
      })
    }
  })

  describe('YIN 音高检测性能', () => {
    for (const size of fftSizes) {
      it(`detectPitchYIN (${size} 样本) 应在合理时间内完成`, () => {
        const buffer = generateSineWave(440, sampleRate, size)
        const result = benchmark(() => detectPitchYIN(buffer, sampleRate), 50)
        console.log(`  YIN ${size}: ${result.average.toFixed(3)}ms/次 (${result.iterations}次)`)
        // YIN 是 O(n²)，允许较大 FFT 更长时间
        expect(result.average).toBeLessThan(size > 4096 ? 50 : 20)
      })
    }
  })

  describe('自相关法音高检测性能', () => {
    for (const size of fftSizes) {
      it(`detectPitchAutocorrelation (${size} 样本) 应在合理时间内完成`, () => {
        const buffer = generateSineWave(440, sampleRate, size)
        const result = benchmark(() => detectPitchAutocorrelation(buffer, sampleRate), 50)
        console.log(`  Autocorrelation ${size}: ${result.average.toFixed(3)}ms/次`)
        expect(result.average).toBeLessThan(size > 4096 ? 50 : 20)
      })
    }
  })

  describe('RMS/Peak 计算性能', () => {
    for (const size of fftSizes) {
      it(`calculateRMS + calculatePeak (${size} 样本) 应在合理时间内完成`, () => {
        const buffer = generateSineWave(440, sampleRate, size)
        const result = benchmark(() => {
          calculateRMS(buffer)
          calculatePeak(buffer)
        })
        console.log(`  RMS+Peak ${size}: ${result.average.toFixed(3)}ms/次`)
        expect(result.average).toBeLessThan(5)
      })
    }
  })

  describe('峰值检测性能', () => {
    for (const size of fftSizes) {
      it(`detectPeaks (${size / 2} bins) 应在合理时间内完成`, () => {
        const data = generateFrequencyData(size / 2)
        const frequencyStep = sampleRate / size
        const result = benchmark(() => detectPeaks(data, frequencyStep))
        console.log(`  Peaks ${size / 2} bins: ${result.average.toFixed(3)}ms/次`)
        expect(result.average).toBeLessThan(5)
      })
    }
  })

  describe('THD 计算性能', () => {
    for (const size of fftSizes) {
      it(`calculateTHD (${size / 2} bins) 应在合理时间内完成`, () => {
        const data = generateFrequencyData(size / 2)
        const frequencyStep = sampleRate / size
        const result = benchmark(() => calculateTHD(data, frequencyStep, 440))
        console.log(`  THD ${size / 2} bins: ${result.average.toFixed(3)}ms/次`)
        expect(result.average).toBeLessThan(5)
      })
    }
  })

  it('性能汇总 - 完整分析管线 (4096 样本)', () => {
    const bufferSize = 4096
    const buffer = generateSineWave(440, sampleRate, bufferSize)
    const frequencyData = generateFrequencyData(bufferSize / 2)
    const frequencyStep = sampleRate / bufferSize
    const win = generateWindow(WindowType.HAMMING, bufferSize)

    const result = benchmark(() => {
      applyWindow(buffer, win)
      calculateRMS(buffer)
      calculatePeak(buffer)
      detectPitchYIN(buffer, sampleRate)
      detectPeaks(frequencyData, frequencyStep)
      calculateTHD(frequencyData, frequencyStep, 440)
    }, 50)

    console.log(`\n  === 完整分析管线 (4096 样本) ===`)
    console.log(`  平均: ${result.average.toFixed(3)}ms/次`)
    console.log(`  帧预算 (60fps): 16.67ms`)
    console.log(`  帧预算占比: ${(result.average / 16.67 * 100).toFixed(1)}%`)
    console.log(`  帧预算 (30fps): 33.33ms`)
    console.log(`  帧预算占比: ${(result.average / 33.33 * 100).toFixed(1)}%\n`)

    // 完整管线应在一帧预算（30fps = 33ms）内完成
    expect(result.average).toBeLessThan(33)
  })
})
