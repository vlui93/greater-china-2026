/* The Prep tab: the shared checklist, the packing lists and their templates.
   Loaded the first time Prep is opened (see PARTS in index.html), and kept
   offline by the service worker. Everything here is a plain global, as in
   index.html; nothing in index.html uses a value this file returns before the
   file is loaded. */
"use strict";

/* General advice for Hong Kong, Macau and the mainland, shown on any trip that
   takes in one of them. Nothing here is about a particular trip, so it can
   live in the public repo. Static HTML only. */
var GUIDE = [
  { t:"Install before you fly", items:[
    "<b>Alipay</b> — the one that matters most. Sign up with your own mobile number, verify your passport in the app and link a Visa or Mastercard. It pays almost everywhere on the mainland, and DiDi and the metro QR codes run inside it.",
    "<b>WeChat</b> — optional, but hotels and restaurants often message through it and some museums take bookings through WeChat accounts. WeChat Pay takes foreign cards too.",
    "<b>Amap 高德地图</b> — maps on the mainland. Google Maps is blocked there and its streets sit hundreds of metres off; this app opens Amap for mainland places on its own.",
    "<b>Trip.com</b> — trains, and the attraction tickets whose own booking channels need a Chinese phone number. Book with names exactly as they appear on your passports.",
    "<b>A translator with Chinese downloaded for offline use</b> — Apple Translate (download Chinese in its settings) or similar. Camera mode reads menus.",
    "<b>Octopus in Apple Wallet</b> for Hong Kong — optional, since MTR gates take contactless cards, but Octopus also covers buses, trams, ferries and convenience stores."
  ]},
  { t:"Staying connected", items:[
    "On mainland networks and hotel wifi, <b>Google (Search, Maps, Gmail), WhatsApp, Instagram and Facebook are blocked</b>. Hong Kong and Macau are not affected.",
    "A <b>roaming eSIM</b> — from your own carrier, or a travel eSIM that covers mainland China, Hong Kong and Macau — routes your data out of the country, so those apps keep working. Buy and install it before you fly; switch it on when you land.",
    "Hotel wifi on the mainland will not get around the block, so stay on the eSIM for anything Google.",
    "This app works offline. Edits made on the mainland wait on the phone and send themselves once Google is reachable — the badge at the top of each screen says how many are waiting."
  ]},
  { t:"Paying", items:[
    "<b>Mainland:</b> nearly everything is Alipay or WeChat Pay — scan the shop's code or show yours. Small stalls often can't take a card at all. Keep a few hundred yuan in cash as a backup.",
    "<b>Hong Kong:</b> contactless cards almost everywhere, Octopus for transport and small shops, cash for markets and dai pai dong.",
    "<b>Macau:</b> Hong Kong dollars are accepted at par, with change in patacas. Cards in hotels and bigger shops, cash elsewhere.",
    "Tell your bank you're travelling and check its foreign-transaction fee — every Alipay payment goes through your card."
  ]},
  { t:"Getting around", items:[
    "<b>Metro:</b> Hong Kong's MTR gates take contactless Visa and Mastercard. On the mainland, add each city's transport QR code in Alipay (search “Transport”); Guangzhou and Chengdu also take foreign contactless cards at the gate.",
    "<b>Cars:</b> open DiDi inside Alipay — it's in English and charges your linked card. Choose the destination by its Chinese name or on the map. If the driver messages you, the messages are translated.",
    "<b>Taxis:</b> show the driver the Chinese name — every place in this app has a “Show this to someone” card for exactly this.",
    "<b>High-speed rail:</b> your passport is your ticket. Foreign passports often need the staffed gate rather than the automatic ones, so arrive 45 minutes early for security and ID checks."
  ]},
  { t:"Power banks", items:[
    "On <b>domestic flights within China</b>, a power bank needs a clearly printed <b>3C (CCC) mark</b> or security will take it. Power banks sold in Australia almost never have one.",
    "Either buy a 3C-marked one once you're on the mainland, or <b>rent</b> one: shared power-bank stations are in nearly every restaurant, mall and station. Scan one with Alipay and return it to any station.",
    "Whatever you carry goes in hand luggage, under 100 Wh (about 27,000 mAh), and stays unused during the flight."
  ]},
  { t:"Small things that help", items:[
    "Carry <b>tissues and hand sanitiser</b> — many public toilets have no paper.",
    "Mainland <b>tap water</b> isn't for drinking; bottled water is everywhere.",
    "Carry your <b>passport</b> on the mainland: hotels, trains, museums and many ticketed sights check it."
  ]}
];

