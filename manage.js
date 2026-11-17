/* Setting things up and changing the plan: Settings, trips and cities, adding
   and editing a place (from a map link, by name, from another trip), choosing
   a day for a place, stop notes, day names, the best order for a day, and
   Recently deleted. Loaded the first time any of them is opened (see PARTS in
   index.html), and kept offline by the service worker. */
"use strict";

function isOwner(){ return !!whoAmI().owner; }

function renameDay(date){
  var v=window.prompt("Name for "+fmtDate(date,true)+" (blank to work it out from the plan)", dayLabel(date));
  if(v===null) return;
  var row={ id:"day-"+TRIP.id+"-"+date.replace(/-/g,""), trip_id:TRIP.id, date:date, label:v.trim() };
  store.write("saveDay", row, function(){
    store.raw.days=(store.raw.days||[]).filter(function(d){ return d.id!==row.id; }).concat([row]);
  }).then(function(){ render(); toast(row.label ? "Renamed" : "Name cleared"); });
}

function binSheet(){
  var items=binItems();
  var html = items.length ? '<p class="blurb small muted" style="margin:12px 0 12px">'+
      'Places deleted on any phone on this trip.'+
      ' Restore puts a place back, with its stops on the days they were on.</p><div class="loclist">'+items.map(function(it){
      var l=it.loc, n=it.stops.length;
      return '<div class="locrow"><div class="thumb">'+typeIcon(l.type)+'</div>'+
        '<div class="lb"><div class="en">'+esc(l.name_en||"")+'</div><div class="zh zh">'+escz(l.name_zh||"")+'</div>'+
        '<div class="mt">'+esc(l.city||"")+' · deleted '+esc(fmtDate(it.at.slice(0,10),false))+(it.by?' by '+esc(it.by):'')+(n?' · '+n+' stop'+(n>1?'s':''):'')+'</div></div>'+
        '<button class="btn sm primary" data-act="bin-restore" data-bid="'+esc(it.id)+'">Restore</button>'+
        '<button class="btn sm ghost" data-act="bin-forget" data-bid="'+esc(it.id)+'" aria-label="Remove from the bin">'+IC.close+'</button></div>';
    }).join("")+'</div>'
    : '<div class="card empty" style="margin-top:12px">'+'Nothing in the bin.'+'</div>';
  openSheet("Recently deleted", html);
}

function locationForm(id){
  var l = id ? store.loc(id) : null;
  var isNew = !l;
  var cities=cityOptions();
  l = l || { id:"", name_en:"", name_zh:"", city:cities[0]||"", type:"attraction",
             lat:"", lng:"", nav_app:mapAppFor(cities[0]), history_blurb:"", recommendations:"",
             dishes_to_order:"", souvenirs:"", notes:"", getting_there:"", arrive_by:"", tickets:"" };
  if(l.city && cities.indexOf(l.city)<0) cities.push(l.city);

  function sel(name,val,opts){
    return '<select id="f_'+name+'">'+opts.map(function(o){
      return '<option value="'+esc(o)+'"'+(String(val)===String(o)?" selected":"")+'>'+esc(o)+'</option>';
    }).join("")+'</select>';
  }
  linkEditing = isNew ? null : l.id;
  var html = (isNew ? findBoxHTML()+linkBoxHTML() : linkBoxHTML(true))+
    '<div class="field"><label>Name (English)</label><input id="f_name_en" value="'+esc(l.name_en)+'" placeholder="English name"></div>'+
    '<div class="field"><label>名称 (Chinese) — required in China</label>'+
      '<input id="f_name_zh" class="zh" value="'+esc(l.name_zh)+'" placeholder="中文名" style="font-size:19px">'+
      '<div class="hint">Every place in mainland China, Hong Kong and Macau needs a Chinese name — it is what search, the map apps and showing your phone to a local all run on.</div></div>'+
    '<div class="grid2">'+
      '<div class="field"><label>City</label>'+sel("city",l.city,cities)+'</div>'+
      '<div class="field"><label>Type</label>'+sel("type",l.type,["attraction","restaurant","shopping","hotel"])+'</div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Latitude</label><input id="f_lat" inputmode="decimal" value="'+esc(l.lat)+'" placeholder="30.6690"></div>'+
      '<div class="field"><label>Longitude</label><input id="f_lng" inputmode="decimal" value="'+esc(l.lng)+'" placeholder="104.0570"></div>'+
    '</div>'+
    '<div class="field"><label>Map link — Navigate opens this</label><input id="f_map_url" inputmode="url" autocapitalize="off" autocorrect="off" value="'+esc(l.map_url||"")+'" placeholder="https://maps.app.goo.gl/… or https://surl.amap.com/…">'+
      '<div class="hint">The share link from Google Maps or Amap, short ones included. Pasting into the box at the top fills this in too. Leave it empty to navigate by the pin or the Chinese name.</div></div>'+
    '<div class="field"><label>Map app</label>'+sel("nav_app",l.nav_app,MAP_APPS)+
      '<div class="hint">Amap 高德 for the mainland, Google Maps for Hong Kong, Macau and most other places. Set automatically when you pick a city, unless you change it.</div></div>'+
    '<div class="field"><label>Getting there</label><textarea id="f_getting_there" style="min-height:80px" placeholder="Nearest station and exit, and when a taxi is better.">'+esc(l.getting_there||"")+'</textarea></div>'+
    '<div class="field"><label>Best way to arrive</label><input id="f_arrive_by" value="'+esc(l.arrive_by||"")+'" placeholder="Optional — e.g. Peak Tram from Central">'+
      '<div class="hint">Only for places reached one particular way. It replaces the worked-out walk / taxi line on the day view, so leave it blank for anywhere a taxi or the metro is fine.</div></div>'+
    '<div class="field"><label>Tickets</label><textarea id="f_tickets" style="min-height:80px" placeholder="Price, where to buy, booking rules, closing days.">'+esc(l.tickets||"")+'</textarea></div>'+
    '<div class="field"><label>Background / history</label><textarea id="f_history_blurb" placeholder="A couple of paragraphs you would happily read out loud.">'+esc(l.history_blurb)+'</textarea></div>'+
    '<div class="field"><label>What to do here</label><textarea id="f_recommendations" placeholder="One per line.">'+esc(l.recommendations)+'</textarea>'+
      '<div class="hint">One item per line.</div></div>'+
    '<div class="field"><label>Dishes to order</label><textarea id="f_dishes_to_order" placeholder="麻婆豆腐 Mapo tofu — why it matters">'+esc(l.dishes_to_order)+'</textarea>'+
      '<div class="hint">One per line, Chinese name first then English.</div></div>'+
    '<div class="field"><label>Worth buying</label><textarea id="f_souvenirs" placeholder="郫县豆瓣酱 Pixian chilli bean paste">'+esc(l.souvenirs)+'</textarea></div>'+
    '<div class="field"><label>Practical notes</label><textarea id="f_notes" style="min-height:70px">'+esc(l.notes)+'</textarea></div>'+
    '<div class="field"><label>Ticket link</label><input id="f_ticket_url" inputmode="url" autocapitalize="off" autocorrect="off" value="'+esc(l.ticket_url||"")+'" placeholder="https://… your e-ticket or booking page">'+
      '<div class="hint">A link to the ticket — a Trip.com order, a PDF in Google Drive. Never the QR code itself. It opens from this page and from the trip overview.</div></div>'+
    '<div class="field"><label>Photo link</label><input id="f_photo_url" inputmode="url" autocapitalize="off" autocorrect="off" value="'+esc(l.photo_url||"")+'" placeholder="Found automatically — or paste an https image link">'+
      '<div class="hint">Photos are found on Wikipedia by each phone and saved for offline use. Paste a link to use your own, or type <b>none</b> for no photo.</div></div>'+
    '<div class="formactions">'+
      '<button class="btn primary" data-act="save-location" data-lid="'+esc(l.id)+'">Save</button>'+
      (isNew?"":'<button class="btn danger" data-act="delete-location" data-lid="'+esc(l.id)+'">Delete</button>')+
    '</div>';
  openSheet(isNew?"New place":"Edit place", html);
  bindLinkBox(); bindFindBox();

  var citySel=$("#f_city"), navSel=$("#f_nav_app");
  citySel.addEventListener("change", function(){ navSel.value = mapAppFor(this.value); });
}

