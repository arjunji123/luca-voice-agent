/**
 * Hiring Detection and Processing Module
 * 
 * Detects hiring-related queries in user input and manages the conversational
 * flow for collecting complete job requirements before initiating candidate search.
 */

const { sendHiringRequest } = require('./lookoutAPI');

const HIRING_KEYWORDS = [
  'hire', 'hiring', 'recruit', 'recruitment', 'candidate', 'candidates',
  'job', 'position', 'role', 'vacancy', 'looking for', 'need someone',
  'searching for', 'find me', 'talent', 'developer', 'engineer', 'manager',
  'designer', 'analyst', 'architect', 'specialist', 'full stack', 'backend',
  'frontend', 'hire karo', 'hire kar do', 'chahiye', 'dhundho'
];

const MIN_DETAIL_WORD_COUNT = 8;
const conversationState = {};

/**
 * Checks if the user input contains hiring-related intent.
 * 
 * @param {string} userText - User's input message
 * @returns {boolean} True if hiring intent is detected
 */
function isHiringQuery(userText) {
  const lowerText = userText.toLowerCase();
  return HIRING_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Validates if user has provided sufficient hiring details.
 * Requirements: job role mentioned and minimum word count met.
 * 
 * @param {string} userText - User's input message
 * @returns {boolean} True if adequate details are provided
 */
function hasEnoughDetails(userText) {
  const hasRole = /developer|engineer|designer|manager|analyst|architect|specialist|consultant/i.test(userText);
  const wordCount = userText.trim().split(/\s+/).length;
  const hasDetails = wordCount >= MIN_DETAIL_WORD_COUNT;
  
  return hasRole && hasDetails;
}

/**
 * Generates prompt requesting additional hiring details from user.
 * 
 * @returns {Object} Response object with guidance message
 */
function askForDetails() {
  return {
    success: true,
    needsMoreInfo: true,
    message: `I'd be happy to help you find the right candidate!

Please provide the following details:
- Role or position (e.g., Full Stack Developer, Backend Engineer)
- Years of experience required
- Skills or technologies (e.g., React, Node.js, Python)
- Location preference (optional)
- Any other specific requirements

You can provide all details together.`
  };
}

/**
 * Processes hiring query and initiates candidate search via API.
 * 
 * @param {string} userText - Complete hiring requirements
 * @param {string} [clientId='default'] - Client identifier for tracking conversation state
 * @returns {Promise<Object>} Processing result with success status and message
 */
async function processHiringQuery(userText, clientId = 'default') {
  try {
    if (!hasEnoughDetails(userText)) {
      conversationState[clientId] = { waitingForDetails: true };
      return askForDetails();
    }

    const result = await sendHiringRequest(userText);
    
    delete conversationState[clientId];
    
    if (result.success) {
      return {
        success: true,
        needsMoreInfo: false,
        message: `I've initiated a candidate search based on your requirements: "${userText}"

The system is now processing your request. This may take a few moments.`,
        apiResponse: result.data
      };
    } else {
      let errorMessage = 'Unable to process your hiring request.';
      if (result.error.includes('No credentials')) {
        errorMessage += ' Authentication credentials are missing. Please run the auto-sync server.';
      } else if (result.error.includes('Authentication failed')) {
        errorMessage += ' Your session has expired. Please re-authenticate.';
      }
      
      return {
        success: false,
        message: errorMessage,
        error: result.error
      };
    }
  } catch (error) {
    delete conversationState[clientId];
    
    return {
      success: false,
      message: 'An unexpected error occurred while processing your request.',
      error: error.message
    };
  }
}

/**
 * Main entry point for processing user input.
 * Routes hiring-related queries to appropriate handler.
 * 
 * @param {string} userText - User's input message
 * @param {string} [clientId='default'] - Client identifier
 * @returns {Promise<Object|null>} Processing result or null if not a hiring query
 */
async function handleUserInput(userText, clientId = 'default') {
  if (conversationState[clientId]?.waitingForDetails) {
    return await processHiringQuery(userText, clientId);
  }
  
  if (isHiringQuery(userText)) {
    return await processHiringQuery(userText, clientId);
  }
  
  return null;
}

/**
 * Resets conversation state for a specific client.
 * 
 * @param {string} clientId - Client identifier
 */
function resetConversation(clientId) {
  delete conversationState[clientId];
}

module.exports = {
  isHiringQuery,
  processHiringQuery,
  handleUserInput,
  resetConversation,
  HIRING_KEYWORDS
};