function shortDate(iso){
  var d=parseISO(iso); return d.getDate()+" "+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
}

function dueInfo(due){
  if(!due) return null;
  var days=Math.round((parseISO(due)-parseISO(todayISO()))/86400000);
  var label = days<0 ? (-days===1?"1 day overdue":(-days)+" days overdue")
            : days===0 ? "due today" : days===1 ? "due tomorrow"
            : days<7 ? "due in "+days+" days" : "due "+shortDate(due);
  return { days:days, label:label, cls: days<0 ? "over" : days<=3 ? "soon" : "" };
}

function byOrder(a,b){ return (+a.order_index||0)-(+b.order_index||0); }

function taskSort(a,b){
  if(!!a.done !== !!b.done) return a.done ? 1 : -1;
  var da=a.due||"9999", db=b.due||"9999";
  if(da!==db) return da<db ? -1 : 1;
  return byOrder(a,b);
}

function groupBySection(items, sortFn){
  var order=[], map={};
  items.slice().sort(byOrder).forEach(function(i){
    var k=i.section||"Other"; if(!map[k]){ map[k]=[]; order.push(k); } map[k].push(i);
  });
  return order.map(function(k){ return { name:k, items: map[k].sort(sortFn||byOrder) }; });
}

function setEachTick(id, on){
  var m=eachTicks(); if(on) m[id]=nowISO(); else delete m[id]; save(EACH_KEY+"."+TRIP.id, m);
}

function ckRow(it, scope){
  var done=!!it.done, meta=[];
  if(it.kind==="task" && !done){ var di=dueInfo(it.due); if(di) meta.push('<span class="due '+di.cls+'">'+esc(di.label)+'</span>'); }
  if(it.location_id){ var l=store.loc(it.location_id); if(l) meta.push('<span>'+esc(l.name_en)+'</span>'); }
  if(it.kind==="pack" && scope==="shared")
    meta.push(done ? '<span class="grp">'+esc(it.done_by ? it.done_by+" brings it" : "Packed")+'</span>'
         : it.assignee ? '<span class="grp to">'+esc(it.assignee===getMe() ? "You're bringing it" : it.assignee+" to bring")+'</span>'
         : '<span class="grp need">One for the group</span>');
  else if(done && it.done_by) meta.push('<span>'+esc(it.done_by)+'</span>');
  return '<div class="ckrow'+(done?" done":"")+'" data-swipe="item">'+
    '<div class="ckslide">'+
    '<button class="ckbox" data-act="ck-toggle" data-scope="'+scope+'" data-id="'+esc(it.id)+'" role="checkbox" '+
      'aria-checked="'+done+'" aria-label="'+esc(it.text)+'">'+IC.check+'</button>'+
    '<button class="cktext" data-act="ck-edit" data-scope="'+scope+'" data-id="'+esc(it.id)+'">'+
      '<span class="t">'+escz(it.text)+'</span>'+(meta.length?'<span class="m">'+meta.join("")+'</span>':'')+'</button>'+
    '</div>'+
    '<button class="ckdel" data-act="ck-swipe-del" data-scope="'+scope+'" data-id="'+esc(it.id)+'" tabindex="-1" aria-hidden="true">Delete</button>'+
  '</div>';
}

/** A section's card. With a scope, its header can be tapped (rename,
 *  delete) or swiped left to delete the whole section. */