function collectLocationForm(existingId){
  var g=function(k){ var e=$("#f_"+k); return e?e.value.trim():""; };
  var o={
    id: existingId || "",
    name_en:g("name_en"), name_zh:g("name_zh"), city:g("city"), type:g("type"),
    lat:g("lat"), lng:g("lng"), nav_app:g("nav_app"),
    // g() is null-safe on purpose: the day view's quick-add form has only a
    // few of these fields, and reading .value off a missing one used to throw.
    history_blurb:g("history_blurb"), recommendations:g("recommendations"),
    dishes_to_order:g("dishes_to_order"), souvenirs:g("souvenirs"), notes:g("notes"),
    getting_there:g("getting_there"), arrive_by:g("arrive_by"), tickets:g("tickets"),
    ticket_url:g("ticket_url"), photo_url:g("photo_url"), map_url:g("map_url")
  };
  if(o.map_url && !mapLinkOf(o)) return { error:"The map link needs to be a Google Maps or Amap https:// link" };
  if(o.ticket_url && !safeUrl(o.ticket_url)) return { error:"The ticket link needs to start with https://" };
  if(o.photo_url && o.photo_url.toLowerCase()==="none") o.photo_url="none";
  else if(o.photo_url && !safeUrl(o.photo_url)) return { error:"The photo link needs to start with https://" };
  if(!o.name_en && !o.name_zh) return { error:"Give the place a name." };
  if(!o.name_zh && CHINA_REGIONS[cityRegion(o.city)]) return { error:"The Chinese name is required — you will need it on the ground." };
  if(!o.name_en) o.name_en=o.name_zh;
  if(!o.id) o.id=uid("loc");
  return { value:o };
}

function isShortMapLink(u){ return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|surl\.amap\.com|a\.amap\.com|m\.amap\.com\/share)/i.test(u); }

function nameFromTitle(t){
  t=String(t||"").replace(/\s*[-–—|]\s*(Google\s*Maps?|Google 地圖|Google 地图|高德地图|高德地圖|Amap).*$/i,"").trim();
  return /^(Google\s*Maps?|高德地图|Amap)$/i.test(t) ? "" : t;
}

/** Merges what the backend found at the end of a short link. */
function mergeResolved(p, r){
  var q=JSON.parse(JSON.stringify(p));
  var fin=(r && r.final_url)||"";
  q.source=q.source||mapSource(fin);
  var c=coordsFrom(fin);
  if(!c && r && r.hints) for(var i=0;i<r.hints.length && !c;i++) c=coordsFrom(r.hints[i]);
  if(c && q.lat==null){ q.lat=c.lat; q.lng=c.lng; }
  // The share text and the link can disagree on language: Amap set to
  // English shares an English name, while the link still carries the
  // Chinese one. Take each language from wherever it turns up first.
  var zh="", en="";
  [q.name, nameFromUrl(fin), nameFromTitle(r && r.title)].forEach(function(n){
    var s=splitNames(n); zh=zh||s.zh; en=en||s.en;
  });
  q.name=[en, zh].filter(Boolean).join(" ");
  return q;
}

/** The pasted place in the app's terms: GPS coordinates, city, names, type. */
function placeFromParsed(p){
  var out={ names:splitNames(p.name), address:p.address, lat:null, lng:null, city:"", shiftedM:0, source:p.source };
  if(p.lat!=null){
    var lat=p.lat, lng=p.lng;
    if(regionOf(lat,lng)==="mainland" && (p.source==="amap"||p.source==="google")){
      var w=gcjToWgs(lat,lng);
      out.shiftedM=Math.round(roadKm({lat:lat,lng:lng},{lat:w[0],lng:w[1]})/ROAD_FACTOR*1000);
      lat=w[0]; lng=w[1];
    }
    out.lat=+lat.toFixed(6); out.lng=+lng.toFixed(6);
    out.city=cityFor(out.lat,out.lng);
  }
  out.type=guessType(p.name);
  return out;
}

/* The place being edited, when the link box is on an existing place: a
   pasted link then sets or moves its pin and leaves its names, city and type
   as they are — names often carry the user's own notes, like "(FAR)". */
var linkEditing=null;

function linkBoxHTML(editing){
  return '<div class="field linkbox"><label for="f_link">'+(editing ? "Set the pin from a map link" : "From a map link")+'</label>'+
    '<textarea id="f_link" rows="2" placeholder="Paste a Google Maps or Amap link — or everything the Share button copies"></textarea>'+
    '<div class="linkrow"><button class="btn sm" data-act="link-paste">Paste</button>'+
      '<button class="btn sm primary" data-act="link-fill">Fill in</button></div>'+
    '<div class="hint" id="f_link_status" role="status">'+(editing
      ? 'Sets or moves this place&#39;s pin; its names stay as they are. Walking and taxi times, and when to leave for a train or flight, then work from the new pin.'
      : 'On the mainland, share from Amap — it gives you the Chinese name. ')+
      'Pins are moved from the Chinese map grid to GPS for you.</div></div>';
}

function setField(id, v, onlyIfEmpty){
  var e=$("#"+id); if(!e || v==null || v==="") return false;
  if(onlyIfEmpty && e.value.trim()) return false;
  if(e.tagName==="SELECT" && ![].some.call(e.options,function(o){ return o.value===v; })){
    var o=document.createElement("option"); o.value=v; o.textContent=v; e.appendChild(o);
  }
  e.value=v; e.dispatchEvent(new Event("change",{bubbles:true})); return true;
}

function applyPlace(pl){
  setField("f_name_zh", pl.names.zh, true);
  setField("f_name_en", pl.names.en, true);
  if(pl.lat!=null){ setField("f_lat", String(pl.lat)); setField("f_lng", String(pl.lng)); }
  if(!linkEditing){
    if(pl.city){ setField("f_city", pl.city); setField("f_nav_app", mapAppFor(pl.city)); }
    setField("f_type", pl.type);
  }
  var n=$("#f_notes");
  if(pl.address && n && n.value.indexOf(pl.address)<0) n.value=(n.value?n.value+"\n":"")+"Address: "+pl.address;
  // Describe what the form now holds, not just what this pass changed: a
  // short link fills the names first and the pin a second later.
  var zh=$("#f_name_zh").value.trim(), en=$("#f_name_en").value.trim(), hasPin=!!$("#f_lat").value.trim();
  var msg=[];
  if(!zh && !en && !hasPin){ linkStatus("Nothing usable in that yet."); return; }
  msg.push("<b>"+esc(zh||en)+"</b>"+(zh&&en?" · "+esc(en):"")+($("#f_city").value?" · "+esc($("#f_city").value):"")+
           (hasPin?" · pin set.":"."));
  if(n && /Address: /.test(n.value)) msg.push("Address added to notes.");
  if(pl.shiftedM>0) msg.push("Pin moved "+pl.shiftedM+" m from the Chinese map grid to GPS.");
  if(!$("#f_name_zh").value.trim()) msg.push("<b>Add the Chinese name</b> — "+(pl.source==="google"?"Google only gave the English one.":"it's required."));
  var dup=nearDuplicate(pl);
  if(dup && dup.id!==linkEditing) msg.push("<b>Already on your list:</b> "+esc(dup.name_en)+" "+esc(dup.name_zh)+" — to use it, add it from “+ Add a stop” instead.");
  linkStatus(msg.join(" "));
}

