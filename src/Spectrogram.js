/**
 * Spectrogram.js - 实时频谱图（瀑布图）渲染器
 *
 * 将频域数据以时间-频率-幅度热力图的形式持续向下滚动展示，
 * 支持三种配色方案：热力图、灰度、彩虹。
 * 点击频谱图可显示对应位置的频率与幅度信息。
 * @module Spectrogram
 */

import { initHiDPICanvas, formatFrequency } from './utils.js';

export class SpectrogramRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - 用于绑定频谱图的 canvas 元素
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;

    // 渲染尺寸（逻辑像素）
    this.width = 0;
    this.height = 300;

    // 配色方案：'heatmap' | 'grayscale' | 'rainbow'
    this.colorScheme = 'heatmap';

    // 用于存储历史频谱行的离屏 canvas（瀑布滚动缓冲）
    // 优先使用 OffscreenCanvas 以获得更好的渲染性能
    this._offscreenCanvas = null;
    this._offscreenCtx = null;
    this._useOffscreen = false; // 标记是否使用了 OffscreenCanvas

    // 最近一帧的频域数据，用于点击查询
    this.lastFrequencyData = null;
    this.lastFrequencyStep = 0;

    // 提示浮层相关
    this.tooltip = null;
    this._onClick = null;

    // 深色主题背景色，与项目保持一致
    this.backgroundColor = '#1a1a2e';
  }

  /**
   * 初始化频谱图：设置 canvas 尺寸、创建离屏缓冲、绑定事件
   */
  init() {
    // 使用工具函数初始化高 DPI canvas，自适应容器宽度
    const containerWidth = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 700;
    this.ctx = initHiDPICanvas(this.canvas, containerWidth, this.height);
    this.width = containerWidth;

    // 创建离屏 canvas 作为瀑布滚动缓冲区
    // 优先使用 OffscreenCanvas（性能更优，不参与 DOM 布局计算），否则回退到普通 canvas
    const physicalW = this.canvas.width;   // 物理像素
    const physicalH = this.canvas.height;  // 物理像素

    if (typeof OffscreenCanvas !== 'undefined') {
      // 浏览器支持 OffscreenCanvas，使用它作为后缓冲区
      this._offscreenCanvas = new OffscreenCanvas(physicalW, physicalH);
      this._offscreenCtx = this._offscreenCanvas.getContext('2d');
      this._useOffscreen = true;
      console.info('[Spectrogram] 已启用 OffscreenCanvas 双缓冲优化');
    } else {
      // 回退方案：使用普通 canvas 元素作为后缓冲区
      this._offscreenCanvas = document.createElement('canvas');
      this._offscreenCanvas.width = physicalW;
      this._offscreenCanvas.height = physicalH;
      this._offscreenCtx = this._offscreenCanvas.getContext('2d');
      this._useOffscreen = false;
      console.info('[Spectrogram] OffscreenCanvas 不可用，使用普通 canvas 作为后缓冲');
    }

    // 初始填充背景色
    this._fillBackground(this.ctx);
    this._fillBackground(this._offscreenCtx);

    // 创建提示浮层元素
    this._createTooltip();

    // 绑定点击事件
    this._onClick = this._handleClick.bind(this);
    this.canvas.addEventListener('click', this._onClick);

    // 鼠标移出时隐藏提示
    this.canvas.addEventListener('mouseleave', () => {
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
    });
  }

  /**
   * 设置配色方案
   * @param {'heatmap' | 'grayscale' | 'rainbow'} scheme - 配色方案名称
   */
  setColorScheme(scheme) {
    const validSchemes = ['heatmap', 'grayscale', 'rainbow'];
    if (!validSchemes.includes(scheme)) {
      console.warn(`[Spectrogram] 未知配色方案 "${scheme}"，可选值: ${validSchemes.join(', ')}`);
      return;
    }
    this.colorScheme = scheme;
  }

  /**
   * 每帧更新频谱图，传入当前帧的频域数据
   * @param {Uint8Array} frequencyData - FFT 频域数据（0-255）
   * @param {number} frequencyStep - 每个频率 bin 对应的频率间隔（Hz）
   */
  update(frequencyData, frequencyStep) {
    if (!this.ctx || !this._offscreenCtx) return;

    // 保存当前帧数据，供点击查询使用
    this.lastFrequencyData = new Uint8Array(frequencyData);
    this.lastFrequencyStep = frequencyStep;

    const dpr = window.devicePixelRatio || 1;
    const physicalWidth = this.canvas.width;
    const physicalHeight = this.canvas.height;
    // 每次滚动的物理像素行数
    const scrollStep = Math.max(1, Math.round(1 * dpr));

    // --- 瀑布滚动：将缓冲区内容整体下移一行 ---
    // 先把当前缓冲区内容保存（在离屏 canvas 上操作，避免主 canvas 闪烁）
    this._offscreenCtx.drawImage(
      this._offscreenCanvas,
      0, 0, physicalWidth, physicalHeight,            // 源区域：整个缓冲
      0, scrollStep, physicalWidth, physicalHeight     // 目标区域：向下偏移
    );

    // --- 在缓冲区顶部绘制新的一行频谱数据 ---
    const binCount = frequencyData.length;
    const barWidth = physicalWidth / binCount;

    for (let i = 0; i < binCount; i++) {
      const value = frequencyData[i]; // 0-255
      const color = this._valueToColor(value);

      this._offscreenCtx.fillStyle = color;
      this._offscreenCtx.fillRect(
        Math.floor(i * barWidth),
        0,
        Math.ceil(barWidth) + 1, // +1 避免间隙
        scrollStep
      );
    }

    // --- 将离屏缓冲区一次性绘制到主 canvas（减少主 canvas 操作次数） ---
    this.ctx.drawImage(this._offscreenCanvas, 0, 0);
  }

  /**
   * 销毁实例，清理事件监听和 DOM 元素
   */
  destroy() {
    // 移除点击事件
    if (this._onClick) {
      this.canvas.removeEventListener('click', this._onClick);
      this._onClick = null;
    }

    // 移除提示浮层
    if (this.tooltip && this.tooltip.parentElement) {
      this.tooltip.parentElement.removeChild(this.tooltip);
      this.tooltip = null;
    }

    // 清理离屏缓冲区
    this._offscreenCanvas = null;
    this._offscreenCtx = null;
    this._useOffscreen = false;

    // 清理引用
    this.lastFrequencyData = null;
    this.ctx = null;
  }

  // ========================
  //  私有方法
  // ========================

  /**
   * 将幅度值（0-255）映射为颜色字符串，根据当前配色方案
   * @param {number} value - 幅度值，范围 0-255
   * @returns {string} CSS 颜色字符串
   */
  _valueToColor(value) {
    // 归一化到 0-1
    const normalized = value / 255;

    switch (this.colorScheme) {
      case 'heatmap':
        return this._heatmapColor(normalized);
      case 'grayscale':
        return this._grayscaleColor(normalized);
      case 'rainbow':
        return this._rainbowColor(normalized);
      default:
        return this._heatmapColor(normalized);
    }
  }

  /**
   * 热力图配色：黑 -> 蓝 -> 青 -> 绿 -> 黄 -> 红 -> 白
   * @param {number} t - 归一化值 0-1
   * @returns {string} CSS 颜色
   */
  _heatmapColor(t) {
    let r, g, b;

    if (t < 0.15) {
      // 黑 -> 深蓝
      const s = t / 0.15;
      r = 0;
      g = 0;
      b = Math.round(s * 120);
    } else if (t < 0.35) {
      // 深蓝 -> 青
      const s = (t - 0.15) / 0.2;
      r = 0;
      g = Math.round(s * 200);
      b = 120 + Math.round(s * 55);
    } else if (t < 0.55) {
      // 青 -> 绿
      const s = (t - 0.35) / 0.2;
      r = 0;
      g = 200 + Math.round(s * 55);
      b = 175 - Math.round(s * 175);
    } else if (t < 0.75) {
      // 绿 -> 黄
      const s = (t - 0.55) / 0.2;
      r = Math.round(s * 255);
      g = 255;
      b = 0;
    } else if (t < 0.9) {
      // 黄 -> 红
      const s = (t - 0.75) / 0.15;
      r = 255;
      g = 255 - Math.round(s * 255);
      b = 0;
    } else {
      // 红 -> 白
      const s = (t - 0.9) / 0.1;
      r = 255;
      g = Math.round(s * 255);
      b = Math.round(s * 255);
    }

    return `rgb(${r},${g},${b})`;
  }

  /**
   * 灰度配色：从深色背景黑色到白色
   * @param {number} t - 归一化值 0-1
   * @returns {string} CSS 颜色
   */
  _grayscaleColor(t) {
    // 使用 gamma 校正使低幅度区域更暗，增强对比度
    const gamma = 1.5;
    const corrected = Math.pow(t, gamma);
    const level = Math.round(corrected * 255);
    return `rgb(${level},${level},${level})`;
  }

  /**
   * 彩虹配色：使用 HSL 色相环从紫色到红色
   * @param {number} t - 归一化值 0-1
   * @returns {string} CSS 颜色
   */
  _rainbowColor(t) {
    if (t < 0.05) {
      // 极低幅度显示为背景色附近的深色
      const brightness = Math.round(t / 0.05 * 15);
      return `rgb(${brightness},${brightness},${brightness})`;
    }

    // 色相从 270（紫）经过蓝、青、绿、黄到 0（红）
    const hue = 270 - Math.round(t * 270);
    // 饱和度保持较高，亮度随幅度增加
    const saturation = 85 + Math.round(t * 15);
    const lightness = 15 + Math.round(t * 45);

    return `hsl(${hue},${saturation}%,${lightness}%)`;
  }

  /**
   * 填充背景色
   * @param {CanvasRenderingContext2D} ctx - 画布上下文
   */
  _fillBackground(ctx) {
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * 创建悬浮提示 DOM 元素
   */
  _createTooltip() {
    this.tooltip = document.createElement('div');

    Object.assign(this.tooltip.style, {
      position: 'absolute',
      display: 'none',
      padding: '6px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: '#e0e0e0',
      fontSize: '13px',
      lineHeight: '1.5',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '1000',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    });

    // 将提示添加到 canvas 的父元素中，确保定位正确
    const parent = this.canvas.parentElement;
    if (parent) {
      // 确保父元素有定位上下文
      const parentPosition = window.getComputedStyle(parent).position;
      if (parentPosition === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(this.tooltip);
    } else {
      document.body.appendChild(this.tooltip);
    }
  }

  /**
   * 处理 canvas 点击事件，显示对应位置的频率和幅度信息
   * @param {MouseEvent} event - 鼠标点击事件
   */
  _handleClick(event) {
    if (!this.lastFrequencyData || !this.tooltip) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 根据点击的 x 坐标计算对应的频率 bin 索引
    const binCount = this.lastFrequencyData.length;
    const binIndex = Math.floor((x / this.width) * binCount);

    // 边界检查
    if (binIndex < 0 || binIndex >= binCount) return;

    // 计算频率（Hz）和幅度（dB 近似）
    const frequency = binIndex * this.lastFrequencyStep;
    const amplitude = this.lastFrequencyData[binIndex];
    // 将 0-255 映射到大致的 dB 范围（-100dB 到 0dB）
    const amplitudeDb = amplitude > 0
      ? ((amplitude / 255) * 100 - 100).toFixed(1)
      : '-Inf';

    // 格式化频率显示
    const frequencyText = formatFrequency(frequency);

    // 更新提示内容和位置
    this.tooltip.innerHTML = [
      `<span style="color:#4fc3f7">频率:</span> ${frequencyText}`,
      `<span style="color:#81c784">幅度:</span> ${amplitude} (${amplitudeDb} dB)`,
    ].join('<br>');

    // 计算提示位置，避免溢出画布
    const tooltipX = Math.min(x + 12, this.width - 160);
    const tooltipY = Math.max(y - 50, 4);

    this.tooltip.style.left = `${tooltipX}px`;
    this.tooltip.style.top = `${tooltipY}px`;
    this.tooltip.style.display = 'block';

    // 3 秒后自动隐藏
    clearTimeout(this._tooltipTimer);
    this._tooltipTimer = setTimeout(() => {
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
    }, 3000);
  }
}
