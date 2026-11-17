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