function fillFromLink(){
  var box=$("#f_link"); if(!box) return;
  var p=parseMapText(box.value);
  if(!p.url && !p.name && p.lat==null){ linkStatus("Paste a Google Maps or Amap link, or the text their Share button copies."); return; }
  applyPlace(placeFromParsed(p));
  if(p.url && mapLinkOf({ map_url:p.url })) setField("f_map_url", p.url);
  if(p.lat!=null || !p.url || !isShortMapLink(p.url)) return;
  // A bare short link has nothing readable on this side; say why, plainly.
  var got=$("#f_name_zh").value.trim()||$("#f_name_en").value.trim();
  var lead=got ? $("#f_link_status").innerHTML+" " : "";
  if(!store.configured()){
    linkStatus(lead+"That's a short link — reading it needs the Sheet connected. For now, type the Chinese name: that alone is enough for the map app to find it.");
    return;
  }
  var before=got ? $("#f_link_status").innerHTML : "";
  linkStatus(before+" <i>Looking up the link…</i>");
  store.call("resolvePlace", { url:p.url }).then(function(r){
    var pl=placeFromParsed(mergeResolved(p, r));
    applyPlace(pl);
    if(pl.lat==null) linkStatus($("#f_link_status").innerHTML+" The link didn't include a pin — the map app will search the Chinese name instead, which usually works.");
  }).catch(function(err){
    linkStatus((got?before+" ":"")+"Couldn't look the link up just now — no signal to Google? Type the Chinese name for now; that alone is enough to navigate.");
  });
}

function bindLinkBox(){
  var box=$("#f_link"); if(!box) return;
  box.addEventListener("paste", function(){ setTimeout(fillFromLink, 0); });
}

function quickAddForm(date){
  linkEditing=null;
  var html =
    '<p class="blurb muted small" style="margin-bottom:14px">Just enough to navigate to it. Fill in the rest later.</p>'+
    findBoxHTML()+linkBoxHTML()+'<input type="hidden" id="f_map_url">'+
    '<div class="field"><label>Name (English)</label><input id="f_name_en" placeholder="That noodle place"></div>'+
    '<div class="field"><label>名称 (Chinese) — required in China</label><input id="f_name_zh" class="zh" style="font-size:19px" placeholder="小面馆"></div>'+
    '<div class="grid2">'+
      '<div class="field"><label>City</label><select id="f_city">'+
        cityOptions().map(function(c){
          return '<option'+(c===(guessCity(date)||"")?" selected":"")+'>'+esc(c)+'</option>'; }).join("")+
      '</select></div>'+
      '<div class="field"><label>Type</label><select id="f_type">'+
        ["attraction","restaurant","shopping","hotel"].map(function(t){return "<option>"+t+"</option>";}).join("")+
      '</select></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Latitude</label><input id="f_lat" inputmode="decimal" placeholder="optional"></div>'+
      '<div class="field"><label>Longitude</label><input id="f_lng" inputmode="decimal" placeholder="optional"></div>'+
    '</div>'+
    '<div class="field"><label>Map app</label><select id="f_nav_app">'+
      MAP_APPS.map(function(a){ return '<option value="'+a+'">'+a+'</option>'; }).join("")+'</select>'+
      '<div class="hint">Without coordinates the map app will search the Chinese name instead, which usually works.</div></div>'+
    '<div class="field"><label>Time on this day</label><input id="f_time" placeholder="e.g. 14:30"></div>'+
    '<div class="field"><label>Notes</label><textarea id="f_notes" style="min-height:60px" placeholder="Optional"></textarea></div>'+
    '<div class="formactions"><button class="btn primary block" data-act="save-quick" data-date="'+esc(date)+'">Add to Day '+dayNumber(date)+'</button></div>';
  openSheet("New place · Day "+dayNumber(date), html);
  bindLinkBox(); bindFindBox();
  var c=$("#f_city"), n=$("#f_nav_app");
  function syncNav(){ n.value=mapAppFor(c.value); }
  syncNav(); c.addEventListener("change", syncNav);
}

var MAP_APPS = ["amap","google","apple"];

function guessCity(date){
  var stops=store.dayStops(date);
  for(var i=0;i<stops.length;i++){ var l=store.loc(stops[i].location_id); if(l) return l.city; }
  var here=baseOn(date, tripBases()); if(here) return here;
  var lbl=dayLabel(date), known=cityList();
  for(var j=0;j<known.length;j++) if(lbl.indexOf(known[j].name)>=0) return known[j].name;
  return "";
}

function pickLocationForDay(date){
  function results(q){
    var list=store.data.locations.filter(function(l){ return matches(l,q); });
    var already={}; store.dayStops(date).forEach(function(s){ already[s.location_id]=1; });
    return '<div class="loclist">'+list.map(function(l){
        return '<button class="locrow" data-act="pick" data-lid="'+esc(l.id)+'" data-date="'+esc(date)+'">'+
          (photoOf(l) ? '<div class="thumb photo" style="'+bgStyle(photoOf(l))+'"></div>' : '<div class="thumb">'+typeIcon(l.type)+'</div>')+
          '<div class="lb"><div class="en">'+hilite(l.name_en,q)+'</div>'+
            '<div class="zh zh">'+hilite(l.name_zh,q)+'</div>'+
            '<div class="mt">'+esc(l.city)+' · '+esc(l.type)+(already[l.id]?" · already on this day":"")+'</div></div>'+
          '<span class="rowend">'+IC.plus+'</span></button>';
      }).join("")+'</div>'+
      (list.length?"":'<div class="card empty">No match.</div>');
  }
  openSheet("Add to Day "+dayNumber(date),
    '<div class="searchwrap" style="margin-top:12px">'+
      '<span class="mag"><svg class="svgic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.2 4.2"/></svg></span>'+
      '<input id="pq" type="search" placeholder="Search — English or 中文" autocomplete="off">'+
    '</div>'+
    '<div id="pickResults">'+results("")+'</div>'+
    (otherTripPlaces().length ? '<button class="btn block ghost" data-act="library" style="margin-top:12px">Copy a place from another trip</button>' : ''));
  var i=$("#pq");
  if(i) i.addEventListener("input", function(){
    // Only the list is redrawn — see renderPlaces for why the box must stay put.
    var r=$("#pickResults"); if(r) r.innerHTML=results(this.value);
    var w=this.closest(".searchwrap"); if(w) w.classList.toggle("has", !!this.value);
  });
}

function pickDayForLocation(lid){
  var html='<div class="loclist" style="margin-top:12px">'+DAYS.map(function(d,i){
    var n=store.dayStops(d).length;
    return '<button class="locrow" data-act="pick" data-lid="'+esc(lid)+'" data-date="'+d+'">'+
      '<div class="thumb">'+(i+1)+'</div>'+
      '<div class="lb"><div class="en">'+esc(fmtDate(d,true))+'</div>'+
      '<div class="mt">'+esc(dayLabel(d))+' · '+n+' stop'+(n===1?"":"s")+'</div></div>'+
      '<span class="rowend">'+IC.plus+'</span></button>';
  }).join("")+'</div>';
  openSheet("Add to which day?", html);
}

