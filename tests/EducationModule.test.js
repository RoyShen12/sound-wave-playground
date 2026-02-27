import { describe, it, expect } from 'vitest'
import { PRESET_SCENES } from '../src/EducationModule.js'

// ===== PRESET_SCENES 结构完整性测试 =====

describe('PRESET_SCENES - 预设场景库', () => {
  it('应包含至少一个场景', () => {
    expect(PRESET_SCENES.length).toBeGreaterThan(0)
  })

  it('每个场景应有 id 字段', () => {
    for (const scene of PRESET_SCENES) {
      expect(scene).toHaveProperty('id')
      expect(typeof scene.id).toBe('string')
      expect(scene.id.length).toBeGreaterThan(0)
    }
  })

  it('每个场景应有 name 字段', () => {
    for (const scene of PRESET_SCENES) {
      expect(scene).toHaveProperty('name')
      expect(typeof scene.name).toBe('string')
      expect(scene.name.length).toBeGreaterThan(0)
    }
  })

  it('每个场景应有 description 字段', () => {
    for (const scene of PRESET_SCENES) {
      expect(scene).toHaveProperty('description')
      expect(typeof scene.description).toBe('string')
      expect(scene.description.length).toBeGreaterThan(0)
    }
  })

  it('每个场景应有 config 字段', () => {
    for (const scene of PRESET_SCENES) {
      expect(scene).toHaveProperty('config')
      expect(typeof scene.config).toBe('object')
      expect(scene.config).not.toBeNull()
    }
  })

  it('每个 config 应有 oscillators 数组或 noise 配置', () => {
    for (const scene of PRESET_SCENES) {
      const config = scene.config
      // oscillators 应该是数组
      if (config.oscillators !== undefined) {
        expect(Array.isArray(config.oscillators)).toBe(true)
      }
      // 应该至少有 oscillators 或 noise
      const hasOscillators = config.oscillators && config.oscillators.length > 0
      const hasNoise = config.noise === true
      expect(hasOscillators || hasNoise).toBe(true)
    }
  })

  it('oscillators 中每个振荡器应有完整配置', () => {
    for (const scene of PRESET_SCENES) {
      const oscillators = scene.config.oscillators || []
      for (const osc of oscillators) {
        expect(osc).toHaveProperty('frequency')
        expect(typeof osc.frequency).toBe('number')
        expect(osc.frequency).toBeGreaterThan(0)

        expect(osc).toHaveProperty('type')
        expect(typeof osc.type).toBe('string')
        expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(osc.type)

        expect(osc).toHaveProperty('volume')
        expect(typeof osc.volume).toBe('number')
        expect(osc.volume).toBeGreaterThanOrEqual(0)
        expect(osc.volume).toBeLessThanOrEqual(1)

        expect(osc).toHaveProperty('enabled')
        expect(typeof osc.enabled).toBe('boolean')
      }
    }
  })

  it('场景 id 应唯一', () => {
    const ids = PRESET_SCENES.map(s => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('应包含基础正弦波 A4 场景', () => {
    const sine440 = PRESET_SCENES.find(s => s.id === 'sine440')
    expect(sine440).toBeDefined()
    expect(sine440.config.oscillators[0].frequency).toBe(440)
    expect(sine440.config.oscillators[0].type).toBe('sine')
  })

  it('应包含白噪声场景', () => {
    const whiteNoise = PRESET_SCENES.find(s => s.id === 'white_noise')
    expect(whiteNoise).toBeDefined()
    expect(whiteNoise.config.noise).toBe(true)
  })

  it('应包含和弦场景', () => {
    const chordMajor = PRESET_SCENES.find(s => s.id === 'chord_major')
    expect(chordMajor).toBeDefined()
    expect(chordMajor.config.oscillators.length).toBe(3)
  })

  it('应包含拍频场景', () => {
    const beat = PRESET_SCENES.find(s => s.id === 'beat_frequency')
    expect(beat).toBeDefined()
    expect(beat.config.oscillators.length).toBe(2)
    // 两个频率应该很接近
    const freq1 = beat.config.oscillators[0].frequency
    const freq2 = beat.config.oscillators[1].frequency
    expect(Math.abs(freq1 - freq2)).toBeLessThan(10)
  })
})
