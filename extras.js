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