function backendNoteHTML(){
  if(!backendBehind()) return "";
  return '<div class="loclist" style="margin-top:12px"><div class="locrow" id="backendNote"><div class="lb"><div class="en">Backend needs updating</div>'+
    '<div class="mt">The Sheet’s script is version '+store.v+'; this app is built for version '+BACKEND_WANT+'. Everything you had still works. '+
    (isOwner() ? 'For faster syncing and the Inbox: paste the latest Code.gs into Apps Script, then Deploy › Manage deployments › edit › New version.'
               : 'Faster syncing and the Inbox switch on once the trip owner updates it.')+'</div></div></div></div>';
}

function settingsForm(){
  var c=store.cfg;
  var html=
    '<p class="blurb small muted" style="margin:12px 0 16px">The trip lives in the Google Sheet — nothing about it is in the '+
    'public repo. This phone holds a cached copy, so the app keeps working with no signal, and where Google '+
    'can’t be reached. Every edit is saved to the Sheet and shared across devices.</p>'+
    '<div class="field"><label>Your name</label>'+
      '<input id="s_me" autocomplete="given-name" value="'+esc(getMe())+'" placeholder="Optional">'+
      '<div class="hint">Shown on shared items you tick, so the others know who is bringing what. Saved on this phone.</div></div>'+
    '<div class="field"><label>Web App URL</label>'+
      '<input id="s_url" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="https://script.google.com/macros/s/.../exec" value="'+esc(c.url)+'"></div>'+
    '<div class="field"><label>API key</label>'+
      '<input id="s_key" autocapitalize="off" autocorrect="off" placeholder="the API_KEY you set in Code.gs" value="'+esc(c.key)+'">'+
      '<div class="hint">Stored only on this phone, never in the public repo.</div></div>'+
    '<div class="formactions">'+
      '<button class="btn primary" data-act="save-cfg">Save &amp; connect</button>'+
      '<button class="btn" data-act="test-cfg">Test</button>'+
    '</div>'+
    backendNoteHTML()+
    (store.lastError && store.lastError.kind ? '<div class="loclist" style="margin-top:12px"><div class="locrow syncerr"><div class="lb"><div class="en">Last sync</div>'+
      '<div class="mt">'+esc(syncProblem(store.lastError))+'</div></div></div></div>' : '')+
    peopleSectionHTML()+tripsSectionHTML()+citiesSectionHTML()+
    '<div class="section-title">Data</div>'+
    '<div class="loclist">'+
      '<div class="locrow"><div class="lb"><div class="en">Pending changes</div>'+
        '<div class="mt">'+store.queue.length+' waiting to be sent to the Sheet</div></div>'+
        '<button class="btn sm" data-act="flush">Send</button></div>'+
      '<div class="locrow"><div class="lb"><div class="en">Pull from the Sheet</div>'+
        '<div class="mt">Replace this phone’s copy with what is in the Sheet</div></div>'+
        '<button class="btn sm" data-act="sync" data-fresh="1">Pull</button></div>'+
      '<div class="locrow"><div class="lb"><div class="en">Import trip notes</div>'+
        '<div class="mt">Getting there, tickets and arrival notes from a .json file — kept on this phone</div></div>'+
        '<button class="btn sm" data-act="import-notes">Import</button></div>'+
      '<input type="file" id="importFile" accept="application/json,.json,text/plain" hidden>'+
      (function(){ var ps=photoStats();
        return '<div class="locrow"><div class="lb"><div class="en">Photos</div>'+
          '<div class="mt" id="photoStat">'+ps.n+' of '+ps.of+' places · '+ps.mb+' MB saved for offline · from Wikipedia, checked against each pin</div></div>'+
          '<button class="btn sm" data-act="find-photos">Find</button></div>'; })()+
      '<div class="locrow"><div class="lb"><div class="en">Reset this phone</div>'+
        '<div class="mt">Discards the local copy and downloads the trip again</div></div>'+
        '<button class="btn sm danger" data-act="reset-local">Reset</button></div>'+
    '</div>'+
    '<div class="section-title">About</div>'+
    '<p class="blurb small muted">'+store.data.locations.length+' places, '+store.data.bookings.length+' bookings, '+
      store.data.schedule.length+' scheduled stops across '+DAYS.length+' days.<br>'+
      esc(TRIP.name)+': '+esc(tripRange())+'.</p>';
  openSheet("Settings", html);
  var fi=$("#importFile");
  if(fi) fi.addEventListener("change", function(){ var f=this.files && this.files[0]; withExtras(function(){ importNotes(f); }); });
  var meIn=$("#s_me");
  if(meIn) meIn.addEventListener("change", function(){ save(LS.me, this.value.trim()); toast("Saved"); });
}

/* ---------- trips and cities (Settings) ---------- */

function peopleSectionHTML(){
  if(!store.configured() || !(store.raw && store.raw.me)) return "";
  var me=whoAmI();
  if(!me.owner){
    var n=me.trips==="*" ? "every trip" : (me.trips||[]).length+" trip"+((me.trips||[]).length===1?"":"s");
    return '<div class="section-title">Signed in</div><p class="blurb small">As <b>'+esc(me.name||"a guest")+'</b> · '+
      (me.role==="viewer" ? "view only" : "can edit")+' · '+esc(n)+'. The trip owner decides who sees which trip.</p>';
  }
  return '<div class="section-title">People</div>'+
    '<p class="blurb small muted" style="margin:-2px 0 10px">Who can see which trip. Each person gets their own key; remove someone and only their access stops.</p>'+
    '<div class="formactions" style="margin-top:0"><button class="btn" data-act="people">Manage people</button></div>';
}

function isArchived(t){ return /^(1|true|yes)$/i.test(String(t && t.archived || "")); }

/** Archiving needs the trip to be a row in the Sheet's Trips tab. */
function canArchive(){ return (store.raw.trips||[]).length>0; }

/** How many places a trip has, from the count the backend sends with each sync. */
function placesIn(t){
  var ix=store.raw.index; if(!ix) return null;
  return (ix[t.id]||0) + (t.id===defaultTripId() ? (ix[""]||0) : 0);
}

function setArchived(id, on){
  var t=(store.raw.trips||[]).filter(function(x){ return x.id===id; })[0]; if(!t) return;
  var row={ id:id, archived:on?"1":"", updated:nowISO() };
  store.write("saveTrip", row, function(){
    store.raw.trips=(store.raw.trips||[]).map(function(x){ return x.id===id ? Object.assign({}, x, row) : x; });
  }).then(function(){ closeSheet(); settingsForm(); toast(on ? "Archived — it's under Archived trips" : "Back in the trip list"); });
}

function tripsSectionHTML(){
  var list=allTrips().slice().sort(function(a,b){ return a.start<b.start?-1:1; });
  var row=function(t){
      var open=t.id===TRIP.id, n=placesIn(t), arch=isArchived(t);
      return '<div class="locrow"><div class="lb"><div class="en">'+esc(t.name)+(t.name_zh?' <span class="zh">'+escz(t.name_zh)+'</span>':'')+'</div>'+
        '<div class="mt">'+esc(rangeText(t.start,t.end))+(n!==null?' · '+n+' place'+(n===1?'':'s'):'')+(open?' · open now':'')+'</div></div>'+
        (open ? (isOwner() ? '<button class="btn sm" data-act="trip-edit" data-tid="'+esc(t.id)+'">Edit</button>' : '')
              : '<button class="btn sm primary" data-act="trip-open" data-tid="'+esc(t.id)+'">Open</button>')+
        (!open && canArchive() && isOwner() && t.id!==defaultTripId()
          ? '<button class="btn sm ghost" data-act="'+(arch?'trip-unarchive':'trip-archive')+'" data-tid="'+esc(t.id)+'">'+(arch?'Unarchive':'Archive')+'</button>' : '')+
        '</div>';
    };
  var live=list.filter(function(t){ return !isArchived(t) || t.id===TRIP.id; });
  var gone=list.filter(function(t){ return isArchived(t) && t.id!==TRIP.id; });
  return '<div class="section-title">Trips</div><div class="loclist">'+live.map(row).join("")+'</div>'+
    (gone.length ? '<details class="archived"><summary>Archived trips ('+gone.length+')</summary><div class="loclist">'+gone.map(row).join("")+'</div></details>' : '')+
    (isOwner() ? '<div class="formactions" style="margin-top:10px"><button class="btn" data-act="trip-new">+ New trip</button></div>' : '');
}

