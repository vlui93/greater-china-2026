/* The Bookings tab, adding and editing a booking, reading a pasted
   confirmation, and the calendar file and printable itinerary. Loaded the
   first time any of them is opened (see PARTS in index.html), and kept
   offline by the service worker. */
"use strict";

function bkWhenText(b){
  var dt=String(b.time||"").trim(), at=hhmm(b.arr_time), ad=bkArrDate(b);
  if(isOpenTime(dt)) return MOVE_TYPES[b.type] ? "open — any sailing" : "open — any time";
  if(b.type==="hotel"){
    return [dt?"in "+dt:"", b.arr_date ? "out "+fmtDate(b.arr_date,false)+(at?" "+at:"") : (at?"out "+at:"")].filter(Boolean).join(" · ");
  }
  if(!at) return dt;
  var plus=ad && ad!==b.date ? " +"+daysBetween(b.date, ad) : "";
  return (hhmm(dt)||dt)+" → "+at+plus;
}

function setBookingTicket(bid){
  var b=store.data.bookings.filter(function(x){ return x.id===bid; })[0]; if(!b) return;
  var v=window.prompt("Link to the ticket for "+shortTitle(b.description)+" (https://…, blank to remove)", b.ticket_url||"");
  if(v===null) return;
  v=v.trim();
  if(v && !safeUrl(v)){ toast("The link needs to start with https://"); return; }
  // Only the link goes to the Sheet, so nothing else on the booking is rewritten
  store.write("saveBooking", { id:b.id, ticket_url:v }, function(){ b.ticket_url=v; }).then(function(){
    render(); toast(v ? "Ticket link saved" : "Ticket link removed");
  });
}

/** The zone a booking's time is in, when it isn't the trip's — a flight out
 *  of home, say. Only the zone goes to the Sheet. */
function setBookingTz(bid){
  var b=store.data.bookings.filter(function(x){ return x.id===bid; })[0]; if(!b) return;
  var v=window.prompt("Time zone for "+shortTitle(b.description)+"'s time, e.g. Australia/Sydney. Blank uses the trip's ("+tripTz()+").", b.tz||"");
  if(v===null) return;
  v=v.trim().replace(/\s+/g,"_");
  if(v && !validTz(v)){ toast("Not a time zone this phone knows — try Region/City, like Europe/London"); return; }
  store.write("saveBooking", { id:b.id, tz:v }, function(){ b.tz=v; }).then(function(){ render(); toast("Saved"); });
}

function renderBookings(){
  $("#viewTitle").textContent="Bookings · 预订";
  var bs=store.data.bookings.slice().sort(function(a,b){
    if(a.date!==b.date) return a.date<b.date?-1:1;
    return String(a.time||"").localeCompare(String(b.time||""));
  });
  $("#viewSub").textContent=bs.length+" flights, trains, ferries and hotels · 交通与住宿";
  $("#view-bookings").innerHTML = statusBar()+
    '<div class="toolrow"><button class="btn sm primary" data-act="bk-new">+ Add booking</button></div>'+
    (bs.length? bs.map(function(b){
      var dnum = DAYS.indexOf(b.date)>=0 ? "Day "+(DAYS.indexOf(b.date)+1)+" · " : "";
      return '<div class="bk" data-bid="'+esc(b.id)+'">'+
        '<button class="bk-head" data-act="bk">'+
          '<div class="bk-ic">'+(BK_ICON[b.type]||svgIc('<circle cx="12" cy="12" r="6"/>'))+'</div>'+
          '<div class="bk-b">'+
            '<div class="bk-when">'+esc(dnum+fmtDate(b.date,false))+(bkWhenText(b)?" · "+esc(bkWhenText(b)):"")+
              (tzOffset(depTz(b),Date.now())!==tzOffset(tripTz(),Date.now()) ? " · "+esc(tzName(depTz(b)))+" time" : "")+'</div>'+
            '<div class="bk-t">'+escz(bkTitle(b))+'</div>'+
            (b.confirmation_no?'<div class="bk-cn">Ref <b>'+esc(b.confirmation_no)+'</b></div>':'')+
            (safeUrl(b.ticket_url)?'<div class="bk-cn"><span class="pill ok">Ticket link · 票券</span></div>':'')+
          '</div><span class="chev">'+IC.chev+'</span>'+
        '</button>'+
        '<div class="bk-body">'+escz(b.details).replace(/\n/g,"<br>")+
          '<div class="bk-acts">'+(safeUrl(b.ticket_url)
            ? ticketLink(b.ticket_url,"Open ticket","btn sm primary")+'<button class="btn sm ghost" data-act="bk-ticket" data-bid="'+esc(b.id)+'">Change link</button>'
            : '<button class="btn sm" data-act="bk-ticket" data-bid="'+esc(b.id)+'">+ Add ticket link</button>')+
            '<button class="btn sm ghost" data-act="bk-tz" data-bid="'+esc(b.id)+'">Time zone</button>'+
            '<button class="btn sm ghost" data-act="bk-edit" data-bid="'+esc(b.id)+'">Edit</button></div>'+
        '</div>'+
      '</div>';
    }).join("") : '<div class="card empty">No bookings yet. Add one, or paste a confirmation email and let the app read it.</div>');
}

