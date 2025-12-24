const http = require('http');
const fs = require('fs');
const path = require('path');

const SYNC_PORT = 9876;
const CREDS_FILE = path.join(require('os').homedir(), '.lookoutai-credentials.json');
const MAX_CREDENTIAL_AGE_MS = 60 * 60 * 1000;

let syncServer = null;
let serverStarted = false;

function needsRefresh() {
  try {
    if (!fs.existsSync(CREDS_FILE)) {
      return { needed: true, reason: 'MISSING' };
    }
    
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const age = Date.now() - creds.timestamp;
    
    if (age > MAX_CREDENTIAL_AGE_MS) {
      return { needed: true, reason: 'EXPIRED', ageMinutes: Math.floor(age / (1000 * 60)) };
    }
    
    return { needed: false };
  } catch (error) {
    return { needed: true, reason: 'INVALID' };
  }
}

function startSyncServer(silent = false) {
  return new Promise((resolve, reject) => {
    if (syncServer || serverStarted) {
      resolve({ alreadyRunning: true });
      return;
    }
    
    syncServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', port: SYNC_PORT }));
        return;
      }
      
      if (req.method === 'POST' && req.url === '/sync') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const credentials = JSON.parse(body);
            fs.writeFileSync(CREDS_FILE, JSON.stringify(credentials, null, 2));
            
            if (!silent) {
              console.log('\n✓ Credentials synced!');
              console.log(`  Email: ${credentials.userEmail}`);
              console.log('🚀 Voice agent ready for hiring queries!\n');
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    syncServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        if (!silent) console.log(`Sync server already running on port ${SYNC_PORT}`);
        serverStarted = true;
        resolve({ alreadyRunning: true });
      } else {
        reject(error);
      }
    });
    
    syncServer.listen(SYNC_PORT, () => {
      serverStarted = true;
      if (!silent) {
        console.log(`\n🔄 Credential sync server running on port ${SYNC_PORT}`);
      }
      resolve({ started: true, port: SYNC_PORT });
    });
  });
}

function showInstructions() {
  console.log('\n' + '═'.repeat(70));
  console.log('⚠️  CREDENTIALS NEEDED');
  console.log('═'.repeat(70));
  console.log('\n📍 Option 1 (Recommended):');
  console.log('   Open https://lookoutai-dev.web.app in Chrome with extension');
  console.log('   Extension will auto-sync credentials in background\n');
  console.log('📍 Option 2 (Manual):');
  console.log('   Open Chrome Extension console and run:');
  console.log('\n   window.__LOOKOUTAI_EXTENSION__.getSession().then(s =>');
  console.log('     fetch("http://localhost:9876/sync", {');
  console.log('       method: "POST",');
  console.log('       headers: {"Content-Type": "application/json"},');
  console.log('       body: JSON.stringify(s)');
  console.log('     }));');
  console.log('\n' + '═'.repeat(70) + '\n');
}

async function autoSync() {
  const check = needsRefresh();
  
  if (!check.needed) {
    await startSyncServer(true);
    return { synced: true, message: 'Credentials valid' };
  }
  
  await startSyncServer(false);
  
  if (check.reason === 'MISSING') {
    console.log('\n⚠️  No credentials found');
  } else if (check.reason === 'EXPIRED') {
    console.log(`\n⚠️  Credentials expired (${check.ageMinutes} min old)`);
  } else {
    console.log('\n⚠️  Invalid credentials');
  }
  
  showInstructions();
  
  return { 
    needsSync: true, 
    reason: check.reason,
    serverRunning: true
  };
}

module.exports = {
  autoSync,
  needsRefresh,
  startSyncServer,
  showInstructions
};
