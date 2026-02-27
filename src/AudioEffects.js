/**
 * AudioEffects.js
 * 音频效果与滤波器模块，提供滤波器链、动态压缩器、卷积混响等功能。
 * 同时导出加法合成器 AdditiveSynthesizer 类。
 * @module AudioEffects
 */

/**
 * 音频效果处理器
 * 提供滤波器链管理、动态压缩、卷积混响等音频效果功能。
 */
export class AudioEffects {
  /**
   * @param {AudioContext} audioContext - Web Audio API 的音频上下文
   */
  constructor(audioContext) {
    /** @type {AudioContext} */
    this.audioContext = audioContext;

    /** @type {Object|null} 当前滤波器链 */
    this.filterChain = null;

    /** @type {DynamicsCompressorNode|null} 动态压缩器节点 */
    this.compressor = null;

    /** @type {ConvolverNode|null} 卷积混响节点 */
    this.convolver = null;

    /** @type {Map<string, boolean>} 各滤波器的启用状态 */
    this.filterStates = new Map();
  }

  /**
   * 创建滤波器链
   * 按照 lowpass -> highpass -> bandpass -> notch 的顺序串联四个 BiquadFilterNode。
   * 每个滤波器默认处于旁通状态（通过增益节点控制）。
   * @returns {{ input: GainNode, output: GainNode, filters: { lowpass: BiquadFilterNode, highpass: BiquadFilterNode, bandpass: BiquadFilterNode, notch: BiquadFilterNode } }}
   */
  createFilterChain() {
    const ctx = this.audioContext;

    // 创建输入和输出增益节点
    const input = ctx.createGain();
    const output = ctx.createGain();

    // 创建四种类型的 BiquadFilter 节点
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 20000; // 默认截止频率设为最高，相当于不过滤
    lowpass.Q.value = 1;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 20; // 默认截止频率设为最低，相当于不过滤
    highpass.Q.value = 1;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;
    bandpass.Q.value = 1;

    const notch = ctx.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = 1000;
    notch.Q.value = 1;

    // 为每个滤波器创建旁通结构（干信号路径 + 湿信号路径）
    const filterNodes = { lowpass, highpass, bandpass, notch };
    const filterOrder = ['lowpass', 'highpass', 'bandpass', 'notch'];

    // 为每个滤波器创建启用/旁通控制用的增益节点
    const wetGains = {};  // 经过滤波器的信号路径
    const dryGains = {};  // 旁通信号路径
    const mergeGains = {}; // 合并节点

    for (const type of filterOrder) {
      wetGains[type] = ctx.createGain();
      dryGains[type] = ctx.createGain();
      mergeGains[type] = ctx.createGain();

      // 默认禁用滤波器：干信号增益为 1，湿信号增益为 0
      wetGains[type].gain.value = 0;
      dryGains[type].gain.value = 1;
      this.filterStates.set(type, false);
    }

    // 构建串联信号链：input -> [滤波器1旁通结构] -> [滤波器2旁通结构] -> ... -> output
    let previousNode = input;

    for (const type of filterOrder) {
      // 将前一个节点分别连接到湿信号路径和干信号路径
      previousNode.connect(wetGains[type]);
      previousNode.connect(dryGains[type]);

      // 湿信号经过滤波器处理
      wetGains[type].connect(filterNodes[type]);
      filterNodes[type].connect(mergeGains[type]);

      // 干信号直接旁通
      dryGains[type].connect(mergeGains[type]);

      // 合并节点成为下一级的输入
      previousNode = mergeGains[type];
    }

    // 最后一个合并节点连接到输出
    previousNode.connect(output);

    // 保存引用以便后续控制
    this.filterChain = {
      input,
      output,
      filters: filterNodes,
      _wetGains: wetGains,
      _dryGains: dryGains,
      _mergeGains: mergeGains,
    };

    return {
      input,
      output,
      filters: filterNodes,
    };
  }

  /**
   * 设置指定滤波器的参数
   * @param {'lowpass'|'highpass'|'bandpass'|'notch'} filterType - 滤波器类型
   * @param {number} frequency - 截止/中心频率 (Hz)
   * @param {number} q - Q 值（品质因数）
   * @param {number} gain - 增益 (dB)，仅对 peaking/lowshelf/highshelf 类型有效
   */
  setFilterParams(filterType, frequency, q, gain) {
    if (!this.filterChain) {
      console.warn('滤波器链尚未创建，请先调用 createFilterChain()');
      return;
    }

    const filter = this.filterChain.filters[filterType];
    if (!filter) {
      console.warn(`未知的滤波器类型: ${filterType}`);
      return;
    }

    // 使用 setValueAtTime 确保参数立即生效且不产生噪声
    const now = this.audioContext.currentTime;

    if (typeof frequency === 'number' && isFinite(frequency)) {
      filter.frequency.setValueAtTime(frequency, now);
    }

    if (typeof q === 'number' && isFinite(q)) {
      filter.Q.setValueAtTime(q, now);
    }

    if (typeof gain === 'number' && isFinite(gain)) {
      filter.gain.setValueAtTime(gain, now);
    }
  }