function ckGroupHTML(title, rows, addScope, addKind, count, n){
  var sec=(title==="Mine"||title==="Shared"||title==="To do"||title==="Each of us") ? "" : title;
  var head = addScope && sec && n
    ? '<div class="ckhead" data-swipe="section"><div class="ckslide">'+
        '<button class="ckname" data-act="ck-section" data-scope="'+addScope+'" data-kind="'+addKind+'" data-section="'+esc(sec)+'">'+esc(title)+'</button>'+
        (count?'<span>'+count+'</span>':'')+'</div>'+
        '<button class="ckdel" data-act="ck-section-del" data-scope="'+addScope+'" data-kind="'+addKind+'" data-section="'+esc(sec)+'" tabindex="-1" aria-hidden="true">Delete all '+n+'</button></div>'
    : '<div class="ckhead"><div class="ckslide"><span>'+esc(title)+'</span>'+(count?'<span>'+count+'</span>':'')+'</div></div>';
  return '<div class="ckgroup">'+head+rows+
    (addScope ? '<button class="ckadd" data-act="ck-add" data-scope="'+addScope+'" data-kind="'+addKind+'" data-section="'+esc(sec)+'">'+
      IC.plus+'Add</button>' : '')+'</div>';
}

function countDone(items){ return items.filter(function(i){ return i.done; }).length+" / "+items.length; }

function renderPrep(){
  var tab = ui.prepTab || "checklist";
  var toGo = Math.round((parseISO(TRIP_START)-parseISO(todayISO()))/86400000);
  $("#viewTitle").textContent="Prep · 准备";
  $("#viewSub").textContent = toGo>1 ? toGo+" days until you fly" : toGo===1 ? "You fly tomorrow" : toGo===0 ? "You fly today" : "On the trip";
  var seg='<div class="seg" role="tablist">'+[["checklist","Checklist"],["packing","Packing"],["guide","Guide"]].map(function(x){
    return '<button data-act="prep-tab" data-v="'+x[0]+'" aria-pressed="'+(tab===x[0])+'">'+x[1]+'</button>';
  }).join("")+'</div>';
  var body = tab==="packing" ? prepPacking() : tab==="guide" ? prepGuide() : prepChecklist();
  $("#view-prep").innerHTML = statusBar()+seg+body;
  updateStatus();   // renderPrep is also called on its own (segment switches), not only via render()
}

function prepChecklist(){
  var tasks=sharedItems("task");
  if(!tasks.length) return '<div class="card empty">No checklist yet. Import the trip notes file from ⚙ Settings, '+
    'or add your own.</div>'+ckGroupHTML("To do", "", "shared", "task");
  var open=tasks.filter(function(t){ return !t.done; }).sort(taskSort);
  var done=tasks.length-open.length;
  var urgent=open.filter(function(t){ var d=dueInfo(t.due); return d && d.days<=7; }).slice(0,4);
  return '<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="'+tasks.length+'" aria-valuenow="'+done+'">'+
      '<i style="width:'+Math.round(done/tasks.length*100)+'%"></i></div>'+
    (urgent.length ? '<div class="nextup">'+ckGroupHTML("Next up", urgent.map(function(t){ return ckRow(t,"shared"); }).join(""))+'</div>' : '')+
    groupBySection(tasks, taskSort).map(function(g){
      return ckGroupHTML(g.name, g.items.map(function(t){ return ckRow(t,"shared"); }).join(""), "shared", "task", countDone(g.items), g.items.length);
    }).join("")+swipeHint();
}

function swipeHint(){
  return '<p class="hint small muted" style="text-align:center;margin:4px 0 10px">Swipe an item — or a section\'s title — to the left to delete it. Tap a title to rename it.</p>';
}

var IC_ONE = '<svg class="svgic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.6"/><path d="M5.2 19.6c.9-3.4 3.6-5.2 6.8-5.2s5.9 1.8 6.8 5.2"/></svg>';

var IC_GROUP = '<svg class="svgic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.6" r="3.1"/><path d="M3.4 19.2c.7-3 2.9-4.6 5.6-4.6s4.9 1.6 5.6 4.6"/><circle cx="16.6" cy="7.4" r="2.5"/><path d="M15.8 12.9c2.4-.2 4.3 1.2 4.9 3.9"/></svg>';

