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

// Add natural pauses using Murf.ai's native syntax
function addNaturalPauses(text) {
  let enhanced = text;

  // Add pauses at punctuation using Murf.ai syntax: [pause duration]
  enhanced = enhanced.replace(/\. /g, '. [pause 0.4] ');  // Period
  enhanced = enhanced.replace(/\.\.\./g, '... [pause 0.6] ');  // Ellipsis
  enhanced = enhanced.replace(/\? /g, '? [pause 0.5] ');  // Question
  enhanced = enhanced.replace(/! /g, '! [pause 0.4] ');  // Exclamation
  enhanced = enhanced.replace(/, /g, ', [pause 0.2] ');  // Comma

  return enhanced;
}

// Text to speech via Murf.ai
async function synthesizeAudio(text, voiceId = config.DEFAULT_AGENT_CONFIG.model) {
  if (!text || typeof text !== 'string') {
    console.error('TTS Error: Invalid text:', text);
    return null;
  }

  // Trim whitespace but keep the full text
  text = text.trim();

  // Add natural pauses for human-like speech
  const textWithPauses = addNaturalPauses(text);

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎤 TTS Input:');
    console.log(`   Original: "${text}"`);
    if (textWithPauses !== text) {
      console.log(`   With pauses: "${textWithPauses.substring(0, 100)}..."`);
    }
    console.log(`   Length: ${text.length} characters`);
    console.log(`   Voice: ${voiceId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await axios.post(config.API_ENDPOINTS.MURF_AI, {
      text: textWithPauses,  // Send text with natural pauses
      voiceId: voiceId,
      model: config.TTS_CONFIG.model,
      format: config.TTS_CONFIG.format,
      sampleRate: config.SAMPLE_RATE,
      speed: config.TTS_CONFIG.speed,
      style: config.TTS_CONFIG.style,
      variation: 2  // Add natural variation to pitch/speed (0-5, higher = more natural)
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.API_KEYS.MURF_AI
      },
      responseType: 'arraybuffer',
      timeout: config.TTS_CONFIG.timeout
    });

    let audioBuffer = Buffer.from(response.data);

    // Murf.ai returns WAV format - strip the 44-byte WAV header to get raw PCM
    // This ensures compatibility with the audio stream
    if (audioBuffer.length > 44 && audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
      console.log('   Stripping WAV header (44 bytes)');
      audioBuffer = audioBuffer.slice(44);
    }

    const estimatedDuration = (audioBuffer.length / (config.SAMPLE_RATE * 2)).toFixed(1);
    console.log(`✅ Audio generated: ${audioBuffer.length} bytes`);
    console.log(`   Estimated duration: ~${estimatedDuration}s`);

    // Validate audio length - should be roughly 1-2 seconds per 20 characters
    const expectedMinDuration = (text.length / 20) * 0.5; // Minimum expected
    if (parseFloat(estimatedDuration) < expectedMinDuration) {
      console.warn(`⚠️  Audio seems short! Expected at least ${expectedMinDuration.toFixed(1)}s for ${text.length} chars`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return audioBuffer;

  } catch (error) {
    console.error('❌ TTS Error:', error.message);

    if (text.length > 300 && error.message.includes('414')) {
      console.log('⚠️  Text too long, truncating to 300 chars');
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
          // Random ending message
          const randomEnd = config.END_MESSAGES[Math.floor(Math.random() * config.END_MESSAGES.length)];
          const audioOutput = await synthesizeAudio(randomEnd, agentConfig.model);
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
            // Random acknowledgment message
            const randomAck = config.ACK_MESSAGES[Math.floor(Math.random() * config.ACK_MESSAGES.length)];
            const audioOutput = await synthesizeAudio(randomAck, agentConfig.model);
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

        // Log the full LLM response
        console.log('\n🤖 LLM Response (Full):');
        console.log(`   "${assistantText}"`);
        console.log(`   Length: ${assistantText.length} characters\n`);

        // Truncate response if too long
        if (assistantText.length > config.MAX_RESPONSE_LENGTH) {
          console.log(`⚠️  Response too long (${assistantText.length} chars), truncating to ${config.MAX_RESPONSE_LENGTH}`);
          assistantText = assistantText.substring(0, config.MAX_RESPONSE_LENGTH) + "...";
        }

        context.conversationHistory.push({ role: "assistant", content: assistantText });

        console.log('📢 Sending to TTS...');
        const audioOutput = await synthesizeAudio(assistantText, agentConfig.model);

        // Check if audio was generated
        if (audioOutput) {
          console.log(`📤 Sending audio to client (${audioOutput.length} bytes)`);
          onAudio({
            trigger: "realtime_audio.bot_output",
            data: { chunk: audioOutput.toString("base64"), sample_rate: config.SAMPLE_RATE }
          });
        } else {
          console.error('❌ No audio generated!');
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
        // Random greeting from array
        const randomGreeting = agentConfig.greetings[Math.floor(Math.random() * agentConfig.greetings.length)];
        const audioOutput = await synthesizeAudio(randomGreeting, agentConfig.model);
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

      // Prompt, model, and greeting are all fixed in config now

      console.log("\n" + messages.INFO.FORM_SUBMITTED);
      console.log("   " + messages.INFO.MEETING_URL.replace("{url}", meetingUrl));
      console.log("   " + messages.INFO.WEBSOCKET_URL.replace("{url}", formData.wsUrl));
      console.log("   Voice Model: en-US-natalie (Natural & Conversational)");

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