  /**
   * 启用或禁用指定滤波器
   * 通过控制干/湿信号路径的增益来实现滤波器的启用和旁通。
   * @param {'lowpass'|'highpass'|'bandpass'|'notch'} filterType - 滤波器类型
   * @param {boolean} enabled - 是否启用
   */
  enableFilter(filterType, enabled) {
    if (!this.filterChain) {
      console.warn('滤波器链尚未创建，请先调用 createFilterChain()');
      return;
    }

    const wetGain = this.filterChain._wetGains[filterType];
    const dryGain = this.filterChain._dryGains[filterType];

    if (!wetGain || !dryGain) {
      console.warn(`未知的滤波器类型: ${filterType}`);
      return;
    }

    const now = this.audioContext.currentTime;
    // 使用短时间淡入淡出避免切换时的咔嗒声
    const fadeTime = 0.02;

    if (enabled) {
      // 启用滤波器：湿信号增益渐变到 1，干信号增益渐变到 0
      wetGain.gain.linearRampToValueAtTime(1, now + fadeTime);
      dryGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    } else {
      // 禁用滤波器（旁通）：湿信号增益渐变到 0，干信号增益渐变到 1
      wetGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      dryGain.gain.linearRampToValueAtTime(1, now + fadeTime);
    }

    this.filterStates.set(filterType, enabled);
  }

  /**
   * 获取指定滤波器的频率响应数据
   * 可用于在 Canvas 上绘制滤波器的频率响应曲线。
   * @param {'lowpass'|'highpass'|'bandpass'|'notch'} filterType - 滤波器类型
   * @param {Float32Array} frequencyArray - 要查询的频率数组 (Hz)
   * @returns {{ magnitude: Float32Array, phase: Float32Array }} 幅度响应和相位响应
   */
  getFilterResponse(filterType, frequencyArray) {
    if (!this.filterChain) {
      console.warn('滤波器链尚未创建，请先调用 createFilterChain()');
      return { magnitude: new Float32Array(0), phase: new Float32Array(0) };
    }

    const filter = this.filterChain.filters[filterType];
    if (!filter) {
      console.warn(`未知的滤波器类型: ${filterType}`);
      return { magnitude: new Float32Array(0), phase: new Float32Array(0) };
    }

    const magnitude = new Float32Array(frequencyArray.length);
    const phase = new Float32Array(frequencyArray.length);

    // 调用 BiquadFilterNode 的 getFrequencyResponse 方法
    filter.getFrequencyResponse(frequencyArray, magnitude, phase);

    return { magnitude, phase };
  }

  /**
   * 创建动态压缩器节点
   * 动态压缩器用于减小音频信号的动态范围，防止削波失真。
   * @returns {DynamicsCompressorNode} 压缩器节点
   */
  createCompressor() {
    this.compressor = this.audioContext.createDynamicsCompressor();

    // 设置合理的默认参数
    this.compressor.threshold.value = -24;  // 压缩阈值 (dB)
    this.compressor.knee.value = 30;        // 拐点平滑度 (dB)
    this.compressor.ratio.value = 12;       // 压缩比
    this.compressor.attack.value = 0.003;   // 起始时间 (秒)
    this.compressor.release.value = 0.25;   // 释放时间 (秒)

    return this.compressor;
  }

  /**
   * 设置压缩器参数
   * @param {number} threshold - 压缩阈值 (dB)，信号超过此电平时开始压缩
   * @param {number} knee - 拐点平滑度 (dB)，控制压缩曲线在阈值附近的过渡
   * @param {number} ratio - 压缩比，例如 4 表示 4:1 压缩
   * @param {number} attack - 起始时间 (秒)，信号超过阈值后压缩器开始生效的速度
   * @param {number} release - 释放时间 (秒)，信号低于阈值后压缩器停止压缩的速度
   */
  setCompressorParams(threshold, knee, ratio, attack, release) {
    if (!this.compressor) {
      console.warn('压缩器尚未创建，请先调用 createCompressor()');
      return;
    }

    const now = this.audioContext.currentTime;

    if (typeof threshold === 'number' && isFinite(threshold)) {
      this.compressor.threshold.setValueAtTime(threshold, now);
    }

    if (typeof knee === 'number' && isFinite(knee)) {
      this.compressor.knee.setValueAtTime(knee, now);
    }

    if (typeof ratio === 'number' && isFinite(ratio)) {
      this.compressor.ratio.setValueAtTime(ratio, now);
    }

    if (typeof attack === 'number' && isFinite(attack)) {
      this.compressor.attack.setValueAtTime(attack, now);
    }

    if (typeof release === 'number' && isFinite(release)) {
      this.compressor.release.setValueAtTime(release, now);
    }
  }