function prepPacking(){
  var mine=packing.items.filter(function(i){ return !i.removed; });
  var each=eachItems(), shared=sharedItems("pack");
  var me=getMe(), all=myPacking();
  var packed=all.filter(function(i){ return i.done; }).length;
  function groups(items, scope, kind){
    return groupBySection(items).map(function(g){
      return ckGroupHTML(g.name, g.items.map(function(i){ return ckRow(i,scope); }).join(""), scope, kind, countDone(g.items), g.items.length);
    }).join("");
  }
  var html = (all.length ? '<div class="prog"><i style="width:'+Math.round(packed/all.length*100)+'%"></i></div>' : '');
  html += '<div class="whohead"><span class="wi">'+IC_ONE+'</span><span><b>Each of us · 每人</b>'+
      '<small>Everyone packs their own. Your ticks are yours — they stay on this phone.</small></span></div>';
  html += groups(each, "each", "each") || ckGroupHTML("Each of us", "", "each", "each");
  html += '<div class="whohead grp"><span class="wi">'+IC_GROUP+'</span><span><b>Group · 共用</b>'+
      '<small>One of us brings it for all three. Tick it when you pack it, and the others see your name.</small></span></div>'+
    (me ? '' : '<p class="blurb muted small" style="margin:-2px 0 10px">Add your name in ⚙ Settings so the others can see who is bringing what.</p>');
  html += groups(shared, "shared", "pack") || ckGroupHTML("Shared", "", "shared", "pack");
  html += '<div class="whohead me"><span class="wi">'+IC.pen+'</span><span><b>Just me · 仅我</b>'+
      '<small>Extras only you need. Kept on this phone, never shared.</small></span></div>'+
    '<div class="toolrow"><button class="btn sm" data-act="pk-templates">Use a template</button>'+
    (mine.length ? '<button class="btn sm ghost" data-act="pk-save-template">Save as template</button>' : '')+'</div>';
  html += groups(mine, "mine", "pack") || ckGroupHTML("Mine", "", "mine", "pack");
  return html+swipeHint();
}

/* For trips that don't take in China. As general as the China one: nothing
   here is about a particular trip. */
var GUIDE_GENERAL = [
  { t:"Before you fly", items:[
    "Check each passport has <b>six months</b> left after you come home, and whether you need a visa or an electronic travel authority for every country on the way — transit stops included.",
    "Tell your bank where you're going, and carry two cards from different banks. Check which ones charge for foreign transactions.",
    "Travel insurance: check that it covers everyone, every country and anything you plan to do (hiring a car, skiing, diving).",
    "Save copies of passports, insurance and bookings somewhere you can open offline, and share them with someone at home."
  ]},
  { t:"On your phone", items:[
    "Download <b>offline maps</b> for each city in Google Maps or Apple Maps, and the language in your translator.",
    "Mobile data: an eSIM bought before you go is usually cheaper than roaming. Install it at home and switch it on when you land.",
    "Each place in this app opens in the map app set for its city — change it per place in Edit place."
  ]},
  { t:"Money and getting around", items:[
    "Cards and phone payments are taken almost everywhere in many countries, but keep some local cash for markets, small shops and tips.",
    "Rides and fares between stops are estimates, worked out from the distance and the city's taxi tariff when one is set in ⚙ Settings › Cities.",
    "Check the local emergency number and save your country's embassy or consulate in your contacts."
  ]}
];

function prepGuide(){
  return '<div class="guide">'+(tripHasChina() ? GUIDE : GUIDE_GENERAL).map(function(sec){
    return '<div class="card"><h3>'+esc(sec.t)+'</h3><ul>'+sec.items.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ul></div>';
  }).join("")+'</div>';
}

