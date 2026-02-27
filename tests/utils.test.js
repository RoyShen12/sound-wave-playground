import { describe, it, expect } from 'vitest'
import {
  linearFunction,
  polarToCartesian,
  formatFrequency,
  dbToNormalized,
  clamp
} from '../src/utils.js'

// ===== linearFunction 测试 =====

describe('linearFunction - 线性函数生成', () => {
  it('y = 2x + 3 应正确计算', () => {
    const fn = linearFunction(2, 3)
    expect(fn(0)).toBe(3)
    expect(fn(1)).toBe(5)
    expect(fn(-1)).toBe(1)
    expect(fn(10)).toBe(23)
  })

  it('y = 0x + 5 应始终返回 5（常数函数）', () => {
    const fn = linearFunction(0, 5)
    expect(fn(0)).toBe(5)
    expect(fn(100)).toBe(5)
    expect(fn(-100)).toBe(5)
  })

  it('y = x + 0 应返回 x 本身（恒等函数）', () => {
    const fn = linearFunction(1, 0)
    expect(fn(42)).toBe(42)
    expect(fn(-7)).toBe(-7)
  })

  it('负斜率应正确工作', () => {
    const fn = linearFunction(-3, 10)
    expect(fn(0)).toBe(10)
    expect(fn(1)).toBe(7)
    expect(fn(2)).toBe(4)
  })

  it('小数参数应正确工作', () => {
    const fn = linearFunction(0.5, 0.1)
    expect(fn(2)).toBeCloseTo(1.1, 5)
    expect(fn(4)).toBeCloseTo(2.1, 5)
  })
})

// ===== polarToCartesian 测试 =====

describe('polarToCartesian - 极坐标转笛卡尔坐标', () => {
  it('角度 0, 长度 10 应向右移动', () => {
    const [x, y] = polarToCartesian(0, 0, 0, 10)
    expect(x).toBeCloseTo(10, 5)
    expect(y).toBeCloseTo(0, 5)
  })

  it('角度 PI/2, 长度 10 应向上移动 (Canvas y 轴翻转)', () => {
    const [x, y] = polarToCartesian(0, 0, Math.PI / 2, 10)
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(-10, 5) // Canvas 中 y 轴向下
  })

  it('角度 PI, 长度 10 应向左移动', () => {
    const [x, y] = polarToCartesian(0, 0, Math.PI, 10)
    expect(x).toBeCloseTo(-10, 5)
    expect(y).toBeCloseTo(0, 4)
  })

  it('从非原点出发应正确偏移', () => {
    const [x, y] = polarToCartesian(100, 200, 0, 50)
    expect(x).toBeCloseTo(150, 5)
    expect(y).toBeCloseTo(200, 5)
  })

  it('长度为 0 应返回起点', () => {
    const [x, y] = polarToCartesian(50, 75, Math.PI / 4, 0)
    expect(x).toBeCloseTo(50, 5)
    expect(y).toBeCloseTo(75, 5)
  })

  it('45 度角应正确计算', () => {
    const [x, y] = polarToCartesian(0, 0, Math.PI / 4, Math.sqrt(2))
    expect(x).toBeCloseTo(1, 4)
    expect(y).toBeCloseTo(-1, 4)
  })
})

// ===== formatFrequency 测试 =====

describe('formatFrequency - 频率格式化', () => {
  it('低于 1000Hz 应以 Hz 为单位', () => {
    expect(formatFrequency(440)).toBe('440Hz')
    expect(formatFrequency(100)).toBe('100Hz')
  })

  it('1000Hz 及以上应以 kHz 为单位', () => {
    expect(formatFrequency(1000)).toBe('1kHz')
    expect(formatFrequency(2000)).toBe('2kHz')
    expect(formatFrequency(20000)).toBe('20kHz')
  })

  it('非整数 kHz 应保留一位小数', () => {
    expect(formatFrequency(1500)).toBe('1.5kHz')
    expect(formatFrequency(2500)).toBe('2.5kHz')
  })

  it('低于 1000Hz 的非整数应保留一位小数', () => {
    expect(formatFrequency(440.5)).toBe('440.5Hz')
  })

  it('非常小的频率应正确处理', () => {
    expect(formatFrequency(0)).toBe('0Hz')
    expect(formatFrequency(1)).toBe('1Hz')
  })

  it('kHz 范围的值应正确四舍五入', () => {
    // 1234Hz -> round(1234/100)/10 = round(12.34)/10 = 12/10 = 1.2kHz
    expect(formatFrequency(1234)).toBe('1.2kHz')
    // 1250Hz -> round(1250/100)/10 = round(12.5)/10 = 13/10 = 1.3kHz
    expect(formatFrequency(1250)).toBe('1.3kHz')
  })
})

// ===== dbToNormalized 测试 =====

describe('dbToNormalized - 分贝归一化', () => {
  it('minDb 应映射到 0', () => {
    expect(dbToNormalized(-90, -90, -10)).toBe(0)
  })

  it('maxDb 应映射到 1', () => {
    expect(dbToNormalized(-10, -90, -10)).toBe(1)
  })

  it('中间值应线性映射', () => {
    expect(dbToNormalized(-50, -90, -10)).toBeCloseTo(0.5, 5)
  })

  it('低于 minDb 应被裁剪到 0', () => {
    expect(dbToNormalized(-100, -90, -10)).toBe(0)
    expect(dbToNormalized(-200, -90, -10)).toBe(0)
  })

  it('高于 maxDb 应被裁剪到 1', () => {
    expect(dbToNormalized(0, -90, -10)).toBe(1)
    expect(dbToNormalized(100, -90, -10)).toBe(1)
  })

  it('自定义范围应正确工作', () => {
    expect(dbToNormalized(-60, -120, 0)).toBeCloseTo(0.5, 5)
    expect(dbToNormalized(-120, -120, 0)).toBe(0)
    expect(dbToNormalized(0, -120, 0)).toBe(1)
  })

  it('默认参数应正确工作', () => {
    // 默认 minDb=-90, maxDb=-10
    expect(dbToNormalized(-90)).toBe(0)
    expect(dbToNormalized(-10)).toBe(1)
  })
})

// ===== clamp 测试 =====

describe('clamp - 数值范围限制', () => {
  it('值在范围内应返回原值', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it('值低于最小值应返回最小值', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(-100, -50, 50)).toBe(-50)
  })

  it('值高于最大值应返回最大值', () => {
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(100, -50, 50)).toBe(50)
  })

  it('min == max 时应总是返回该值', () => {
    expect(clamp(0, 5, 5)).toBe(5)
    expect(clamp(10, 5, 5)).toBe(5)
    expect(clamp(-10, 5, 5)).toBe(5)
  })

  it('浮点数应正确工作', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(-0.1, 0, 1)).toBe(0)
    expect(clamp(1.5, 0, 1)).toBe(1)
  })

  it('负范围应正确工作', () => {
    expect(clamp(-5, -10, -1)).toBe(-5)
    expect(clamp(0, -10, -1)).toBe(-1)
    expect(clamp(-15, -10, -1)).toBe(-10)
  })
})
