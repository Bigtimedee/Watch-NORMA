#!/bin/bash
# One-time backfill: fetch NBA/MLB games for the date-picker range (-5 to +5 days from today).
# Run once from the project root: bash scripts/backfill-games.sh

URL="https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"

# Compute today's Eastern date
TODAY=$(TZ="America/New_York" date +%Y-%m-%d)

echo "Today (Eastern): $TODAY"
echo ""

for offset in -5 -4 -3 -2 -1 0 1 2 3 4 5; do
  # Compute target date by adding offset days (portable: uses python3)
  TARGET=$(TZ="America/New_York" python3 -c \
    "from datetime import date, timedelta, timezone; import os; \
     import zoneinfo; \
     tz = zoneinfo.ZoneInfo('America/New_York'); \
     today = date.today(); \
     print((today + timedelta(days=${offset})).strftime('%Y-%m-%d'))" 2>/dev/null || \
    python3 -c "from datetime import date, timedelta; print((date.today() + timedelta(days=${offset})).strftime('%Y-%m-%d'))")

  printf "Fetching %-12s ... " "$TARGET"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$URL" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"date\": \"$TARGET\"}")

  if [ "$STATUS" = "200" ]; then
    echo "OK"
  else
    echo "HTTP $STATUS (check Supabase logs)"
  fi

  sleep 3
done

echo ""
echo "Backfill complete. Open the NORMA app and check each date."