function checklistForm(scope, id, kind, section){
  var it = id ? findItem(scope, id) : null;
  var isNew=!it; kind = it ? it.kind : kind;
  it = it || { id:"", kind:kind, section:section||"", text:"", due:"" };
  var packKinds = scope!=="mine" && kind!=="task";
  // Sections already in use, per list, in the order they appear
  var bySec={ each:[], pack:[], task:[], mine:[] };
  (scope==="mine" ? packing.items : store.data.checklist).forEach(function(i){
    if(!i.section || i.removed) return;
    var k = scope==="mine" ? "mine" : i.kind;
    if(bySec[k] && bySec[k].indexOf(i.section)<0) bySec[k].push(i.section);
  });
  ckForm = { bySec:bySec, scope:scope, section:it.section };
  var people=tripPeople();
  var html=
    '<div class="field"><label>'+(kind==="task"?"Task":"Item")+'</label><textarea id="c_text" style="min-height:70px">'+esc(it.text)+'</textarea></div>'+
    (packKinds ? '<div class="field"><label>Who packs it</label><div class="whopick">'+
      '<label><input type="radio" name="c_who" value="each"'+(kind==="each"?" checked":"")+'><span><b>Each of us</b><br>everyone brings their own</span></label>'+
      '<label><input type="radio" name="c_who" value="pack"'+(kind==="pack"?" checked":"")+'><span><b>The group</b><br>one of us brings it</span></label>'+
      '</div></div>' : '')+
    '<div class="field"><label for="c_section_sel">Section</label><select id="c_section_sel"></select>'+
      '<input id="c_section_new" placeholder="Name the new section" autocomplete="off" style="margin-top:8px" hidden></div>'+
    (packKinds ? '<div class="field" id="c_assign_f"'+(kind==="pack"?"":" hidden")+'><label for="c_assign">Who\'s bringing it</label>'+
      '<select id="c_assign"><option value="">Not decided yet</option>'+
        people.map(function(n){ return '<option value="'+esc(n)+'"'+(it.assignee===n?" selected":"")+'>'+esc(n)+(n===getMe()?" (you)":"")+'</option>'; }).join("")+
        '<option value="__new__">＋ Someone else…</option></select>'+
      '<input id="c_assign_new" placeholder="Their name" autocomplete="off" style="margin-top:8px" hidden>'+

      '</div>' : '')+
    (kind==="task" ? '<div class="field"><label>Due</label><input id="c_due" type="date" value="'+esc(it.due||"")+'"></div>' : '')+
    (scope==="mine" ? '<p class="hint small muted">Only on this phone.</p>'
      : kind==="task" ? '<p class="hint small muted">Shared with the others.</p>'
      : '<p class="hint small muted">On everyone\'s phone. Ticks on an "each of us" item are your own; a group item shows who is bringing it.</p>')+
    '<div class="formactions">'+
      '<button class="btn primary" data-act="ck-save" data-scope="'+scope+'" data-kind="'+kind+'" data-id="'+esc(it.id)+'">Save</button>'+
      (isNew ? '' : '<button class="btn danger" data-act="ck-delete" data-scope="'+scope+'" data-id="'+esc(it.id)+'">Delete</button>')+
    '</div>';
  openSheet(isNew ? (kind==="task"?"New task":"New item") : "Edit", html);
  fillSections(scope==="mine" ? "mine" : kind, it.section);
  var sel=$("#c_section_sel"), nw=$("#c_section_new"), as=$("#c_assign"), asn=$("#c_assign_new");
  sel.addEventListener("change", function(){ nw.hidden = sel.value!=="__new__"; if(!nw.hidden) nw.focus(); });
  if(as) as.addEventListener("change", function(){ asn.hidden = as.value!=="__new__"; if(!asn.hidden) asn.focus(); });
  document.querySelectorAll('input[name="c_who"]').forEach(function(r){ r.addEventListener("change", function(){
    var keep = sel.value==="__new__" ? "" : sel.value;
    fillSections(r.value, keep);
    var f=$("#c_assign_f"); if(f) f.hidden = r.value!=="pack";
  }); });
}

var ckForm=null;

/** The section picker: the list's sections, the item's own (even if new), then "New section…". */
function fillSections(list, current){
  var sel=$("#c_section_sel"), nw=$("#c_section_new"); if(!sel || !ckForm) return;
  var secs=(ckForm.bySec[list]||[]).slice();
  if(current && secs.indexOf(current)<0) secs.unshift(current);
  sel.innerHTML=secs.map(function(k){ return '<option value="'+esc(k)+'"'+(k===current?" selected":"")+'>'+esc(k)+'</option>'; }).join("")+
    '<option value="__new__">＋ New section…</option>';
  if(!secs.length){ sel.value="__new__"; nw.hidden=false; } else nw.hidden = sel.value!=="__new__";
}

