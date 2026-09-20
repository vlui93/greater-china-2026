/* Serves the real Code.gs over HTTP against the mock Apps Script runtime, so the
   sheet.js CLI can be exercised end-to-end without touching a real Google Sheet. */
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');

function MockSheet(n){ this.name=n; this.d=[]; this.fmt={}; }
MockSheet.prototype = {
  getName(){return this.name;},
  getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r&&r.some(c=>c!==''&&c!=null))l=i+1;});return l;},
  getLastColumn(){return this.d.reduce((m,r)=>Math.max(m,r?r.length:0),0);},
  setFrozenRows(){}, _cell(r,c){if(!this.d[r-1])this.d[r-1]=[];if(this.d[r-1][c-1]===undefined)this.d[r-1][c-1]='';return this.d[r-1][c-1];},
  getRange(row,col,nr,nc){ nr=nr==null?1:nr; nc=nc==null?1:nc; const sh=this;
    return { getValues(){const o=[];for(let r=row;r<row+nr;r++){const l=[];for(let c=col;c<col+nc;c++)l.push(sh._cell(r,c));o.push(l);}return o;},
      setValues(v){v.forEach((l,i)=>l.forEach((val,j)=>{if(!sh.d[row+i-1])sh.d[row+i-1]=[];sh.d[row+i-1][col+j-1]=val;}));return this;},
      setValue(v){if(!sh.d[row-1])sh.d[row-1]=[];sh.d[row-1][col-1]=v;return this;},
      setNumberFormat(){return this;}, setFontWeight(){return this;} }; },
  appendRow(r){this.d[this.getLastRow()]=r.slice();},
  deleteRow(r){this.d.splice(r-1,1);}, deleteRows(r,n){this.d.splice(r-1,n);}
};
function MockSS(){this.sheets=[];}
MockSS.prototype={ getSheetByName(n){return this.sheets.find(s=>s.name===n)||null;},
  insertSheet(n){const s=new MockSheet(n);this.sheets.push(s);return s;},
  getSheets(){return this.sheets;}, deleteSheet(s){this.sheets=this.sheets.filter(x=>x!==s);},
  getSpreadsheetTimeZone(){return 'Australia/Sydney';} };

const SS=new MockSS();
const sandbox={ SpreadsheetApp:{getActive:()=>SS},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:t=>({_t:t,setMimeType(){return this;}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{formatDate:d=>d.toISOString().slice(0,10)}, Logger:{log(){}}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8'), sandbox, {filename:'Code.gs'});
sandbox.API_KEY = process.env.TEST_KEY || 'test-key';
sandbox.setup();

http.createServer((req,res)=>{
  let body='';
  req.on('data',c=>body+=c);
  req.on('end',()=>{
    const out = sandbox.doPost({ postData:{contents:body}, parameter:{} });
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(out._t);
  });
}).listen(8799, '127.0.0.1', ()=>console.log('mock backend on http://127.0.0.1:8799/exec'));
