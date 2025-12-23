/**
 * LookoutAI API Client
 * 
 * Handles authenticated requests to the LookoutAI API.
 * Automatically manages credentials and authentication headers.
 */

const axios = require('axios');
const FormData = require('form-data');
const extensionConnector = require('./extensionConnector');

const API_URL = process.env.LOOKOUT_API_URL || 'https://lookout-test.onrender.com';
const API_TIMEOUT = 30000;
const HIRING_CHAT_TYPE = '2';

/**
 * Sends hiring requirements to LookoutAI for candidate search.
 * 
 * @param {string} message - Hiring requirements (role, skills, experience, etc.)
 * @returns {Promise<Object>} Response object with success status and data/error
 */
async function sendHiringRequest(message) {
  try {
    const credentials = await extensionConnector.getCredentials();
    
    if (!credentials || !credentials.sessionId || !credentials.accessToken) {
      throw new Error('Missing required credentials');
    }

    const formData = new FormData();
    formData.append('message', message);
    formData.append('session_id', credentials.sessionId);
    formData.append('chat_type', HIRING_CHAT_TYPE);

    const response = await axios.post(
      `${API_URL}/api/luca_message`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${credentials.accessToken}`
        },
        timeout: API_TIMEOUT
      }
    );

    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        extensionConnector.clearCache();
        return {
          success: false,
          error: 'Authentication failed. Please re-sync credentials.'
        };
      }
      
      return {
        success: false,
        error: `API error: ${error.response.status} - ${error.response.statusText}`
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendHiringRequest
};
