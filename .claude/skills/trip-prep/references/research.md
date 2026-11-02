# Research

## Order, per city
1. **Mainstream highlights** — the things the city is famous for (the landmark, the night view, the casino strip, the big market). Include them with one line on what they are, even if they don't look like the travellers' style: on the first trip they skipped the plan to go to exactly these. Let them strike them at the review.
2. **Must-dos and interests** from the intake.
3. **Food** — one primary pick per meal slot plus one nearby alternative. Sources in order of trust: Michelin Bib Gourmand / guide entries, Dianping 必吃榜 and high-ranked listings, Amap's ranking lists, well-reviewed TripAdvisor/Trip.com entries, posts the travellers shared. Note walk-in vs booking, and queues.
4. **Snacks and things to order** per place (`dishes_to_order`), and what's worth buying (`souvenirs`) — from the source, with the name in the local script copied, never retyped.

## Sources — the rule that matters most
- Every fact (address, hours, closed days, price, phone, dish, history, coordinates) comes from a page you read, or "from you". Put the source in your working notes; say what you couldn't verify in the review.
- No source → leave it out, or write it as something to check ("hours not confirmed — check in Amap").
- **Never invent coordinates, booking references, opening hours or prices.** Pins come from a map source (Amap/Google share link, OSM/Nominatim). Mainland Amap pins are GCJ-02 — the app converts links pasted into it; if you write a pin yourself, convert with the same function the app uses or leave it blank (the app then searches the Chinese name).
- When two sources disagree, say so and pick the safer reading for anything time-critical.
- **Xiaohongshu and other login-walled sources**: you can't read them. Use what the person pastes (post text, screenshots, share links) as a lead only, then confirm the place exists, its branch and area on Amap/Dianping before adding it. Credit it in notes ("from your Xiaohongshu list").

## Place records (Locations tab)
- `name_en` and `name_zh` (both — the Chinese name is what map searches and drivers need), `city` (matching a Cities row), `type` (attraction / restaurant / shopping / hotel), `nav_app` (amap on the mainland, google in HK/Macau).
- `history_blurb` (2–4 sourced sentences), `recommendations`, `dishes_to_order`, `souvenirs`, `notes` (practical: branch, booking, closed days, cash/card).
- **Food places carry a spice line** as the first line of `notes`: `Spice: none`, `Spice: mild options` (name them), or `Spice: spicy` — the app shows it as a tag and filters on it. Choose from the menu evidence, not the cuisine's reputation; a Sichuan restaurant with clear-broth and non-chilli dishes is "mild options".
- Don't rename a place whose name carries the person's own note ("(Optional)", "(FAR)", times in brackets).

## Breadth vs depth
Aim for enough to re-plan on the ground — the travellers decide day by day — not an exhaustive list. Per city: the highlights, the must-dos, a primary and an alternative for every meal, and a few "if you have time nearby" extras. More than that becomes reading, not planning.