function icsText(s){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/([,;])/g,"\\$1"); }

function icsFold(line){
  // Lines are folded at 75 bytes; Chinese is 3 bytes a character, so count bytes, not characters
  var out=[], cur="", n=0, lim=75;
  for(var i=0;i<line.length;i++){
    var ch=line[i], c=line.charCodeAt(i);
    if(c>=0xD800 && c<=0xDBFF && i+1<line.length){ ch+=line[++i]; }
    var b=ch.length>1 ? 4 : c<0x80 ? 1 : c<0x800 ? 2 : 3;
    if(n+b>lim){ out.push(cur); cur=" "; n=1; lim=75; }
    cur+=ch; n+=b;
  }
  out.push(cur); return out.join("\r\n");
}

function icsUtc(ms){ return new Date(ms).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""); }

function icsDate(iso){ return String(iso).replace(/-/g,""); }

function buildIcs(o){
  var ev=[], stamp=icsUtc(Date.now());
  var push=function(uid, start, end, summary, desc, loc, geo){
    var e=["BEGIN:VEVENT","UID:"+uid+"@trip-companion","DTSTAMP:"+stamp].concat(start).concat(end)
      .concat(["SUMMARY:"+icsText(summary)]);
    if(desc) e.push("DESCRIPTION:"+icsText(desc));
    if(loc) e.push("LOCATION:"+icsText(loc));
    if(geo) e.push("GEO:"+geo);
    e.push("END:VEVENT"); ev.push(e.map(icsFold).join("\r\n"));
  };
  DAYS.forEach(function(d, di){
    var stops=store.dayStops(d), next=addDaysISO(d,1);
    if(o.days && stops.length){
      push("day-"+TRIP.id+"-"+d, ["DTSTART;VALUE=DATE:"+icsDate(d)], ["DTEND;VALUE=DATE:"+icsDate(next)],
        "Day "+(di+1)+" · "+(dayLabel(d)||TRIP.name),
        stops.map(function(s){ var l=store.loc(s.location_id); return (s.planned_time?s.planned_time+" ":"")+(l?l.name_en+(l.name_zh?" "+l.name_zh:""):""); }).join("\n"));
    }
    if(o.stops) stops.forEach(function(s, i){
      var l=store.loc(s.location_id), m=String(s.planned_time||"").match(/^(\d{1,2}):(\d{2})/);
      if(!l || !m) return;
      var tz=placeTz(l), st=zonedMs(d, m[1]+":"+m[2], tz), en=st+3600000;
      var nx=stops.slice(i+1).filter(function(x){ return /^\d{1,2}:\d{2}/.test(x.planned_time||""); })[0];
      if(nx){ var nm=String(nx.planned_time).match(/^(\d{1,2}):(\d{2})/), ns=zonedMs(d, nm[1]+":"+nm[2], tz);
        if(ns-st>=15*60000 && ns-st<=3*3600000) en=ns; }
      push("stop-"+s.id, ["DTSTART:"+icsUtc(st)], ["DTEND:"+icsUtc(en)], l.name_en+(l.name_zh?" "+l.name_zh:""),
        [s.notes, l.arrive_by||firstSentence(l.getting_there,200)].filter(Boolean).join("\n"),
        [l.name_en, l.name_zh, l.city].filter(Boolean).join(", "), hasXY(l) ? (+l.lat).toFixed(6)+";"+(+l.lng).toFixed(6) : "");
    });
  });
  if(o.bookings) store.data.bookings.forEach(function(b){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||"")) return;
    var m=String(b.time||"").match(/^(\d{1,2}):(\d{2})/), desc=[b.confirmation_no?"Ref "+b.confirmation_no:"", b.details].filter(Boolean).join("\n");
    var title=(b.type==="hotel"?"Hotel · ":"")+bkTitle(b), arr=bkArrMs(b);
    if(m && b.type!=="hotel"){ var st=bookingWhen(b); push("bk-"+b.id, ["DTSTART:"+icsUtc(st)], ["DTEND:"+icsUtc(arr && arr>st ? arr : st+3600000)], title, desc,
      [b.from_place, b.to_place].filter(Boolean).join(" → ")); }
    else push("bk-"+b.id, ["DTSTART;VALUE=DATE:"+icsDate(b.date)],
      ["DTEND;VALUE=DATE:"+icsDate(b.type==="hotel" && b.arr_date>b.date ? b.arr_date : addDaysISO(b.date,1))], title, desc);
  });
  return { n:ev.length, text:["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Trip Companion//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    icsFold("X-WR-CALNAME:"+icsText(TRIP.name))].concat(ev).concat(["END:VCALENDAR"]).join("\r\n")+"\r\n" };
}

function icsForm(){
  var cb=function(id,label,on){ return '<label class="row small" style="gap:8px;margin:0 0 10px"><input type="checkbox" id="'+id+'"'+(on?" checked":"")+'> '+label+'</label>'; };
  var canShare=!!(navigator.canShare && window.File && navigator.canShare({ files:[new File(["x"],"t.ics",{type:"text/calendar"})] }));
  openSheet("Add to calendar",
    '<p class="blurb small muted" style="margin:12px 0 14px">Makes a calendar file of '+esc(TRIP.name)+'. Open it and your calendar offers to add the events. '+
      'It is a copy: changes made in the app later aren\u2019t sent to the calendar — make a new file instead.</p>'+
    cb("ic_days","Each day, as an all-day event listing its stops",true)+
    cb("ic_stops","Stops that have a time",true)+
    cb("ic_bk","Bookings — flights, trains, ferries, hotels",true)+
    '<div class="formactions"><button class="btn primary" data-act="ics-go" data-how="download">Download</button>'+
      (canShare ? '<button class="btn" data-act="ics-go" data-how="share">Share…</button>' : '')+'</div>');
}

function fileName(ext){ return (TRIP.name||"trip").replace(/[^\w\u4e00-\u9fff -]+/g,"").trim().replace(/\s+/g,"-")+ext; }

function exportIcs(how){
  var r=buildIcs({ days:$("#ic_days").checked, stops:$("#ic_stops").checked, bookings:$("#ic_bk").checked });
  if(!r.n){ toast("Nothing to add — tick at least one kind"); return; }
  var name=fileName(".ics"), blob=new Blob([r.text], { type:"text/calendar;charset=utf-8" });
  if(how==="share" && navigator.share){
    navigator.share({ files:[new File([blob], name, { type:"text/calendar" })], title:TRIP.name }).catch(function(){});
    return;
  }
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(r.n+" event"+(r.n===1?"":"s")+" in "+name);
}

/** The whole trip on paper: each day's bookings and stops, with the Chinese
 *  names large enough to show a driver. */
function printHTML(withNotes){
  var h='<div class="pv"><h1>'+esc(TRIP.name)+(TRIP.name_zh?' <span class="zh">'+escz(TRIP.name_zh)+'</span>':'')+'</h1>'+
    '<div class="sub">'+esc(tripRange())+' · '+DAYS.length+' days</div>';
  DAYS.forEach(function(d,i){
    var stops=store.dayStops(d);
    var bks=store.data.bookings.filter(function(b){ return b.date===d; }).sort(function(a,b){ return String(a.time||"")<String(b.time||"")?-1:1; });
    if(!stops.length && !bks.length) return;
    h+='<div class="day"><h2>Day '+(i+1)+' · '+esc(fmtDate(d,true))+' <span>· '+esc(dayLabel(d))+'</span></h2>'+
      store.data.bookings.filter(function(b){ return MOVE_TYPES[b.type] && b.date!==d && bkArrDate(b)===d && hhmm(b.arr_time); }).map(function(b){
        return '<div class="bk"><b>'+esc(hhmm(b.arr_time))+'</b> · '+(b.type==="flight"?"Land":"Arrive")+' · '+escz(bkTitle(b))+'</div>'; }).join("")+
      bks.map(function(b){ return '<div class="bk"><b>'+esc(bkWhenText(b)||b.type)+'</b> · '+escz(bkTitle(b))+
        (b.confirmation_no?' · Ref '+esc(b.confirmation_no):'')+(/TO BOOK/.test(b.details||"")?' · <b>TO BOOK</b>':'')+'</div>'; }).join("")+
      (stops.length ? '<table>'+stops.map(function(s){
        var l=store.loc(s.location_id); if(!l) return "";
        var note=[s.notes, withNotes ? (l.arrive_by || firstSentence(l.getting_there,160)) : ""].filter(Boolean).join(" · ");
        return '<tr><td class="t">'+esc(s.planned_time||"")+'</td><td><b>'+esc(l.name_en)+'</b>'+(l.name_zh?' <span class="zh">'+escz(l.name_zh)+'</span>':'')+
          (note?'<div class="n">'+escz(note)+'</div>':'')+'</td></tr>';
      }).join("")+'</table>' : '')+'</div>';
  });
  return h+'</div>';
}

function printForm(){
  openSheet("Printable itinerary",
    '<label class="row small" style="gap:8px;margin:12px 0 10px"><input type="checkbox" id="pr_notes" checked> Include how to get to each place</label>'+
    '<div class="formactions"><button class="btn primary" data-act="print-go">Print or save as PDF</button></div>'+
    '<div id="prPreview">'+printHTML(true)+'</div>');
  $("#pr_notes").addEventListener("change", function(){ $("#prPreview").innerHTML=printHTML(this.checked); });
}

function printNow(){
  $("#printView").innerHTML=printHTML($("#pr_notes") ? $("#pr_notes").checked : true);
  document.title=TRIP.name+" itinerary";
  setTimeout(function(){ window.print(); document.title=TRIP.name; }, 50);
}

var MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};

