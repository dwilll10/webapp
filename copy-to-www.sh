#!/bin/bash
set -e
mkdir -p www/icons
cp index.html app.js styles.css manifest.json sw.js www/
cp icons/icon-192.png icons/icon-512.png icons/icon.svg www/icons/
# Inject Capacitor bridge into the native-only copy of index.html
sed -i '' 's|<script src="app.js"></script>|<script src="capacitor.js"></script>\n  <script src="app.js"></script>|' www/index.html
echo "✓ www/ populated"
