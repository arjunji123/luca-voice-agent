/**
 * Extension Connector Module
 * 
 * Manages authentication credentials for LookoutAI Chrome Extension integration.
 * Credentials are stored locally and cached in memory for performance.
 * 
 * Storage hierarchy:
 * 1. Memory cache (fastest)
 * 2. Local file system (~/.lookoutai-credentials.json)
 * 3. Environment variables (fallback)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDENTIALS_FILE = '.lookoutai-credentials.json';
const CREDENTIAL_MAX_AGE_MINUTES = 60;

class ExtensionConnector {
  constructor() {
    this.credentials = null;
    this.credentialsPath = path.join(os.homedir(), CREDENTIALS_FILE);
  }

  /**
   * Retrieves stored credentials from available sources.
   * 
   * @returns {Promise<Object>} Credentials object containing sessionId and accessToken
   * @throws {Error} If no credentials are available from any source
   */
  async getCredentials() {
    try {
      if (this.credentials) {
        return this.credentials;
      }

      if (fs.existsSync(this.credentialsPath)) {
        const data = fs.readFileSync(this.credentialsPath, 'utf8');
        const parsed = JSON.parse(data);
        
        const ageInMinutes = (Date.now() - parsed.timestamp) / (1000 * 60);
        if (ageInMinutes > CREDENTIAL_MAX_AGE_MINUTES) {
          console.warn('Warning: Credentials are older than 1 hour and may be expired');
        }
        
        this.credentials = {
          sessionId: parsed.sessionId || parsed.lookoutai_session_id,
          accessToken: parsed.accessToken || parsed.lookoutai_access_token,
          userEmail: parsed.userEmail || parsed.lookoutai_user_email,
          timestamp: parsed.timestamp || parsed.lookoutai_token_timestamp
        };
        
        return this.credentials;
      }

      if (process.env.LOOKOUT_SESSION_ID && process.env.LOOKOUT_ACCESS_TOKEN) {
        this.credentials = {
          sessionId: process.env.LOOKOUT_SESSION_ID,
          accessToken: process.env.LOOKOUT_ACCESS_TOKEN
        };
        return this.credentials;
      }

      throw new Error('No credentials available. Run auto-sync server first: node autoSyncFromChrome.js');

    } catch (error) {
      if (error.message.includes('No credentials available')) {
        throw error;
      }
      console.error('Error loading credentials:', error.message);
      throw new Error('Failed to load credentials');
    }
  }

  /**
   * Clears credential cache from memory and file system.
   */
  clearCache() {
    this.credentials = null;
    if (fs.existsSync(this.credentialsPath)) {
      fs.unlinkSync(this.credentialsPath);
    }
  }

  /**
   * Checks if valid credentials are available.
   * 
   * @returns {Promise<boolean>} True if credentials exist, false otherwise
   */
  async hasCredentials() {
    try {
      await this.getCredentials();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Manually sets credentials (primarily for testing purposes).
   * 
   * @param {string} sessionId - User session identifier
   * @param {string} accessToken - Authentication token
   * @param {string} [userEmail] - Optional user email
   */
  setCredentials(sessionId, accessToken, userEmail = null) {
    this.credentials = { 
      sessionId, 
      accessToken, 
      userEmail, 
      timestamp: Date.now() 
    };
    
    fs.writeFileSync(
      this.credentialsPath,
      JSON.stringify(this.credentials, null, 2)
    );
  }
}

module.exports = new ExtensionConnector();