function guessYear(m,d){
  var y=+String(TRIP_START).slice(0,4), iso=y+"-"+pad2(m)+"-"+pad2(d);
  return daysBetween(TRIP_START, iso) < -180 ? y+1 : y;
}

function findDates(text){
  var out=[], add=function(i,y,m,d){ m=+m; d=+d; if(m<1||m>12||d<1||d>31) return; y=y?+y:guessYear(m,d); out.push({ i:i, iso:y+"-"+pad2(m)+"-"+pad2(d) }); };
  var r, M="(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";
  var re=/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g; while((r=re.exec(text))) add(r.index,r[1],r[2],r[3]);
  re=/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/g; while((r=re.exec(text))) add(r.index,r[1],r[2],r[3]);
  re=new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+"+M+",?\\s*(20\\d{2})?","gi"); while((r=re.exec(text))) add(r.index,r[3],MONTHS[r[2].toLowerCase().slice(0,r[2].toLowerCase()==="sept"?4:3)]||MONTHS[r[2].toLowerCase().slice(0,3)],r[1]);
  re=new RegExp("\\b"+M+"\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(20\\d{2})?","gi"); while((r=re.exec(text))) add(r.index,r[3],MONTHS[r[1].toLowerCase().slice(0,3)],r[2]);
  re=/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g; while((r=re.exec(text))){
    var a=+r[1], b=+r[2]; if(b>12) add(r.index,r[3],a,b); else add(r.index,r[3],b,a);   // day first, unless it can't be
  }
  return out.sort(function(a,b){ return a.i-b.i; });
}

