#!/usr/bin/env node
/**
 * One-time Credential Setup
 * 
 * Run this once to extract credentials from Chrome Extension.
 * After this, voice agent will automatically use stored credentials.
 * 
 * Usage: node setupCredentials.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDENTIALS_FILE = path.join(os.homedir(), '.lookoutai-credentials.json');
const PORT = 9999;

console.log('\n' + '='.repeat(60));
console.log('LookoutAI Credential Setup');
console.log('='.repeat(60) + '\n');

if (fs.existsSync(CREDENTIALS_FILE)) {
  try {
    const existing = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    const ageMinutes = Math.floor((Date.now() - existing.timestamp) / (1000 * 60));
    
    console.log('Existing credentials found:');
    console.log('  Session ID: ' + existing.sessionId.substring(0, 15) + '...');
    console.log('  Age: ' + ageMinutes + ' minutes');
    console.log('  Email: ' + (existing.userEmail || 'N/A'));
    
    if (ageMinutes < 60) {
      console.log('\nCredentials are still valid. You can skip setup.');
      console.log('\nTo continue anyway, delete the file:');
      console.log('  rm ~/.lookoutai-credentials.json\n');
      process.exit(0);
    } else {
      console.log('\nCredentials are expired. Setting up new ones...\n');
    }
  } catch (e) {
    console.log('Found invalid credentials file. Setting up new ones...\n');
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/sync-credentials') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const credentials = JSON.parse(body);
        
        if (!credentials.sessionId || !credentials.accessToken) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing credentials' }));
          return;
        }

        credentials.timestamp = Date.now();
        fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));

        console.log('SUCCESS! Credentials saved.');
        console.log('  Location: ' + CREDENTIALS_FILE);
        console.log('\nYou can now run: node index.js\n');

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));

        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);

      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }
});

server.listen(PORT, 'localhost', () => {
  console.log('Temporary server started on port ' + PORT);
  console.log('\nOpen Chrome and follow these steps:\n');
  console.log('1. Go to https://lookoutai.com (make sure you are logged in)');
  console.log('2. Open Developer Console (Press F12)');
  console.log('3. Paste this code and press Enter:\n');
  console.log('-'.repeat(60));
  console.log(`
if (window.__LOOKOUTAI_EXTENSION__) {
  window.__LOOKOUTAI_EXTENSION__.getSession().then(async session => {
    await fetch('http://localhost:${PORT}/sync-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
    console.log('Credentials synced successfully!');
  });
} else {
  console.error('Extension not found. Make sure Chrome Extension is installed.');
}
`);
  console.log('-'.repeat(60));
  console.log('\nWaiting for credentials...\n');
});

setTimeout(() => {
  console.log('\nTimeout: No credentials received after 60 seconds.');
  console.log('Please make sure:');
  console.log('  1. You are logged in on LookoutAI.com');
  console.log('  2. Chrome Extension is installed and active');
  console.log('  3. You pasted the code in the correct console\n');
  server.close();
  process.exit(1);
}, 60000);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('\nError: Port ' + PORT + ' is already in use.');
    console.error('Another setup process may be running.\n');
  } else {
    console.error('\nError:', error.message);
  }
  process.exit(1);
});
