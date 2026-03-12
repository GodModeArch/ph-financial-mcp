#!/usr/bin/env bash
set -euo pipefail

echo "BSP Bank Directory - Update Checker"
echo "===================================="

# Re-fetch from API and compare count
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

echo "Fetching current institution count from BSP API..."
COUNT=$(curl -s "https://www.bsp.gov.ph/_api/web/lists/getbytitle('Institutions')/ItemCount" \
  -H "Accept: application/json;odata=verbose" | \
  grep -o '"ItemCount":[0-9]*' | grep -o '[0-9]*')

CURRENT=$(node -e "const d = require('./data/banks.json'); console.log(d.length);" 2>/dev/null || echo "0")

echo "BSP API count: $COUNT"
echo "Local dataset:  $CURRENT"
echo ""

if [ "$COUNT" != "$CURRENT" ]; then
  echo "CHANGE DETECTED: BSP has $COUNT institutions, local has $CURRENT."
  echo ""
  echo "To update, run:"
  echo "  node scripts/fetch-bsp-api.js"
  echo "  node scripts/psgc-join.js"
  echo "  npm test"
  echo "  # Review diff before deploying"
else
  echo "No changes detected. Dataset is up to date."
fi
