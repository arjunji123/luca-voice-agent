wss.on("connection", (client, req) => {
    const clientId = `${req.socket.remoteAddress}-${Date.now()}`;
    console.log("\n" + messages.INFO.CLIENT_CONNECTED.replace("{id}", clientId));

    // TEMPORARY: Create agent immediately with default meeting URL
    // TODO: Update frontend to send meeting URL via meeting.init message
    const defaultMeetingUrl = 'default-meeting-' + Date.now();

    const agent = createAgent(clientId, defaultMeetingUrl, (payload) => {
        console.log(`[WS] Sending to client ${clientId}:`, payload.trigger);
        client.send(JSON.stringify(payload));
    });

    // Receive messages from browser
    client.on("message", (msg) => {
        try {
            const parsed = JSON.parse(msg.toString());

            // Handle meeting URL update (if sent from client)
            if (parsed.trigger === "meeting.init" && parsed?.data?.meetingUrl) {
                const meetingUrl = parsed.data.meetingUrl;
                console.log(`📍 Meeting URL received: ${meetingUrl}`);

                // Update agent's meeting URL
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
