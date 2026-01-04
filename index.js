require("dotenv").config();
const { WebSocketServer } = require("ws");
const axios = require("axios");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { parse } = require("querystring");

const config = require("./config");
const messages = require("./messages");
const utils = require("./utils");
const { handleUserInput: handleHiringInput } = require('./hiringIntegration');

const extensionConnector = require('./extensionConnector');

const PORT = config.PORT;

// Validate all required API keys
Object.entries(config.API_KEYS).forEach(([key, value]) => {
  if (!value) {
    console.error(messages.ERRORS.MISSING_API_KEY.replace("{key}", key));
    process.exit(1);
  }
});

console.log(messages.INFO.KEYS_CONFIGURED + "\n");

// Speech to text via Assembly AI
async function transcribeAudio(audioBuffer) {
  try {
    const tempFile = `/tmp/audio-${Date.now()}.wav`;
    const wavBuffer = utils.createWavHeader(audioBuffer);
    fs.writeFileSync(tempFile, wavBuffer);

    const uploadRes = await axios.post(config.API_ENDPOINTS.ASSEMBLY_AI_UPLOAD, wavBuffer, {
      headers: {
        'Authorization': config.API_KEYS.ASSEMBLY_AI,
        'Content-Type': 'application/octet-stream'
      }
    });

    const txRes = await axios.post(config.API_ENDPOINTS.ASSEMBLY_AI_TRANSCRIPT, {
      audio_url: uploadRes.data.upload_url,
      language_code: config.TRANSCRIPTION_CONFIG.languageCode
    }, {
      headers: { 'Authorization': config.API_KEYS.ASSEMBLY_AI }
    });

    let result = txRes.data;
    let pollCount = 0;

    while (result.status !== 'completed' && result.status !== 'error' && pollCount < config.TRANSCRIPTION_CONFIG.maxPolls) {
      await new Promise(r => setTimeout(r, config.TRANSCRIPTION_CONFIG.pollInterval));
      pollCount++;
      result = (await axios.get(`${config.API_ENDPOINTS.ASSEMBLY_AI_TRANSCRIPT}/${result.id}`, {
        headers: { 'Authorization': config.API_KEYS.ASSEMBLY_AI }
      })).data;
    }

    fs.unlinkSync(tempFile);

    if (pollCount >= config.TRANSCRIPTION_CONFIG.maxPolls) {
      throw new Error(messages.ERRORS.TRANSCRIPTION_TIMEOUT);
    }

    if (result.status === 'error') {
      throw new Error(messages.ERRORS.ASSEMBLY_AI_ERROR.replace("{error}", result.error));
    }

    return result.text || '';

  } catch (error) {
    console.error(messages.ERRORS.STT_ERROR.replace("{message}", error.message));
    throw error;
  }
}

// Get LLM response via OpenRouter
async function getLLMResponse(userText, conversationHistory, clientId = 'default', meetingUrl = null, sendToClient = null) {
  try {
    // Check hiring integration first - pass meetingUrl for credential retrieval
    const hiringResult = await handleHiringInput(userText, meetingUrl, sendToClient);

    // If hiring integration handled it, return directly WITHOUT calling OpenRouter
    if (hiringResult && hiringResult.message) {
      console.log('Hiring query handled - skipping OpenRouter');
      console.log('   Response:', hiringResult.message);
      return hiringResult.message; // Return immediately, don't call OpenRouter
    }

    // Only call OpenRouter if hiring integration didn't handle it
    console.log('Calling OpenRouter for non-hiring query...');
    const msgs = [
      ...conversationHistory,
      { role: "user", content: userText }
    ];

    const response = await axios.post(config.API_ENDPOINTS.OPENROUTER, {
      model: config.LLM_CONFIG.model,
      messages: msgs,
      max_tokens: config.LLM_CONFIG.maxTokens
    }, {
      headers: {
        Authorization: `Bearer ${config.API_KEYS.OPENROUTER}`,
        "HTTP-Referer": `http://localhost:${config.PORT}`,
        "X-Title": "Voice Agent"
      }
    });

    const assistantText = response.data.choices[0].message.content;
    console.log(messages.INFO.BOT_RESPONSE.replace("{text}", assistantText));
    return assistantText;

  } catch (error) {
    console.error('LLM Response Error:', error.message);
    return "I'm having trouble processing that right now. Could you please try again?";
  }
}

