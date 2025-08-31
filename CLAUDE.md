# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a sound wave visualization playground that displays audio waveforms in both time and frequency domains using Web Audio API and Canvas. The project consists of two main interactive demos:

1. **Main Demo** (`index.html`) - Interactive oscillator-based sound generator with real-time visualization
2. **Microphone Demo** (`MIC.html`) - Real-time microphone input analysis and visualization

## Architecture

### Core Components

- **`output.js`** - Main application logic for the oscillator-based demo
  - Audio context initialization and management
  - Multiple oscillator setup (5 oscillators + white noise)
  - Real-time time-domain and frequency-domain visualization
  - DOM controls for frequency, volume, and waveform selection

- **`analyze.js`** - Microphone-based audio analysis
  - Microphone input capture via getUserMedia
  - PCM audio data processing
  - Simple time-domain visualization

- **`tools.js`** - Utility functions
  - Mathematical helpers (linear functions, coordinate transformations)
  - Time decomposition utilities
  - Canvas drawing helpers

### Audio Pipeline

The main application (`output.js`) implements this audio graph:
```
Oscillators (×5) → Volume Gains → Switch Gains → Master Gain → [Analyser + Destination]
White Noise → Noise Volume → Noise Enable → Master Gain
```

### Canvas Architecture

- **Time Domain Canvas** (`main`) - Displays real-time audio waveform with configurable drawing modes (points, lines, continuous wave)
- **Frequency Domain Canvas** (`sub`) - Shows FFT analysis as vertical bars with frequency scale
- Canvas rendering uses device pixel ratio scaling for crisp display

## Development Notes

### Audio Context Initialization
- Uses both `AudioContext` and `webkitAudioContext` for cross-browser compatibility
- Requires user interaction for initialization (click handlers)
- Handles suspended audio context states properly

### Canvas Rendering
- All canvases use device pixel ratio scaling for high-DPI displays
- Time-domain visualization supports three drawing modes: sampling points, filled areas, and continuous waves
- Frequency analysis uses configurable FFT sizes (256-16384 samples)

### Browser Compatibility
- Includes fallbacks for webkit-prefixed audio APIs
- Uses both standard and webkit getUserMedia APIs
- No build process - runs directly in browsers

## File Structure

- `index.html` - Main oscillator demo
- `MIC.html` - Microphone analysis demo  
- `output.js` - Primary application logic
- `analyze.js` - Microphone capture and analysis
- `tools.js` - Utility functions
- `jquery3.4.1.min.js` / `lodash.min.js` - External dependencies

## Running the Project

This is a static web application with no build process. Simply open the HTML files in a web browser:

- Open `index.html` for the main oscillator demo
- Open `MIC.html` for microphone analysis
- Requires HTTPS or localhost for microphone access

Both demos require user interaction (clicking) to initialize the audio context due to browser autoplay policies.