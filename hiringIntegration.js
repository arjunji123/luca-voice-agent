const { sendHiringRequest } = require('./lookoutAPI');

// More specific hiring keywords to avoid false positives
const HIRING_KEYWORDS = [
  'hire someone', 'hiring for', 'recruit', 'recruiting', 'recruitment',
  'find candidate', 'find candidates', 'need candidate', 'looking for candidate',
  'job opening', 'vacancy', 'opening for', 'search for candidate',
  'need developer', 'need engineer', 'need designer',
  'hire developer', 'hire engineer', 'hire designer', 'hire professional', 'hire talent',
  'looking for developer', 'looking for engineer', 'looking for talent', 'looking for professional',
  'need talent', 'need professional', 'need developer', 'need engineer', 'need designer',
  'need manager', 'need lead', 'need scientist', 'need analyst',
];

const conversationState = {};

function isHiringQuery(text) {
  const lowerText = text.toLowerCase();

  // Must have explicit hiring intent - not just keywords like "AI" or "developer"
  const hasHiringIntent = HIRING_KEYWORDS.some(keyword => lowerText.includes(keyword));

  // Additional check: must have role-related words along with hiring intent
  const hasRole = /\b(developer|engineer|designer|manager|lead|scientist|analyst)\b/i.test(text);

  return hasHiringIntent && hasRole;
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
