/**
 * Extension Connector
 * Meeting URL-based credential storage
 * Credentials are stored per meeting URL when form is submitted
 */

// Map: meetingUrl -> { sessionId, accessToken, timestamp }
const meetingCredentials = new Map();

/**
 * Store credentials for a specific meeting URL
 * Called when form is submitted with meeting URL + credentials from extension
 * @param {string} meetingUrl - The meeting URL (from form)
 * @param {string} sessionId - LookoutAI session ID (from extension)
 * @param {string} accessToken - LookoutAI access token (from extension)
 */
function setCredentialsForMeeting(meetingUrl, sessionId, accessToken) {
  const credentials = {
    sessionId,
    accessToken,
    timestamp: Date.now()
  };

  meetingCredentials.set(meetingUrl, credentials);
  console.log(`✅ Credentials stored for meeting: ${meetingUrl}`);
  console.log(`   Session ID: ${sessionId.substring(0, 20)}...`);
  console.log(`   Total meetings: ${meetingCredentials.size}`);
}

/**
 * Get credentials for a specific meeting URL
 * Called when API needs to be hit for a specific meeting
 * @param {string} meetingUrl - The meeting URL
 * @returns {Object|null} Credentials or null if not found
 */
function getCredentialsForMeeting(meetingUrl) {
  // Try to get credentials for this specific meeting
  const credentials = meetingCredentials.get(meetingUrl);

  if (credentials) {
    const age = Date.now() - credentials.timestamp;
    console.log(`📦 Using credentials for meeting: ${meetingUrl}`);
    console.log(`   Age: ${Math.round(age / 1000)}s`);
    return credentials;
  }


  console.log(`❌ No credentials found for meeting: ${meetingUrl}`);
  return null;
}

/**
 * Clear credentials for a specific meeting
 * @param {string} meetingUrl - The meeting URL
 */
function clearCredentialsForMeeting(meetingUrl) {
  const deleted = meetingCredentials.delete(meetingUrl);
  if (deleted) {
    console.log(`🗑️  Credentials cleared for meeting: ${meetingUrl}`);
  }
}

/**
 * Get all stored meeting URLs (for debugging)
 * @returns {Array<string>} Array of meeting URLs
 */
function getAllMeetingUrls() {
  return Array.from(meetingCredentials.keys());
}

module.exports = {
  setCredentialsForMeeting,
  getCredentialsForMeeting,
  clearCredentialsForMeeting,
  getAllMeetingUrls
};