// Text to speech via Murf.ai
async function synthesizeAudio(text, voiceId = config.DEFAULT_AGENT_CONFIG.model) {
  if (!text || typeof text !== 'string') {
    console.error('TTS Error: Invalid text:', text);
    return null;
  }
  try {
    console.log(messages.INFO.GENERATING_AUDIO.replace("{chars}", text.length));

    const response = await axios.post(config.API_ENDPOINTS.MURF_AI, {
      text: text,
      voiceId: voiceId,
      model: config.TTS_CONFIG.model,
      format: config.TTS_CONFIG.format,
      sampleRate: config.SAMPLE_RATE
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.API_KEYS.MURF_AI
      },
      responseType: 'arraybuffer',
      timeout: config.TTS_CONFIG.timeout
    });

    const audioBuffer = Buffer.from(response.data);
    console.log(messages.INFO.AUDIO_GENERATED.replace("{bytes}", audioBuffer.length));
    return audioBuffer;

  } catch (error) {
    console.error(messages.ERRORS.TTS_ERROR.replace("{message}", error.message));

    if (text.length > 300 && error.message.includes('414')) {
      console.log(messages.ERRORS.TTS_TIMEOUT);
      const shortText = text.substring(0, 300);
      return await synthesizeAudio(shortText, voiceId);
    }

    return utils.generateFallbackTone();
  }
}


let agentConfig = { ...config.DEFAULT_AGENT_CONFIG };
const clientContexts = new Map();
const clientToMeetingUrl = new Map(); // Track which client is in which meeting

