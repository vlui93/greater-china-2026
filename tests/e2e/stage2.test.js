/* The Locations map and its filters, the map of a day, best order, find a place by name, importing KML/KMZ/Takeout files, and Chinese names required only in China. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({});

  const zlib=require('zlib');
  const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  let tiles=0; await page.ctx.route('**/tile.openstreetmap.org/**', r=>{ tiles++; r.fulfill({status:200,contentType:'image/png',body:PNG}); });
  let nomQ=null;
  await page.ctx.route('**/nominatim.openstreetmap.org/**', r=>{ nomQ=new URL(r.request().url()); r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {lat:"22.3302",lon:"114.1622",category:"amenity",type:"restaurant",name:"Test Dim Sum",display_name:"Test Dim Sum, 9 Test Street, Test District, Kowloon, Hong Kong, China",
     namedetails:{name:"測試點心 Test Dim Sum","name:en":"Test Dim Sum","name:zh":"測試點心"}},
    {lat:"22.2800",lon:"114.1600",category:"tourism",type:"hotel",name:"Test Inn",display_name:"Test Inn, Central, Hong Kong, China",namedetails:{name:"Test Inn"}}])}); });

  console.log('\n1. Locations map');
  await page.evaluate(()=>setView("places")); await wait(200);
  await page.click('[data-act="places-mode"][data-v="map"]'); await wait(1500);
  const pinned=await page.evaluate(()=>store.data.locations.filter(hasXY).length);
  const mk=await page.$$eval('#placesMap .leaflet-marker-icon', e=>e.length);
  ok(mk===pinned && mk>10, 'every place with a pin is on the map ('+mk+')');
  const tileImgs=await page.$$eval('#placesMap img.leaflet-tile', e=>e.map(x=>x.src));
  ok(tileImgs.length>0 && tileImgs.every(u=>/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)), 'OpenStreetMap tiles ('+tileImgs.length+', '+tiles+' fetched)');
  ok(new RegExp(pinned+' on the map').test(await page.innerText('.maplegend')), 'legend counts the pins');
  // the user's case: zoom in somewhere, then filter — the map must move to the filtered places
  await page.evaluate(()=>maps.places.setView([30.66,104.07],15)); await wait(300);
  await page.click('[data-act="city"][data-v="Macau"]'); await wait(1500);
  const inView=await page.evaluate(()=>{ const b=maps.places.getBounds(); const ls=store.data.locations.filter(l=>l.city==="Macau"&&hasXY(l));
    return ls.filter(l=>b.contains([+l.lat,+l.lng])).length+'/'+ls.length; });
  ok(/^(\d+)\/\1$/.test(inView), 'filtering to Macau moves the map onto every Macau pin ('+inView+')');
  await page.click('[data-act="city"][data-v="Chengdu"]'); await wait(1500);
  await page.evaluate(()=>maps.places.setView([22.19,113.54],16)); await wait(300);
  await page.click('[data-act="type"][data-v="restaurant"]'); await wait(1500);
  const hv=await page.evaluate(()=>{ const b=maps.places.getBounds(); const ls=store.data.locations.filter(l=>l.city==="Chengdu"&&l.type==="restaurant"&&hasXY(l));
    return ls.filter(l=>b.contains([+l.lat,+l.lng])).length+'/'+ls.length; });
  ok(/^([1-9]\d*)\/\1$/.test(hv), 'type filter too: Chengdu restaurants all in view ('+hv+')');
  await page.click('[data-act="type"][data-v="All"]'); await wait(300);
  await page.click('[data-act="city"][data-v="Macau"]'); await wait(1500);
  await page.evaluate(()=>maps.places.setView([22.19,113.54],17)); await wait(300);
  await page.evaluate(()=>render()); await wait(1500);
  ok(await page.evaluate(()=>maps.places.getZoom())===17, 'same filter, redrawn (a sync): stays where you were');
  await page.click('[data-act="city"][data-v="All"]'); await wait(300); await page.click('[data-act="city"][data-v="Macau"]'); await wait(1500);
  const mac=await page.evaluate(()=>store.data.locations.filter(l=>l.city==="Macau"&&hasXY(l)).length);
  ok(await page.$$eval('#placesMap .leaflet-marker-icon', e=>e.length)===mac, 'city filter applies to the map ('+mac+')');
  await page.locator('#placesMap .leaflet-marker-icon').first().click({force:true}); await wait(400);
  ok(await page.$('.leaflet-popup [data-act="open"]')!==null, 'tapping a pin shows a popup with Details');
  await page.click('.leaflet-popup [data-act="open"]'); await wait(300);
  ok(await page.evaluate(()=>document.getElementById("sheet").classList.contains("open")), 'Details opens the place');
  await page.evaluate(()=>closeSheet()); await wait(200);
  ok(await page.$$eval('#placesMap .leaflet-marker-icon', e=>e.length)===mac, 'closing a sheet leaves the Locations map alone');
  await page.click('[data-act="city"][data-v="All"]'); await wait(300);
  await page.click('[data-act="places-mode"][data-v="list"]'); await wait(300);
  ok(await page.$('#placesMap')===null && await page.$('#q')!==null, 'back to the list');

  console.log('\n2. map of the day');
  await page.evaluate(()=>{ homeMode="day"; ui.day="2026-10-22"; setView("today"); }); await wait(300);
  const nStops=await page.evaluate(()=>store.dayStops("2026-10-22").map(s=>store.loc(s.location_id)).filter(l=>l&&hasXY(l)).length);
  await page.click('[data-act="day-map"]'); await wait(1500);
  const labels=await page.$$eval('#dayMap .leaflet-marker-icon', e=>e.map(x=>x.innerText.trim()));
  ok(labels.filter(x=>/^\d+$/.test(x)).length===nStops, 'numbered stops: '+labels.join(','));
  ok(await page.$$eval('#dayMap path.leaflet-interactive', e=>e.length)>0, 'route drawn');
  await page.evaluate(()=>closeSheet()); await wait(200);
  ok(await page.evaluate(()=>!maps.sheet), 'sheet map removed on close');

  console.log('\n3. best order');
  const r3=await page.evaluate(()=>{
    const P=(id,lat,time,type)=>({ s:{id:id,planned_time:time||""}, l:{id:id,lat:lat,lng:114,type:type||"attraction"} });
    const start={lat:22.0,lng:114}, end={lat:22.0,lng:114};
    const a=P("a",22.01), b=P("b",22.02), c=P("c",22.03), d=P("d",22.04);
    const r1=orderDay([c,a,d,b], start, null).seq.map(x=>x.s.id).join("");
    // a timed stop stays put relative to other fixed ones; free ones fit around it
    const t=P("t",22.05,"09:00"), u=P("u",22.10,"15:00");
    const r2=orderDay([u,b,t,a], start, null).seq.map(x=>x.s.id).join("");
    return {r1:r1, r2:r2};
  });
  ok(r3.r1==="abcd", 'shortest way from the hotel: '+r3.r1);
  ok(r3.r2.indexOf("u")<r3.r2.indexOf("t"), 'timed stops keep their order: '+r3.r2);
  // a real day, scrambled
  const day="2026-10-28";
  const before=await page.evaluate(d=>store.dayStops(d).map(s=>s.id), day);
  await page.evaluate(d=>{ const st=store.dayStops(d); st.forEach(s=>s.planned_time=""); const ids=st.map(s=>s.id); const sh=[ids[2],ids[0],ids[3],ids[1]].concat(ids.slice(4)).filter(Boolean); return commitOrder(d, sh); }, day);
  await page.evaluate(d=>{ ui.day=d; setView("today"); }, day); await wait(300);
  let msg=''; page.once('dialog', dlg=>{ msg=dlg.message(); dlg.accept(); });
  await page.click('[data-act="best-order"]'); await wait(800);
  ok(/Best order — about/.test(msg), 'asks first, with the saving: '+msg.split('\n')[0]);
  const after=await page.evaluate(d=>store.dayStops(d).map(s=>s.id), day);
  const sheetOrder=rows('Schedule').filter(s=>s.date===day).sort((a,b)=>a.order_index-b.order_index).map(s=>s.id);
  ok(JSON.stringify(after)===JSON.stringify(sheetOrder), 'new order saved to the Sheet');
  let msg2=null; page.once('dialog', dlg=>{ msg2=dlg.message(); dlg.dismiss(); });
  await page.click('[data-act="best-order"]'); await wait(500);
  ok(msg2===null && /already about as short/.test(await page.innerText('#toast')), 'running it again: already the shortest');

  console.log('\n4. find by name');
  await page.click('[data-act="quick-add"]'); await wait(200);
  await page.selectOption('#f_city','Hong Kong');
  await page.fill('#f_find','dim sum'); await page.click('[data-act="find-place"]'); await wait(500);
  ok(nomQ && nomQ.searchParams.get('q')==='dim sum' && /^113\.\d+,22\.\d+,114\.\d+,21\.\d+$/.test(nomQ.searchParams.get('viewbox')||''), 'searched near Hong Kong: '+(nomQ&&nomQ.searchParams.get('viewbox')));
  ok(await page.$$eval('#f_find_results button', e=>e.length)===2, 'two results listed');
  await page.click('[data-act="find-pick"][data-i="0"]'); await wait(300);
  const f=await page.evaluate(()=>({en:$("#f_name_en").value, zh:$("#f_name_zh").value, lat:$("#f_lat").value, city:$("#f_city").value, nav:$("#f_nav_app").value, type:$("#f_type").value}));
  ok(f.en==='Test Dim Sum' && f.zh==='測試點心' && f.lat==='22.3302' && f.city==='Hong Kong' && f.nav==='google' && f.type==='restaurant', 'form filled: '+JSON.stringify(f));
  await page.evaluate(()=>closeSheet());

  console.log('\n5. import a file');
  const KML='<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>List</name>'+
    '<Placemark><name>Test Temple 测试寺</name><description><![CDATA[Go early<br>Free]]></description><Point><coordinates>113.2645,23.1291,0</coordinates></Point></Placemark>'+
    '<Placemark><name>Test Bakery</name><Point><coordinates>114.1700,22.3000,0</coordinates></Point></Placemark>'+
    '<Placemark><name>A route</name><LineString><coordinates>114,22 114.1,22.1</coordinates></LineString></Placemark>'+
    '</Document></kml>';
  // A KMZ as My Maps makes it: a zip with doc.kml, deflated
  const zipOne=(name,text)=>{ const data=zlib.deflateRawSync(Buffer.from(text)), nm=Buffer.from(name), len=Buffer.byteLength(text);
    const lh=Buffer.alloc(30); lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(8,8); lh.writeUInt32LE(data.length,18); lh.writeUInt32LE(len,22); lh.writeUInt16LE(nm.length,26);
    const cd=Buffer.alloc(46); cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6); cd.writeUInt16LE(8,10); cd.writeUInt32LE(data.length,20); cd.writeUInt32LE(len,24); cd.writeUInt16LE(nm.length,28); cd.writeUInt32LE(0,42);
    const local=Buffer.concat([lh,nm,data]), central=Buffer.concat([cd,nm]);
    const e=Buffer.alloc(22); e.writeUInt32LE(0x06054b50,0); e.writeUInt16LE(1,8); e.writeUInt16LE(1,10); e.writeUInt32LE(central.length,12); e.writeUInt32LE(local.length,16);
    return Buffer.concat([local,central,e]); };
  await page.evaluate(()=>setView("places")); await wait(200);
  await page.setInputFiles('#placesFile', {name:'My list.kmz', mimeType:'application/vnd.google-earth.kmz', buffer:zipOne('doc.kml',KML)}); await wait(600);
  let txt=await page.innerText('#sheetBody');
  ok(/2 in My list\.kmz/.test(txt), 'KMZ: two pins read (the route skipped)');
  ok(await page.$('#imp_shift')!==null, 'offers to move mainland pins to GPS');
  const nBefore=await page.evaluate(()=>store.data.locations.length);
  await page.click('[data-act="import-apply"]'); await wait(800);
  const tmpl=await page.evaluate(()=>store.data.locations.filter(l=>/^Test (Temple|Bakery)$/.test(l.name_en)).map(l=>({en:l.name_en,zh:l.name_zh,city:l.city,lat:+l.lat,nav:l.nav_app,notes:l.notes})));
  const tt=tmpl.find(x=>x.en==='Test Temple'), tb=tmpl.find(x=>x.en==='Test Bakery');
  ok(tmpl.length===2 && tt.zh==='测试寺' && tt.city==='Guangzhou' && tt.nav==='amap' && /Go early\nFree/.test(tt.notes), 'Temple: names split, city, Amap, notes '+JSON.stringify(tt));
  ok(Math.abs(tt.lat-23.1291)>0.001 && Math.abs(tt.lat-23.1291)<0.01, 'mainland pin moved off the Chinese grid ('+tt.lat+')');
  ok(tb.city==='Hong Kong' && tb.lat===22.3 && tb.nav==='google', 'Hong Kong pin left alone');
  ok(rows('Locations').filter(l=>/^Test (Temple|Bakery)$/.test(l.name_en)).length===2, 'saved to the Sheet');
  // the same file again: both already there, nothing ticked
  await page.setInputFiles('#placesFile', {name:'My list.kml', mimeType:'application/vnd.google-earth.kml+xml', buffer:Buffer.from(KML)}); await wait(500);
  ok(/2 already on your list/.test(await page.innerText('#sheetBody')) && await page.$$eval('.implist input:checked',e=>e.length)===0, 'KML again: both spotted as already there, unticked');
  await page.evaluate(()=>closeSheet());
  const GJ={type:"FeatureCollection",features:[
    {type:"Feature",geometry:{type:"Point",coordinates:[114.1580,22.2830]},properties:{google_maps_url:"https://maps.google.com/?cid=1",location:{name:"Test Noodles",address:"1 Test Rd, Central"}}},
    {type:"Feature",geometry:{type:"Point",coordinates:[0,0]},properties:{google_maps_url:"https://www.google.com/maps/place/X/@22.2700,114.1500,17z",location:{name:"Test Lookout"}}}]};
  await page.setInputFiles('#placesFile', {name:'Saved Places.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(GJ))}); await wait(500);
  txt=await page.innerText('#sheetBody');
  ok(/Test Noodles/.test(txt) && /Test Lookout[\s\S]*Hong Kong/.test(txt) && !/no pin/.test(txt), 'Takeout GeoJSON: pins from geometry, and from the link when 0,0');
  await page.evaluate(()=>closeSheet());
  const CSV='Title,Note,URL,Tags,Comment\n"Test Cafe, Wan Chai","Good, cheap",https://www.google.com/maps/place/Test/@22.2770,114.1720,17z,,\nTest Unknown,,https://www.google.com/maps/place/Unknown/data=!4m2!3m1!1s0x1:0x2,,\n';
  await page.setInputFiles('#placesFile', {name:'Want to go.csv', mimeType:'text/csv', buffer:Buffer.from(CSV)}); await wait(500);
  txt=await page.innerText('#sheetBody');
  ok(/Test Cafe, Wan Chai/.test(txt) && /Test Unknown[\s\S]*no pin/.test(txt) && !await page.$('#imp_shift'), 'Takeout CSV: quoted commas, a pin from the link, one without');
  await page.selectOption('#imp_city','Macau');
  await page.click('[data-act="import-apply"]'); await wait(500);
  const tu=await page.evaluate(()=>store.data.locations.find(l=>l.name_en==="Test Unknown"));
  ok(tu && tu.city==='Macau' && tu.lat==='' && tu.notes==='', 'no pin: goes to the city picked for it');

  console.log('\n6. Chinese names: required in China only');
  await page.evaluate(()=>locationForm(null)); await wait(200);
  await page.fill('#f_name_en','Only English'); await page.selectOption('#f_city','Chengdu');
  await page.click('[data-act="save-location"]'); await wait(300);
  ok(/Chinese name is required/.test(await page.innerText('#toast')), 'Chengdu: still required');
  await page.selectOption('#f_city','Sydney');
  await page.click('[data-act="save-location"]'); await wait(400);
  ok(await page.evaluate(()=>store.data.locations.some(l=>l.name_en==="Only English"&&l.city==="Sydney")), 'Sydney: saved without one');
});
