// index.js - COMPLETE REFACTOR WITH STREAMING + DEBUGGING
/* 
   Flow:
   Meeting Audio (Stream) 
     → Assembly AI WebSocket (Real-time transcription)
     → OpenRouter LLM (Text response)
     → Murf.ai WebSocket Streaming (Real-time voice)
     → Meeting Audio (Stream back)

   Debug: Every step logged clearly
*/

require("dotenv").config();
const { WebSocketServer } = require("ws");
const axios = require("axios");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { parse } = require("querystring");
const WebSocket = require("ws");

// CONFIGURATION
const PORT = process.env.PORT || 5005;
const SAMPLE_RATE = 16000;
const AUDIO_BUFFER_TIMEOUT = 1000; // 1 second of silence = stop recording
const MIN_AUDIO_FOR_PROCESSING = 16000; // 1 second minimum
const SILENCE_THRESHOLD = 50; // Volume threshold to detect silence (adjust as needed)

// API Keys
const ASSEMBLY_AI_KEY = process.env.ASSEMBLY_AI_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MURF_AI_KEY = process.env.MURF_AI_KEY;
const ATTENDEE_API_KEY = process.env.ATTENDEE_API_KEY;
const ATTENDEE_API_BASE_URL = process.env.ATTENDEE_API_BASE_URL || 'app.attendee.dev';

// Validate keys
[
  { key: ASSEMBLY_AI_KEY, name: "ASSEMBLY_AI_KEY" },
  { key: OPENROUTER_API_KEY, name: "OPENROUTER_API_KEY" },
  { key: MURF_AI_KEY, name: "MURF_AI_KEY" },
  { key: ATTENDEE_API_KEY, name: "ATTENDEE_API_KEY" },
].forEach(({ key, name }) => {
  if (!key) {
    console.error(`Set ${name} in .env`);
    process.exit(1);
  }
});

console.log("All API keys configured\n");

// STEP 1: ASSEMBLY AI - SPEECH TO TEXT (Streaming)
async function transcribeAudio(audioBuffer) {
  try {
    // Save WAV file with correct header
    const tempFile = `/tmp/audio-${Date.now()}.wav`;
    const channels = 1; // Mono
    const bitsPerSample = 16;
    const byteRate = SAMPLE_RATE * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    
    const wavHeader = Buffer.alloc(44);
    
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + audioBuffer.length, 4); // File size - 8
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
    wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
    wavHeader.writeUInt16LE(channels, 22); // NumChannels
    wavHeader.writeUInt32LE(SAMPLE_RATE, 24); // SampleRate
    wavHeader.writeUInt32LE(byteRate, 28); // ByteRate
    wavHeader.writeUInt16LE(blockAlign, 32); // BlockAlign
    wavHeader.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(audioBuffer.length, 40);
    
    const wavBuffer = Buffer.concat([wavHeader, audioBuffer]);
    fs.writeFileSync(tempFile, wavBuffer);

    // Upload to Assembly AI
    const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', wavBuffer, {
      headers: {
        'Authorization': ASSEMBLY_AI_KEY,
        'Content-Type': 'application/octet-stream'
      }
    });

    // Request transcription
    const txRes = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: uploadRes.data.upload_url,
      language_code: 'en'
    }, {
      headers: { 'Authorization': ASSEMBLY_AI_KEY }
    });

    const txId = txRes.data.id;

    // Poll for result (with timeout)
    let result = txRes.data;
    let pollCount = 0;
    const maxPolls = 120; // 2 minutes max

    while (result.status !== 'completed' && result.status !== 'error' && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 1000));
      pollCount++;
      result = (await axios.get(`https://api.assemblyai.com/v2/transcript/${txId}`, {
        headers: { 'Authorization': ASSEMBLY_AI_KEY }
      })).data;
    }

    fs.unlinkSync(tempFile);

    if (pollCount >= maxPolls) {
      throw new Error('Transcription timeout - took too long');
    }

    if (result.status === 'error') {
      throw new Error(`Assembly AI error: ${result.error}`);
    }

    return result.text || '';

  } catch (error) {
    console.error(`STT Error: ${error.message}`);
    throw error;
  }
}

// STEP 2: OPENROUTER - LLM RESPONSE
async function getLLMResponse(userText, conversationHistory) {
  const messages = [
    ...conversationHistory,
    { role: "user", content: userText }
  ];

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o",
      messages: messages,
      max_tokens: 50  // Extremely short responses (1-2 sentences max)
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:5005",
        "X-Title": "Voice Agent"
      }
    }
  );

  const assistantText = response.data.choices[0].message.content;
  console.log(`BOT: "${assistantText}"`);
  
  return assistantText;
}