  /**
   * 创建卷积混响节点
   * 卷积混响通过与脉冲响应（Impulse Response）进行卷积运算来模拟真实空间的混响效果。
   * @param {AudioBuffer} impulseResponseBuffer - 脉冲响应音频缓冲区
   * @returns {ConvolverNode} 卷积器节点
   */
  createConvolver(impulseResponseBuffer) {
    this.convolver = this.audioContext.createConvolver();

    if (impulseResponseBuffer) {
      this.convolver.buffer = impulseResponseBuffer;
    }

    // 默认开启归一化，防止卷积后音量过大
    this.convolver.normalize = true;

    return this.convolver;
  }

  /**
   * 销毁所有音频效果节点，断开所有连接并释放资源
   */
  destroy() {
    // 断开滤波器链中的所有节点
    if (this.filterChain) {
      const { input, output, filters, _wetGains, _dryGains, _mergeGains } = this.filterChain;

      // 断开输入输出节点
      try { input.disconnect(); } catch (_e) { /* 忽略已断开的节点 */ }
      try { output.disconnect(); } catch (_e) { /* 忽略已断开的节点 */ }

      // 断开所有滤波器及其控制增益节点
      for (const type of Object.keys(filters)) {
        try { filters[type].disconnect(); } catch (_e) { /* 忽略 */ }
        try { _wetGains[type].disconnect(); } catch (_e) { /* 忽略 */ }
        try { _dryGains[type].disconnect(); } catch (_e) { /* 忽略 */ }
        try { _mergeGains[type].disconnect(); } catch (_e) { /* 忽略 */ }
      }

      this.filterChain = null;
    }

    // 断开压缩器
    if (this.compressor) {
      try { this.compressor.disconnect(); } catch (_e) { /* 忽略 */ }
      this.compressor = null;
    }

    // 断开卷积混响
    if (this.convolver) {
      try { this.convolver.disconnect(); } catch (_e) { /* 忽略 */ }
      this.convolver = null;
    }

    // 清除滤波器状态
    this.filterStates.clear();
  }
}

/**
 * 加法合成器
 * 通过叠加多个正弦波谐波来合成复杂音色。
 * 每个谐波的频率是基频的整数倍，可独立控制幅度和相位。
 */
export class AdditiveSynthesizer {
  /**
   * @param {AudioContext} audioContext - Web Audio API 的音频上下文
   */
  constructor(audioContext) {
    /** @type {AudioContext} */
    this.audioContext = audioContext;

    /** @type {number} 基频 (Hz) */
    this.fundamentalFrequency = 440;

    /**
     * 谐波参数列表
     * @type {Array<{ amplitude: number, phase: number }>}
     */
    this.harmonics = [];

    /**
     * 振荡器节点列表，与谐波参数一一对应
     * @type {Array<OscillatorNode>}
     */
    this.oscillators = [];

    /**
     * 每个谐波对应的增益节点，用于控制幅度
     * @type {Array<GainNode>}
     */
    this.gainNodes = [];

    /** @type {GainNode} 主输出增益节点 */
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1;

    /** @type {boolean} 合成器是否正在运行 */
    this.isPlaying = false;
  }

  /**
   * 设置第 N 个谐波的幅度和相位
   * 谐波索引从 0 开始，第 0 个谐波为基频，第 1 个谐波为二次谐波，依此类推。
   * 如果索引超出当前谐波数量，中间的谐波将以默认值（幅度 0，相位 0）填充。
   * @param {number} index - 谐波索引（0 = 基频，1 = 二次谐波...）
   * @param {number} amplitude - 幅度 (0 ~ 1)
   * @param {number} phase - 相位 (弧度，0 ~ 2*PI)
   */
  setHarmonic(index, amplitude, phase) {
    // 如果索引超出范围，扩展谐波列表
    while (this.harmonics.length <= index) {
      this.harmonics.push({ amplitude: 0, phase: 0 });
    }

    this.harmonics[index] = { amplitude, phase };

    // 如果合成器正在运行，实时更新对应的振荡器参数
    if (this.isPlaying && index < this.oscillators.length) {
      this._updateOscillator(index);
    } else if (this.isPlaying && index >= this.oscillators.length) {
      // 需要创建新的振荡器来覆盖新增的谐波
      this._rebuildOscillators();
    }
  }