function citiesSectionHTML(){
  var here=cityOptions(), list=cityList().slice().sort(function(a,b){
    var ia=here.indexOf(a.name), ib=here.indexOf(b.name);
    return (ia<0?999:ia)-(ib<0?999:ib) || (a.name<b.name?-1:1);
  });
  var REG={ cn:"mainland China", hk:"Hong Kong", mo:"Macau", tw:"Taiwan" };
  return '<div class="section-title">Cities</div>'+
    '<p class="blurb small muted" style="margin:-2px 0 10px">Time zone, map app and taxi fares for each city. Add a city before adding places in it.</p>'+
    '<div class="loclist">'+list.map(function(c){
      return '<div class="locrow"><div class="lb"><div class="en">'+esc(c.name)+(c.name_zh?' <span class="zh">'+escz(c.name_zh)+'</span>':'')+'</div>'+
        '<div class="mt">'+[REG[c.region]||"", tzName(c.tz)===REG[c.region] ? "" : (c.tz ? tzName(c.tz)+" time" : "no time zone"),
          mapAppFor(c.name), c.taxi?"fares set":"no fares"].filter(Boolean).map(esc).join(" · ")+'</div></div>'+
        '<button class="btn sm" data-act="city-edit" data-v="'+esc(c.name)+'">Edit</button></div>';
    }).join("")+'</div>'+
    '<div class="formactions" style="margin-top:10px"><button class="btn" data-act="city-new">+ Add city</button></div>';
}

function tripForm(id){
  var t=id ? allTrips().filter(function(x){ return x.id===id; })[0] : null;
  var isNew=!t;
  t=t || { id:"", name:"", name_zh:"", start:"", end:"", tz:tripTz(), zh_script:"", notes:"" };
  var opt=function(v,l){ return '<option value="'+v+'"'+((t.zh_script||"")===v?" selected":"")+'>'+l+'</option>'; };
  var html=
    (isNew ? '<p class="blurb small muted" style="margin:12px 0 16px">A new trip opens empty. Add its cities in ⚙ Settings › Cities first, so places get the right map app, time zone and fares.</p>' : '<div style="height:12px"></div>')+
    '<div class="field"><label>Name</label><input id="t_name" value="'+esc(t.name)+'" placeholder="Japan 2027"></div>'+
    '<div class="field"><label>中文名 (optional)</label><input id="t_name_zh" class="zh" value="'+esc(t.name_zh)+'"></div>'+
    '<div class="grid2">'+
      '<div class="field"><label>First day</label><input id="t_start" type="date" value="'+esc(t.start)+'"></div>'+
      '<div class="field"><label>Last day</label><input id="t_end" type="date" value="'+esc(t.end)+'"></div>'+
    '</div>'+
    (isNew && allTrips().length && (store.raw.trips||[]).length ? '<div class="field"><label>Start from</label><select id="t_from"><option value="">An empty trip</option>'+
        allTrips().map(function(x){ return '<option value="'+esc(x.id)+'">'+esc(x.name)+'’s checklist and packing</option>'; }).join("")+'</select>'+
        '<div class="hint">Copies that trip’s checklist tasks (unticked, due dates moved to suit the new first day) and packing lists. Places and bookings aren’t copied.</div></div>' : '')+
    (isNew ? '' : '<label class="row small" style="gap:8px;margin:-4px 0 14px"><input type="checkbox" id="t_move" checked> '+
      'Move the plan with the first day — stops, day names. Bookings stay put; change those yourself.</label>')+
    '<div class="field"><label>Time zone</label><input id="t_tz" list="tzlist" autocapitalize="off" value="'+esc(t.tz)+'">'+tzDatalist("tzlist")+
      '<div class="hint">Where most of the trip is. Booking times are read in it, unless a booking has its own.</div></div>'+
    '<div class="field"><label>Chinese characters</label><select id="t_script">'+
      opt("","Automatic")+opt("simplified","Always Simplified")+opt("original","As written")+'</select>'+
      '<div class="hint">Automatic shows Simplified when the trip takes in mainland China, Hong Kong or Macau.</div></div>'+
    '<div class="field"><label>Notes</label><textarea id="t_notes" style="min-height:60px">'+esc(t.notes||"")+'</textarea></div>'+
    '<div class="formactions"><button class="btn primary" data-act="trip-save" data-tid="'+esc(t.id)+'">'+(isNew?"Create and open":"Save")+'</button>'+
      (!isNew && t.id!==defaultTripId() ? '<button class="btn danger" data-act="trip-delete" data-tid="'+esc(t.id)+'">Delete trip</button>' : '')+'</div>';
  openSheet(isNew?"New trip":"Edit trip", html);
}

function saveTripForm(id){
  var g=function(k){ var e=$("#t_"+k); return e ? e.value.trim() : ""; };
  var old=id ? allTrips().filter(function(x){ return x.id===id; })[0] : null;
  var t=Object.assign({}, old || { id:uid("trip"), is_default:"" });
  t.name=g("name"); t.name_zh=g("name_zh"); t.start=g("start"); t.end=g("end");
  t.tz=g("tz").replace(/\s+/g,"_"); t.zh_script=g("script"); t.notes=g("notes"); t.updated=nowISO();
  if(!t.name){ toast("Give the trip a name"); return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t.start) || !/^\d{4}-\d{2}-\d{2}$/.test(t.end)){ toast("Set the first and last day"); return; }
  if(t.end<t.start){ toast("The last day is before the first"); return; }
  if(daysBetween(t.start,t.end)>120){ toast("That's over 120 days — check the dates"); return; }
  if(t.tz && !validTz(t.tz)){ toast("Not a time zone this phone knows — pick one from the list"); return; }
  var shift = old && $("#t_move") && $("#t_move").checked ? daysBetween(old.start, t.start) : 0;
  var row=function(o){ var r={}; ["id","name","name_zh","start","end","tz","zh_script","is_default","notes","updated","archived"].forEach(function(k){ r[k]=o[k]==null?"":o[k]; }); return r; };
  // The Sheet's first trip row: the one there is, written out before any other joins it
  var one=firstTrip();
  if(!(store.raw.trips||[]).length && t.id!==one.id){
    var first=row(Object.assign({}, one, { updated:nowISO() }));
    store.raw.trips=[first]; store.enqueue("saveTrip", first);
  }
  var r=row(t);
  store.raw.trips=(store.raw.trips||[]).filter(function(x){ return x.id!==r.id; }).concat([r]);
  store.enqueue("saveTrip", r);
  if(shift && old.id===TRIP.id){
    // Day names first, while dayLabel still reads the old dates
    var named=DAYS.map(function(d){ return { d:d, label:dayLabel(d), own:(store.raw.days||[]).some(function(x){ return x.date===d && tripOf(x)===old.id && x.label; }) }; });
    (store.raw.days||[]).filter(function(x){ return tripOf(x)===old.id; }).forEach(function(x){ store.enqueue("deleteDay", { id:x.id }); });
    store.raw.days=(store.raw.days||[]).filter(function(x){ return tripOf(x)!==old.id; });
    named.forEach(function(n){
      if(!n.own) return;
      var nd=addDaysISO(n.d, shift);
      var dr={ id:"day-"+old.id+"-"+nd.replace(/-/g,""), trip_id:old.id, date:nd, label:n.label };
      store.raw.days.push(dr); store.enqueue("saveDay", dr);
    });
    store.data.schedule.forEach(function(e){ e.date=addDaysISO(e.date, shift); store.enqueue("saveScheduleEntry", e); });
  }
  var finish=function(note){
    store.persist();
    if(!old){ switchTrip(t.id, true).then(function(){ if(note) toast(note, 6000); }); }
    else { store.data=null; applyTrip(); store.persist(); closeSheet(); render(); toast(shift ? "Saved — plan moved "+Math.abs(shift)+" day"+(Math.abs(shift)===1?"":"s")+(shift>0?" later":" earlier") : "Saved"); }
    if(store.configured()) store.flush().then(updateStatus).catch(function(){});
  };
  var from=!old && g("from") ? allTrips().filter(function(x){ return x.id===g("from"); })[0] : null;
  if(!from){ finish(); return; }
  // Start from another trip: its checklist and packing lists, as a fresh copy
  if(from.id===TRIP.id){ finish(copyChecklist(from, t, store.data.checklist)); return; }
  store.call("checklist").then(function(d){
    finish(copyChecklist(from, t, ((d && d.checklist)||[]).filter(function(i){ return tripOf(i)===from.id; })));
  }, function(){ finish("Created, but empty: "+from.name+"’s checklist couldn’t be read without a connection. Open it and start the new trip from there, or try again."); });
}
/** A fresh copy of one trip's shared checklist and packing lists, and this
 *  phone's own packing list, for a new trip: nothing ticked, nobody assigned,
 *  not tied to any place, due dates moved by the gap between the first days. */
