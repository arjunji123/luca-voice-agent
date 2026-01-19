const { sendHiringRequest } = require('./lookoutAPI');

// Hiring keywords - flexible to catch various phrases
const HIRING_KEYWORDS = [
  'want to hire', 'need to hire', 'looking to hire',
  'hire someone', 'hiring for', 'hire a', 'hire an',
  'recruit', 'recruiting', 'recruitment',
  'find candidate', 'find candidates', 'need candidate', 'looking for candidate',
  'job opening', 'vacancy', 'opening for', 'search for candidate',
  'need developer', 'need engineer', 'need designer',
  'hire developer', 'hire engineer', 'hire designer', 'hire professional', 'hire talent',
  'looking for developer', 'looking for engineer', 'looking for talent', 'looking for professional',
  'need talent', 'need professional',
  'need manager', 'need lead', 'need scientist', 'need analyst',
];

const conversationState = {};

function isHiringQuery(text) {
  const lowerText = text.toLowerCase();

  // Check for hiring keywords
  const hasHiringIntent = HIRING_KEYWORDS.some(keyword => lowerText.includes(keyword));

  // Check for role-related words
  const hasRole = /\b(developer|engineer|designer|manager|lead|scientist|analyst|talent|professional)\b/i.test(text);

  // Also check for standalone "hire" or "hiring" followed by role
  const hasStandaloneHire = /\b(hire|hiring)\b/i.test(text) && hasRole;

  return (hasHiringIntent && hasRole) || hasStandaloneHire;
}

function hasEnoughDetails(text) {
  const wordCount = text.split(/\s+/).length;
  const hasRole = /\b(developer|engineer|designer|manager|lead|scientist|analyst)\b/i.test(text);
  return wordCount >= 8 && hasRole;
}

function askForDetails() {
  return {
    success: true,
    needsMoreInfo: true,
    message: "Please provide the role, required skills, and years of experience."
  };
}

async function processHiringQuery(userText, meetingUrl = null, sendToClient = null) {
  const clientKey = meetingUrl || 'default';

  try {
    if (!hasEnoughDetails(userText)) {
      conversationState[clientKey] = { waitingForDetails: true };
      return askForDetails();
    }

    // Send immediate response to user
    const immediateMsg = "Processing your hiring request, please wait...";

    // Process API in background with meetingUrl for credential retrieval
    sendHiringRequest(userText, meetingUrl).then(result => {
      if (result.success) {
        console.log('Hiring API Success:', result.data?.description || 'Candidates being searched');
      } else {
        console.log('Hiring API Failed:', result.error);
        console.log('   Error details:', result.message);
        if (result.details) {
          console.log('   Response:', JSON.stringify(result.details, null, 2));
        }
      }
    }).catch(err => {
      console.log('Hiring API Error:', err.message);
    });

    delete conversationState[clientKey];

    return {
      success: true,
      needsMoreInfo: false,
      message: immediateMsg + " I'll notify you once candidates are found. Check your dashboard for results."
    };

  } catch (error) {
    delete conversationState[clientKey];
    return {
      success: false,
      message: 'Error processing request.'
    };
  }
}

async function handleUserInput(userText, meetingUrl = null, sendToClient = null) {
  const clientKey = meetingUrl || 'default';

  if (conversationState[clientKey]?.waitingForDetails) {
    return await processHiringQuery(userText, meetingUrl, sendToClient);
  }

  if (isHiringQuery(userText)) {
    return await processHiringQuery(userText, meetingUrl, sendToClient);
  }

  return null;
}

function resetConversation(clientId = 'default') {
  delete conversationState[clientId];
}

module.exports = {
  isHiringQuery,
  handleUserInput,
  resetConversation
};
