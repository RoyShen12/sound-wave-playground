import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        AudioWorkletNode: 'readonly',
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        Float32Array: 'readonly',
        Float64Array: 'readonly',
        Int16Array: 'readonly',
        Uint8Array: 'readonly',
        ArrayBuffer: 'readonly',
        DataView: 'readonly',
        Math: 'readonly',
        Infinity: 'readonly',
        HTMLCanvasElement: 'readonly',
        OffscreenCanvas: 'readonly',
        ResizeObserver: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        isFinite: 'readonly',
        Worker: 'readonly',
        Map: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.min.js', 'public/']
  }
]