function copyChecklist(from, to, items){
  var shift=daysBetween(from.start, to.start), now=nowISO(), n={ task:0, pack:0 };
  items.filter(function(i){ return !i.removed && /^(task|pack|each)$/.test(i.kind); }).forEach(function(i, k){
    var c={ id:uid("ck")+k, kind:i.kind, section:i.section||"", text:i.text||"", due:/^\d{4}-\d{2}-\d{2}$/.test(i.due||"") ? addDaysISO(i.due, shift) : "",
            location_id:"", done:"", done_by:"", order_index:i.order_index||"", updated:now, removed:"", trip_id:to.id, assignee:"" };
    store.raw.checklist.push(c); store.enqueue("saveChecklistItem", c);
    n[i.kind==="task" ? "task" : "pack"]++;
  });
  var mine=load(from.id===defaultTripId() ? LS.packing : LS.packing+"."+from.id, []).filter(function(i){ return !i.removed; });
  if(mine.length) save(LS.packing+"."+to.id, mine.map(function(i, k){ return Object.assign({}, i, { id:uid("pk")+k, done:"" }); }));
  var bits=[]; if(n.task) bits.push(n.task+" task"+(n.task===1?"":"s"));
  if(n.pack+mine.length) bits.push((n.pack+mine.length)+" packing item"+(n.pack+mine.length===1?"":"s"));
  return bits.length ? "Started from "+from.name+": "+bits.join(" and ")+" copied, nothing ticked" : "Created — "+from.name+" has no checklist to copy";
}

function deleteTrip(id){
  var t=allTrips().filter(function(x){ return x.id===id; })[0];
  if(!t || id===defaultTripId()) return;
  if(!window.confirm("Delete “"+t.name+"” and everything in it — places, stops, bookings, checklist? This can't be undone.")) return;
  store.persist();
  store.write("deleteTrip", { id:id }, function(){
    TRIP_TABS.concat(["days"]).forEach(function(k){ store.raw[k]=(store.raw[k]||[]).filter(function(r){ return r.trip_id!==id; }); });
    store.raw.trips=(store.raw.trips||[]).filter(function(x){ return x.id!==id; });
    store.data=null; ui.trip=defaultTripId(); save(LS.ui, ui); applyTrip();
  }).then(function(){ closeSheet(); setView("today"); toast("Trip deleted"); });
}

function cityForm(name){
  var c=name ? cityInfo(name) : null, isNew=!c;
  c=c || { name:"", name_zh:"", lat:"", lng:"", tz:tripTz(), region:"", map_app:"", taxi:null };
  var x=c.taxi||{}, v=function(k){ return x[k]==null ? "" : x[k]; };
  var f=function(id,label,val,ph,mode){ return '<div class="field"><label>'+label+'</label><input id="y_'+id+'"'+(mode?' inputmode="'+mode+'"':'')+
    ' value="'+esc(val)+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+'></div>'; };
  var sel=function(id,val,opts){ return '<select id="y_'+id+'">'+opts.map(function(o){
    return '<option value="'+o[0]+'"'+(String(val||"")===o[0]?" selected":"")+'>'+o[1]+'</option>'; }).join("")+'</select>'; };
  var html=
    (isNew ? '' : '<p class="blurb small muted" style="margin:12px 0">Places are matched to their city by name, so a renamed city loses its places — add a new one instead.</p>')+
    '<div class="grid2">'+f("name","City",c.name,"Kyoto").replace("<input ", isNew?"<input ":"<input readonly ")+f("name_zh","中文名",c.name_zh,"京都")+'</div>'+
    '<div class="field linkbox"><label for="y_link">Centre from a map link</label>'+
      '<textarea id="y_link" rows="2" placeholder="Paste a Google Maps or Amap link with a pin in it"></textarea>'+
      '<div class="hint" id="y_link_status">Or type the coordinates. The centre is used to match new places to the city.</div></div>'+
    '<div class="grid2">'+f("lat","Latitude",c.lat,"35.01","decimal")+f("lng","Longitude",c.lng,"135.77","decimal")+'</div>'+
    '<div class="field"><label>Time zone</label><input id="y_tz" list="tzlist2" autocapitalize="off" value="'+esc(c.tz)+'">'+tzDatalist("tzlist2")+'</div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Region</label>'+sel("region",c.region,[["","Elsewhere"],["cn","Mainland China"],["hk","Hong Kong"],["mo","Macau"],["tw","Taiwan"]])+'</div>'+
      '<div class="field"><label>Map app</label>'+sel("map_app",c.map_app,[["","Automatic"],["amap","Amap 高德"],["google","Google Maps"],["apple","Apple Maps"]])+'</div>'+
    '</div>'+
    '<p class="blurb small muted" style="margin:-6px 0 14px">The region is filled in from the centre. Mainland China switches on Amap, the China guide and Simplified Chinese.</p>'+
    '<div class="section-title">Taxi fares (optional)</div>'+
    '<div class="grid2">'+f("currency","Currency symbol",v("cur"),"¥ or €")+f("round","Round to",v("step"),"1","decimal")+'</div>'+
    '<div class="grid2">'+f("flag","Flag fall",v("flag"),"500","decimal")+f("flag_km","Km it covers",v("flagKm"),"1.1","decimal")+'</div>'+
    '<div class="grid2">'+f("per_km","Per km after",v("perKm"),"400","decimal")+f("transit","Public transport is",v("transit"),"subway")+'</div>'+
    '<div class="grid2">'+f("car","Cars are",v("car"),"taxi")+'<div></div></div>'+
    '<details class="small" style="margin:-4px 0 14px"><summary>Cheaper rate past a fare</summary><div class="grid2" style="margin-top:10px">'+
      f("high_at","From a fare of",v("highAt"),"","decimal")+f("per_km_high","Per km then",v("perKmHigh"),"","decimal")+'</div></details>'+
    '<div class="formactions"><button class="btn primary" data-act="city-save" data-v="'+esc(c.name)+'">Save</button></div>';
  openSheet(isNew?"New city":"Edit city", html);
  var box=$("#y_link");
  function fromLink(){
    var p=placeFromParsed(parseMapText(box.value)), st=$("#y_link_status");
    if(p.lat==null){ st.textContent="No pin in that — paste the full link (not a short one), or type the coordinates."; return; }
    $("#y_lat").value=p.lat; $("#y_lng").value=p.lng;
    var r=regionCode(p.lat,p.lng); $("#y_region").value=r;
    if(!$("#y_name_zh").value && p.names.zh) $("#y_name_zh").value=p.names.zh;
    st.textContent="Centre set"+(p.shiftedM?" (moved "+p.shiftedM+" m from the Chinese map grid to GPS)":"")+".";
  }
  box.addEventListener("paste", function(){ setTimeout(fromLink,0); });
  box.addEventListener("change", fromLink);
  ["y_lat","y_lng"].forEach(function(id){ $("#"+id).addEventListener("change", function(){
    var a=parseFloat($("#y_lat").value), b=parseFloat($("#y_lng").value);
    if(isFinite(a) && isFinite(b)) $("#y_region").value=regionCode(a,b);
  }); });
}

