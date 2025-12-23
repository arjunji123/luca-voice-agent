// Utility functions
const fs = require('fs');
const config = require('./config');

// Check if word is similar (handles speech recognition errors)
function isSimilarWord(text, target) {
  const patterns = [
    'lu[ck]+a[as]?',
    'l[u]+c[k]*a[as]?',
  ];
  return patterns.some(p => new RegExp(p, 'i').test(text));
}

// Remove bot name from text in all variations
function removeBotNameFromText(text, botName) {
  let cleaned = text;
  cleaned = cleaned.replace(/^(hey|hi|hello|hey there|hi there)\s+lu[ck]+a[as]?[,.]?\s*/i, '').trim();
  cleaned = cleaned.replace(/^lu[ck]+a[as]?[,.]?\s*/i, '').trim();
  cleaned = cleaned.replace(/[\s,.]lu[ck]+a[as]?[,.]?[\s]*/gi, ' ').trim();
  return cleaned;
}

// Create WAV header for audio buffer
function createWavHeader(audioBuffer) {
  const { channels, bitsPerSample } = config.WAV_CONFIG;
  const sampleRate = config.SAMPLE_RATE;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + audioBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(audioBuffer.length, 40);

  return Buffer.concat([wavHeader, audioBuffer]);
}

// Detect if audio chunk is silent
function isSilentChunk(chunk) {
  if (chunk.length === 0) return true;

  let sum = 0;
  for (let i = 0; i < chunk.length; i += 2) {
    const sample = chunk.readInt16LE(i);
    sum += Math.abs(sample);
  }

  const average = sum / (chunk.length / 2);
  return average < config.SILENCE_THRESHOLD;
}

// Generate fallback tone for TTS errors
function generateFallbackTone() {
  const sampleRate = config.SAMPLE_RATE;
  const duration = 1;
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const value = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0x7FFF;
    buffer.writeInt16LE(Math.floor(value), i * 2);
  }

  return buffer;
}

// Format message with variables
function formatMessage(template, variables = {}) {
  let message = template;
  Object.entries(variables).forEach(([key, value]) => {
    message = message.replace(`{${key}}`, value);
  });
  return message;
}

// Detect if text contains task keywords
function hasTaskKeyword(text) {
  const lowerText = text.toLowerCase();
  return config.TASK_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

module.exports = {
  isSimilarWord,
  removeBotNameFromText,
  createWavHeader,
  isSilentChunk,
  generateFallbackTone,
  formatMessage,
  hasTaskKeyword,
};
