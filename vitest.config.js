import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/DSPAnalyzer.js', 'src/utils.js'],
      exclude: [
        'src/main.js',
        'src/mic.js',
        'src/styles.css',
        'src/Visualizer.js',
        'src/Spectrogram.js',
        'src/RadialVisualizer.js',
        'src/AudioFileManager.js',
        'src/AudioEffects.js',
        'src/AdditiveSynthRenderer.js',
        'src/UIController.js',
        'src/FilterResponseRenderer.js',
        'src/AudioEngine.js',
        'src/DSPWorkerManager.js'
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80
      }
    }
  }
})
