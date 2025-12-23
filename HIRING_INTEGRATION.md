# LookoutAI Hiring Integration

Voice agent integration for processing hiring requests through LookoutAI API.

## Quick Start

### 1. Setup Credentials (One Time Only)

```bash
node setupCredentials.js
```

Follow the instructions to paste code in Chrome console. This will save your credentials.

### 2. Start Voice Agent

```bash
node index.js
```

The voice agent will automatically load credentials and be ready for hiring queries.

### 3. Test Hiring Query

Say: "I want to hire a full stack developer with 5 years of experience in React and Node.js"

## How It Works

When you start `node index.js`:
1. Checks for credentials at `~/.lookoutai-credentials.json`
2. If missing, shows setup instructions
3. If found, loads them automatically
4. Voice agent listens for hiring queries
5. When hiring query detected, calls LookoutAI API
6. Returns candidate search results

## Core Files

- **hiringIntegration.js** - Detects hiring queries and validates requirements
- **lookoutAPI.js** - Makes authenticated API calls to LookoutAI
- **extensionConnector.js** - Manages credential storage and retrieval
- **setupCredentials.js** - One-time credential extraction tool

## Hiring Query Examples

Valid queries (will trigger API call):
- "Hire a full stack developer with 5 years React experience"
- "Find me a senior backend engineer skilled in Python and AWS"
- "Looking for a UI/UX designer with 3 years experience"

Incomplete queries (will ask for more details):
- "I want to hire someone" → Asks for role and details
- "Need a developer" → Requests experience and skills

## Credential Management

**Location:** `~/.lookoutai-credentials.json`

**Validity:** Credentials expire after ~1 hour

**Re-sync:** Run `node setupCredentials.js` again if credentials expire

**Check credentials:**
```bash
cat ~/.lookoutai-credentials.json
```

## API Details

**Endpoint:** `POST /api/luca_message`

**Authentication:** Bearer token

**Parameters:**
- message: Hiring requirements
- session_id: User session ID
- chat_type: "2" (hiring type)

## Troubleshooting

**"Credentials not found" error:**
```bash
node setupCredentials.js
```

**"Authentication failed" error:**
- Credentials expired
- Re-run setup: `node setupCredentials.js`

**No hiring detection:**
- Make sure query includes role (developer, engineer, etc.)
- Provide at least 8 words with details

**API call fails:**
- Check internet connection
- Verify credentials are not expired
- Ensure LookoutAI API is accessible

## Dependencies

```bash
npm install axios form-data
```

Already included if you ran `npm install` in the project.