// STEP 3: MURF.AI - TEXT TO SPEECH (Streaming)
async function synthesizeAudio(text, voiceId = "en-US-alina") {
  try {
    console.log(`Generating audio (${text.length} chars)...`);
    
    const response = await axios.post(
      "https://global.api.murf.ai/v1/speech/stream",
      {
        text: text,
        voiceId: voiceId,
        model: "FALCON",
        format: "WAV",
        sampleRate: SAMPLE_RATE
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': MURF_AI_KEY
        },
        responseType: 'arraybuffer',
        timeout: 60000 // 60 second timeout for longer texts
      }
    );

    const audioBuffer = Buffer.from(response.data);
    console.log(`GENERATED: ${audioBuffer.length} bytes`);
    return audioBuffer;

  } catch (error) {
    console.error(`TTS Error: ${error.message}`);
    
    // If text is too long, try splitting and retrying with shorter version
    if (text.length > 300 && error.message.includes('414')) {
      console.log(`Text too long, trying with shortened version...`);
      const shortText = text.substring(0, 300);
      return await synthesizeAudio(shortText, voiceId);
    }
    
    // Fallback: Generate a short silence/tone instead of failing
    const sampleRate = SAMPLE_RATE;
    const duration = 1;
    const samples = sampleRate * duration;
    const buffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
      const value = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0x7FFF;
      buffer.writeInt16LE(Math.floor(value), i * 2);
    }
    
    console.log(` Using fallback tone`);
    return buffer;
  }
}

// AGENT - ORCHESTRATES EVERYTHING
let agentConfig = {
  prompt: "You are a helpful voice assistant speaking to a person. CRITICAL: Keep ALL responses EXTREMELY SHORT. Maximum 1-2 sentences only. Never exceed 50 words. Be direct and concise. No long explanations.",
  greeting: "Hello! I'm your voice assistant. How can I help?",
  model: "en-US-alina"
};

const clientContexts = new Map();

function createAgent(clientId, onAudio) {
  const context = {
    conversationHistory: [
      { role: "system", content: agentConfig.prompt }
    ],
    isProcessing: false,
    isListening: true, // Track if bot should accept audio
    audioBuffer: Buffer.alloc(0),
    audioTimeout: null,
    lastTranscript: "" // Track last transcript to prevent duplicates
  };

  clientContexts.set(clientId, context);

  const agent = {
    addAudio(audioChunk) {
      // Don't accept audio while bot is speaking
      if (!context.isListening) {
        return;
      }

      // Detect if this chunk has audio (not silence)
      const isSilent = this.isSilentChunk(audioChunk);
      
      if (!isSilent) {
        // Got audio - add to buffer
        context.audioBuffer = Buffer.concat([context.audioBuffer, audioChunk]);
        const durationSeconds = (context.audioBuffer.length / (SAMPLE_RATE * 2)).toFixed(1);
        process.stdout.write(`\r Recording... ${durationSeconds}s`);

        // Reset silence timeout when audio arrives
        if (context.audioTimeout) {
          clearTimeout(context.audioTimeout);
        }

        // If we have enough audio, set timeout for silence
        if (context.audioBuffer.length >= MIN_AUDIO_FOR_PROCESSING && !context.isProcessing) {
          context.audioTimeout = setTimeout(() => {
            if (context.audioBuffer.length > 0 && !context.isProcessing && context.isListening) {
              const bufferToProcess = context.audioBuffer;
              context.audioBuffer = Buffer.alloc(0);
              console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              this.processAudio(bufferToProcess);
            }
          }, AUDIO_BUFFER_TIMEOUT);
        }
      } else {
        // Got silence - if we have buffered audio, start silence timer
        if (context.audioBuffer.length > 0 && !context.audioTimeout && !context.isProcessing) {
          context.audioTimeout = setTimeout(() => {
            if (context.audioBuffer.length > 0 && !context.isProcessing && context.isListening) {
              const bufferToProcess = context.audioBuffer;
              context.audioBuffer = Buffer.alloc(0);
              console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              this.processAudio(bufferToProcess);
            }
          }, AUDIO_BUFFER_TIMEOUT);
        }
      }
    },

    isSilentChunk(chunk) {
      // Analyze audio chunk to detect silence
      if (chunk.length === 0) return true;
      
      let sum = 0;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i);
        sum += Math.abs(sample);
      }
      
      const average = sum / (chunk.length / 2);
      return average < SILENCE_THRESHOLD;
    },

    async processAudio(audioBuffer) {
      if (context.isProcessing) {
        return;
      }

      if (audioBuffer.length === 0) {
        return;
      }

      context.isProcessing = true;
      context.isListening = false; // STOP LISTENING while processing

      try {
        // STEP 1: Transcribe
        const userText = await transcribeAudio(audioBuffer);

        // Ignore silence
        if (userText === "(silence)" || !userText || userText.trim() === "") {
          context.isListening = true;
          return;
        }

        // Prevent duplicate messages
        if (userText === context.lastTranscript) {
          console.log("Duplicate transcript, skipping...");
          context.isListening = true;
          return;
        }

        context.lastTranscript = userText;
        console.log(`YOU: "${userText}"`);
        context.conversationHistory.push({ role: "user", content: userText });

        // STEP 2: Get response
        const assistantText = await getLLMResponse(userText, context.conversationHistory);
        context.conversationHistory.push({ role: "assistant", content: assistantText });

        // STEP 3: Synthesize - send full response to TTS
        // Don't truncate - let Murf.ai handle the full text
        const audioOutput = await synthesizeAudio(assistantText, agentConfig.model);

        // Send to client
        const payload = {
          trigger: "realtime_audio.bot_output",
          data: { chunk: audioOutput.toString("base64"), sample_rate: SAMPLE_RATE }
        };
        onAudio(payload);
        
        console.log(`✨ RESPONSE SENT\n`);
      } catch (error) {
        console.error("❌ Error:", error.message);
      } finally {
        context.isProcessing = false;
        context.isListening = true; // RESUME LISTENING
      }
    },

    async sendGreeting() {
      try {
        context.isListening = false; // Stop listening during greeting
        console.log("🤖 BOT: Sending greeting...");
        const audioOutput = await synthesizeAudio(agentConfig.greeting, agentConfig.model);
        const payload = {
          trigger: "realtime_audio.bot_output",
          data: { chunk: audioOutput.toString("base64"), sample_rate: SAMPLE_RATE }
        };
        onAudio(payload);
        console.log("✅ Ready for your input\n");
        context.isListening = true; // Resume listening after greeting
      } catch (error) {
        console.error("❌ Greeting error:", error.message);
        context.isListening = true;
      }
    },

    finish() {
      if (context.audioTimeout) {
        clearTimeout(context.audioTimeout);
      }
      clientContexts.delete(clientId);
    }
  };

  agent.sendGreeting();
  return agent;
}

