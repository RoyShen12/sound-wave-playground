/**
 * AudioFileManager - 音频文件导入与录制管理器
 *
 * 提供音频文件的导入（MP3/WAV/OGG）、麦克风录制、WAV 导出等功能。
 */

export class AudioFileManager {
  /**
   * 创建 AudioFileManager 实例
   * @param {AudioContext} audioContext - 外部传入的 AudioContext 实例
   */
  constructor(audioContext) {
    /** @type {AudioContext} */
    this.audioContext = audioContext;

    /** @type {boolean} 是否正在录制 */
    this.isRecording = false;

    /** @type {MediaRecorder|null} 当前的 MediaRecorder 实例 */
    this.mediaRecorder = null;
  }

  /**
   * 导入音频文件（支持 MP3/WAV/OGG 格式）
   * 读取文件内容并解码为 AudioBuffer，同时创建对应的 AudioBufferSourceNode。
   *
   * @param {File} file - 用户选择或拖拽的音频文件
   * @returns {Promise<{source: AudioBufferSourceNode, buffer: AudioBuffer}>}
   * @throws {Error} 文件类型不支持或解码失败时抛出异常
   */
  async loadAudioFile(file) {
    // 校验文件类型
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/vorbis',
    ];

    // 同时通过扩展名做一层兜底判断
    const allowedExtensions = ['.mp3', '.wav', '.ogg'];
    const fileExtension = file.name
      .substring(file.name.lastIndexOf('.'))
      .toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      throw new Error(
        `不支持的音频格式：${file.type || fileExtension}。仅支持 MP3、WAV、OGG 格式。`
      );
    }

    // 将文件读取为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 使用 AudioContext 解码音频数据
    const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

    // 创建 AudioBufferSourceNode 并关联解码后的 buffer
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    return { source, buffer };
  }

  /**
   * 开始录制音频
   * 使用 MediaRecorder API 从给定的 MediaStream 中采集音频数据。
   *
   * @param {MediaStream} stream - 麦克风或其他音频来源的 MediaStream
   * @throws {Error} 如果已在录制中则抛出异常
   */
  startRecording(stream) {
    if (this.isRecording) {
      throw new Error('当前已在录制中，请先停止录制。');
    }

    // 存储录制的音频数据块
    this._recordedChunks = [];

    // 创建 MediaRecorder，优先使用 webm 格式采集（最终导出时会转为 WAV）
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    const options = mimeType ? { mimeType } : {};
    this.mediaRecorder = new MediaRecorder(stream, options);

    // 收集数据块
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this._recordedChunks.push(event.data);
      }
    };

    // 开始录制，每 100ms 产出一次数据
    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  /**
   * 停止录制
   * 停止 MediaRecorder 并将录制内容转为 WAV Blob 返回。
   *
   * @returns {Promise<Blob>} 录制完成后的 WAV 格式 Blob
   * @throws {Error} 如果当前未在录制则抛出异常
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('当前未在录制，无法停止。');
    }

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = async () => {
        try {
          // 将采集到的数据块合并为一个 Blob
          const rawBlob = new Blob(this._recordedChunks, {
            type: this.mediaRecorder.mimeType || 'audio/webm',
          });

          // 将录制的原始音频解码为 AudioBuffer，再重新编码为 WAV
          const arrayBuffer = await rawBlob.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

          // 合并所有声道的 PCM 数据（交错排列）
          const numChannels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          const length = audioBuffer.length;

          // 交错排列多声道数据
          const interleaved = new Float32Array(length * numChannels);
          for (let channel = 0; channel < numChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
              interleaved[i * numChannels + channel] = channelData[i];
            }
          }

          // 编码为 WAV 格式
          const wavBuffer = AudioFileManager.encodeWAV(interleaved, sampleRate, numChannels);
          const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

          // 清理状态
          this._recordedChunks = [];
          this.isRecording = false;
          this.mediaRecorder = null;

          resolve(wavBlob);
        } catch (error) {
          this.isRecording = false;
          this.mediaRecorder = null;
          this._recordedChunks = [];
          reject(new Error(`录制数据处理失败：${error.message}`));
        }
      };

      this.mediaRecorder.onerror = (event) => {
        this.isRecording = false;
        this.mediaRecorder = null;
        this._recordedChunks = [];
        reject(new Error(`录制出错：${event.error?.message || '未知错误'}`));
      };

      // 触发停止
      this.mediaRecorder.stop();
    });
  }

  /**
   * 将 AudioBuffer 导出为 WAV 文件并触发浏览器下载
   *
   * @param {AudioBuffer} audioBuffer - 要导出的 AudioBuffer
   * @param {string} filename - 下载文件名（如 "recording.wav"）
   */
  exportWAV(audioBuffer, filename) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // 交错排列多声道 PCM 数据
    const interleaved = new Float32Array(length * numChannels);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        interleaved[i * numChannels + channel] = channelData[i];
      }
    }

    // 编码为 WAV
    const wavBuffer = AudioFileManager.encodeWAV(interleaved, sampleRate, numChannels);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });

    // 创建临时下载链接并触发下载
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'audio_export.wav';
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();

    // 清理 DOM 与 Object URL
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  /**
   * 将 PCM 采样数据编码为 WAV 格式的 ArrayBuffer
   *
   * WAV 文件结构：
   *   RIFF 头 (12 字节) + fmt 子块 (24 字节) + data 子块 (8 字节 + 音频数据)
   *
   * @param {Float32Array} samples - 交错排列的 PCM 浮点采样数据（范围 -1.0 ~ 1.0）
   * @param {number} sampleRate - 采样率（如 44100、48000）
   * @param {number} numChannels - 声道数（1=单声道，2=立体声）
   * @returns {ArrayBuffer} 编码完成的 WAV 文件数据
   */
  static encodeWAV(samples, sampleRate, numChannels) {
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;

    // WAV 文件总大小 = 44 字节头部 + 音频数据
    const bufferSize = 44 + dataSize;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    let offset = 0;

    // ---------- RIFF 头部 ----------

    // "RIFF" 标识符
    writeString(view, offset, 'RIFF');
    offset += 4;

    // 文件总大小 - 8（不含 RIFF 标识和该字段本身）
    view.setUint32(offset, bufferSize - 8, true);
    offset += 4;

    // "WAVE" 格式标识
    writeString(view, offset, 'WAVE');
    offset += 4;

    // ---------- fmt 子块 ----------

    // "fmt " 子块标识
    writeString(view, offset, 'fmt ');
    offset += 4;

    // fmt 子块大小（PCM 固定为 16）
    view.setUint32(offset, 16, true);
    offset += 4;

    // 音频格式（PCM = 1）
    view.setUint16(offset, 1, true);
    offset += 2;

    // 声道数
    view.setUint16(offset, numChannels, true);
    offset += 2;

    // 采样率
    view.setUint32(offset, sampleRate, true);
    offset += 4;

    // 字节率 = 采样率 × 声道数 × 每样本字节数
    view.setUint32(offset, byteRate, true);
    offset += 4;

    // 块对齐 = 声道数 × 每样本字节数
    view.setUint16(offset, blockAlign, true);
    offset += 2;

    // 每样本位数
    view.setUint16(offset, bitsPerSample, true);
    offset += 2;

    // ---------- data 子块 ----------

    // "data" 子块标识
    writeString(view, offset, 'data');
    offset += 4;

    // 音频数据大小
    view.setUint32(offset, dataSize, true);
    offset += 4;

    // 写入 PCM 采样数据（Float32 → Int16）
    for (let i = 0; i < samples.length; i++) {
      // 将浮点值钳位到 [-1, 1] 范围后映射到 Int16 范围
      const clampedValue = Math.max(-1, Math.min(1, samples[i]));
      const intValue = clampedValue < 0
        ? clampedValue * 0x8000
        : clampedValue * 0x7FFF;
      view.setInt16(offset, intValue, true);
      offset += 2;
    }

    return buffer;
  }
}