function createAgent(clientId, meetingUrl, onAudio) {
  const context = {
    conversationHistory: [
      { role: "system", content: agentConfig.prompt }
    ],
    isProcessing: false,
    isListening: true,
    inConversation: false,
    audioBuffer: Buffer.alloc(0),
    audioTimeout: null,
    lastTranscript: "",
    meetingUrl: meetingUrl // Store meeting URL in context
  };

  clientContexts.set(clientId, context);
  clientToMeetingUrl.set(clientId, meetingUrl); // Map clientId to meeting URL

  const agent = {
    addAudio(audioChunk) {
      if (!context.isListening) return;

      const isSilent = utils.isSilentChunk(audioChunk);

      if (!isSilent) {
        context.audioBuffer = Buffer.concat([context.audioBuffer, audioChunk]);
        const duration = (context.audioBuffer.length / (config.SAMPLE_RATE * 2)).toFixed(1);
        process.stdout.write(`\r ${messages.INFO.RECORDING.replace("{duration}", duration)}`);

        if (context.audioTimeout) clearTimeout(context.audioTimeout);

        if (context.audioBuffer.length >= config.MIN_AUDIO_FOR_PROCESSING && !context.isProcessing) {
          context.audioTimeout = setTimeout(() => {
            if (context.audioBuffer.length > 0 && !context.isProcessing && context.isListening) {
              const bufferToProcess = context.audioBuffer;
              context.audioBuffer = Buffer.alloc(0);
              console.log("");
              this.processAudio(bufferToProcess);
            }
          }, config.AUDIO_BUFFER_TIMEOUT);
        }
      } else {
        if (context.audioBuffer.length > 0 && !context.audioTimeout && !context.isProcessing) {
          context.audioTimeout = setTimeout(() => {
            if (context.audioBuffer.length > 0 && !context.isProcessing && context.isListening) {
              const bufferToProcess = context.audioBuffer;
              context.audioBuffer = Buffer.alloc(0);
              console.log("");
              this.processAudio(bufferToProcess);
            }
          }, config.AUDIO_BUFFER_TIMEOUT);
        }
      }
    },

    async processAudio(audioBuffer) {
      if (context.isProcessing || audioBuffer.length === 0) return;

      context.isProcessing = true;
      context.isListening = false;

      try {
        let userText = await transcribeAudio(audioBuffer);

        if (!userText || userText.trim() === "") {
          context.isListening = true;
          return;
        }

        if (userText === context.lastTranscript) {
          console.log(messages.INFO.DUPLICATE_TRANSCRIPT);
          context.isListening = true;
          return;
        }

        context.lastTranscript = userText;

        const hasEndKeyword = config.END_KEYWORDS.some(keyword => userText.toLowerCase().includes(keyword));

        if (context.inConversation && hasEndKeyword) {
          console.log(messages.INFO.CONVERSATION_ENDED);
          context.inConversation = false;
          const audioOutput = await synthesizeAudio(messages.END_MESSAGE, agentConfig.model);
          onAudio({
            trigger: "realtime_audio.bot_output",
            data: { chunk: audioOutput.toString("base64"), sample_rate: config.SAMPLE_RATE }
          });
          context.isListening = true;
          context.isProcessing = false;
          return;
        }

        const botNameLower = agentConfig.botName.toLowerCase();
        const textLower = userText.toLowerCase();
        const hasBotName = textLower.includes(botNameLower) || utils.isSimilarWord(textLower, botNameLower);

        if (!context.inConversation && !hasBotName) {
          console.log(messages.STATUS.IGNORED.replace("{botName}", agentConfig.botName).replace("{text}", userText));
          context.isListening = true;
          context.isProcessing = false;
          return;
        }

        if (!context.inConversation && hasBotName) {
          console.log(messages.INFO.CONVERSATION_STARTED.replace("{botName}", agentConfig.botName));
          context.inConversation = true;
          userText = utils.removeBotNameFromText(userText, botNameLower);

          if (!userText) {
            console.log(messages.INFO.WAITING_FOR_COMMAND);
            const audioOutput = await synthesizeAudio(messages.ACK_MESSAGE, agentConfig.model);
            onAudio({
              trigger: "realtime_audio.bot_output",
              data: { chunk: audioOutput.toString("base64"), sample_rate: config.SAMPLE_RATE }
            });
            context.isListening = true;
            context.isProcessing = false;
            return;
          }
        }

        console.log(`You: "${userText}"`);
        context.conversationHistory.push({ role: "user", content: userText });

        let assistantText = await getLLMResponse(userText, context.conversationHistory, clientId, context.meetingUrl, onAudio);

        // Safety check for undefined response
        if (!assistantText || typeof assistantText !== 'string') {
          console.error('Got invalid response from LLM:', assistantText);
          assistantText = "I apologize, I'm having trouble processing that. Could you please try again?";
        }

        // Truncate response if too long
        if (assistantText.length > config.MAX_RESPONSE_LENGTH) {
          assistantText = assistantText.substring(0, config.MAX_RESPONSE_LENGTH) + "...";
        }

        context.conversationHistory.push({ role: "assistant", content: assistantText });
        const audioOutput = await synthesizeAudio(assistantText, agentConfig.model);

        // Check if audio was generated
        if (audioOutput) {
          onAudio({
            trigger: "realtime_audio.bot_output",
            data: { chunk: audioOutput.toString("base64"), sample_rate: config.SAMPLE_RATE }
          });
        }

        console.log(messages.INFO.RESPONSE_SENT + "\n");
      } catch (error) {
        console.error(messages.ERRORS.PROCESS_ERROR.replace("{message}", error.message));
      } finally {
        context.isProcessing = false;
        context.isListening = true;
      }
    },

    async sendGreeting() {
      try {
        context.isListening = false;
        console.log(messages.INFO.SENDING_GREETING);
        const audioOutput = await synthesizeAudio(agentConfig.greeting, agentConfig.model);
        onAudio({
          trigger: "realtime_audio.bot_output",
          data: { chunk: audioOutput.toString("base64"), sample_rate: config.SAMPLE_RATE }
        });
        console.log(messages.INFO.READY_FOR_INPUT);
        context.isListening = true;
      } catch (error) {
        console.error(messages.ERRORS.GREETING_ERROR.replace("{message}", error.message));
        context.isListening = true;
      }
    },

    finish() {
      if (context.audioTimeout) clearTimeout(context.audioTimeout);
      clientContexts.delete(clientId);
    }
  };

  agent.sendGreeting();
  return agent;
}

