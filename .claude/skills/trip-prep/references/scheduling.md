# Scheduling rules

Each rule comes from the first trip; the reason is given so edge cases can be judged. The profile's numbers override these defaults.

## Pace
- **Count heavy days, not stops.** Ten-plus short stops in a walkable city with an evening meal was fine. What wore the travellers out was a *run* of heavy days: four in a row (a day trip, another day trip, then two big parks at altitude) was the low point of the trip.
- **No two heavy days back to back.** Heavy = a day trip of 1 h+ each way, altitude, an all-day park or national park, a travel day with sightseeing on top, or a very early start. Put a light city day or a flex half-day between them, and label days "heavy", "light" or "flex" in the Days tab so the check (below) reads your intent.
- **A flex half-day every 3–4 days** (shopping, friends, rest). Travellers took these anyway, by dropping planned stops — plan them in so nothing important is the thing that gets dropped.
- **Arrival day after an overnight flight**: bag drop, one or two easy things, back to rest by early afternoon.
- **Departure day**: count back from the flight/train with the app's buffers (airport 2½ h, station or pier 45 min) and leave the last stop with time to spare.

## Shape of a day
- Morning: the place that gets crowded or closes early. Afternoon: museums and indoor things (heat, rain). Evening: night views, markets, lit-up streets.
- Group stops by area; the app's "Best order" and leg times help. Mark a day "heavy" or "flex" in its Days label if useful.
- **A meal for every slot** (breakfast where the hotel doesn't cover it, lunch, dinner), each with a nearby alternative. Breakfast near the first stop or the hotel.
- **Alternatives** go in as extra Schedule rows whose `notes` start `OPTIONAL — …` and say what they replace ("Pick this or …"). Non-spicy alternative for every spicy meal when the profile asks for it.

## Hard constraints to check
- Closed days (many museums close Mondays; some restaurants one weekday), last entry times, seasonal hours.
- Timed or real-name entry and when booking opens — straight into the Checklist with a due date.
- Transfers: realistic door-to-door times, luggage, early trains (where's breakfast?).
- Altitude: the first day high is gentle; flag the usual advice (slow down, no hot shower that night) as advice from a source.
- Weather norms per city for packing (say they're norms, not a forecast).

## Before the review (QA list)
Run `node tools/qa/plan-check.js <reads-dir or trip.json>` first — it checks the mechanical items below (heavy-day runs, flex gaps, meals, alternatives, closed-day hints, spice lines, missing names). Read the Locations and Schedule tabs (and Days, Bookings) with the Sheets connector first so the gate saves them under `.qa/state/reads/<sheetId>/`; a tab too large for one read can be saved there by hand as `{ "values": [...] }`. Then go through the rest by eye.
- [ ] `plan-check` has no errors; each warning is fixed or deliberately accepted (say which in the review).
- [ ] Every day: a meal per slot, at least one alternative, no closed-day clashes.
- [ ] No two heavy days in a row; a flex half-day every 3–4 days.
- [ ] Every food place has a `Spice:` line; spicy meals have a mild alternative.
- [ ] Every place: `name_zh` copied from a source, a city, a `nav_app`; pins only from a source.
- [ ] Every fact sourced, or marked "check"; the unverified list is ready for the review.
- [ ] Booking windows and real-name tickets are Checklist tasks with due dates; "eSIM/VPN covers Claude" is a task if the trip goes to mainland China, Hong Kong or Macau.
- [ ] Sheet writes verified (`sheet-plan.js verify`) and read back.