function saveCityForm(oldName){
  var g=function(k){ var e=$("#y_"+k); return e ? e.value.trim() : ""; };
  var name=g("name"), cur=oldName ? cityInfo(oldName) : null;
  if(!name){ toast("Give the city a name"); return; }
  if(!oldName && cityInfo(name)){ toast(name+" is already on the list — edit it instead"); return; }
  var lat=g("lat"), lng=g("lng");
  if((lat||lng) && !(isFinite(parseFloat(lat)) && isFinite(parseFloat(lng)))){ toast("Latitude and longitude need to be numbers"); return; }
  var tz=g("tz").replace(/\s+/g,"_");
  if(tz && !validTz(tz)){ toast("Not a time zone this phone knows — pick one from the list"); return; }
  var num=function(k){ var x=g(k); return x && isFinite(parseFloat(x)) ? String(parseFloat(x)) : ""; };
  var r={ id:(cur && cur.id) || "city-"+(name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || Date.now().toString(36)),
    name:oldName||name, name_zh:g("name_zh"), lat:lat?parseFloat(lat):"", lng:lng?parseFloat(lng):"", tz:tz,
    region:g("region"), map_app:g("map_app"), currency:g("currency"), round:num("round"), flag:num("flag"),
    flag_km:num("flag_km"), per_km:num("per_km"), high_at:num("high_at"), per_km_high:num("per_km_high"),
    transit:g("transit"), car:g("car") };
  if((r.flag || r.per_km) && !(r.flag && r.per_km)){ toast("Fares need both the flag fall and the per-km rate"); return; }
  store.write("saveCity", r, function(){
    store.raw.cities=(store.raw.cities||[]).filter(function(x){ return x.id!==r.id && String(x.name).toLowerCase()!==r.name.toLowerCase(); }).concat([r]);
  }).then(function(){ closeSheet(); render(); toast("Saved"); });
}

/* ==========================================================================
   Best order for a day: the shortest way round, starting and ending at the
   hotel as the day view does. Stops with a time, hotels and stops without a
   pin stay in their order; the rest are fitted in where they add the least,
   then each is moved again while that still shortens the day. Straight-line
   distances, so it is a suggestion — it asks before changing anything.
   ========================================================================== */
function routeKm(seq, start, end){
  var pts=[start].concat(seq.map(function(x){ return x.l; })).concat([end]).filter(function(p){ return p && hasXY(p); }), km=0;
  for(var i=1;i<pts.length;i++) km+=roadKm(pts[i-1],pts[i]);
  return km;
}

function bestInsert(seq, it, start, end){
  var best=0, bestKm=1e12;
  for(var i=0;i<=seq.length;i++){
    var t=seq.slice(0,i).concat([it]).concat(seq.slice(i)), k=routeKm(t,start,end);
    if(k<bestKm-1e-9){ bestKm=k; best=i; }
  }
  return seq.slice(0,best).concat([it]).concat(seq.slice(best));
}

function orderDay(items, start, end){
  var fixedOf=function(x){ return !x.l || !hasXY(x.l) || !!String(x.s.planned_time||"").trim() || x.l.type==="hotel"; };
  var fixed=items.filter(fixedOf), free=items.filter(function(x){ return !fixedOf(x); });
  var tries=[free, free.slice().reverse(), free.slice().sort(function(a,b){
    return (start&&hasXY(start) ? roadKm(start,b.l)-roadKm(start,a.l) : 0); })];
  var best=null, bestKm=1e12;
  tries.forEach(function(order){
    var seq=fixed.slice();
    order.forEach(function(it){ seq=bestInsert(seq,it,start,end); });
    for(var round=0, moved=true; moved && round<40; round++){
      moved=false;
      free.forEach(function(it){
        var before=routeKm(seq,start,end), without=seq.filter(function(x){ return x!==it; });
        var again=bestInsert(without,it,start,end);
        if(routeKm(again,start,end) < before-1e-6){ seq=again; moved=true; }
      });
    }
    var k=routeKm(seq,start,end); if(k<bestKm){ bestKm=k; best=seq; }
  });
  return { seq:best||items, km:bestKm, free:free.length };
}

function bestOrder(date){
  var items=store.dayStops(date).map(function(s){ return { s:s, l:store.loc(s.location_id) }; });
  var locs=items.map(function(x){ return x.l; }).filter(Boolean);
  if(!locs.length) return;
  var first=locs[0], last=locs[locs.length-1];
  var start=first.type!=="hotel" ? hotelFor(first) : null, end=last.type!=="hotel" ? hotelFor(last) : null;
  var r=orderDay(items, start, end), now=routeKm(items, start, end);
  if(r.free<2){ toast("Nothing to move — stops with a time, hotels and stops without a pin stay put", 3200); return; }
  var saved=(now-r.km)/ROAD_FACTOR;
  if(saved<0.3 || r.seq.every(function(x,i){ return x===items[i]; })){ toast("This order is already about as short as it gets"); return; }
  var msg="Best order — about "+distText(saved)+" less travel ("+distText(now/ROAD_FACTOR)+" → "+distText(r.km/ROAD_FACTOR)+" in straight lines):\n\n"+
    r.seq.map(function(x,i){ return (i+1)+". "+(x.l?x.l.name_en:"?")+(x.s.planned_time?"  ("+x.s.planned_time+")":""); }).join("\n")+
    "\n\nUse this order?";
  if(!window.confirm(msg)) return;
  commitOrder(date, r.seq.map(function(x){ return x.s.id; })).then(function(){ render(); toast("Reordered"); });
}

function findBoxHTML(){
  return '<div class="field"><label for="f_find">Find by name</label>'+
    '<div class="row" style="gap:8px"><input id="f_find" type="search" autocomplete="off" placeholder="e.g. noodle shop near the hotel" style="flex:1">'+
    '<button class="btn sm" data-act="find-place">Search</button></div>'+
    '<div class="hint" id="f_find_status">Searches OpenStreetMap near the city picked below. Smaller places are often missing — a map link works for anything.</div>'+
    '<div class="findres" id="f_find_results"></div></div>';
}

function bindFindBox(){
  var i=$("#f_find"); if(!i) return;
  i.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); findPlace(); } });
}