function formSection(){
  var sel=$("#c_section_sel"); if(!sel) return "";
  return sel.value==="__new__" ? $("#c_section_new").value.trim() : sel.value;
}

/** Everyone the app has seen on this trip: your name, and whoever has ticked
 *  or been given a group item. Names are added by typing one once. */
function tripPeople(){
  var seen={}, out=[];
  [getMe()].concat(store.data.checklist.map(function(i){ return i.done_by; }), store.data.checklist.map(function(i){ return i.assignee; }))
    .forEach(function(n){ n=String(n||"").trim(); if(n && !seen[n.toLowerCase()]){ seen[n.toLowerCase()]=1; out.push(n); } });
  return out.sort(function(a,b){ return a===getMe() ? -1 : b===getMe() ? 1 : a.localeCompare(b); });
}

function removeItems(scope, items, section){
  items=(items||[]).filter(Boolean);
  if(!items.length) return;
  var before=items.map(function(i){ return Object.assign({}, i, { removed:"" }); });
  setItems(scope, items.map(function(i){ return Object.assign({}, i, { removed:"1" }); }));
  renderPrep(); if(ui.view!=="prep") render();
  var what = section ? "“"+section+"” · "+items.length+" item"+(items.length===1?"":"s")
                     : "“"+String(items[0].text).slice(0,34)+(String(items[0].text).length>34?"…":"")+"”";
  toast("Deleted "+what, 5000, function(){
    setItems(scope, before); renderPrep(); if(ui.view!=="prep") render(); toast("Restored");
  });
}

function sectionForm(scope, kind, sec){
  var n=sectionItems(scope, kind, sec).length;
  openSheet("Section",
    '<div class="field"><label>Name</label><input id="c_secname" value="'+esc(sec)+'"></div>'+
    '<p class="hint small muted">'+n+' item'+(n===1?"":"s")+(scope==="mine" ? ", on this phone only." : ", on everyone\'s phone.")+'</p>'+
    '<div class="formactions">'+
      '<button class="btn primary" data-act="ck-section-save" data-scope="'+scope+'" data-kind="'+kind+'" data-section="'+esc(sec)+'">Save</button>'+
      '<button class="btn danger" data-act="ck-section-del2" data-scope="'+scope+'" data-kind="'+kind+'" data-section="'+esc(sec)+'">Delete all '+n+'</button>'+
    '</div>');
}

/* ==========================================================================
   Packing templates — for the personal list, kept on this phone like the list
   itself. A few general starters, your own saved lists, and your list from
   any other trip. Using one adds only what isn't on the list already.
   ========================================================================== */
var PACK_STARTERS = [
  { id:"st-essentials", name:"Essentials", items:[
    ["Documents","Passport (6+ months left)"],["Documents","Visas / travel authority"],["Documents","Travel insurance details"],
    ["Documents","Copies of passport and bookings (offline)"],["Money","Two cards from different banks"],["Money","Some local cash"],
    ["Health","Prescription medicines, in original packaging"],["Health","Painkillers, plasters, hand sanitiser"],
    ["Clothes","Comfortable walking shoes"],["Clothes","Sleepwear"],["Toiletries","Toothbrush and toothpaste"],["Toiletries","Sunscreen"] ]},
  { id:"st-tech", name:"Phone and tech", items:[
    ["Tech","Phone charger and cable"],["Tech","Power bank (in carry-on, under 100 Wh)"],["Tech","Plug adapter for each country"],
    ["Tech","eSIM installed before leaving"],["Tech","Headphones"],["Tech","Offline maps downloaded"] ]},
  { id:"st-warm", name:"Warm weather", items:[
    ["Clothes","Light breathable shirts"],["Clothes","Shorts or light trousers"],["Clothes","Hat"],["Clothes","Sunglasses"],
    ["Health","Insect repellent"],["Clothes","Light rain jacket or umbrella"] ]},
  { id:"st-cold", name:"Cold weather", items:[
    ["Clothes","Warm jacket"],["Clothes","Thermal layers"],["Clothes","Beanie, gloves and scarf"],["Clothes","Warm socks"],["Health","Lip balm and moisturiser"] ]},
  { id:"st-china", name:"China extras", items:[
    ["Phone","Alipay set up with a card, passport verified"],["Phone","WeChat installed"],["Phone","Amap installed"],
    ["Phone","Translator with Chinese downloaded for offline"],["Toiletries","Tissues (often no paper in public toilets)"],
    ["Documents","Hotel addresses written in Chinese"] ]}
];