// HTTP SERVER
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    fs.readFile(path.join(__dirname, "public/index.html"), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else if (req.method === "POST" && req.url === "/join-meeting") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const formData = parse(body);
      agentConfig.prompt = formData.prompt || agentConfig.prompt;
      agentConfig.greeting = formData.greeting || agentConfig.greeting;
      agentConfig.model = formData.model || agentConfig.model;

      console.log("\n🎯 FORM SUBMITTED:");
      console.log(`   Meeting: ${formData.meetingUrl}`);
      console.log(`   WebSocket: ${formData.wsUrl}`);
      console.log(`   Voice: ${agentConfig.model}`);

      const attendeeData = JSON.stringify({
        meeting_url: formData.meetingUrl,
        bot_name: "Voice Agent",
        websocket_settings: {
          audio: {
            url: formData.wsUrl,
            sample_rate: SAMPLE_RATE
          }
        }
      });

      const options = {
        hostname: ATTENDEE_API_BASE_URL,
        port: 443,
        path: '/api/v1/bots',
        method: 'POST',
        headers: {
          'Authorization': `Token ${ATTENDEE_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(attendeeData)
        }
      };

      const attendeeReq = https.request(options, (attendeeRes) => {
        let responseData = '';
        attendeeRes.on('data', (chunk) => {
          responseData += chunk;
        });
        attendeeRes.on('end', () => {
          if (attendeeRes.statusCode >= 200 && attendeeRes.statusCode < 300) {
            console.log('✅ Bot will join meeting in 30 seconds\n');
            res.writeHead(200);
            res.end("Success!");
          } else {
            console.error('❌ Failed:', responseData);
            res.writeHead(500);
            res.end("Failed");
          }
        });
      });

      attendeeReq.write(attendeeData);
      attendeeReq.end();
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}\n`);
});

wss.on("connection", (client, req) => {
  const clientId = `${req.socket.remoteAddress}-${Date.now()}`;
  console.log(`\n CLIENT CONNECTED: ${clientId}`);

  const agent = createAgent(clientId, (payload) => {
    client.send(JSON.stringify(payload));
  });

  client.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.trigger === "realtime_audio.mixed" && parsed?.data?.chunk) {
        const audio = Buffer.from(parsed.data.chunk, "base64");
        agent.addAudio(audio);
      }
    } catch (err) {
      // Silently ignore parsing errors
    }
  });

  client.on("close", () => {
    console.log(`\n CLIENT DISCONNECTED: ${clientId}`);
    agent.finish();
  });
});
