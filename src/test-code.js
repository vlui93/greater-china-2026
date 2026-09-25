/* Exercises Code.gs against a mock of the Apps Script runtime, so the backend
   is known to work before anyone spends ten minutes setting it up. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { injectSeed } = require('./seed-inject');

/* The committed Code.gs ships with an empty SEED — this repo is public. The
 * tests fill it in the same way src/prepare-code.js does, using the real trip
 * content when it is on this machine and an invented fixture when it is not, so
 * a fresh clone still exercises every path. */
const realSeed = path.join(__dirname, 'seed.json');
const SEED_FILE = fs.existsSync(realSeed) ? realSeed : path.join(__dirname, 'seed.fixture.json');
const SEED = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const NB = SEED.bookings.length, NL = SEED.locations.length, NS = SEED.schedule.length;
const DAY = SEED.schedule[0].date;
const DAY_N = SEED.schedule.filter(s => s.date === DAY).length;
const BK1 = SEED.bookings[0].id;
console.log('seed: ' + path.basename(SEED_FILE) + '  ' +
  NB + ' bookings, ' + NL + ' locations, ' + NS + ' schedule rows');

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
vm.runInContext(injectSeed(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8'), SEED), sandbox, { filename:'Code.gs' });

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
eq([all.bookings.length, all.locations.length, all.schedule.length], [NB,NL,NS], "seeded row counts");
eq(SS.getSheetByName("Locations").getRange(1,1,1,sandbox.TABS.Locations.length).getValues()[0], sandbox.TABS.Locations, "Locations headers");

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
eq([all.bookings.length, all.locations.length, all.schedule.length], [NB,NL,NS], "re-running setup adds nothing");

console.log("5. location CRUD");
let r = post({key:KEY,action:"saveLocation",payload:{name_en:"Test",name_zh:"测试",city:"Chengdu",type:"restaurant",lat:30.1,lng:104.1,nav_app:"amap",history_blurb:"h",recommendations:"a\nb",dishes_to_order:"d",souvenirs:"",notes:""}});
ok(r.ok && r.data.location.id, "creates with a generated id");
const newId = r.data.location.id;
eq(post({key:KEY,action:"all"}).data.locations.length, NL+1, "location count went up");
r = post({key:KEY,action:"saveLocation",payload:{id:newId,name_en:"Test 2"}});
let got = post({key:KEY,action:"locations"}).data.locations.find(l=>l.id===newId);
eq([got.name_en, got.name_zh, got.city], ["Test 2","测试","Chengdu"], "partial update keeps untouched fields");
eq(got.lat, 30.1, "numeric field survives a partial update");

console.log("6. schedule CRUD + ordering");
r = post({key:KEY,action:"saveScheduleEntry",payload:{date:DAY,order_index:99,location_id:newId,planned_time:"09:00",notes:"n"}});
const sid = r.data.entry.id;
let day = post({key:KEY,action:"schedule"}).data.schedule.filter(s=>s.date===DAY);
eq(day.length, DAY_N+1, "entry added to the day");
const ids = day.sort((a,b)=>a.order_index-b.order_index).map(s=>s.id).reverse();
r = post({key:KEY,action:"setDayOrder",payload:{date:DAY,ids:ids}});
eq(r.data.updated, DAY_N+1, "setDayOrder touched every row");
day = post({key:KEY,action:"schedule"}).data.schedule.filter(s=>s.date===DAY).sort((a,b)=>a.order_index-b.order_index);
eq(day.map(s=>s.id), ids, "order actually reversed");
eq(day.map(s=>s.order_index), ids.map((_,i)=>i+1), "indices renumbered 1..n");

console.log("7. cascade delete");
r = post({key:KEY,action:"deleteLocation",payload:{id:newId}});
eq(r.data.schedule_entries_removed, 1, "its schedule entry went with it");
all = post({key:KEY,action:"all"}).data;
eq(all.locations.length, NL, "location gone");
ok(!all.schedule.some(s=>s.id===sid), "schedule entry gone");
ok(all.schedule.every(s=>all.locations.some(l=>l.id===s.location_id)), "still no orphans");

console.log("8. bookings + GET + errors");
eq(get({key:KEY,action:"bookings"}).data.bookings.length, NB, "doGet works with query params");
ok(post({key:KEY,action:"nope"}).error.indexOf("Unknown action")>=0, "unknown action errors cleanly");
ok(post({key:KEY,action:"deleteLocation",payload:{}}).error.indexOf("No id")>=0, "delete without id errors cleanly");
eq(post({key:KEY,action:"deleteBooking",payload:{id:BK1}}).data.deleted.removed, true, "booking delete");
eq(post({key:KEY,action:"all"}).data.bookings.length, NB-1, "booking count went down");

console.log("9. reset and reseed");
sandbox.resetAndReseed();
all = post({key:KEY,action:"all"}).data;
eq([all.bookings.length, all.locations.length, all.schedule.length], [NB,NL,NS], "full reseed restores everything");

console.log("10. an older Sheet upgrades itself in place");
{
  // A Locations tab as the previous version of this script left it: 13 columns.
  const OLD = sandbox.TABS.Locations.slice(0, 13);
  const loc = SS.getSheetByName("Locations");
  const before = loc.getRange(2, 1, 1, 13).getValues()[0];
  loc.d = loc.d.map(r => r.slice(0, 13));
  eq(loc.getLastColumn(), 13, "simulated old tab has 13 columns");
  loc.getRange(1, 1, 1, 13).setValues([OLD]);

  const firstId = before[0];
  const got = post({key:KEY,action:"locations"}).data.locations.find(l=>l.id===firstId);
  eq(loc.getRange(1,1,1,sandbox.TABS.Locations.length).getValues()[0], sandbox.TABS.Locations,
     "first request writes the full header row");
  eq(loc.getRange(2, 1, 1, 13).getValues()[0], before, "existing row did not move");
  eq([got.name_en, got.getting_there, got.tickets], [before[1], "", ""], "old rows read back with the new fields blank");

  const r = post({key:KEY,action:"saveLocation",payload:{id:firstId, getting_there:"MTR exit A", arrive_by:"Walk", tickets:"Free"}});
  ok(r.ok, "partial save of only the new fields succeeds");
  const after = post({key:KEY,action:"locations"}).data.locations.find(l=>l.id===firstId);
  eq([after.getting_there, after.arrive_by, after.tickets], ["MTR exit A","Walk","Free"], "new fields persist");
  eq([after.name_en, after.name_zh, after.lat], [got.name_en, got.name_zh, got.lat], "and the old fields are untouched");
}

console.log("\n" + (fails ? "FAILED " + fails + "/" + checks : "PASSED all " + checks + " checks"));
process.exit(fails ? 1 : 0);
