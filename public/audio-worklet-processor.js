/**
 * AudioWorklet 处理器
 * 替代废弃的 ScriptProcessorNode，在独立的音频线程中处理 PCM 数据
 */
class TimeDomainProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = []
    this._bufferSize = 4096
    this._port = this.port

    // 接收主线程配置消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'setBufferSize') {
        this._bufferSize = event.data.bufferSize
        this._buffer = []
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (input.length === 0) return true

    const channelData = input[0]
    if (!channelData) return true

    // 累积采样数据到缓冲区
    for (let i = 0; i < channelData.length; i++) {
      this._buffer.push(channelData[i])
    }

    // 当缓冲区满时，发送数据到主线程
    if (this._buffer.length >= this._bufferSize) {
      const data = new Float32Array(this._buffer.slice(0, this._bufferSize))
      this.port.postMessage({ type: 'audioData', buffer: data })
      this._buffer = this._buffer.slice(this._bufferSize)
    }

    return true
  }
}

registerProcessor('time-domain-processor', TimeDomainProcessor)