function findTimes(text){
  var out=[], r, re=/(?:^|[^\d:])([01]?\d|2[0-3])[:：](\d{2})(?!\d)\s*(am|pm|a\.m\.|p\.m\.)?/gi;
  while((r=re.exec(text))){
    var h=+r[1], ap=(r[3]||"").toLowerCase().replace(/\./g,"");
    if(ap==="pm" && h<12) h+=12; if(ap==="am" && h===12) h=0;
    out.push({ i:r.index, t:pad2(h)+":"+r[2] });
  }
  return out;
}

function after(list, text, re){
  var m=text.search(re); if(m<0) return null;
  return list.filter(function(x){ return x.i>=m; })[0] || null;
}

function findRef(text){
  var keys=/(booking|confirmation|reservation|order|itinerary|record locator|pnr|e-?ticket|ticket)\s*(?:no\.?|number|num|#|code|id|ref(?:erence)?)?\s*[:：#]?|订单号|订单编号|确认号|預訂編號|预订号|取票号/gi, r;
  while((r=keys.exec(text))){
    var tail=text.slice(r.index+r[0].length, r.index+r[0].length+40);
    var m=tail.match(/^[\s:：#]*((?=[A-Z0-9.-]*\d)[A-Z0-9][A-Z0-9.-]{4,19}|[A-Z]{6})(?![A-Za-z0-9])/);
    if(m) return m[1].replace(/[.-]+$/,"");
  }
  return "";
}

function parseBookingText(text){
  text=String(text||"").replace(/\u00a0/g," ");
  var low=text.toLowerCase(), score={ hotel:0, flight:0, train:0, ferry:0 };
  if(/check[- ]?in|入住/.test(low)) score.hotel+=2; if(/check[- ]?out|退房|离店/.test(low)) score.hotel+=2;
  if(/\bhotel\b|酒店|\bnights?\b|\broom\b|resort/.test(low)) score.hotel+=2;
  if(/flight|airline|airways|boarding|terminal|航班|登机/.test(low)) score.flight+=3;
  if(/\btrain\b|railway|high-speed|12306|高铁|动车|车次|carriage|coach \d/.test(low)) score.train+=3;
  if(/\b[GDC]\d{1,4}\b/.test(text)) score.train+=1;
  if(/ferry|turbojet|cotai|water ?jet|船票|码头|pier/.test(low)) score.ferry+=3;
  var type=Object.keys(score).sort(function(a,b){ return score[b]-score[a]; })[0];
  if(!score[type]) type="other";
  var dates=findDates(text), times=findTimes(text), o={ type:type, date:"", time:"", description:"", confirmation_no:findRef(text), details:"",
    number:"", from_place:"", to_place:"", arr_date:"", arr_time:"" };
  var det=[];
  if(type==="hotel"){
    var ci=after(dates,text,/check[- ]?in|入住/i)||dates[0], co=after(dates,text,/check[- ]?out|退房|离店/i);
    if(co && ci && co.iso===ci.iso) co=dates.filter(function(x){ return x.iso>ci.iso; })[0]||null;
    o.date=ci?ci.iso:"";
    var cit=after(times,text,/check[- ]?in|入住/i); if(cit) o.time=cit.t;
    if(co){ o.arr_date=co.iso; var cot=after(times,text,/check[- ]?out|退房/i); if(cot && (!cit || cot.i>cit.i)) o.arr_time=cot.t; }
    var nights=(text.match(/(\d+)\s*(?:nights?|晚)/i)||[])[1] || (ci&&co ? daysBetween(ci.iso,co.iso) : 0);
    var name="";
    text.split(/\r?\n/).map(function(x){ return x.trim(); }).forEach(function(line){
      if(name || line.length>80 || !/hotel|酒店|resort|inn\b|suites|hostel|宾馆/i.test(line)) return;
      if(/check|confirm|thank|booking|reservation|dear|订单|入住|退房/i.test(line)) return;
      name=line.replace(/^(hotel|property)\s*[:：]\s*/i,"");
    });
    o.description=(name||"Hotel")+(+nights ? " — "+nights+" night"+(+nights===1?"":"s") : "");
  } else {
    var dep=after(dates,text,/depart|departure|出发|发车|開車|开车|travel date|date of travel/i)||dates[0];
    o.date=dep?dep.iso:"";
    var dt=after(times,text,/depart|departure|出发|发车|開車|开车/i)||times[0];
    o.time=dt?dt.t:"";
    var at=after(times,text,/arriv|到达|抵达/i);
    if(!at && times.length>1 && dt) at=times.filter(function(x){ return x.i>dt.i; })[0]||null;   // "08:12 … 14:05": the second time is the arrival
    if(at && at.t!==o.time){
      o.arr_time=at.t;
      var ad=after(dates,text,/arriv|到达|抵达/i);
      if(/^\s*(?:\(?\s*\+\s*1\b|\(?next day\)?)/i.test(text.slice(at.i+at.t.length+1, at.i+at.t.length+14))) o.arr_date=addDaysISO(o.date,1);
      else if(ad && dep && ad.i>dep.i && ad.iso>=o.date) o.arr_date=ad.iso;
    }
    var from="", to="", m;
    if(type==="flight"){
      m=text.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b/);
      if(m){ from=m[1]; to=m[2]; }
      else { var codes=[], cr=/\(([A-Z]{3})\)/g, c; while((c=cr.exec(text))) if(codes.indexOf(c[1])<0) codes.push(c[1]); if(codes.length>1){ from=codes[0]; to=codes[1]; } }
      var fn=(text.match(/\bflight\s*(?:no\.?|number)?\s*[:：]?\s*([A-Z][A-Z0-9]\s?\d{2,4})\b/i)||text.match(/\b((?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4})\b(?=[^\n]{0,40}(?:\n|$))/)||[])[1]||"";
      o.number=fn.replace(/\s+/,"");
      o.description=(from&&to?from+" → "+to:"Flight")+(fn?" — "+o.number:"");
    } else {
      var tn=type==="train" ? ((text.match(/(?:train|车次)\s*(?:no\.?|number)?\s*[:：]?\s*([GDCZTKY]\d{1,4})\b/i)||text.match(/\b([GDC]\d{1,4})\b/)||[])[1]||"") : "";
      var bare=tn ? text.split(tn).join(" ") : text;   // "G1234 Guangzhou South → …": the number isn't part of the station
      var zh=bare.match(/([\u4e00-\u9fff]{2,8}站?)\s*(?:→|->|—|－|-|至|到)\s*([\u4e00-\u9fff]{2,8}站?)/);
      var en=bare.match(/\bfrom\s+([A-Z][\w .'’()-]{2,40}?)\s+to\s+([A-Z][\w .'’()-]{2,40}?)(?=\s*(?:[\n,.;]|\bon\b|\bat\b|$))/)||
             bare.match(/\b([A-Z][\w .'’()-]{2,40}?)\s*(?:→|->)\s*([A-Z][\w .'’()-]{2,40}?)(?=\s*(?:[\n,;]|$))/);
      if(en){ from=en[1].trim(); to=en[2].trim(); } else if(zh){ from=zh[1]; to=zh[2]; }
      o.number=tn;
      o.description=(from&&to?from+" → "+to:(type==="train"?"Train":type==="ferry"?"Ferry":"Booking"))+(tn?" — "+tn:"");
      var seat=(text.match(/\b(?:seat|座位)\s*(?:no\.?)?\s*[:：]?\s*([0-9]{1,2}[A-F]?(?:\s*(?:\/|,)\s*[0-9]{1,2}[A-F]?)*)/i)||[])[1];
      var car=(text.match(/\b(?:coach|carriage|car|车厢)\s*(?:no\.?)?\s*[:：]?\s*(\d{1,2})\b/i)||[])[1];
      if(car||seat) det.push([car?"Coach "+car:"", seat?"seat "+seat:""].filter(Boolean).join(", "));
    }
  }
  o.from_place=from||""; o.to_place=to||"";
  o.details=det.join(". ")+(det.length?".":"");
  return o;
}

function bookingForm(id, presetType){
  var b=id ? store.data.bookings.filter(function(x){ return x.id===id; })[0] : null, isNew=!b;
  b=b || { id:"", type:presetType||"flight", date:"", time:"", description:"", confirmation_no:"", details:"", ticket_url:"", tz:"",
           number:"", from_place:"", to_place:"", arr_date:"", arr_time:"", arr_tz:"" };
  var types=["flight","train","ferry","hotel","ticket","other"];
  var f=function(id,label,val,extra,cls){ return '<div class="field'+(cls?" "+cls:"")+'"><label id="'+id+'_l">'+label+'</label><input id="'+id+'" value="'+esc(val||"")+'"'+(extra||"")+'></div>'; };
  var html=(isNew ? '<div class="field linkbox pastebox" style="margin-top:12px"><label for="b_paste">Paste the confirmation</label>'+
      '<textarea id="b_paste" placeholder="Copy the confirmation email (or the booking page) and paste it here"></textarea>'+
      '<div class="linkrow"><button class="btn sm primary" data-act="bk-read">Read it</button></div>'+
      '<div class="hint" id="b_paste_status">Read on this phone — nothing is sent anywhere. Check each field before saving.</div></div>' : '<div style="height:12px"></div>')+
    '<div class="grid2"><div class="field"><label>Type</label><select id="b_type">'+types.map(function(t){
        return '<option'+(b.type===t?" selected":"")+'>'+t+'</option>'; }).join("")+'</select></div>'+
      f("b_number","Flight no.",b.number,' autocapitalize="characters" placeholder="CX138"',"mv")+'</div>'+
    '<div class="grid2 mv">'+f("b_from","From",b.from_place,' placeholder="SYD, or a station"')+f("b_to","To",b.to_place,' placeholder="HKG"')+'</div>'+
    '<div class="grid2">'+f("b_date","Departs",b.date,' type="date"')+f("b_time","Time",hhmm(b.time)||"",' type="time"')+'</div>'+
    '<label class="row small" style="gap:8px;margin:-4px 0 14px"><input type="checkbox" id="b_open"'+(isOpenTime(b.time)?" checked":"")+'> '+
      '<span id="b_open_l">Open — no fixed time</span></label>'+
    (b.time && !hhmm(b.time) && !isOpenTime(b.time) || /^\d{1,2}:\d{2}\s*[-–]/.test(b.time||"") ? '<p class="hint" style="margin:-8px 0 12px">Was “'+esc(b.time)+'” — now just the start; put the end in Arrives.</p>' : '')+
    '<div class="grid2 arrrow">'+f("b_arr_date","Arrives",b.arr_date||"",' type="date"')+f("b_arr_time","Time",hhmm(b.arr_time)||"",' type="time"')+'</div>'+
    '<p class="blurb small muted mv" id="b_arr_hint" style="margin:-8px 0 14px">The arrival goes on that day’s plan: when you can drop bags at the hotel and be out exploring.</p>'+
    '<div class="field"><label>Reference</label><input id="b_confirmation_no" autocapitalize="characters" value="'+esc(b.confirmation_no)+'"></div>'+
    '<div class="field"><label>Description</label><input id="b_description" value="'+esc(b.description)+'" placeholder="Filled in from the route if left blank"></div>'+
    '<div class="field"><label>Details</label><textarea id="b_details" style="min-height:80px">'+esc(b.details)+'</textarea></div>'+
    '<label class="row small" style="gap:8px;margin:-4px 0 14px"><input type="checkbox" id="b_tobook"'+(/TO BOOK/.test(b.details||"")?" checked":"")+'> Not booked yet (TO BOOK)</label>'+
    '<details class="small" style="margin:-4px 0 14px"'+(b.tz||b.arr_tz?" open":"")+'><summary>Time zones</summary>'+
      '<p class="hint" style="margin:8px 0">Worked out from airport codes and your cities. Set one only when that guess is wrong.</p>'+
      '<div class="grid2"><div class="field"><label id="b_tz_l">Departure</label><input id="b_tz" list="tzlist3" autocapitalize="off" value="'+esc(b.tz||"")+'"></div>'+
      '<div class="field"><label id="b_arr_tz_l">Arrival</label><input id="b_arr_tz" list="tzlist3" autocapitalize="off" value="'+esc(b.arr_tz||"")+'"></div></div>'+tzDatalist("tzlist3")+'</details>'+
    '<div class="field"><label>Ticket link</label><input id="b_ticket_url" inputmode="url" autocapitalize="off" value="'+esc(b.ticket_url||"")+'" placeholder="https://…"></div>'+
    '<div class="formactions"><button class="btn primary" data-act="bk-save" data-bid="'+esc(b.id)+'">Save</button>'+
      (isNew?'':'<button class="btn danger" data-act="bk-delete" data-bid="'+esc(b.id)+'">Delete</button>')+'</div>';
  openSheet(isNew?"New booking":"Edit booking", html);
  var pb=$("#b_paste"); if(pb) pb.addEventListener("paste", function(){ setTimeout(readPasted, 0); });
  ["b_type","b_from","b_to","b_open"].forEach(function(id){ $("#"+id).addEventListener("change", bookingFormShape); $("#"+id).addEventListener("input", bookingFormShape); });
  bookingFormShape();
}

/** Labels and fields follow the type: a hotel has check-in and check-out, a
 *  journey a number, a route and departs/arrives. Time zones show their guess. */
function bookingFormShape(){
  var t=$("#b_type") ? $("#b_type").value : "flight", move=!!MOVE_TYPES[t];
  document.querySelectorAll("#sheetBody .mv").forEach(function(e){ e.hidden=!move; });
  var set=function(id,txt){ var e=$("#"+id); if(e) e.textContent=txt; };
  set("b_number_l", t==="flight"?"Flight no.":t==="train"?"Train no.":"Sailing / no.");
  set("b_date_l", t==="hotel"?"Check-in":move?"Departs":"Date");
  set("b_arr_date_l", t==="hotel"?"Check-out":move?"Arrives":"Ends");
  set("b_time_l", t==="ticket" ? "Entry time" : "Time");
  set("b_open_l", move ? "Open ticket — any sailing or train that day" : t==="ticket" ? "Open — any time that day" : "Open — no fixed time");
  document.querySelectorAll("#sheetBody .arrrow").forEach(function(e){ e.hidden=(t==="ticket"); });
  var op=$("#b_open"), tm=$("#b_time"); if(op && tm){ tm.disabled=op.checked; if(op.checked) tm.value=""; }
  var probe={ type:t, from_place:($("#b_from")||{}).value||"", to_place:($("#b_to")||{}).value||"", tz:"", arr_tz:"" };
  var a=$("#b_tz"), c=$("#b_arr_tz");
  if(a) a.placeholder=depTz(probe); if(c) c.placeholder=arrTz(probe);
  var d=$("#b_description"); if(d && move) d.placeholder=bkRoute({ from_place:probe.from_place, to_place:probe.to_place, number:($("#b_number")||{}).value||"" }) || "Filled in from the route if left blank";
}

function readPasted(){
  var box=$("#b_paste"), st=$("#b_paste_status"); if(!box || !box.value.trim()) return;
  var o=parseBookingText(box.value), got=[];
  var set=function(id,v,label){ if(!v) return; var e=$("#"+id); if(e){ e.value=v; if(label) got.push(label); } };
  set("b_type", o.type==="other"?"":o.type, "type"); set("b_number", o.number, "number");
  set("b_from", o.from_place, ""); set("b_to", o.to_place, o.from_place||o.to_place ? "route" : "");
  set("b_date", o.date, "date"); set("b_time", o.time, "time");
  set("b_arr_date", o.arr_date, ""); set("b_arr_time", o.arr_time, o.type==="hotel" ? "check-out" : "arrival");
  if(o.type==="hotel" && o.arr_date && got.indexOf("check-out")<0) got.push("check-out");
  set("b_description", o.description, "what it is"); set("b_confirmation_no", o.confirmation_no, "reference"); set("b_details", o.details, "details");
  bookingFormShape();
  if(o.date && (o.date<TRIP_START || o.date>TRIP_END)) got.push("<b>the date is outside this trip — check it</b>");
  st.innerHTML=got.length ? "Filled in: "+got.join(", ")+". Check each field before saving." : "Couldn’t find anything to fill in — type it in below.";
}

function saveBookingForm(id){
  var g=function(k){ var e=$("#b_"+k); return e ? e.value.trim() : ""; };
  var old=id ? store.data.bookings.filter(function(x){ return x.id===id; })[0] : null;
  var b=Object.assign({}, old||{});
  ["type","date","time","description","confirmation_no","details","ticket_url","number","arr_date","arr_time"].forEach(function(k){ b[k]=g(k); });
  b.from_place=g("from"); b.to_place=g("to");
  b.tz=g("tz").replace(/\s+/g,"_"); b.arr_tz=g("arr_tz").replace(/\s+/g,"_");
  if(!MOVE_TYPES[b.type]){ b.number=""; b.from_place=""; b.to_place=""; if(b.type!=="hotel") b.arr_tz=""; }
  if($("#b_open") && $("#b_open").checked) b.time="open";
  if(b.type==="ticket"){ b.arr_date=""; b.arr_time=""; }
  b.number=b.number.toUpperCase().replace(/\s+/g,"");
  var tb=$("#b_tobook") && $("#b_tobook").checked;
  b.details=tb ? (/TO BOOK/.test(b.details) ? b.details : ("TO BOOK. "+b.details).trim()) : b.details.replace(/TO BOOK\.?\s*/g,"").trim();
  if(!b.description) b.description=MOVE_TYPES[b.type] ? bkRoute(b) : "";
  if(!b.description){ toast(b.type==="ticket" ? "Say what the ticket is for" : "Say what it is — a route, a hotel"); return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)){ toast("Set the date"); return; }
  if(b.arr_time && !b.arr_date) b.arr_date=bkArrDate(b);
  if(b.arr_date && b.arr_date<b.date){ toast(b.type==="hotel" ? "Check-out is before check-in" : "The arrival is before the departure"); return; }
  if(MOVE_TYPES[b.type] && b.arr_date && b.time && b.arr_time && bkArrMs(b)<=bookingWhen(b)){ toast("It arrives before it leaves — check the times and time zones"); return; }
  if(b.ticket_url && !safeUrl(b.ticket_url)){ toast("The ticket link needs to start with https://"); return; }
  if((b.tz && !validTz(b.tz)) || (b.arr_tz && !validTz(b.arr_tz))){ toast("Not a time zone this phone knows — pick one from the list"); return; }
  if(!b.id) b.id=uid("bk");
  store.write("saveBooking", b, function(){
    var found=false;
    store.data.bookings=store.data.bookings.map(function(x){ if(x.id===b.id){ found=true; return b; } return x; });
    if(!found) store.data.bookings.push(b);
  }).then(function(){ closeSheet(); render(); toast(old?"Saved":"Booking added"); });
}

function deleteBookingForm(id){
  if(!window.confirm("Delete this booking?")) return;
  store.write("deleteBooking", { id:id }, function(){
    store.data.bookings=store.data.bookings.filter(function(x){ return x.id!==id; });
  }).then(function(){ closeSheet(); render(); toast("Deleted"); });
}