function osmSearch(q, near){
  var u="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&namedetails=1&addressdetails=1&accept-language=en&q="+encodeURIComponent(q);
  if(near && hasXY(near)) u+="&viewbox="+[(+near.lng-0.6),(+near.lat+0.6),(+near.lng+0.6),(+near.lat-0.6)].map(function(x){ return x.toFixed(4); }).join(",");
  return fetch(u, { headers:{ "Accept":"application/json" } }).then(function(r){
    if(!r.ok) throw new Error("search "+r.status); return r.json();
  });
}

function osmPlace(r){
  var nd=r.namedetails||{}, raw=String(nd.name||r.name||"");
  var zh=nd["name:zh-Hans"]||nd["name:zh"]||nd["name:zh-Hant"]||nd["name:zh-CN"]||nd["name:zh-HK"]||"";
  var en=nd["name:en"]||"";
  if(!zh || !en){ var sp=splitNames(raw); zh=zh||sp.zh; en=en||sp.en; }
  if(!en && !CJK.test(raw)) en=raw;
  var cat=r.category||r["class"]||"", typ=r.type||"";
  var type = cat==="tourism" && /hotel|hostel|guest_house|motel|apartment/.test(typ) ? "hotel"
           : cat==="amenity" && /restaurant|cafe|fast_food|food_court|bar|pub|ice_cream|biergarten/.test(typ) ? "restaurant"
           : cat==="shop" || /marketplace|mall|department_store/.test(typ) ? "shopping"
           : guessType(raw);
  var lat=+(+r.lat).toFixed(6), lng=+(+r.lon).toFixed(6);
  var parts=String(r.display_name||"").split(", ");
  var address=parts.slice(raw && parts[0]===raw ? 1 : 0, Math.max(1, parts.length-1)).join(", ");
  return { names:{ zh:zh, en:en }, lat:lat, lng:lng, city:cityFor(lat,lng), type:type, address:address, source:"osm", shiftedM:0,
           kind:(typ||cat).replace(/_/g," ") };
}

function findPlace(){
  var q=($("#f_find")||{}).value||"", st=$("#f_find_status"), box=$("#f_find_results");
  q=q.trim(); if(!q || !box) return;
  if(!navigator.onLine){ st.textContent="Searching needs a connection. A map link, or the Chinese name alone, works offline."; return; }
  var c=$("#f_city"), near=cityInfo(c ? c.value : "");
  st.textContent="Searching…"; box.innerHTML="";
  osmSearch(q, near).then(function(rows){
    found=(rows||[]).map(osmPlace);
    if(!found.length){ st.textContent="Nothing found. Try fewer words, the Chinese name, or paste a map link below."; return; }
    st.textContent="Pick one:";
    box.innerHTML=found.map(function(p,i){
      return '<button data-act="find-pick" data-i="'+i+'"><div class="en">'+esc(p.names.en||p.names.zh)+
        (p.names.en&&p.names.zh?' <span class="zh">'+escz(p.names.zh)+'</span>':'')+'</div>'+
        '<div class="mt">'+esc([p.kind, p.city||"", p.address].filter(Boolean).join(" · ").slice(0,140))+'</div></button>';
    }).join("");
  }).catch(function(){ st.textContent="The search didn't answer. Try again, or paste a map link below."; });
}

function pickFound(i){
  var p=found[i]; if(!p) return;
  var en=$("#f_name_en"), zh=$("#f_name_zh");
  if(en) en.value=p.names.en||""; if(zh) zh.value=p.names.zh||"";
  applyPlace(p);
  var box=$("#f_find_results"); if(box) box.innerHTML="";
  var st=$("#f_find_status"); if(st) st.textContent="Filled in from OpenStreetMap — check the names below.";
}

function libraryForm(){
  if(store.configured() && !store.raw.locations.some(function(l){ return tripOf(l)!==TRIP.id; })){
    openSheet("From other trips", '<p class="blurb small muted" style="margin:12px 0">Fetching places from your other trips…</p>');
    store.call("locations").then(function(d){ libCache=(d && d.locations) || []; libraryShow(); }, function(err){
      $("#sheetBody").innerHTML='<div class="card empty" style="margin-top:12px">'+
        (err && err.kind && err.kind!=="net" ? esc(syncProblem(err)) : "Places from other trips need a connection — they aren't kept on the phone.")+'</div>';
    });
    return;
  }
  libraryShow();
}

function libraryShow(){
  function results(q){
    var list=otherTripPlaces().filter(function(l){ return matches(l,q); })
      .sort(function(a,b){ return (a.city+a.name_en)<(b.city+b.name_en)?-1:1; });
    return list.length ? '<div class="loclist">'+list.map(function(l){
      var here=nearDuplicate({ names:{ zh:l.name_zh }, lat:hasXY(l)?+l.lat:null, lng:hasXY(l)?+l.lng:null });
      return '<div class="locrow">'+
        (photoOf(l) ? '<div class="thumb photo" style="'+bgStyle(photoOf(l))+'"></div>' : '<div class="thumb">'+typeIcon(l.type)+'</div>')+
        '<div class="lb"><div class="en">'+hilite(l.name_en,q)+'</div><div class="zh zh">'+hilite(l.name_zh,q)+'</div>'+
        '<div class="mt">'+esc(l.city)+' · '+esc(l.type)+' · '+esc(tripName(tripOf(l)))+'</div></div>'+
        (here ? '<span class="pill ok">Here</span>' : '<button class="btn sm" data-act="lib-copy" data-lid="'+esc(l.id)+'">Copy</button>')+'</div>';
    }).join("")+'</div>' : '<div class="card empty">No match.</div>';
  }
  openSheet("From other trips",
    '<p class="blurb small muted" style="margin:12px 0">Places from your other trips. Copy one into '+esc(TRIP.name)+' with its notes, tickets and photo; then add it to a day.</p>'+
    '<div class="searchwrap"><span class="mag">'+IC.mag+'</span><input id="lq" type="search" placeholder="Search — English or 中文" autocomplete="off"></div>'+
    '<div id="libResults">'+results("")+'</div>');
  var i=$("#lq");
  i.addEventListener("input", function(){ $("#libResults").innerHTML=results(this.value); this.closest(".searchwrap").classList.toggle("has", !!this.value); });
}

function copyPlace(lid, btn){
  var src=otherTripPlaces().filter(function(l){ return l.id===lid; })[0]; if(!src) return;
  var l={}; LOC_FIELDS.forEach(function(k){ l[k]=src[k]==null?"":src[k]; });
  l.id=uid("loc"); l.trip_id="";
  if(!cityInfo(l.city) && hasXY(l)) l.city=cityFor(+l.lat,+l.lng)||l.city;
  saveLocation(l).then(function(){
    if(btn){ var pill=document.createElement("span"); pill.className="pill ok"; pill.textContent="Copied"; btn.replaceWith(pill); }
    toast("Copied into "+TRIP.name);
  });
}

/* A stop's own note, in a text box: notes run to phone numbers and several
   lines, which the browser's one-line prompt cut off and couldn't show. */
function stopNoteForm(sid){
  var e=store.data.schedule.filter(function(s){ return s.id===sid; })[0]; if(!e) return;
  var l=store.loc(e.location_id)||{};
  openSheet("Note · Day "+dayNumber(e.date),
    '<div class="field"><label>'+esc(l.name_en||"This stop")+(l.name_zh?' · <span class="zh">'+escz(l.name_zh)+'</span>':'')+'</label>'+
      '<textarea id="f_stopnote" style="min-height:160px" placeholder="Booking number, what to order, when to leave…">'+esc(e.notes||"")+'</textarea>'+
      '<div class="hint">Shown in full under this stop on the day. It belongs to this day only — notes for the place itself go in Edit this place.</div></div>'+
    '<div class="formactions"><button class="btn primary" data-act="save-stop-note" data-sid="'+esc(sid)+'">Save</button></div>');
}
