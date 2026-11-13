/* City facts for the suites' Sheet: pin, time zone, region (cn = mainland China), and the taxi
   meter for the getting-around estimates. The app carries none of its own; they live in the
   Sheet's Cities tab. Public facts about real cities; nothing here says which were visited when. */
module.exports = () => [
 { "id": "city-hong-kong", "name": "Hong Kong", "name_zh": "香港", "lat": 22.3, "lng": 114.17, "tz": "Asia/Hong_Kong", "region": "hk", "map_app": "", "currency": "HK$", "round": 5, "flag": 29, "flag_km": 2, "per_km": 10.5, "high_at": 102.5, "per_km_high": 7, "transit": "MTR", "car": "taxi" },
 { "id": "city-macau", "name": "Macau", "name_zh": "澳门", "lat": 22.17, "lng": 113.55, "tz": "Asia/Macau", "region": "mo", "map_app": "", "currency": "MOP ", "round": 5, "flag": 21, "flag_km": 1.6, "per_km": 9.1, "high_at": "", "per_km_high": "", "transit": "bus", "car": "taxi" },
 { "id": "city-guangzhou", "name": "Guangzhou", "name_zh": "广州", "lat": 23.13, "lng": 113.26, "tz": "Asia/Shanghai", "region": "cn", "map_app": "", "currency": "¥", "round": 1, "flag": 12, "flag_km": 3, "per_km": 2.6, "high_at": "", "per_km_high": "", "transit": "metro", "car": "DiDi" },
 { "id": "city-foshan", "name": "Foshan", "name_zh": "佛山", "lat": 23.02, "lng": 113.12, "tz": "Asia/Shanghai", "region": "cn", "map_app": "", "currency": "¥", "round": 1, "flag": 10, "flag_km": 2.5, "per_km": 2.8, "high_at": "", "per_km_high": "", "transit": "metro", "car": "DiDi" },
 { "id": "city-chongqing", "name": "Chongqing", "name_zh": "重庆", "lat": 29.56, "lng": 106.55, "tz": "Asia/Shanghai", "region": "cn", "map_app": "", "currency": "¥", "round": 1, "flag": 10, "flag_km": 3, "per_km": 2, "high_at": "", "per_km_high": "", "transit": "metro", "car": "DiDi" },
 { "id": "city-chengdu", "name": "Chengdu", "name_zh": "成都", "lat": 30.66, "lng": 104.07, "tz": "Asia/Shanghai", "region": "cn", "map_app": "", "currency": "¥", "round": 1, "flag": 9, "flag_km": 2, "per_km": 1.9, "high_at": "", "per_km_high": "", "transit": "metro", "car": "DiDi" },
 { "id": "city-sydney", "name": "Sydney", "name_zh": "悉尼", "lat": -33.87, "lng": 151.21, "tz": "Australia/Sydney", "region": "", "map_app": "", "currency": "", "round": "", "flag": "", "flag_km": "", "per_km": "", "high_at": "", "per_km_high": "", "transit": "", "car": "" }
];
