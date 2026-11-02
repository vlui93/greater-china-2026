/* File importers, loaded on demand by withExtras() in index.html (which has a
   size ceiling). Plain functions in the page's global scope, like the rest of
   the app: they use its store, toast, sheets and helpers. Nothing here is
   about a particular trip. */
/* Merges getting_there / arrive_by / tickets into places this phone already
 * has, matched by id. Local only: the Sheet gets them from a laptop, with
 * sheet.js push, once the backend has the columns (see README). A full
 * seed.json works here too — only these three fields are read from it. */
function importNotes(file){
  if(!file) return;
  var r=new FileReader();
  r.onload=function(){
    var j; try{ j=JSON.parse(r.result); }catch(e){ toast("That file is not valid JSON"); return; }
    var rows=(j && j.locations) || [];
    if(!rows.length && !(j && (j.checklist||j.packing||j.schedule||j.schedule_remove))){ toast("Nothing to import in that file"); return; }
    // Places added on a phone have ids nobody else knows, so a row can also
    // name its place. Long-form details only ever fill an empty field — an
    // import never overwrites what someone has written.
    var byId={}, byZh={}, byEn={};
    store.data.locations.forEach(function(l){
      byId[l.id]=l; if(l.name_zh) byZh[l.name_zh]=l; if(l.name_en) byEn[l.name_en.toLowerCase()]=l;
    });
    var DETAILS=["history_blurb","recommendations","dishes_to_order","souvenirs"];
    var n=0, miss=0, sent=0, added=0;
    rows.forEach(function(x){
      if(!x) return;
      var l=(x.id && byId[x.id]) || (x.name_zh && byZh[x.name_zh]) || (x.name_en && byEn[String(x.name_en).toLowerCase()]);
      // A row marked "add" is a new place: created here with the file's id, so
      // an itinerary in the same file can point at it.
      if(!l && x.add && x.id && x.name_en && x.city){
        var fresh={};
        LOC_FIELDS.forEach(function(k){ fresh[k]=(x[k]==null ? "" : x[k]); });
        store.data.locations.push(fresh);
        byId[fresh.id]=fresh; if(fresh.name_zh) byZh[fresh.name_zh]=fresh; byEn[fresh.name_en.toLowerCase()]=fresh;
        store.enqueue("saveLocation", fresh); added++; sent++;
        return;
      }
      if(!l){ miss++; return; }
      var changed=false, part={ id:l.id }, detail=false;
      LOCAL_FIRST.forEach(function(k){
        if(typeof x[k]==="string" && x[k]!==(l[k]||"")){ l[k]=x[k]; part[k]=x[k]; changed=true; }
      });
      DETAILS.forEach(function(k){
        if(typeof x[k]==="string" && x[k] && !String(l[k]||"").trim()){ l[k]=x[k]; part[k]=x[k]; changed=detail=true; }
      });
      // A pin only ever fills a place that has none — never moves one.
      if(x.lat!=null && x.lng!=null && isFinite(+x.lat) && isFinite(+x.lng) && !hasXY(l)){
        l.lat=+x.lat; l.lng=+x.lng; part.lat=l.lat; part.lng=l.lng; changed=detail=true;
      }
      if(typeof x.notes==="string" && x.notes && String(l.notes||"").indexOf(x.notes)<0){
        l.notes=(l.notes ? l.notes+"\n" : "")+x.notes; part.notes=l.notes; changed=detail=true;
      }
      if(changed) n++;
      // Details go to the Sheet (queued, so this works unconnected too). Only
      // for these: the three LOCAL_FIRST fields are kept safe on the phone,
      // and queueing all 68 places on every import would stall the first sync.
      if(detail){ store.enqueue("saveLocation", part); sent++; }
    });
    // Itinerary: stops in the file are added or updated by id, and listed ids
    // are removed. This rewrites the plan everyone sees, so ask first.
    var sc=(j && j.schedule) || [], scGone=(j && j.schedule_remove) || [], scN=0;
    if(sc.length || scGone.length){
      var have={}; store.data.schedule.forEach(function(s){ have[s.id]=s; });
      var SCF=["date","order_index","location_id","planned_time","notes"];
      // Only what would actually change counts, so importing the same file on
      // a phone that already has the new plan asks nothing and does nothing.
      sc=sc.filter(function(x){
        if(!x || !x.id || !store.loc(x.location_id)) return false;
        var e=have[x.id]; if(!e) return true;
        return SCF.some(function(k){ return x[k]!==undefined && String(x[k])!==String(e[k]==null?"":e[k]); });
      });
      scGone=scGone.filter(function(id){ return have[id]; });
      var upd=sc.filter(function(x){ return have[x.id]; }).length;
      var msg="This file also updates the itinerary:\n"+
        (sc.length-upd ? "• "+(sc.length-upd)+" stops added\n" : "")+
        (upd ? "• "+upd+" stops moved or retimed\n" : "")+
        (scGone.length ? "• "+scGone.length+" stops removed\n" : "")+
        "\nApply it? It changes the plan for everyone once synced.";
      if((sc.length || scGone.length) && confirm(msg)){
        sc.forEach(function(x){
          var e=have[x.id];
          if(!e){ e={ id:x.id, date:"", order_index:0, location_id:"", planned_time:"", notes:"" }; store.data.schedule.push(e); have[x.id]=e; }
          SCF.forEach(function(k){ if(x[k]!==undefined) e[k]=x[k]; });
          store.enqueue("saveScheduleEntry", e); scN++;
        });
        scGone.forEach(function(id){
          store.data.schedule=store.data.schedule.filter(function(s){ return s.id!==id; });
          store.enqueue("deleteScheduleEntry", { id:id }); scN++;
        });
      }
    }
    // Checklist and packing: add what is new, update wording and dates, and
    // never touch whether something has been ticked — importing a newer file
    // must not undo anyone's progress.
    var ckN=0, pkN=0;
    ((j && j.checklist) || []).forEach(function(x){
      if(!x || !x.id || !x.text) return;
      var cur=findItem("shared", x.id);
      if(!cur){
        store.data.checklist.push({ id:x.id, kind:x.kind||"task", section:x.section||"", text:x.text,
          due:x.due||"", location_id:x.location_id||"", done:"", done_by:"", order_index:x.order_index||0,
          updated:"", removed:"" });
        ckN++; return;
      }
      var changed=false;
      ["kind","section","text","due","location_id","order_index"].forEach(function(k){
        if(x[k]!==undefined && String(x[k])!==String(cur[k]==null?"":cur[k])){ cur[k]=x[k]; changed=true; }
      });
      if(changed){ cur.updated=nowISO(); ckN++; }
    });
    ((j && j.packing) || []).forEach(function(x){
      if(!x || !x.id || !x.text) return;
      var mine=findItem("mine", x.id);
      if(!mine){
        packing.items.push({ id:x.id, kind:"pack", section:x.section||"", text:x.text, done:"", removed:"",
                             order_index:x.order_index||packing.items.length+1 });
        pkN++; return;
      }
      // Same rule as the shared list: a newer file can reword or regroup an
      // item, but never untick it, and never bring back one you deleted.
      if(mine.removed) return;
      var moved=false;
      ["section","text","order_index"].forEach(function(k){
        if(x[k]!==undefined && String(x[k])!==String(mine[k]==null?"":mine[k])){ mine[k]=x[k]; moved=true; }
      });
      if(moved) pkN++;
    });
    packing.persist();
    store.persist(); closeSheet(); render();
    var parts=[];
    if(added) parts.push(added+" new place"+(added===1?"":"s"));
    if(n) parts.push(n+" place"+(n===1?"":"s"));
    if(scN) parts.push(scN+" itinerary change"+(scN===1?"":"s"));
    if(ckN) parts.push(ckN+" checklist item"+(ckN===1?"":"s"));
    if(pkN) parts.push(pkN+" packing item"+(pkN===1?"":"s"));
    toast(parts.length ? "Updated "+parts.join(" · ")+(miss?" · "+miss+" places not on this phone":"")
                       : "Nothing new in that file", 3400);
    if((ckN || sent || scN) && store.configured()) store.sync({quiet:true}).catch(function(){});
  };
  r.onerror=function(){ toast("Could not read that file"); };
  r.readAsText(file);
}