// HTTP and WebSocket server
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
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      const formData = parse(body);
      const meetingUrl = formData.meetingUrl;
      const sessionId = formData.sessionId;
      const accessToken = formData.accessToken;

      // Store credentials for this meeting URL
      if (meetingUrl && sessionId && accessToken) {
        extensionConnector.setCredentialsForMeeting(meetingUrl, sessionId, accessToken);

      }

      agentConfig.prompt = formData.prompt || agentConfig.prompt;
      agentConfig.greeting = formData.greeting || agentConfig.greeting;
      agentConfig.model = formData.model || agentConfig.model;

      console.log("\n" + messages.INFO.FORM_SUBMITTED);
      console.log("   " + messages.INFO.MEETING_URL.replace("{url}", meetingUrl));
      console.log("   " + messages.INFO.WEBSOCKET_URL.replace("{url}", formData.wsUrl));
      console.log("   " + messages.INFO.VOICE_MODEL.replace("{model}", agentConfig.model));

      const attendeeData = JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: "Voice Agent",
        websocket_settings: {
          audio: {
            url: formData.wsUrl + '?meetingUrl=' + encodeURIComponent(meetingUrl),
            sample_rate: config.SAMPLE_RATE
          }
        }
      });

      const options = {
        hostname: config.API_ENDPOINTS.ATTENDEE_API,
        port: 443,
        path: '/api/v1/bots',
        method: 'POST',
        headers: {
          'Authorization': `Token ${config.API_KEYS.ATTENDEE}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(attendeeData)
        }
      };

      const attendeeReq = https.request(options, (attendeeRes) => {
        let responseData = '';
        attendeeRes.on('data', (chunk) => { responseData += chunk; });
        attendeeRes.on('end', () => {
          if (attendeeRes.statusCode >= 200 && attendeeRes.statusCode < 300) {
            console.log(messages.INFO.BOT_JOINING + "\n");
            res.writeHead(200);
            res.end("Success!");
          } else {
            console.error("Failed:", responseData);
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

wss.on("connection", (client, req) => {
  const clientId = `${req.socket.remoteAddress}-${Date.now()}`;
  console.log("\n" + messages.INFO.CLIENT_CONNECTED.replace("{id}", clientId));

  // Extract meeting URL from query parameters (if provided by Attendee.dev bot)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const meetingUrlFromQuery = url.searchParams.get('meetingUrl');

  // Use meeting URL from query or create default
  const meetingUrl = meetingUrlFromQuery || 'default-meeting-' + Date.now();

  if (meetingUrlFromQuery) {
    console.log(`📍 Meeting URL from query: ${meetingUrlFromQuery}`);
  }

  const agent = createAgent(clientId, meetingUrl, (payload) => {
    console.log(`[WS] Sending to client ${clientId}:`, payload.trigger);
    client.send(JSON.stringify(payload));
  });

  // Receive messages from browser
  client.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());

      // Handle meeting URL initialization (sent first from client)
      if (parsed.trigger === "meeting.init" && parsed?.data?.meetingUrl) {
        const meetingUrl = parsed.data.meetingUrl;
        console.log(`📍 Meeting URL received: ${meetingUrl}`);

        // Update agent's meeting URL (agent already created on connection)
        const context = clientContexts.get(clientId);
        if (context) {
          context.meetingUrl = meetingUrl;
          clientToMeetingUrl.set(clientId, meetingUrl);
          console.log(`✅ Agent meeting URL updated to: ${meetingUrl}`);
        }
        return;
      }

      // Handle audio
      if (parsed.trigger === "realtime_audio.mixed" && parsed?.data?.chunk) {
        const audio = Buffer.from(parsed.data.chunk, "base64");
        agent.addAudio(audio);
      }
    } catch (err) {
      // Silent error handling for malformed messages
    }
  });

  // Client disconnected
  client.on("close", () => {
    console.log("\n" + messages.INFO.CLIENT_DISCONNECTED.replace("{id}", clientId));
    agent.finish();
    clientToMeetingUrl.delete(clientId);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`\nOpen http://localhost:${PORT} in your browser\n`);
});
