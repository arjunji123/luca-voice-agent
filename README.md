# Voice Agent - Ready to Use

A minimal Node.js voice agent that connects to your browser or Google Meet calls and responds to your speech.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Edit `.env` with your API keys:
   - `ASSEMBLY_AI_KEY` - Speech-to-text
   - `OPENROUTER_API_KEY` - AI responses
   - `MURF_AI_KEY` - Text-to-speech
   - `ATTENDEE_API_KEY` - Meeting integration

3. **Start the server:**
   ```bash
   node index.js
   ```

4. **Test locally:**
   Open http://localhost:5005 in your browser

5. **Use with Google Meet:**
   - Start ngrok: `ngrok http 5005`
   - Use the ngrok URL in the web form
   - Submit to join the meeting

## How It Works

```
Your Voice → Transcription (Assembly AI)
           → AI Response (OpenRouter)
           → Speech Synthesis (Murf.ai)
           → Meeting Audio Output
```

## Features

✅ Real-time speech-to-text  
✅ Natural AI conversations  
✅ High-quality voice output  
✅ Browser & Google Meet support  
✅ Automatic silence detection  
✅ No duplicate responses  

## Customization

Edit `index.js` to change:
- **Greeting**: Line 210 `agentConfig.greeting`
- **Prompt**: Line 208 `agentConfig.prompt`
- **Voice**: Line 211 `agentConfig.model` (en-US-alina, en-US-cooper, etc.)
- **Response size**: Line 30 `MAX_TOKENS: 300`

---

**Ready to go!** 🚀
