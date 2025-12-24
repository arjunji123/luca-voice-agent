// Paste this in LookoutAI Chrome Extension background.js or content script
// This will auto-sync credentials when page loads

(function autoSyncCredentials() {
  const SYNC_URL = 'http://localhost:9876/sync';
  const PING_URL = 'http://localhost:9876/ping';
  
  // Check if sync server is running
  fetch(PING_URL)
    .then(res => res.json())
    .then(data => {
      if (data.status === 'ready') {
        console.log('Voice agent sync server detected');
        
        // Get credentials from extension
        if (window.__LOOKOUTAI_EXTENSION__) {
          window.__LOOKOUTAI_EXTENSION__.getSession()
            .then(session => {
              // Post credentials to sync server
              return fetch(SYNC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session)
              });
            })
            .then(res => res.json())
            .then(result => {
              if (result.success) {
                console.log('✓ Credentials auto-synced to voice agent!');
              }
            })
            .catch(err => console.log('Auto-sync failed:', err.message));
        }
      }
    })
    .catch(() => {
      // Sync server not running, ignore silently
    });
})();
