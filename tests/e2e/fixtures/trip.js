/* An invented trip for the browser suites. Every place, booking, time and
 * reference here is made up — this repo is public, and a real itinerary lives
 * only in the Sheet. The dates are the app's built-in first trip (16 Oct –
 * 1 Nov 2026), which is already in index.html, so the suites need no Trips row.
 *
 * Shape, chosen so each feature has something to work on:
 *   Hong Kong 4 nights (Macau day trip by ferry from Sheung Wan)
 *   → train from West Kowloon → Guangzhou 4 nights
 *   → flight → Chengdu 7 nights (train day trip) → overnight flight home (Melbourne).
 * Traditional Chinese names in Hong Kong and Macau, Simplified on the mainland.
 * Getting-there, tickets and arrive-by are NOT here: they come from
 * trip-notes.json, which the suites import. */
module.exports = function trip() {
  const L = [], S = [];
  const loc = (id, en, zh, city, type, lat, lng, extra) => L.push(Object.assign({
    id, name_en: en, name_zh: zh, city, type, lat, lng,
    nav_app: /Hong Kong|Macau/.test(city) ? 'google' : 'amap',
    history_blurb: '', recommendations: '', dishes_to_order: '', souvenirs: '', notes: ''
  }, extra || {}));

  // Hong Kong
  loc('fx-hk-hotel',   'Test Harbour Hotel',  '測試海港酒店', 'Hong Kong', 'hotel',      22.2790, 114.1730);
  loc('fx-hk-peak',    'Test Peak',           '測試山頂',     'Hong Kong', 'attraction', 22.2712, 114.1500,
      { history_blurb: 'An invented lookout above an invented harbour. The view is best just before dusk.' });
  loc('fx-hk-market',  'Test Night Market',   '測試夜市',     'Hong Kong', 'attraction', 22.3065, 114.1702);
  loc('fx-hk-central', 'Test Covered Market', '測試街市'    , 'Hong Kong', 'shopping',   22.2846, 114.1555);
  loc('fx-hk-cable',   'Test Cable Car',      '測試纜車',     'Hong Kong', 'attraction', 22.2895, 113.9410);
  loc('fx-hk-buddha',  'Test Big Buddha',     '測試大佛',     'Hong Kong', 'attraction', 22.2540, 113.9050);
  loc('fx-hk-town',    'Test West Town',      '測試西城',     'Hong Kong', 'attraction', 22.2830, 114.1290);
  loc('fx-hk-noodle',  'Test Noodle Bar',     '測試麵家',     'Hong Kong', 'restaurant', 22.2838, 114.1520,
      { dishes_to_order: '雲吞麵 Wonton noodles — invented house special' });
  loc('fx-hk-dimsum',  'Test Dim Sum Hall',   '測試茶樓',     'Hong Kong', 'restaurant', 22.2820, 114.1570);
  loc('fx-hk-museum',  'Test Art Museum',     '測試藝術館',   'Hong Kong', 'attraction', 22.3020, 114.1600);
  loc('fx-hk-clock',   'Test Clock Tower',    '測試鐘樓',     'Hong Kong', 'attraction', 22.2950, 114.1690);
  loc('fx-hk-shoes',   'Test Shoe Lane',      '測試鞋巷'  ,   'Hong Kong', 'shopping',   22.3180, 114.1700);
  // Macau
  loc('fx-mo-ruins',   'Test Ruins',          '測試遺址',     'Macau',     'attraction', 22.1975, 113.5410);
  loc('fx-mo-square',  'Test Square',         '測試廣場',     'Macau',     'attraction', 22.1936, 113.5390);
  loc('fx-mo-bakery',  'Test Egg Tart Bakery','測試餅店',     'Macau',     'restaurant', 22.1530, 113.5560);
  loc('fx-mo-temple',  'Test Sea Temple',     '測試海廟',     'Macau',     'attraction', 22.1860, 113.5310);
  // Guangzhou
  loc('fx-gz-hotel',   'Test Garden Inn',     '测试花园酒店', 'Guangzhou', 'hotel',      23.1150, 113.2620);
  loc('fx-gz-hall',    'Test Clan Hall',      '测试祠堂',     'Guangzhou', 'attraction', 23.1260, 113.2450);
  loc('fx-gz-isle',    'Test Island',         '测试岛',       'Guangzhou', 'attraction', 23.1070, 113.2420);
  loc('fx-gz-tower',   'Test TV Tower',       '测试电视塔',   'Guangzhou', 'attraction', 23.1060, 113.3240);
  loc('fx-gz-tea',     'Test Tea House',      '测试酒家',     'Guangzhou', 'restaurant', 23.1190, 113.2560);
  loc('fx-gz-street',  'Test Walking Street', '测试步行街',   'Guangzhou', 'shopping',   23.1250, 113.2680);
  loc('fx-gz-park',    'Test Park',           '测试公园',     'Guangzhou', 'attraction', 23.1390, 113.2640);
  // Chengdu
  loc('fx-cd-hotel',   'Test Bamboo Hotel',   '测试竹林酒店', 'Chengdu',   'hotel',      30.6550, 104.0800);
  loc('fx-cd-panda',   'Test Panda Park',     '测试熊猫园',   'Chengdu',   'attraction', 30.7330, 104.1460);
  loc('fx-cd-temple',  'Test Monastery',      '测试禅院',     'Chengdu',   'attraction', 30.6740, 104.0730);
  loc('fx-cd-alley',   'Test Wide Alley',     '测试宽巷',     'Chengdu',   'attraction', 30.6640, 104.0560);
  loc('fx-cd-hotpot',  'Test Hotpot',         '测试火锅',     'Chengdu',   'restaurant', 30.6520, 104.0850);
  loc('fx-cd-tofu',    'Test Tofu House',     '测试豆腐坊',   'Chengdu',   'restaurant', 30.6700, 104.0450);
  loc('fx-cd-mall',    'Test Mall',           '测试商场',     'Chengdu',   'shopping',   30.6530, 104.0830);
  loc('fx-cd-museum',  'Test Sichuan Museum', '测试四川馆',   'Chengdu',   'attraction', 30.6600, 104.0400);
  loc('fx-cd-oldtown', 'Test Old Town',       '测试古镇',     'Chengdu',   'attraction', 30.6100, 104.0100);

  // The plan, day by day: [place, time]
  const plan = {
    '2026-10-17': [['fx-hk-hotel', '14:00'], ['fx-hk-peak', '15:30'], ['fx-hk-market', '19:00']],
    '2026-10-18': [['fx-hk-dimsum', '08:00'], ['fx-hk-central', '10:00'], ['fx-hk-noodle', '12:30'], ['fx-hk-museum', '15:00'], ['fx-hk-clock', '18:00']],
    '2026-10-19': [['fx-hk-central', '09:00'], ['fx-hk-cable', '10:30'], ['fx-hk-buddha', '13:00'], ['fx-hk-town', '17:30']],
    '2026-10-20': [['fx-mo-ruins', '10:00'], ['fx-mo-square', '11:30'], ['fx-mo-bakery', '13:00'], ['fx-mo-temple', '15:00']],
    '2026-10-21': [['fx-gz-hotel', '14:00'], ['fx-gz-tea', '18:30']],
    '2026-10-22': [['fx-gz-hall', '09:00'], ['fx-gz-park', '11:00'], ['fx-gz-street', '14:00'], ['fx-gz-tower', '17:30']],
    '2026-10-23': [['fx-gz-isle', '10:00'], ['fx-gz-tea', '12:00'], ['fx-gz-street', '15:00']],
    '2026-10-24': [['fx-gz-park', '10:00'], ['fx-gz-isle', '16:00']],
    '2026-10-25': [['fx-cd-hotel', '15:30'], ['fx-cd-museum', '16:30']],
    '2026-10-26': [['fx-cd-temple', '09:30'], ['fx-cd-alley', '11:00'], ['fx-cd-tofu', '12:30'], ['fx-cd-mall', '15:00']],
    '2026-10-27': [['fx-cd-alley', '10:00'], ['fx-cd-hotpot', '19:00']],
    '2026-10-28': [['fx-cd-panda', '08:00'], ['fx-cd-temple', '11:00'], ['fx-cd-tofu', '13:00'], ['fx-cd-mall', '16:00']],
    '2026-10-29': [['fx-cd-oldtown', '10:30']],
    '2026-10-30': [['fx-cd-panda', '09:00']],
    '2026-10-31': [['fx-cd-mall', '18:00'], ['fx-cd-hotel', '20:00']]
  };
  let n = 0;
  Object.keys(plan).forEach(date => plan[date].forEach((p, i) => {
    n++; S.push({ id: 'fx-sc-' + String(n).padStart(2, '0'), date, order_index: i + 1, location_id: p[0], planned_time: p[1], notes: '' });
  }));

  const bk = (id, type, date, time, description, details) =>
    ({ id, type, date, time, description, confirmation_no: 'FX' + id.slice(-2) + '000', details: details || '' });
  const B = [
    bk('fx-bk-01', 'flight', '2026-10-16', '',      'Melbourne (MEL) → Hong Kong (HKG) — Test Air'),
    bk('fx-bk-02', 'ferry',  '2026-10-20', '07:45', 'Hong Kong → Macau — Test Ferry from Sheung Wan'),
    bk('fx-bk-03', 'train',  '2026-10-21', '09:00', 'West Kowloon → Guangzhou South — Test Rail', 'TO BOOK. Invented train.'),
    bk('fx-bk-04', 'flight', '2026-10-25', '11:20', 'Guangzhou (CAN) → Chengdu (TFU) — Test Air TA330'),
    bk('fx-bk-05', 'train',  '2026-10-29', '',      'Chengdu East → Test Town — high-speed rail'),
    bk('fx-bk-06', 'flight', '2026-11-01', '00:50', 'Chengdu Tianfu (TFU) → Melbourne (MEL) — Test Air TA700'),
    bk('fx-bk-07', 'hotel',  '2026-10-17', '15:00', 'Test Harbour Hotel 測試海港酒店 — Hong Kong'),
    bk('fx-bk-08', 'hotel',  '2026-10-21', '15:00', 'Test Garden Inn 测试花园酒店 — Guangzhou'),
    bk('fx-bk-09', 'hotel',  '2026-10-25', '15:00', 'Test Bamboo Hotel 测试竹林酒店 — Chengdu')
  ];
  return { bookings: B, locations: L, schedule: S };
};
