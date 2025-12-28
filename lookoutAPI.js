const axios = require('axios');
const FormData = require('form-data');
const extensionConnector = require('./extensionConnector');

const API_URL = process.env.LOOKOUT_API_URL || 'https://lookout-test.onrender.com';
const API_TIMEOUT = 30000;
const HIRING_CHAT_TYPE = '2';

async function sendHiringRequest(message) {
  try {
    // STEP 1: Get credentials from extension (fresh every time)
    const credentials = await extensionConnector.getCredentialsFromExtension();
    
    if (!credentials || !credentials.sessionId || !credentials.accessToken) {
      return {
        success: false,
        error: 'CREDENTIALS_MISSING',
        message: 'Missing sessionId or accessToken in request.'
      };
    }

    const formData = new FormData();
    formData.append('message', message);
    formData.append('session_id', credentials.sessionId);
    formData.append('chat_type', HIRING_CHAT_TYPE);

    console.log('📤 API Request:', {
      url: `${API_URL}/api/luca_message`,
      session_id: credentials.sessionId,
      chat_type: HIRING_CHAT_TYPE,
      message_length: message.length
    });

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

    console.log('📥 API Response:', response.status, response.data);

    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });

      if (error.response.status === 401) {
        extensionConnector.clearCache();
        return {
          success: false,
          error: 'CREDENTIALS_EXPIRED',
          message: 'Token expired. Run: node syncCredentials.js'
        };
      }
      
      return {
        success: false,
        error: `API_ERROR_${error.response.status}`,
        message: error.response.data?.description || error.response.data?.message || error.response.statusText,
        details: error.response.data
      };
    }

    console.error('Network Error:', error.message);
    
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error.message
    };
  }
}

module.exports = { sendHiringRequest };