  /**
   * 设置基频
   * 所有谐波的频率将根据新的基频重新计算。
   * @param {number} freq - 基频 (Hz)
   */
  setFundamentalFrequency(freq) {
    this.fundamentalFrequency = freq;

    // 如果正在播放，更新所有振荡器的频率
    if (this.isPlaying) {
      const now = this.audioContext.currentTime;
      for (let i = 0; i < this.oscillators.length; i++) {
        const harmonicFreq = this.fundamentalFrequency * (i + 1);
        this.oscillators[i].frequency.setValueAtTime(harmonicFreq, now);
      }
    }
  }

  /**
   * 将合成器的输出连接到目标音频节点
   * @param {AudioNode} destination - 目标节点（如 AudioContext.destination 或其他处理节点）
   */
  connect(destination) {
    this.masterGain.connect(destination);
  }

  /**
   * 启动合成器，开始产生声音
   * 根据当前的谐波参数创建振荡器并开始播放。
   */
  start() {
    if (this.isPlaying) {
      console.warn('合成器已在运行中');
      return;
    }

    this.isPlaying = true;
    this._rebuildOscillators();
  }

  /**
   * 停止合成器，停止所有振荡器
   */
  stop() {
    if (!this.isPlaying) {
      return;
    }

    this.isPlaying = false;

    // 停止并断开所有振荡器
    for (const osc of this.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch (_e) {
        // 忽略已停止的振荡器
      }
    }

    // 断开所有增益节点
    for (const gain of this.gainNodes) {
      try {
        gain.disconnect();
      } catch (_e) {
        // 忽略
      }
    }

    this.oscillators = [];
    this.gainNodes = [];
  }

  /**
   * 获取当前所有谐波的参数列表
   * @returns {Array<{ index: number, frequency: number, amplitude: number, phase: number }>}
   */
  getHarmonics() {
    return this.harmonics.map((h, i) => ({
      index: i,
      frequency: this.fundamentalFrequency * (i + 1),
      amplitude: h.amplitude,
      phase: h.phase,
    }));
  }

  /**
   * 更新单个振荡器的参数（内部方法）
   * @param {number} index - 谐波索引
   * @private
   */
  _updateOscillator(index) {
    const harmonic = this.harmonics[index];
    const now = this.audioContext.currentTime;

    if (this.oscillators[index]) {
      // 更新频率
      const harmonicFreq = this.fundamentalFrequency * (index + 1);
      this.oscillators[index].frequency.setValueAtTime(harmonicFreq, now);
    }

    if (this.gainNodes[index]) {
      // 更新幅度，使用短时间渐变避免咔嗒声
      this.gainNodes[index].gain.linearRampToValueAtTime(harmonic.amplitude, now + 0.01);
    }

    // 注意：Web Audio API 的 OscillatorNode 不直接支持设置相位，
    // 相位通过 PeriodicWave 在重建振荡器时应用。
  }

  /**
   * 重建所有振荡器（内部方法）
   * 停止所有现有振荡器，根据当前谐波参数创建新的振荡器。
   * 使用 PeriodicWave 来精确控制每个谐波的相位。
   * @private
   */
  _rebuildOscillators() {
    // 先停止旧的振荡器
    for (const osc of this.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch (_e) {
        // 忽略
      }
    }
    for (const gain of this.gainNodes) {
      try {
        gain.disconnect();
      } catch (_e) {
        // 忽略
      }
    }

    this.oscillators = [];
    this.gainNodes = [];

    if (this.harmonics.length === 0) {
      return;
    }

    const now = this.audioContext.currentTime;

    // 为每个谐波创建独立的振荡器和增益节点
    for (let i = 0; i < this.harmonics.length; i++) {
      const harmonic = this.harmonics[i];
      const harmonicFreq = this.fundamentalFrequency * (i + 1);

      // 创建振荡器
      const oscillator = this.audioContext.createOscillator();

      // 使用 PeriodicWave 设置单个正弦波的相位
      // real 分量 = amplitude * cos(phase)，imag 分量 = amplitude * sin(phase)
      const real = new Float32Array(2);
      const imag = new Float32Array(2);
      real[0] = 0; // 直流分量
      imag[0] = 0;
      real[1] = Math.cos(harmonic.phase); // 基频的余弦分量
      imag[1] = Math.sin(harmonic.phase); // 基频的正弦分量

      const periodicWave = this.audioContext.createPeriodicWave(real, imag, {
        disableNormalization: true,
      });

      oscillator.setPeriodicWave(periodicWave);
      oscillator.frequency.setValueAtTime(harmonicFreq, now);

      // 创建增益节点控制幅度
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(harmonic.amplitude, now);

      // 连接信号链：振荡器 -> 增益 -> 主输出
      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);

      // 启动振荡器
      oscillator.start(now);

      this.oscillators.push(oscillator);
      this.gainNodes.push(gainNode);
    }
  }
}
