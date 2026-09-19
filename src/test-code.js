/* Exercises Code.gs against a mock of the Apps Script runtime, so the backend
   is known to work before anyone spends ten minutes setting it up. */
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.error("  FAIL: " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

/* ---- mock Sheet ---- */
function MockSheet(name) { this.name = name; this.d = []; this.fmt = {}; this.frozen = 0; }
MockSheet.prototype = {
  getName(){ return this.name; },
  getLastRow(){ let last=0; this.d.forEach((r,i)=>{ if(r && r.some(c=>c!=="" && c!=null)) last=i+1; }); return last; },
  getLastColumn(){ return this.d.reduce((m,r)=>Math.max(m, r?r.length:0), 0); },
  setFrozenRows(n){ this.frozen=n; },
  _cell(r,c){ if(!this.d[r-1]) this.d[r-1]=[]; if(this.d[r-1][c-1]===undefined) this.d[r-1][c-1]=""; return this.d[r-1][c-1]; },
  getRange(row, col, nr, nc){
    nr = nr==null?1:nr; nc = nc==null?1:nc;
    const sh=this;
    return {
      getValues(){
        const out=[];
        for(let r=row;r<row+nr;r++){ const line=[];
          for(let c=col;c<col+nc;c++) line.push(sh._cell(r,c));
          out.push(line); }
        return out;
      },
      setValues(v){
        if(v.length!==nr) throw new Error("setValues row mismatch: "+v.length+" vs "+nr);
        v.forEach((line,i)=>{
          if(line.length!==nc) throw new Error("setValues col mismatch: "+line.length+" vs "+nc);
          line.forEach((val,j)=>{ if(!sh.d[row+i-1]) sh.d[row+i-1]=[]; sh.d[row+i-1][col+j-1]=val; });
        });
        return this;
      },
      setValue(v){ if(!sh.d[row-1]) sh.d[row-1]=[]; sh.d[row-1][col-1]=v; return this; },
      setNumberFormat(f){ sh.fmt[col]=f; return this; },
      setFontWeight(){ return this; }
    };
  },
  appendRow(row){ this.d[this.getLastRow()] = row.slice(); },
  deleteRow(r){ this.d.splice(r-1,1); },
  deleteRows(r,n){ this.d.splice(r-1,n); }
};
function MockSS(){ this.sheets=[]; }
MockSS.prototype = {
  getSheetByName(n){ return this.sheets.find(s=>s.name===n) || null; },
  insertSheet(n){ const s=new MockSheet(n); this.sheets.push(s); return s; },
  getSheets(){ return this.sheets; },
  deleteSheet(s){ this.sheets = this.sheets.filter(x=>x!==s); },
  getSpreadsheetTimeZone(){ return "Australia/Sydney"; }
};

const SS = new MockSS();
SS.insertSheet("Sheet1"); // the default tab a new Sheet arrives with

const sandbox = {
  SpreadsheetApp: { getActive: () => SS },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (t) => ({ _t: t, setMimeType(){ return this; }, getContent(){ return this._t; } })
  },
  LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
  Utilities: { formatDate: (d) => d.toISOString().slice(0,10) },
  Logger: { log(){} },
  console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8'), sandbox, { filename:'Code.gs' });

const post = (body) => JSON.parse(sandbox.doPost({ postData:{ contents: JSON.stringify(body) }, parameter:{} })._t);
const get  = (p)    => JSON.parse(sandbox.doGet({ parameter: p })._t);
const KEY  = "test-key-123";

console.log("\n1. auth");
ok(post({action:"all"}).error.indexOf("not configured")>=0, "refuses while API_KEY is the placeholder");
sandbox.API_KEY = KEY;
eq(post({action:"all"}).error, "Bad or missing API key.", "refuses a missing key");
eq(post({key:"wrong",action:"all"}).error, "Bad or missing API key.", "refuses a wrong key");
ok(post({key:KEY,action:"ping"}).ok, "accepts the right key");

console.log("2. setup + seed");
sandbox.setup();
ok(SS.getSheetByName("Bookings") && SS.getSheetByName("Locations") && SS.getSheetByName("Schedule"), "three tabs created");
ok(!SS.getSheetByName("Sheet1"), "empty default tab removed");
let all = post({key:KEY,action:"all"}).data;
eq([all.bookings.length, all.locations.length, all.schedule.length], [10,68,71], "seeded row counts");
eq(SS.getSheetByName("Locations").getRange(1,1,1,13).getValues()[0], sandbox.TABS.Locations, "Locations headers");

console.log("3. seed integrity through the Sheet");
ok(all.locations.every(l=>l.name_en && l.name_zh), "every location has both names");
ok(all.locations.every(l=>/[㐀-鿿]/.test(l.name_zh)), "every name_zh is actually Chinese");
ok(all.locations.every(l=> (l.city==="Hong Kong"||l.city==="Macau") ? l.nav_app==="google" : l.nav_app==="amap"), "nav_app matches city");
ok(all.locations.every(l=>typeof l.lat==="number"||l.lat===""), "lat comes back numeric");
ok(all.locations.filter(l=>l.type==="restaurant").every(l=>l.dishes_to_order), "restaurants list dishes");
ok(all.locations.every(l=>l.history_blurb.length>80), "every blurb has real content");
ok(all.schedule.every(s=>all.locations.some(l=>l.id===s.location_id)), "no orphan schedule rows");
ok(all.locations.every(l=>all.schedule.some(s=>s.location_id===l.id)), "every location is scheduled somewhere");

console.log("4. setup is idempotent");
sandbox.setup();
all = post({key:KEY,action:"all"}).data;
eq([all.bookings.length, all.locations.length, all.schedule.length], [10,68,71], "re-running setup adds nothing");

console.log("5. location CRUD");
let r = post({key:KEY,action:"saveLocation",payload:{name_en:"Test",name_zh:"测试",city:"Chengdu",type:"restaurant",lat:30.1,lng:104.1,nav_app:"amap",history_blurb:"h",recommendations:"a\nb",dishes_to_order:"d",souvenirs:"",notes:""}});
ok(r.ok && r.data.location.id, "creates with a generated id");
const newId = r.data.location.id;
eq(post({key:KEY,action:"all"}).data.locations.length, 69, "location count went up");
r = post({key:KEY,action:"saveLocation",payload:{id:newId,name_en:"Test 2"}});
let got = post({key:KEY,action:"locations"}).data.locations.find(l=>l.id===newId);
eq([got.name_en, got.name_zh, got.city], ["Test 2","测试","Chengdu"], "partial update keeps untouched fields");
eq(got.lat, 30.1, "numeric field survives a partial update");

console.log("6. schedule CRUD + ordering");
r = post({key:KEY,action:"saveScheduleEntry",payload:{date:"2026-10-26",order_index:99,location_id:newId,planned_time:"09:00",notes:"n"}});
const sid = r.data.entry.id;
let day = post({key:KEY,action:"schedule"}).data.schedule.filter(s=>s.date==="2026-10-26");
eq(day.length, 3, "entry added to the day");
const ids = day.sort((a,b)=>a.order_index-b.order_index).map(s=>s.id).reverse();
r = post({key:KEY,action:"setDayOrder",payload:{date:"2026-10-26",ids:ids}});
eq(r.data.updated, 3, "setDayOrder touched every row");
day = post({key:KEY,action:"schedule"}).data.schedule.filter(s=>s.date==="2026-10-26").sort((a,b)=>a.order_index-b.order_index);
eq(day.map(s=>s.id), ids, "order actually reversed");
eq(day.map(s=>s.order_index), [1,2,3], "indices renumbered 1..n");

console.log("7. cascade delete");
r = post({key:KEY,action:"deleteLocation",payload:{id:newId}});
eq(r.data.schedule_entries_removed, 1, "its schedule entry went with it");
all = post({key:KEY,action:"all"}).data;
eq(all.locations.length, 68, "location gone");
ok(!all.schedule.some(s=>s.id===sid), "schedule entry gone");
ok(all.schedule.every(s=>all.locations.some(l=>l.id===s.location_id)), "still no orphans");

console.log("8. bookings + GET + errors");
eq(get({key:KEY,action:"bookings"}).data.bookings.length, 10, "doGet works with query params");
ok(post({key:KEY,action:"nope"}).error.indexOf("Unknown action")>=0, "unknown action errors cleanly");
ok(post({key:KEY,action:"deleteLocation",payload:{}}).error.indexOf("No id")>=0, "delete without id errors cleanly");
eq(post({key:KEY,action:"deleteBooking",payload:{id:"bk-01"}}).data.deleted.removed, true, "booking delete");
eq(post({key:KEY,action:"all"}).data.bookings.length, 9, "booking count went down");

console.log("9. reset and reseed");
sandbox.resetAndReseed();
all = post({key:KEY,action:"all"}).data;
eq([all.bookings.length, all.locations.length, all.schedule.length], [10,68,71], "full reseed restores everything");

console.log("\n" + (fails ? "FAILED " + fails + "/" + checks : "PASSED all " + checks + " checks"));
process.exit(fails ? 1 : 0);