/**
 * 向 DataView 中写入 ASCII 字符串（辅助函数，用于 WAV 编码）
 *
 * @param {DataView} view - 目标 DataView
 * @param {number} offset - 写入起始偏移量
 * @param {string} str - 要写入的 ASCII 字符串
 */
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * 为指定 DOM 元素设置拖拽上传功能
 *
 * 当用户将音频文件拖拽到目标元素上时，会阻止默认行为并调用回调函数。
 * 支持 MP3、WAV、OGG 格式的音频文件。
 *
 * @param {HTMLElement} element - 接收拖拽的 DOM 元素
 * @param {function(File): void} onFileLoaded - 文件拖入后的回调，参数为拖入的 File 对象
 */
export function setupDragDrop(element, onFileLoaded) {
  // 阻止默认拖拽行为，启用自定义拖放
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove('drag-over');

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    // 筛选出音频文件
    const allowedExtensions = ['.mp3', '.wav', '.ogg'];
    const audioFile = Array.from(files).find((file) => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      return file.type.startsWith('audio/') || allowedExtensions.includes(ext);
    });

    if (audioFile) {
      onFileLoaded(audioFile);
    } else {
      console.warn('拖入的文件不是支持的音频格式（MP3/WAV/OGG）。');
    }
  });
}
