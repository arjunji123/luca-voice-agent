// Configuration and constants
module.exports = {
  PORT: process.env.PORT || 5005,
  SAMPLE_RATE: 16000,
  AUDIO_BUFFER_TIMEOUT: 1000,
  MIN_AUDIO_FOR_PROCESSING: 16000,
  SILENCE_THRESHOLD: 50,
  
  API_KEYS: {
    ASSEMBLY_AI: process.env.ASSEMBLY_AI_KEY,
    OPENROUTER: process.env.OPENROUTER_API_KEY,
    MURF_AI: process.env.MURF_AI_KEY,
    ATTENDEE: process.env.ATTENDEE_API_KEY,
  },
  
  API_ENDPOINTS: {
    ASSEMBLY_AI_UPLOAD: 'https://api.assemblyai.com/v2/upload',
    ASSEMBLY_AI_TRANSCRIPT: 'https://api.assemblyai.com/v2/transcript',
    OPENROUTER: 'https://openrouter.ai/api/v1/chat/completions',
    MURF_AI: 'https://global.api.murf.ai/v1/speech/stream',
    ATTENDEE_API: process.env.ATTENDEE_API_BASE_URL || 'app.attendee.dev',
  },
  
  DEFAULT_AGENT_CONFIG: {
    botName: 'Luca',
    prompt: 'You are a helpful voice assistant. Provide complete answers in 2-4 sentences. Maximum 150 words.',
    greeting: "Hello! I'm your voice assistant. How can I help?",
    model: 'en-US-alina',
  },
  
  END_KEYWORDS: [
    'thank you', 'thanks', 'thankyou', 'ty',
    'goodbye', 'bye', 'see you', 'goodbye luca', 'bye luca',
    "that's all", 'thats all', 'that is all', 'done', 'finished'
  ],
  
  END_MESSAGE: 'Okay, see you later! Call me whenever you need help.',
  ACK_MESSAGE: "Hi! I'm listening. What can I help you with?",
  
  WAV_CONFIG: {
    channels: 1,
    bitsPerSample: 16,
  },
  
  LLM_CONFIG: {
    model: 'openai/gpt-4o',
    maxTokens: 200,
  },
  
  TTS_CONFIG: {
    model: 'FALCON',
    format: 'WAV',
    timeout: 60000,
  },
  
  TRANSCRIPTION_CONFIG: {
    languageCode: 'en',
    maxPolls: 120,
    pollInterval: 1000,
  },
};