var PACK_TPL_KEY="gct.packtpl";

function myTemplates(){ return load(PACK_TPL_KEY, []); }

function packingKeyFor(t){ return t.id===defaultTripId() ? LS.packing : LS.packing+"."+t.id; }

function templateSources(){
  var out=PACK_STARTERS.map(function(t){ return { src:"st:"+t.id, name:t.name, kind:"Starter", items:t.items.map(function(x){ return { section:x[0], text:x[1] }; }) }; });
  myTemplates().forEach(function(t){ out.push({ src:"my:"+t.id, name:t.name, kind:"Yours", items:t.items, del:true }); });
  allTrips().forEach(function(t){
    if(t.id===TRIP.id) return;
    var items=load(packingKeyFor(t), []).filter(function(i){ return !i.removed; });
    if(items.length) out.push({ src:"trip:"+t.id, name:t.name, kind:"Your list from", items:items });
  });
  return out;
}

function templatesForm(){
  var have={}; packing.items.forEach(function(i){ if(!i.removed) have[String(i.text).toLowerCase()]=1; });
  openSheet("Packing templates",
    '<p class="blurb small muted" style="margin:12px 0">Adds only what isn\u2019t on your list already. Nothing is ticked.</p>'+
    '<div class="loclist">'+templateSources().map(function(t){
      var add=t.items.filter(function(i){ return !have[String(i.text).toLowerCase()]; }).length;
      return '<div class="locrow"><div class="lb"><div class="en">'+(t.kind==="Your list from" ? 'Your list from '+esc(t.name) : esc(t.name))+'</div>'+
        '<div class="mt">'+(t.kind==="Your list from"?"":esc(t.kind)+' · ')+t.items.length+' items'+(add<t.items.length?' · '+add+' new':'')+'</div></div>'+
        (t.del ? '<button class="btn sm ghost" data-act="pk-del-template" data-src="'+esc(t.src)+'">Delete</button>' : '')+
        '<button class="btn sm'+(add?' primary':'')+'" data-act="pk-use" data-src="'+esc(t.src)+'"'+(add?'':' disabled')+'>Add</button></div>';
    }).join("")+'</div>');
}

function useTemplate(src){
  var t=templateSources().filter(function(x){ return x.src===src; })[0]; if(!t) return;
  var have={}; packing.items.forEach(function(i){ if(!i.removed) have[String(i.text).toLowerCase()]=1; });
  var n=0, base=Date.now().toString(36);
  t.items.forEach(function(i){
    var k=String(i.text).toLowerCase(); if(!i.text || have[k]) return; have[k]=1;
    packing.items.push({ id:"my-"+base+(n++).toString(36), kind:"pack", section:i.section||"", text:i.text, done:"", removed:"",
                         order_index:packing.items.length+1 });
  });
  packing.persist(); closeSheet(); renderPrep();
  toast(n ? "Added "+n+" item"+(n===1?"":"s") : "Everything in it is on your list already");
}

function saveTemplate(){
  var items=packing.items.filter(function(i){ return !i.removed; }).map(function(i){ return { section:i.section||"", text:i.text }; });
  if(!items.length) return;
  var name=window.prompt("Name for this template", TRIP.name+" packing"); if(name===null || !name.trim()) return;
  var list=myTemplates(); list.push({ id:Date.now().toString(36), name:name.trim(), items:items }); save(PACK_TPL_KEY, list);
  toast("Saved — "+items.length+" items");
}

function deleteTemplate(src){
  if(!window.confirm("Delete this template? Your packing lists are not affected.")) return;
  save(PACK_TPL_KEY, myTemplates().filter(function(t){ return "my:"+t.id!==src; }));
  templatesForm();
}
