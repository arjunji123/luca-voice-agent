/**
 * Extension Connector
 * Minimal memory store - receives credentials from browser via WebSocket
 */

let credentials = null;
let credentialsPromise = null;
let credentialsResolve = null;

function setCredentials(sessionId, accessToken) {
  credentials = {
    sessionId,
    accessToken,
    timestamp: Date.now()
  };
  console.log('Credentials stored (age: 0ms)');
  
  // Resolve any pending promise
  if (credentialsResolve) {
    credentialsResolve(credentials);
    credentialsResolve = null;
    credentialsPromise = null;
  }
}

async function getCredentialsFromExtension(waitTime = 500) {
  if (credentials) {
    const age = Date.now() - credentials.timestamp;
    console.log(`Using stored credentials (age: ${Math.round(age/1000)}s)`);
    return credentials;
  }
  
  console.log(`Waiting for credentials (timeout: ${waitTime}ms)...`);
  
  // Create promise if not exists
  if (!credentialsPromise) {
    credentialsPromise = new Promise((resolve) => {
      credentialsResolve = resolve;
    });
  }
  
  // Race between promise and timeout
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), waitTime);
  });
  
  const result = await Promise.race([credentialsPromise, timeoutPromise]);
  
  if (!result) {
    console.log('Credentials timeout - no credentials received');
    return null;
  }
  
  return result;
}

module.exports = {
  setCredentials,
  getCredentialsFromExtension
};
