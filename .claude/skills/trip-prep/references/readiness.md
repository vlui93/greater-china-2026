# Readiness check

Do this before research. Report everything that's blocked in **one** message with the fix for each, then get on with whatever isn't blocked. Each item is here because it silently cost a round last time.

## 1. Can this session research?
Probe the sites you'll need (a quick `curl -sS -m 8 -o /dev/null -w "%{http_code}" https://<host>/` or a fetch). In a cloud environment the network policy may refuse them, and web search alone only gives summaries — not enough to source a fact.

Typical hosts for a China / Hong Kong / Macau trip:
`en.wikivoyage.org`, `en.wikipedia.org`, `www.tripadvisor.com`, `www.trip.com`, `us.trip.com`, `www.klook.com`, `www.dianping.com`, `www.amap.com`, `nominatim.openstreetmap.org`, `guide.michelin.com`, plus official sites of the sights you're researching.

If refused: tell the person to add them under the environment's **Network access → Allowed domains** (session title bar → environment → Edit), and offer the fallback — they paste names or share links and you add only what those show.

## 2. Is the Sheet connected?
Read the trip Sheet (find it by name with the Drive connector; read `Trips` and one other tab). Confirm the hook in `.claude/settings.json` is live (`node tools/qa/sheet-gate.js status`). For a brand-new trip, decide whether it goes in the same Sheet (the app supports several trips) — usually yes.

## 3. Does the backend answer?
If the person has just pasted a new `Code.gs`, check a phone can sync: after their first Sync, any new column from the update should appear in the Sheet's header row. The app's ⚙ Settings → Test names the cause if not (wrong key, key missing after a paste, deployment not open to "Anyone").

## 4. Will Claude be reachable on the trip?
Claude isn't reachable from mainland China, Hong Kong or Macau without a VPN (the travellers' eSIM had one). Ask about their phone plan in the intake; if it has no VPN, say plainly that changes during the trip will have to be made in the app (which needs no Claude and no redeploy), and that big replanning should be finished before departure. Add a checklist task two weeks before departure: "Check the eSIM/VPN covers Claude".

## 5. Anything time-critical?
Booking windows that open soon (trains, timed-entry sights, popular restaurants) go straight into the Checklist with due dates, before the rest of the research — they don't wait for the review.
