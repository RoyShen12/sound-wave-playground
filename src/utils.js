/**
 * 工具函数模块
 * 提供数学计算、Canvas 绘图等通用辅助函数
 */

/**
 * 创建线性函数 y = kx + b
 * @param {number} k - 斜率
 * @param {number} b - 截距
 * @returns {(x: number) => number}
 */
export function linearFunction(k, b) {
  return x => k * x + b
}

/**
 * 根据起点、角度和长度计算目标点坐标
 * @param {number} x - 起点 x 坐标
 * @param {number} y - 起点 y 坐标
 * @param {number} degree - 角度（弧度）
 * @param {number} length - 长度
 * @returns {[number, number]} 目标点坐标 [x, y]
 */
export function polarToCartesian(x, y, degree, length) {
  const dx = Math.cos(degree) * length
  const dy = Math.sin(degree) * length
  return [x + dx, y - dy]
}

/**
 * 将频率值格式化为可读字符串
 * @param {number} hz - 频率（Hz）
 * @returns {string} 格式化后的频率字符串
 */
export function formatFrequency(hz) {
  if (hz >= 1000) {
    return (Math.round(hz / 100) / 10) + 'kHz'
  }
  return Math.round(hz * 10) / 10 + 'Hz'
}

/**
 * 初始化高 DPI Canvas
 * @param {HTMLCanvasElement} canvas - Canvas 元素
 * @param {number} width - 逻辑宽度
 * @param {number} height - 逻辑高度
 * @returns {CanvasRenderingContext2D} Canvas 2D 上下文
 */
export function initHiDPICanvas(canvas, width, height) {
  const dpi = window.devicePixelRatio || 1
  canvas.width = width * dpi
  canvas.height = height * dpi
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpi, dpi)
  return ctx
}

/**
 * 将 dB 值映射到 0-1 范围
 * @param {number} db - 分贝值
 * @param {number} minDb - 最小分贝
 * @param {number} maxDb - 最大分贝
 * @returns {number} 0-1 范围的值
 */
export function dbToNormalized(db, minDb = -90, maxDb = -10) {
  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)))
}

/**
 * 限制数值在指定范围内
 * @param {number} value - 输入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
