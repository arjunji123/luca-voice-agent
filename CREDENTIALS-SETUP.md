# Credential Setup for Voice Agent Hiring

## Quick Start

### 1. Start Voice Agent
```bash
node index.js
```

The sync server will automatically start on port 9876.

### 2. Refresh Credentials (when needed)

**Option A - Automatic (Recommended):**
```bash
./refresh-credentials.sh
```
This opens LookoutAI platform. Extension auto-syncs credentials.

**Option B - Manual:**
1. Open https://lookoutai-dev.web.app in Chrome
2. Extension detects voice agent and syncs automatically

**Option C - Console (if needed):**
Open Chrome Extension console and paste:
```javascript
window.__LOOKOUTAI_EXTENSION__.getSession().then(s =>
  fetch("http://localhost:9876/sync", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(s)
  }).then(() => console.log("✓ Synced!"))
);
```

## For Chrome Extension Developers

Add this code to your extension's page-bridge.js or content script:

```javascript
// Auto-sync on page load
fetch('http://localhost:9876/ping')
  .then(res => res.json())
  .then(data => {
    if (data.status === 'ready' && window.__LOOKOUTAI_EXTENSION__) {
      window.__LOOKOUTAI_EXTENSION__.getSession()
        .then(session => 
          fetch('http://localhost:9876/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(session)
          })
        );
    }
  })
  .catch(() => {});
```

## Usage

After credentials are synced, use the hiring feature:

```
"Luca, hire a DevOps engineer with 5 years experience in Docker, Kubernetes, and AWS."
```

Bot will immediately respond and process in background!
