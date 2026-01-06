// Configuration and constants
module.exports = {
  PORT: process.env.PORT || 5005,
  SAMPLE_RATE: 16000,
  AUDIO_BUFFER_TIMEOUT: 600,  // Reduced from 1000ms for faster response
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
    // Enhanced human-like prompt
    prompt: `You are Luca, a friendly and helpful voice assistant with a warm personality. 

CONVERSATION STYLE:
- Talk like a real human friend, not a robot
- Use casual, natural language with contractions like "I'm", "you're", "let's"
- Be enthusiastic, empathetic, and relatable
- Show emotion: excitement, concern, humor when appropriate
- Vary your responses - don't sound scripted

RESPONSE RULES:
- Keep it brief: 1-2 sentences max (under 40 words)
- Speak naturally, as if talking to a friend
- Avoid formal language like "I apologize" or "I would be happy to"
- Use simple, everyday words
- Add verbal cues when natural: "Oh!", "Hmm", "Great!", "Got it!"

EXAMPLES:
❌ "I would be happy to assist you with that request."
✅ "Sure thing! I can help with that."

❌ "I apologize for the inconvenience."
✅ "Oops, my bad! Let me fix that."

Remember: You're a helpful friend, not a corporate assistant.`,

    // Random greetings - will be selected randomly
    greetings: [
      "Hey there! I'm Luca. What can I help you with?",
      "Hi! Luca here. How can I assist you today?",
      "Hello! I'm Luca, your voice assistant. What do you need?",
      "Hey! I'm Luca. Ready to help. What's up?",
      "Hi there! Luca at your service. How can I help?"
    ],

    // Natural voice model (Natalie is more conversational)
    model: 'en-US-natalie',
  },

  MAX_RESPONSE_LENGTH: 200,  // Reduced for quicker responses

  END_KEYWORDS: [
    'thank you', 'thanks', 'thankyou', 'ty',
    'goodbye', 'bye', 'see you', 'goodbye luca', 'bye luca',
    "that's all", 'thats all', 'that is all', 'done', 'finished'
  ],

  // Multiple ending messages for variety
  END_MESSAGES: [
    "Okay, see you later! Call me whenever you need help.",
    "Alright! Catch you later!",
    "Sure thing! Talk to you soon!",
    "Got it! Have a great day!",
    "Okay! I'll be here when you need me."
  ],

  // Multiple acknowledgment messages for variety
  ACK_MESSAGES: [
    "Hi! I'm listening. What can I help you with?",
    "Hey! What do you need?",
    "Yes? I'm all ears!",
    "Hello! How can I help?",
    "I'm here! What's up?"
  ],

  WAV_CONFIG: {
    channels: 1,
    bitsPerSample: 16,
  },

  LLM_CONFIG: {
    model: 'openai/gpt-4o',
    maxTokens: 80,  // Reduced for faster responses
  },

  TTS_CONFIG: {
    model: 'FALCON',
    format: 'WAV',
    timeout: 60000,
    // Natural voice settings
    speed: 1.15,  // Slightly faster, more natural
    style: 'conversational'  // Casual tone
  },

  TRANSCRIPTION_CONFIG: {
    languageCode: 'en',
    maxPolls: 120,
    pollInterval: 1000,
  },
};
