/* More, loaded when first opened (see PARTS in index.html) and kept offline by
   the service worker: the trip recap, and the Inbox of things sent in from
   other apps. Each registers its own actions with onAct. */
"use strict";

/* ==========================================================================
   Recap. What was done against the plan, per city: planned places visited
   and skipped, extras (an optional stop taken, or a place that was never on
   the plan), and meals kept. Hotels aren't counted. Worked out from the
   schedule and the visited ticks; nothing is stored.
   ========================================================================== */
function recapData(){
  var ix=planIndex(), by={}, first={};
  store.data.schedule.forEach(function(s){
    var l=store.loc(s.location_id); if(!l) return;
    if(!first[l.city] || s.date<first[l.city]) first[l.city]=s.date;
  });
  store.data.locations.forEach(function(l){
    if(l.type==="hotel") return;
    var c=by[l.city] || (by[l.city]={ city:l.city||"(no city)", planned:0, done:0, skipped:[], extras:[], meals:0, mealsKept:0 });
    var p=ix[l.id], planned=!!(p && p.planned.length), v=isVisited(l), name=l.name_en||l.name_zh||l.id;
    if(planned){
      c.planned++; if(v) c.done++; else c.skipped.push(name);
      if(l.type==="restaurant"){ c.meals++; if(v) c.mealsKept++; }
    } else if(v) c.extras.push(name);
  });
  var cities=Object.keys(by).map(function(k){ return by[k]; }).filter(function(c){ return c.planned || c.extras.length; })
    .sort(function(a,b){ var x=first[a.city]||"9", y=first[b.city]||"9"; return x<y ? -1 : x>y ? 1 : a.city<b.city ? -1 : 1; });
  var sum=function(f){ return cities.reduce(function(n,c){ return n+f(c); }, 0); };
  return { cities:cities, planned:sum(function(c){ return c.planned; }), done:sum(function(c){ return c.done; }),
           extras:sum(function(c){ return c.extras.length; }), meals:sum(function(c){ return c.meals; }), mealsKept:sum(function(c){ return c.mealsKept; }) };
}
function recapLine(r){
  return "Visited "+r.done+" of "+r.planned+" planned places"+(r.extras ? ", plus "+r.extras+" extra"+(r.extras===1?"":"s") : "")+
    (r.meals ? "; "+r.mealsKept+" of "+r.meals+" planned meals kept" : "")+".";
}
function recapText(){
  var r=recapData(), out=["Trip recap — "+TRIP.name+", "+tripRange(), recapLine(r), ""];
  r.cities.forEach(function(c){
    out.push(c.city+": "+c.done+" of "+c.planned+" planned"+(c.meals ? " · meals "+c.mealsKept+" of "+c.meals : ""));
    if(c.skipped.length) out.push("  Skipped: "+c.skipped.join(", "));
    if(c.extras.length) out.push("  Extras: "+c.extras.join(", "));
  });
  return out.join("\n");
}
function recapSheet(){
  var r=recapData();
  var html='<p class="blurb" style="margin:14px 0 6px"><b>'+esc(recapLine(r))+'</b></p>'+
    '<p class="blurb small muted" style="margin:0 0 12px">Against the plan as it stands now. An extra is an optional stop you took, or a place that was never on the plan. Hotels aren’t counted.</p>'+
    '<div class="formactions" style="margin:0 0 6px"><button class="btn primary" data-act="recap-copy">Copy as text</button></div>'+
    '<div class="hint small muted" style="margin:0 0 14px">To paste into the next trip’s plan, or your notes.</div>'+
    r.cities.map(function(c){
      var pct=c.planned ? Math.round(c.done/c.planned*100) : 0;
      return '<div class="card recapcity" style="padding:12px 14px;margin-bottom:10px" data-city="'+esc(c.city)+'">'+
        '<div class="spread"><b>'+esc(c.city)+'</b><span class="muted small rc-n">'+c.done+' of '+c.planned+' planned'+(c.meals ? ' · meals '+c.mealsKept+' of '+c.meals : '')+'</span></div>'+
        (c.planned ? '<div class="prog" style="margin:8px 0 2px"><i style="width:'+pct+'%"></i></div>' : '')+
        (c.skipped.length ? '<div class="small rc-skip" style="margin-top:8px"><span class="muted">Skipped · </span>'+escz(c.skipped.join(", "))+'</div>' : '')+
        (c.extras.length ? '<div class="small rc-extra" style="margin-top:6px"><span class="muted">Extras · </span>'+escz(c.extras.join(", "))+'</div>' : '')+
      '</div>';
    }).join("")+
    '<textarea id="recap_text" readonly style="position:absolute;left:-9999px;top:0" aria-hidden="true" tabindex="-1"></textarea>';
  openSheet("Recap", html);
}
onAct("recap", function(){ recapSheet(); });
onAct("recap-copy", function(){
  var t=recapText(), done=function(){ toast("Recap copied", 2500); };
  var box=$("#recap_text"); if(box) box.value=t;
  var byHand=function(){ try{ box.select(); document.execCommand("copy"); done(); }catch(e){ toast("Couldn’t copy — try again"); } };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, byHand); else byHand();
});

/* ==========================================================================
   Inbox. Links and notes sent in from another app's share menu, through an
   iPhone Shortcut that calls the backend's inboxAdd (see shareSetupSheet).
   Each item becomes a place — the map-link reader fills in what it can — or
   is dismissed. Either way it is marked done in the Sheet and leaves every
   phone's inbox.
   ========================================================================== */