/* ==========================================================================
   Import places from a file
   - Google My Maps: Export to KML/KMZ (a list of pins with names and notes)
   - Google Takeout, Maps (your places): "Saved Places.json"
   - Google Takeout, Saved: one .csv per list (Title, Note, URL)
   Read on the phone; nothing is uploaded except the places you add.
   ========================================================================== */
function unzipFirst(buf, want){
  var u8=new Uint8Array(buf), dv=new DataView(buf), eocd=-1;
  for(var i=u8.length-22;i>=Math.max(0,u8.length-66000);i--) if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; }
  if(eocd<0) return Promise.reject(new Error("not a zip"));
  var count=dv.getUint16(eocd+10,true), p=dv.getUint32(eocd+16,true), dec=new TextDecoder();
  for(var k=0;k<count;k++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    var method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nlen=dv.getUint16(p+28,true),
        xlen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    var name=dec.decode(u8.subarray(p+46,p+46+nlen));
    p+=46+nlen+xlen+clen;
    if(!want.test(name)) continue;
    var start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true), data=u8.subarray(start,start+csize);
    if(method===0) return Promise.resolve(dec.decode(data));
    if(method!==8 || typeof DecompressionStream==="undefined") return Promise.reject(new Error("can't unzip"));
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }
  return Promise.reject(new Error("no kml inside"));
}
function stripTags(h){
  var d=document.createElement("div"); d.innerHTML=String(h||"").replace(/<br\s*\/?>/gi,"\n");
  return (d.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
}
function parseKml(text){
  var doc=new DOMParser().parseFromString(text,"application/xml"), out=[];
  var pms=doc.getElementsByTagName("Placemark");
  for(var i=0;i<pms.length;i++){
    var pm=pms[i], get=function(tag){ var e=pm.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ""; };
    if(!pm.getElementsByTagName("Point").length) continue;   // a route or an area, not a place
    var c=get("coordinates").split(/\s+/)[0].split(",");
    out.push({ name:get("name"), note:stripTags(get("description")), lng:c.length>1?+c[0]:null, lat:c.length>1?+c[1]:null });
  }
  return out;
}
function parseGeoJson(j){
  var fs=(j && j.features) || (j && j.type==="Feature" ? [j] : []);
  return fs.map(function(f){
    var p=f.properties||{}, loc=p.location||p.Location||{}, g=f.geometry||{}, c=g.coordinates||[];
    var lat=+c[1], lng=+c[0];
    if(!(isFinite(lat)&&isFinite(lng)) || (lat===0&&lng===0)){
      var gc=loc["Geo Coordinates"]||{}; lat=+gc.Latitude; lng=+gc.Longitude;
    }
    var url=p.google_maps_url||p["Google Maps URL"]||"";
    if(!(isFinite(lat)&&isFinite(lng)) || (lat===0&&lng===0)){ var m=parseMapText(url); lat=m.lat; lng=m.lng; }
    var addr=loc.address||loc.Address||"";
    return { name:loc.name||loc["Business Name"]||p.Title||p.title||p.name||"", note:[p.Comment||p.comment||"", addr?"Address: "+addr:""].filter(Boolean).join("\n"),
             lat:isFinite(lat)&&lat!==null?lat:null, lng:isFinite(lng)&&lng!==null?lng:null };
  });
}
function parseCsv(text){
  var rows=[], row=[], f="", q=false;
  text=String(text).replace(/^﻿/,"");
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=ch; continue; }
    if(ch==='"') q=true;
    else if(ch===","){ row.push(f); f=""; }
    else if(ch==="\n"||ch==="\r"){ if(ch==="\r"&&text[i+1]==="\n") i++; row.push(f); rows.push(row); row=[]; f=""; }
    else f+=ch;
  }
  if(f||row.length){ row.push(f); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){ return String(x).trim(); }); });
}
function parseCsvPlaces(text){
  var rows=parseCsv(text); if(rows.length<2) return [];
  var h=rows[0].map(function(x){ return String(x).trim().toLowerCase(); });
  var col=function(re){ for(var i=0;i<h.length;i++) if(re.test(h[i])) return i; return -1; };
  var cn=col(/^(title|name)$/), cnote=col(/^(note|notes|comment|description)$/), cu=col(/^url$/), cla=col(/^(lat|latitude)$/), clo=col(/^(lng|lon|long|longitude)$/);
  if(cn<0) cn=0;
  return rows.slice(1).map(function(r){
    var lat=cla>=0?parseFloat(r[cla]):NaN, lng=clo>=0?parseFloat(r[clo]):NaN;
    if(!(isFinite(lat)&&isFinite(lng)) && cu>=0){ var m=parseMapText(r[cu]||""); lat=m.lat; lng=m.lng; }
    return { name:String(r[cn]||"").trim(), note:cnote>=0?String(r[cnote]||"").trim():"",
             lat:isFinite(lat)&&lat!==null?lat:null, lng:isFinite(lng)&&lng!==null?lng:null };
  }).filter(function(x){ return x.name; });
}
function readPlacesFile(file){
  var n=String(file.name||"").toLowerCase();
  if(/\.kmz$/.test(n)) return file.arrayBuffer().then(function(b){ return unzipFirst(b,/\.kml$/i); }).then(parseKml);
  return file.text().then(function(t){
    if(/^\s*</.test(t)) return parseKml(t);
    if(/^\s*[\[{]/.test(t)) return parseGeoJson(JSON.parse(t));
    return parseCsvPlaces(t);
  });
}
var importing=[];
function importPlacesFile(file){
  if(!file) return;
  readPlacesFile(file).then(function(rows){
    rows=rows.filter(function(r){ return r.name || r.lat!=null; });
    if(!rows.length){ toast("No places found in that file", 2800); return; }
    importing=rows.map(function(r){
      var names=splitNames(r.name||"Unnamed place"), has=r.lat!=null&&r.lng!=null&&isFinite(r.lat)&&isFinite(r.lng);
      var dup=nearDuplicate({ names:names, lat:has?r.lat:null, lng:has?r.lng:null });
      return { names:names, raw:r.name, note:r.note||"", lat:has?+r.lat:null, lng:has?+r.lng:null,
               city:has?cityFor(+r.lat,+r.lng):"", type:guessType(r.name), dup:dup };
    });
    var mainland=importing.some(function(x){ return x.lat!=null && regionOf(x.lat,x.lng)==="mainland"; });
    var newOnes=importing.filter(function(x){ return !x.dup; }).length;
    var opts=cityOptions();
    openSheet("Import places",
      '<p class="blurb small muted" style="margin:12px 0">'+importing.length+' in '+esc(file.name)+'. '+
        (importing.length-newOnes ? (importing.length-newOnes)+' already on your list (unticked). ' : '')+
        'They go into '+esc(TRIP.name)+'; add them to days afterwards.</p>'+
      (mainland ? '<label class="row small" style="gap:8px;margin:0 0 12px;align-items:flex-start"><input type="checkbox" id="imp_shift" checked style="margin-top:2px"> '+
        'Pins in mainland China came from Google Maps or Amap — move them to GPS (leave ticked unless the file came from somewhere else)</label>' : '')+
      '<div class="field"><label>City for places outside the cities you have</label><select id="imp_city">'+
        opts.map(function(c){ return '<option>'+esc(c)+'</option>'; }).join("")+'</select></div>'+
      '<div class="implist">'+importing.map(function(x,i){
        return '<label><input type="checkbox" data-i="'+i+'"'+(x.dup?'':' checked')+'><span><div class="en">'+esc(x.names.en||x.names.zh)+
          (x.names.en&&x.names.zh?' <span class="zh">'+escz(x.names.zh)+'</span>':'')+'</div>'+
          '<div class="mt">'+esc([x.city||"", x.type, x.lat==null?"no pin":"", x.dup?"already on your list":""].filter(Boolean).join(" · "))+'</div></span></label>';
      }).join("")+'</div>'+
      '<div class="formactions"><button class="btn primary block" data-act="import-apply">Add the ticked places</button></div>');
  }).catch(function(e){
    toast(/zip|unzip|kml inside/.test(String(e&&e.message)) ? "Couldn't open that KMZ — export it as KML instead" : "Couldn't read that file", 3200);
  });
}
function applyImport(){
  var shift=$("#imp_shift") && $("#imp_shift").checked, fallback=($("#imp_city")||{}).value||"";
  var picked=[].slice.call(document.querySelectorAll('.implist input[type="checkbox"]')).filter(function(c){ return c.checked; })
    .map(function(c){ return importing[+c.dataset.i]; }).filter(Boolean);
  if(!picked.length){ toast("Nothing ticked"); return; }
  var base=uid("loc");
  picked.forEach(function(x,i){
    var lat=x.lat, lng=x.lng;
    if(lat!=null && shift && regionOf(lat,lng)==="mainland"){ var w=gcjToWgs(lat,lng); lat=+w[0].toFixed(6); lng=+w[1].toFixed(6); }
    var city=(lat!=null ? cityFor(lat,lng) : "") || fallback;
    var l={}; LOC_FIELDS.forEach(function(k){ l[k]=""; });
    l.id=base+i.toString(36); l.name_en=x.names.en||x.names.zh; l.name_zh=x.names.zh; l.city=city; l.type=x.type;
    l.lat=lat==null?"":lat; l.lng=lng==null?"":lng; l.nav_app=mapAppFor(city); l.notes=x.note;
    store.data.locations.push(l); store.enqueue("saveLocation", l);
  });
  store.persist(); closeSheet(); render();
  toast("Added "+picked.length+" place"+(picked.length===1?"":"s"));
  if(store.configured()) store.flush().then(updateStatus).catch(function(){});
}


/* ==========================================================================
   Plan with any AI
   A form for the trip's basics writes a prompt to paste into any AI app
   (ChatGPT, Gemini, Apple's); its reply is pasted back here, previewed,
   ticked and imported. Nothing here calls an AI itself — no key, no cost —
   and nothing goes in unseen. Every place imported says "AI draft — check"
   in its notes until someone has checked it, and pins are never taken from
   an AI reply (they're usually made up): add a map link to the place, or use
   Search in its Edit form, and it gets a real one.
   The traveller part of the form (who, languages, food, pace) is kept for
   every trip; the rest per trip. Both stay on this phone.
   ========================================================================== */
var AI_PROFILE="gct.aiprofile", aiPlan=null, aiLastReply="";
var AI_TYPES={ attraction:1, restaurant:1, shopping:1, hotel:1 };
function aiFormKey(){ return "gct.aiform."+TRIP.id; }
/** Each city on the plan, with the days it covers, as a starting point. */
function aiCitiesGuess(){
  var span={}, order=[];
  DAYS.forEach(function(d){ store.dayStops(d).forEach(function(s){
    var l=store.loc(s.location_id); if(!l || !l.city) return;
    if(!span[l.city]){ span[l.city]={ a:d, b:d }; order.push(l.city); } else span[l.city].b=d;
  }); });
  return order.map(function(c){ return c+" — "+fmtDate(span[c].a,false)+" to "+fmtDate(span[c].b,false); }).join("\n");
}
function aiValues(){
  var p=load(AI_PROFILE, {}), f=load(aiFormKey(), {});
  return {
    who:p.who||"", langs:p.langs||"", spice:p.spice||"", diet:p.diet||"", budget:p.budget||"", pace:p.pace||"moderate",
    noHeavy:p.noHeavy!==false, flex:p.flex!==false,
    cities:f.cities!=null ? f.cities : aiCitiesGuess(), from:f.from||TRIP_START, to:f.to||TRIP_END,
    interests:f.interests||"", must:f.must||"", booked:f.booked||"", posts:f.posts||"",
    inc:f.inc||{ places:true, food:true, days:true, guide:true, tasks:true }
  };
}
function aiCollect(){
  var g=function(id){ var e=$("#ai_"+id); return e ? (e.type==="checkbox" ? e.checked : e.value) : ""; };
  var v={ who:g("who"), langs:g("langs"), spice:g("spice"), diet:g("diet"), budget:g("budget"), pace:g("pace"),
          noHeavy:g("noheavy"), flex:g("flex"), cities:g("cities"), from:g("from"), to:g("to"),
          interests:g("interests"), must:g("must"), booked:g("booked"), posts:g("posts"),
          inc:{ places:g("inc_places"), food:g("inc_food"), days:g("inc_days"), guide:g("inc_guide"), tasks:g("inc_tasks") } };
  save(AI_PROFILE, { who:v.who, langs:v.langs, spice:v.spice, diet:v.diet, budget:v.budget, pace:v.pace, noHeavy:v.noHeavy, flex:v.flex });
  save(aiFormKey(), { cities:v.cities, from:v.from, to:v.to, interests:v.interests, must:v.must, booked:v.booked, posts:v.posts, inc:v.inc });
  return v;
}
function aiForm(){
  var v=aiValues();
  var inp=function(id,label,val,ph,hint){ return '<div class="field"><label>'+label+'</label><input id="ai_'+id+'" value="'+esc(val)+'" placeholder="'+esc(ph||"")+'">'+(hint?'<div class="hint">'+hint+'</div>':'')+'</div>'; };
  var area=function(id,label,val,ph,hint){ return '<div class="field"><label>'+label+'</label><textarea id="ai_'+id+'" style="min-height:'+(id==="cities"?112:64)+'px" placeholder="'+esc(ph||"")+'">'+esc(val)+'</textarea>'+(hint?'<div class="hint">'+hint+'</div>':'')+'</div>'; };
  var opt=function(cur,val,label){ return '<option value="'+val+'"'+(cur===val?" selected":"")+'>'+label+'</option>'; };
  var tick=function(id,on,label){ return '<label class="row small" style="gap:8px;margin:6px 0"><input type="checkbox" id="ai_'+id+'"'+(on?" checked":"")+'> '+label+'</label>'; };
  var html='<div id="aiFormWrap">'+
    '<p class="blurb small muted" style="margin:12px 0 14px">Fill this in, copy the prompt into any AI app — ChatGPT, Gemini, Apple Intelligence — '+
      'then paste its reply below. You see everything before it goes in. Imported places are marked <b>AI draft — check</b>.</p>'+
    '<div class="section-title" style="margin-top:0">1 · The trip</div>'+
    '<p class="blurb small">'+esc(TRIP.name)+' · '+esc(tripRange())+' <span class="muted">(dates: ⚙ Settings › Trips)</span></p>'+
    '<div class="grid2"><div class="field"><label>Plan from</label><input id="ai_from" type="date" min="'+TRIP_START+'" max="'+TRIP_END+'" value="'+esc(v.from)+'"></div>'+
      '<div class="field"><label>to</label><input id="ai_to" type="date" min="'+TRIP_START+'" max="'+TRIP_END+'" value="'+esc(v.to)+'"></div></div>'+
    area("cities","Cities and dates",v.cities,"Hong Kong — 17 to 20 Oct\nGuangzhou — 21 to 23 Oct","One per line. Where you're staying helps too.")+
    area("booked","Already booked or fixed",v.booked,"Flights, trains, hotels, tickets, a dinner with friends…")+
    area("must","Must-dos",v.must,"Places, foods, experiences")+
    inp("interests","Interests",v.interests,"history, food, architecture, shopping, nature…")+
    area("posts","Saved posts to use (optional)",v.posts,"Paste Xiaohongshu, Instagram or blog text here","They're used as leads; the AI is asked to check each place exists.")+
    '<div class="section-title">2 · You (kept for every trip)</div>'+
    inp("who","Who's going",v.who,"3 adults")+
    inp("langs","Languages you speak",v.langs,"English, Mandarin…","No translation help is suggested where these are spoken.")+
    '<div class="field"><label>Spice</label><select id="ai_spice">'+opt(v.spice,"","No preference")+opt(v.spice,"none","No spice")+
      opt(v.spice,"mild","Mild — mixed menus with mild dishes")+opt(v.spice,"spicy","Spicy is fine")+'</select></div>'+
    inp("diet","Diet and dislikes",v.diet,"vegetarian, no offal, allergies…")+
    inp("budget","Budget per meal",v.budget,"about ¥80–150 a head")+
    '<div class="field"><label>Pace</label><select id="ai_pace">'+opt(v.pace,"relaxed","Relaxed")+opt(v.pace,"moderate","Moderate")+opt(v.pace,"packed","Packed")+'</select>'+
      tick("noheavy",v.noHeavy,"Never two heavy days in a row (day trips, altitude, all-day parks)")+
      tick("flex",v.flex,"A flex half-day every 3–4 days")+'</div>'+
    '<div class="section-title">3 · What to ask for</div>'+
    tick("inc_places",v.inc.places,"Places to see — the famous ones first")+
    tick("inc_food",v.inc.food,"Somewhere to eat for every lunch and dinner, with an alternative")+
    tick("inc_days",v.inc.days,"A day-by-day plan")+
    tick("inc_guide",v.inc.guide,"Background, what to do, order and buy for each place")+
    tick("inc_tasks",v.inc.tasks,"Things to book ahead, for the checklist")+
    '<div class="formactions" style="margin-top:14px"><button class="btn primary" data-act="ai-copy">Copy the prompt</button></div>'+
    '<textarea id="ai_prompt" readonly style="min-height:90px;font-size:12px;margin-top:10px" aria-label="The prompt"></textarea>'+
    '<div class="section-title">4 · Paste the reply</div>'+
    '<textarea id="ai_reply" style="min-height:110px;font-size:12.5px" placeholder="Paste the AI\'s whole reply here"></textarea>'+
    '<div class="formactions" style="margin-top:10px"><button class="btn primary" data-act="ai-read">Read the reply</button></div>'+
    '<div id="ai_err" class="hint" style="color:var(--warn)"></div></div>';
  openSheet("Plan with AI", html);
  $("#ai_prompt").value=aiPrompt(v);
  $("#ai_reply").value=aiLastReply;
  // On the form's own wrapper, so they go when the sheet shows something else
  var w=$("#aiFormWrap"), upd=function(e){ if(e.target.id!=="ai_reply" && e.target.id!=="ai_prompt") $("#ai_prompt").value=aiPrompt(aiCollect()); };
  w.addEventListener("input", upd); w.addEventListener("change", upd);
}
function aiPrompt(v){
  var L=[], add=function(s){ L.push(s); };
  var SP={ none:"no spice at all", mild:"less spicy to non-spicy — pick places with mixed menus and name the mild dishes", spicy:"spicy food is fine" };
  add("You're helping plan a trip. Reply with JSON only — no other text — in exactly the format at the end.");
  add(""); add("TRIP");
  add("Name: "+TRIP.name);
  add("Dates: "+TRIP_START+" to "+TRIP_END+((v.from!==TRIP_START||v.to!==TRIP_END) ? " — plan only "+v.from+" to "+v.to : ""));
  if(v.cities) add("Cities and dates:\n"+v.cities);
  if(v.booked) add("Already booked or fixed:\n"+v.booked);
  if(v.must) add("Must-dos:\n"+v.must);
  if(v.interests) add("Interests: "+v.interests);
  if(v.who) add("Travellers: "+v.who);
  if(v.langs) add("Languages we speak: "+v.langs+" (no translation help needed where these are spoken)");
  var food=[SP[v.spice], v.diet && "diet and dislikes: "+v.diet, v.budget && "budget per meal: "+v.budget].filter(Boolean);
  if(food.length) add("Food: "+food.join("; "));
  add("Pace: "+v.pace+"."+(v.noHeavy?" Never put two heavy days back to back (a day trip of an hour or more each way, altitude, an all-day park, a travel day with sightseeing).":"")+
    (v.flex?" Leave a flex half-day every 3–4 days.":""));
  if(v.posts) add("Saved posts to use as leads (check each place exists before including it):\n"+v.posts);
  var have=store.data.locations.map(function(l){ return "- "+(l.name_en||l.name_zh)+(l.name_zh&&l.name_en?" ("+l.name_zh+")":"")+" — "+l.city; });
  if(have.length) add("Places already in the plan — don't add them again; you may schedule them by their exact English name:\n"+have.slice(0,120).join("\n"));
  add(""); add("WHAT TO INCLUDE");
  if(v.inc.places) add("- places: each city's famous highlights first, even if not obviously our style (say what they are), then the must-dos and interests.");
  if(v.inc.food) add("- food: a restaurant for every lunch and dinner near that day's stops, plus one nearby alternative (optional: true). Give each restaurant's spice level and, where it has spicy dishes, the mild ones to order.");
  if(v.inc.days) add("- days: for each day, the stops in order with a time, one optional alternative for each meal and big stop, and whether the day is heavy, light or flex.");
  if(v.inc.guide) add("- for each new place: background (2–3 sentences), what to do, what to order, what to buy.");
  if(v.inc.tasks) add("- tasks: what must be booked ahead, with the date booking opens if you know it.");
  add(""); add("RULES");
  add("- Every fact needs a source you can name: put a URL in \"source\". If you're not sure of something (hours, prices, booking), leave it out or write \"check\".");
  add("- No coordinates.");
  add("- name_zh is the name as written locally: Simplified Chinese on the mainland, Traditional in Hong Kong, Macau and Taiwan.");
  add("- Dates YYYY-MM-DD, times HH:MM (24-hour). type is attraction, restaurant, shopping or hotel. spice is none, mild or spicy.");
  add("- In days, \"place\" is the place's name_en exactly as in places or in the list above.");
  add(""); add("FORMAT");
  var f={ kind:"trip-ai-plan", version:1,
    places:[{ name_en:"", name_zh:"", city:"", type:"attraction", area:"", background:"", what_to_do:"", what_to_order:"", what_to_buy:"",
              spice:"", mild_dishes:"", hours:"", booking:"", getting_there:"", tickets:"", source:"" }] };
  if(v.inc.days) f.days=[{ date:"YYYY-MM-DD", label:"", load:"heavy | light | flex", stops:[{ place:"", time:"HH:MM", optional:false, note:"" }] }];
  if(v.inc.tasks) f.tasks=[{ text:"", due:"YYYY-MM-DD", section:"Bookings" }];
  add(JSON.stringify(f));
  return L.join("\n");
}
function aiCopy(){
  var p=$("#ai_prompt"); p.value=aiPrompt(aiCollect());
  var done=function(){ toast("Prompt copied — paste it into your AI app", 3000); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p.value).then(done, function(){ p.select(); try{ document.execCommand("copy"); done(); }catch(e){ toast("Select the prompt and copy it"); } });
  else { p.select(); try{ document.execCommand("copy"); done(); }catch(e){ toast("Select the prompt and copy it"); } }
}
/** The JSON in an AI's reply: code fences, chat before and after, and
 *  trailing commas are all tolerated. */
function aiParse(text){
  var t=String(text||"").replace(/```(?:json)?/gi, "");
  var a=t.indexOf("{"), b=t.lastIndexOf("}");
  if(a<0) throw new Error("There's no data in that reply — ask the AI to reply with the JSON only.");
  if(b<a) throw new Error("The reply isn't complete data — it may have been cut off. Ask the AI to send the JSON again, all of it.");
  var j=t.slice(a, b+1), d;
  try{ d=JSON.parse(j); }catch(e){
    try{ d=JSON.parse(j.replace(/,\s*([}\]])/g, "$1")); }
    catch(e2){ throw new Error("The reply isn't complete data — it may have been cut off. Ask the AI to send the JSON again, all of it."); }
  }
  if(!d || (!Array.isArray(d.places) && !Array.isArray(d.days) && !Array.isArray(d.tasks))) throw new Error("That reply doesn't have places, days or tasks in it.");
  return d;
}
function aiKey(s){ return toSimp(String(s||"").trim()).toLowerCase(); }
/** The reply, checked against the trip: places already here, stops pointing
 *  at nothing, days outside the trip. */
function aiNormalize(d){
  var mine={}; store.data.locations.forEach(function(l){ if(l.name_en) mine[aiKey(l.name_en)]=l.id; if(l.name_zh) mine[aiKey(l.name_zh)]=l.id; });
  var s=function(x){ return x==null ? "" : Array.isArray(x) ? x.join("\n") : String(x).trim(); };
  var places=(d.places||[]).map(function(p){
    var o={ name_en:s(p.name_en), name_zh:s(p.name_zh), city:s(p.city), type:s(p.type).toLowerCase(), area:s(p.area), background:s(p.background),
            what_to_do:s(p.what_to_do), what_to_order:s(p.what_to_order), what_to_buy:s(p.what_to_buy), spice:s(p.spice).toLowerCase(),
            mild_dishes:s(p.mild_dishes), hours:s(p.hours), booking:s(p.booking), getting_there:s(p.getting_there), tickets:s(p.tickets), source:s(p.source) };
    if(!AI_TYPES[o.type]) o.type = /food|eat|caf|bar|dessert|bakery|restaur/.test(o.type) ? "restaurant" : /shop|market|mall/.test(o.type) ? "shopping" : "attraction";
    if(!/^(none|mild|spicy)$/.test(o.spice)) o.spice="";
    o.existing = mine[aiKey(o.name_en)] || mine[aiKey(o.name_zh)] || "";
    return o;
  }).filter(function(p){ return p.name_en || p.name_zh; });
  var byName={}; places.forEach(function(p,i){ if(p.name_en) byName[aiKey(p.name_en)]=i; if(p.name_zh) byName[aiKey(p.name_zh)]=i; });
  var days=(d.days||[]).map(function(x){
    var date=s(x.date), load=s(x.load).toLowerCase();
    return { date:date, inTrip:DAYS.indexOf(date)>=0, label:s(x.label), load:/^(heavy|light|flex)$/.test(load)?load:"",
      stops:(x.stops||[]).map(function(st){
        var k=aiKey(st.place), i=byName[k];
        var ref = i!=null ? (places[i].existing ? { existing:places[i].existing } : { newIndex:i }) : mine[k] ? { existing:mine[k] } : null;
        var t=s(st.time); return { place:s(st.place), time:/^\d{1,2}:\d\d$/.test(t) ? ("0"+t).slice(-5) : "", optional:!!st.optional, note:s(st.note), ref:ref };
      }) };
  });
  var tasks=(d.tasks||[]).map(function(t){ var due=s(t.due); return { text:s(t.text), due:/^\d{4}-\d\d-\d\d$/.test(due)?due:"", section:s(t.section)||"From AI" }; })
    .filter(function(t){ return t.text; });
  return { places:places, days:days, tasks:tasks };
}
function aiRead(){
  var err=$("#ai_err"); err.textContent=""; aiLastReply=$("#ai_reply").value;
  try{ aiPlan=aiNormalize(aiParse($("#ai_reply").value)); }catch(e){ err.textContent=e.message; return; }
  aiPreview();
}
function aiPreview(){
  var P=aiPlan, nNew=P.places.filter(function(p){ return !p.existing; }).length;
  var nameOf=function(st){ return st.ref && st.ref.existing ? (store.loc(st.ref.existing)||{}).name_en || st.place : st.place; };
  var box=function(k,on,dis,np){ return '<input type="checkbox" data-k="'+k+'"'+(np!=null?' data-np="'+np+'"':'')+(on?" checked":"")+(dis?" disabled":"")+'>'; };
  var html='<p class="blurb small muted" style="margin:12px 0">Untick anything you don\'t want, then import. A stop at a new place you untick is left out too.</p>'+
    '<div class="section-title" style="margin-top:0">Places · '+nNew+' new'+(P.places.length-nNew ? ', '+(P.places.length-nNew)+' already here' : '')+'</div><div class="implist">'+
    P.places.map(function(p,i){
      return '<label class="impr'+(p.existing?" muted":"")+'">'+(p.existing ? '<span class="pill">Already here</span>' : box("p:"+i,true))+
        '<span><b>'+esc(p.name_en||p.name_zh)+'</b>'+(p.name_zh&&p.name_en?' <span class="zh">'+escz(p.name_zh)+'</span>':'')+
        '<span class="small muted"> · '+esc(p.city||"no city")+' · '+esc(p.type)+(p.spice?' · '+esc(SPICE_LABEL[p.spice]||p.spice):'')+
        (p.city && !cityInfo(p.city) ? ' · <b>new city</b> — add it in ⚙ Settings › Cities' : '')+(p.source?'':' · no source')+'</span></span></label>';
    }).join("")+'</div>'+
    (P.days.length ? '<div class="section-title">Day plan</div>'+P.days.map(function(d,di){
      if(!d.inTrip) return '<p class="blurb small muted">'+esc(d.date)+' — outside this trip\'s dates, left out</p>';
      var own=(store.raw.days||[]).some(function(x){ return x.date===d.date && tripOf(x)===TRIP.id && x.label; });
      return '<div class="impday"><div class="impdh"><b>'+esc(fmtDate(d.date,true))+'</b>'+
        (d.label||d.load ? '<label class="small" style="margin-left:6px">'+box("d:"+di,!own)+' name it “'+esc([d.label,d.load].filter(Boolean).join(" · "))+'”'+(own?' (replaces yours)':'')+'</label>' : '')+'</div>'+
        d.stops.map(function(st,si){
          return '<label class="impr">'+box("s:"+di+":"+si, !!st.ref, !st.ref, st.ref && st.ref.newIndex!=null ? st.ref.newIndex : null)+'<span>'+esc(st.time||"—")+' · '+esc(nameOf(st))+
            (st.optional?' <span class="pill">option</span>':'')+(st.ref?'':' <span class="small muted">— not in the list, left out</span>')+'</span></label>';
        }).join("")+'</div>';
    }).join("") : '')+
    (P.tasks.length ? '<div class="section-title">Checklist · '+P.tasks.length+'</div><div class="implist">'+P.tasks.map(function(t,i){
      return '<label class="impr">'+box("t:"+i,true)+'<span>'+esc(t.text)+(t.due?' <span class="small muted">· by '+esc(fmtDate(t.due,false))+'</span>':'')+'</span></label>';
    }).join("")+'</div>' : '')+
    '<div class="formactions" style="margin-top:14px"><button class="btn primary" data-act="ai-import">Import ticked</button><button class="btn" data-act="ai-back">Back</button></div>';
  openSheet("Check before importing", html);
  // Unticking a new place unticks (and greys) the stops at it; ticking it back restores them
  $("#sheetBody").querySelector(".implist").addEventListener("change", function(e){
    var k=e.target.dataset && e.target.dataset.k; if(!k || k.indexOf("p:")) return;
    [].forEach.call(document.querySelectorAll('#sheetBody input[data-np="'+k.slice(2)+'"]'), function(c){ c.checked=e.target.checked; c.disabled=!e.target.checked; });
  });
}
function aiNotes(p){
  return ["AI draft — check before relying on it",
    p.spice ? "Spice: "+(p.spice==="mild"?"mild options":p.spice)+(p.mild_dishes?" — "+p.mild_dishes:"") : "",
    p.area && "Area: "+p.area, p.hours && "Hours: "+p.hours, p.booking && "Booking: "+p.booking,
    "Source: "+(p.source||"none given")].filter(Boolean).join("\n");
}
function aiImport(){
  var on=function(k){ var c=document.querySelector('#sheetBody input[data-k="'+k+'"]'); return !!(c && c.checked && !c.disabled); };
  var P=aiPlan, made={}, base=uid("loc"), n={ p:0, s:0, d:0, t:0, skip:0 };
  P.places.forEach(function(p,i){
    if(p.existing || !on("p:"+i)) return;
    var l={}; LOC_FIELDS.forEach(function(k){ l[k]=""; });
    l.id=base+i.toString(36); l.name_en=p.name_en||p.name_zh; l.name_zh=p.name_zh; l.city=p.city; l.type=p.type;
    l.nav_app=mapAppFor(p.city); l.history_blurb=p.background; l.recommendations=p.what_to_do; l.dishes_to_order=p.what_to_order;
    l.souvenirs=p.what_to_buy; l.getting_there=p.getting_there; l.tickets=p.tickets; l.notes=aiNotes(p);
    store.data.locations.push(l); store.enqueue("saveLocation", l); made[i]=l.id; n.p++;
  });
  P.days.forEach(function(d,di){
    if(!d.inTrip) return;
    if((d.label||d.load) && on("d:"+di)){
      var row={ id:"day-"+TRIP.id+"-"+d.date.replace(/-/g,""), trip_id:TRIP.id, date:d.date, label:[d.label,d.load].filter(Boolean).join(" · ") };
      store.raw.days=(store.raw.days||[]).filter(function(x){ return x.id!==row.id; }).concat([row]); store.enqueue("saveDay", row); n.d++;
    }
    d.stops.forEach(function(st,si){
      if(!on("s:"+di+":"+si)) return;
      var lid = st.ref.existing || made[st.ref.newIndex];
      if(!lid){ n.skip++; return; }
      var e={ id:uid("sc")+di.toString(36)+si.toString(36), date:d.date, order_index:nextOrder(d.date), location_id:lid,
              planned_time:st.time, notes:(st.optional ? "OPTIONAL — "+(st.note||"alternative") : st.note) };
      store.data.schedule.push(e); store.enqueue("saveScheduleEntry", e); n.s++;
    });
  });
  P.tasks.forEach(function(t,i){
    if(!on("t:"+i)) return;
    var it={ id:uid("ck")+i.toString(36), kind:"task", section:t.section, text:t.text, due:t.due, location_id:"", done:"", done_by:"",
             order_index:900+i, updated:nowISO(), removed:"", assignee:"" };
    store.data.checklist.push(it); store.enqueue("saveChecklistItem", it); n.t++;
  });
  store.persist(); closeSheet(); render();
  toast("Imported "+n.p+" place"+(n.p===1?"":"s")+", "+n.s+" stop"+(n.s===1?"":"s")+(n.t?", "+n.t+" task"+(n.t===1?"":"s"):"")+(n.d?", "+n.d+" day name"+(n.d===1?"":"s"):"")+
    (n.skip?" — "+n.skip+" stop"+(n.skip===1?"":"s")+" left out with their place":""), 6000);
  if(store.configured()) store.flush().then(updateStatus).catch(function(){});
}
