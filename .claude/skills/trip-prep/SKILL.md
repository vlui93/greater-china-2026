---
name: trip-prep
description: End-to-end workflow for planning a trip into the trip-companion app and its Google Sheet in one pass — a single intake brief, a readiness check, sourced research per city, a paced day-by-day schedule with meal and alternative stops, seeding the Sheet safely, a QA pass, and one review round. Use this whenever someone wants to plan, research, draft, extend or rework a trip itinerary, add places or restaurants to a trip, or set up a new trip in the app — even if they only mention one city, one day or "some places to eat". Read the traveller's profile skill first if one is installed.
---

# Trip prep

Planning the first trip with this app took weeks of back-and-forth. Almost none of it was research — it was learning things one at a time: a food preference after the plan was written, a pace limit after the trip, that research sites were blocked, that Claude can't be reached from where they're going. This workflow front-loads all of that, so a trip goes from brief to a complete, checked plan with **one** question round at the start and **one** review at the end.

Before anything else:
- Read the **traveller-profile** skill if it's installed (it may be under another name; it holds standing preferences). Never re-ask what it answers.
- In this repo, read `CLAUDE.md`. Its rules (privacy, Sheet writes by id, sources for every fact) apply throughout, and the `quality-gates` skill backs them.

## 1. Intake — one message, asked once

Send the brief in `references/intake.md` as a single message, minus anything the profile already answers. Don't start research on a half-answered brief, and don't drip follow-up questions during research: collect anything new you're unsure about and ask it at the review (step 6), with your default stated. A default the person can veto costs nothing; a question that blocks the work costs a round.

## 2. Readiness check — before any research

Run `references/readiness.md`. It catches the things that silently ruined a session last time: research sites blocked by the environment's network policy, the Sheet connector missing, a backend key that doesn't work, and Claude being unreachable at the destination (mainland China, Hong Kong and Macau need a VPN). Report what's blocked in one go, with the fix for each; carry on with what isn't blocked.

## 3. Research — sourced, per city

Follow `references/research.md`. In short:
- **Mainstream highlights first** — what the place is famous for, even if it's not obviously the travellers' style (say what it is; let them choose). Then the travellers' must-dos and interests. Then food.
- **Food from local rankings**, not generic lists. Label every food place's spice level (a `Spice:` line in notes) and name the mild dishes.
- **Social media cross-check**: Claude can't read Xiaohongshu (it needs a login). Ask the person to paste or share posts or a saved list in the intake; extract places and dishes from what they share, then verify each on a map or review site before it goes in.
- **Every fact has a source** you actually read, or "from you". Unverifiable → leave it out or mark it "check". Copy names in other scripts; never invent pins, hours or prices.

## 4. Schedule — paced, with alternatives

Apply `references/scheduling.md`: pace judged by heavy days rather than stop counts — no two heavy days back to back (day trips, altitude, all-day parks, travel days), a flex half-day every few days, closed days, transfer and arrival buffers, a meal for every slot, and **one nearby alternative** for each meal and big stop, marked `OPTIONAL — …` in the stop notes. Travellers re-plan on the ground; alternatives are what make that easy.

## 5. Seed the Sheet

Write to the trip's Sheet in batches, following `CLAUDE.md` and the hook in `.claude/settings.json`: back up each tab first, read the whole tab fresh, address rows by id (`node tools/qa/sheet-plan.js plan …`), write, read back and `verify`. Tab columns are in `src/Code.head.gs` (`TABS`). Places go in Locations (with `name_zh`, `city`, `type`, `nav_app`, pins only from a source); stops in Schedule; day names in Days; tasks and packing in Checklist, starting from `references/checklist-starter.md` and adding what this trip needs (booking windows, real-name tickets, altitude, weather by city). A new trip gets a Trips row and any missing Cities first.

No Code.gs change should be needed for planning: all of this is data. If a plan seems to need one, say so at the review instead of doing it.

## 6. QA, then one review round

Run `node tools/qa/plan-check.js` and the QA list in `references/scheduling.md` ("Before the review"), and fix what they find. Then send one review message:
- a day-by-day table: date · area · stops (time) · meals (spice label) · alternatives · heavy/flex;
- what you couldn't verify, in plain words;
- the open questions you collected, each with the default you'll use if they don't answer;
- the pre-departure tasks with dates (booking windows open, real-name bookings, VPN/eSIM for Claude).

Apply their answers in one pass. If the review turns up a preference that will hold for future trips, offer to add it to the profile skill.

## What not to build or suggest

Check the profile's "never suggest" list. In general the trip app is for **today's plan** (Home) and **what's left to see** (Locations, with "visited" ticks). Booking apps, map apps, payment apps and expense-splitting apps already do their jobs well — link to them; don't duplicate them.
