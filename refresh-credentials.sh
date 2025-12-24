#!/bin/bash

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🔄 CREDENTIAL REFRESH"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Opening LookoutAI platform in your default browser..."
echo ""
echo "The Chrome Extension will automatically sync credentials"
echo "to your voice agent in the background."
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Open LookoutAI platform
open "https://lookoutai-dev.web.app" 2>/dev/null || \
xdg-open "https://lookoutai-dev.web.app" 2>/dev/null || \
echo "Please manually open: https://lookoutai-dev.web.app"

echo "✓ Browser opened. Credentials will sync automatically!"
echo ""