function inboxSheet(){
  var items=inboxItems();
  var ago=function(iso){ var d=String(iso||"").slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d,false) : ""; };
  var html='<p class="blurb small muted" style="margin:12px 0 14px">Sent in from other apps’ Share button'+
      (isOwner() ? ' (set up in ⚙ Settings › Share to Trip)' : '')+'. Make each one a place, or dismiss it.</p>'+
    (items.length ? '<div class="loclist">'+items.map(function(i){
      return '<div class="card inboxitem" style="padding:12px 14px" data-iid="'+esc(i.id)+'">'+
        '<div class="small" style="white-space:pre-wrap;word-break:break-word">'+escz(i.text || i.url)+'</div>'+
        (i.url && i.text.indexOf(i.url)<0 ? '<div class="small muted" style="word-break:break-all;margin-top:4px">'+esc(i.url)+'</div>' : '')+
        '<div class="small muted" style="margin-top:6px">'+esc([i.by && "from "+i.by, ago(i.added)].filter(Boolean).join(" · "))+'</div>'+
        '<div class="row" style="gap:8px;margin-top:10px">'+
          (isViewer() ? '' : '<button class="btn sm primary" data-act="inbox-place" data-iid="'+esc(i.id)+'">Make it a place</button>'+
          '<button class="btn sm" data-act="inbox-dismiss" data-iid="'+esc(i.id)+'">Dismiss</button>')+'</div></div>';
    }).join("")+'</div>' : '<div class="card empty">Nothing waiting.</div>');
  openSheet("Inbox", html);
}
function inboxDone(id){
  return store.write("saveInboxItem", { id:id, done:nowISO() }, function(){
    store.raw.inbox=(store.raw.inbox||[]).filter(function(i){ return i.id!==id; });
  });
}
onAct("inbox", function(){ inboxSheet(); });
onAct("inbox-dismiss", function(t){
  inboxDone(t.dataset.iid).then(function(){ render(); if(inboxItems().length) inboxSheet(); else closeSheet(); toast("Dismissed"); });
});
onAct("inbox-place", function(t){
  var it=inboxItems().filter(function(i){ return i.id===t.dataset.iid; })[0]; if(!it) return;
  Promise.resolve(locationForm(null)).then(function(){
    var box=$("#f_link"); if(!box) return;
    box.dataset.inbox=it.id;
    box.value=[it.text, it.url && it.text.indexOf(it.url)<0 ? it.url : ""].filter(Boolean).join("\n");
    fillFromLink();
  });
});

/* Setting up the Shortcut. The backend takes a plain GET — action, key and
   text in the address — because the request-body editor of Shortcuts' web
   request action is reported to be unreliable. */
function shareSetupSheet(){
  var url=store.cfg.url||"", ready=!!(url && store.cfg.key);
  var addr=url+(url.indexOf("?")<0?"?":"&")+"action=inboxAdd&key=";
  var html='<p class="blurb small" style="margin:12px 0 10px">Make an iPhone Shortcut once, and every app’s <b>Share</b> button — Xiaohongshu, Amap, Dianping, Safari — can send a link or a note to this trip’s Inbox, even when the app is closed. It goes to the trip under way or coming up next.</p>'+
    (ready ? '' : '<div class="card empty">Connect this phone to the Sheet first.</div>')+
    '<div class="section-title">In the Shortcuts app</div>'+
    '<ol class="small steps" style="line-height:1.55;padding-left:20px;margin:0">'+
      '<li>Tap <b>+</b> for a new shortcut and name it <b>Send to Trip</b>.</li>'+
      '<li>Open the shortcut’s details (ⓘ) and turn on <b>Show in Share Sheet</b>. Where it says what it receives, choose <b>Text</b> and <b>URLs</b>.</li>'+
      '<li>Add the action <b>URL Encode</b> (search “encode”) and set it to encode the <b>Shortcut Input</b>. <span class="muted">I couldn’t confirm this action’s exact name in Apple’s guide; if it reads differently on your phone, pick the one that encodes text for a URL.</span></li>'+
      '<li>Add a <b>Text</b> action. Paste the address below into it, then put the result of URL Encode at its very end.</li>'+
      '<li>Add <b>Get Contents of URL</b> and give it that Text. Leave the method as GET.</li>'+
      '<li>Optional: add <b>Show Notification</b> saying “Sent to Trip”.</li></ol>'+
    '<div class="field" style="margin-top:14px"><label>The address (ends with your key)</label>'+
      '<textarea id="share_addr" readonly style="min-height:64px;font-size:12px;word-break:break-all">'+esc(addr)+'…</textarea>'+
      '<div class="hint">Shown without the key. <b>Copy</b> puts the whole address, key included, on the clipboard. Anyone with the shortcut could send things to your Inbox, so don’t share it.</div></div>'+
    '<div class="formactions"><button class="btn primary" data-act="share-copy"'+(ready?'':' disabled')+'>Copy the address</button></div>'+
    '<p class="blurb small muted" style="margin-top:14px">Then, in any app: Share › <b>Send to Trip</b>. Items appear under Places › Inbox after the next sync.</p>';
  openSheet("Share to Trip", html);
}
onAct("share-setup", function(){ shareSetupSheet(); });
onAct("share-copy", function(){
  var u=store.cfg.url, t=u+(u.indexOf("?")<0?"?":"&")+"action=inboxAdd&key="+encodeURIComponent(store.cfg.key)+"&text=";
  var done=function(){ toast("Address copied — paste it into the Text action", 3500); };
  var byHand=function(){ var b=$("#share_addr"); b.value=t; b.select(); try{ document.execCommand("copy"); done(); }catch(e){ toast("Couldn’t copy — try again"); } b.value=t.replace(/key=[^&]*/, "key=")+"…"; };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, byHand); else byHand();
});
