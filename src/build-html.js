const fs = require('fs'), path = require('path');
const d = __dirname;
const seed = fs.readFileSync(path.join(d, 'seed.json'), 'utf8');
const tpl = fs.readFileSync(path.join(d, 'index.template.html'), 'utf8');
if (!tpl.includes('/*__SEED__*/')) throw new Error('seed placeholder missing');
const html = tpl.replace('/*__SEED__*/', JSON.stringify(JSON.parse(seed)));
fs.writeFileSync(path.join(d, '..', 'index.html'), html);
console.log('index.html written:', (fs.statSync(path.join(d, '..', 'index.html')).size / 1024).toFixed(0) + 'KB');
