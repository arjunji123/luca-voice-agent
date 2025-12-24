const { sendHiringRequest } = require('./lookoutAPI');

const HIRING_KEYWORDS = [
  'hire', 'hiring', 'recruit', 'recruiting', 'recruitment',
  'candidate', 'candidates', 'talent', 'developer', 'engineer',
  'looking for', 'need', 'required', 'position', 'role',
  'job opening', 'vacancy', 'opening', 'search for',
  'full stack', 'frontend', 'backend', 'devops', 'data scientist',
  'ml engineer', 'designer', 'product manager', 'tech lead'
];

const conversationState = {};

function isHiringQuery(text) {
  const lowerText = text.toLowerCase();
  return HIRING_KEYWORDS.some(keyword => lowerText.includes(keyword));
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
    message: "Please provide: role, skills, experience years, and location (optional)."
  };
}

async function processHiringQuery(userText, clientId = 'default') {
  try {
    if (!hasEnoughDetails(userText)) {
      conversationState[clientId] = { waitingForDetails: true };
      return askForDetails();
    }

    // Send immediate response to user
    const immediateMsg = "Processing your hiring request, please wait...";
    
    // Process API in background (don't wait)
    sendHiringRequest(userText).then(result => {
      if (result.success) {
        console.log('✅ Hiring API Success:', result.data?.description || 'Candidates being searched');
      } else {
        console.log('❌ Hiring API Failed:', result.error);
        console.log('   Error details:', result.message);
        if (result.details) {
          console.log('   Response:', JSON.stringify(result.details, null, 2));
        }
      }
    }).catch(err => {
      console.log('❌ Hiring API Error:', err.message);
    });

    delete conversationState[clientId];
    
    return {
      success: true,
      needsMoreInfo: false,
      message: immediateMsg + " I'll notify you once candidates are found. Check your dashboard for results."
    };
    
  } catch (error) {
    delete conversationState[clientId];
    return { 
      success: false, 
      message: 'Error processing request.'
    };
  }
}

async function handleUserInput(userText, clientId = 'default') {
  if (conversationState[clientId]?.waitingForDetails) {
    return await processHiringQuery(userText, clientId);
  }
  
  if (isHiringQuery(userText)) {
    return await processHiringQuery(userText, clientId);
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
