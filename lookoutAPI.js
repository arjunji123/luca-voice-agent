const axios = require('axios');
const FormData = require('form-data');
const extensionConnector = require('./extensionConnector');

const API_URL = process.env.LOOKOUT_API_URL || 'https://lookout-test.onrender.com';
const API_TIMEOUT = 30000;
const HIRING_CHAT_TYPE = '2';

async function sendHiringRequest(message, meetingUrl) {
  try {
    // STEP 1: Get credentials for this specific meeting URL
    const credentials = extensionConnector.getCredentialsForMeeting(meetingUrl);

    if (!credentials || !credentials.sessionId || !credentials.accessToken) {
      console.error(`❌ No credentials found for meeting: ${meetingUrl}`);
      return {
        success: false,
        error: 'CREDENTIALS_MISSING',
        message: 'Missing sessionId or accessToken for this meeting.'
      };
    }

    console.log(`🔑 Using credentials for meeting: ${meetingUrl}`);

    const formData = new FormData();
    formData.append('message', message);
    formData.append('session_id', credentials.sessionId);
    formData.append('chat_type', HIRING_CHAT_TYPE);

    console.log('📤 API Request:', {
      url: `${API_URL}/api/luca_message`,
      meeting_url: meetingUrl,
      session_id: credentials.sessionId.substring(0, 20) + '...',
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
        extensionConnector.clearCredentialsForMeeting(meetingUrl);
        return {
          success: false,
          error: 'CREDENTIALS_EXPIRED',
          message: 'Token expired for this meeting.'
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
