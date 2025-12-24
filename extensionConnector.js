const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.join(require('os').homedir(), '.lookoutai-credentials.json');
const MAX_AGE_MS = 60 * 60 * 1000;

let credentialsCache = null;

// UUID format validation (8-4-4-4-12 hex characters)
function isValidUUID(sessionId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(sessionId);
}

async function getCredentials() {
  if (credentialsCache) {
    return credentialsCache;
  }

  if (process.env.LOOKOUT_SESSION_ID && process.env.LOOKOUT_ACCESS_TOKEN) {
    const sessionId = process.env.LOOKOUT_SESSION_ID;
    if (!isValidUUID(sessionId)) {
      console.error('❌ Invalid session ID format in env vars (expected UUID):', sessionId);
      return null;
    }
    
    credentialsCache = {
      sessionId: sessionId,
      accessToken: process.env.LOOKOUT_ACCESS_TOKEN,
      userEmail: process.env.LOOKOUT_USER_EMAIL || 'env-user',
      timestamp: Date.now()
    };
    return credentialsCache;
  }

  try {
    const data = fs.readFileSync(CREDS_FILE, 'utf8');
    const credentials = JSON.parse(data);
    
    // Validate session ID format
    if (!isValidUUID(credentials.sessionId)) {
      console.error('❌ Invalid session ID format (expected UUID):', credentials.sessionId);
      console.log('💡 Session ID should be in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
      console.log('💡 Please start a new chat on LookoutAI platform to generate a valid session UUID');
      return null;
    }
    
    const age = Date.now() - credentials.timestamp;
    if (age > MAX_AGE_MS) {
      const ageMinutes = Math.floor(age / (1000 * 60));
      console.log(`Warning: Credentials are ${ageMinutes} minutes old (max 60)`);
    }
    
    credentialsCache = credentials;
    return credentials;
  } catch (error) {
    return null;
  }
}

function clearCache() {
  credentialsCache = null;
}

async function hasCredentials() {
  const creds = await getCredentials();
  return creds !== null && creds.sessionId && creds.accessToken;
}

function setCredentials(sessionId, accessToken, userEmail) {
  if (!isValidUUID(sessionId)) {
    console.error('❌ Invalid session ID format (expected UUID):', sessionId);
    return null;
  }
  
  const credentials = {
    sessionId,
    accessToken,
    userEmail: userEmail || 'manual-user',
    timestamp: Date.now()
  };
  
  fs.writeFileSync(CREDS_FILE, JSON.stringify(credentials, null, 2));
  credentialsCache = credentials;
  
  return credentials;
}

module.exports = {
  getCredentials,
  clearCache,
  hasCredentials,
  setCredentials,
  isValidUUID
};
