// Builds the static site in docs/ for GitHub Pages.
//   node tools/build.js
// Reads sets/*.js (each calls add([...7 prompts])), validates every answer sheet,
// assigns one set per day from EPOCH, and writes docs/dives/<date>.json + docs/dives/index.json.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const EPOCH = '2026-09-24';
const TIER_KEYS = ['p', 'c', 's', 'a', 'd'];

const FOLD = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };
function norm(s) {
  s = String(s || '').toLowerCase().replace(/[øæœßłđðþı]/g, c => FOLD[c]).normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ');
  s = s.replace(/^\s*(the|a|an)\s+/, '');
  return s.replace(/[^a-z0-9]/g, '');
}
const plain = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function addDays(k, n) {
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ---- load sources
global.window = {};
require(path.join(ROOT, 'bank.js'));
const bankQs = new Set(window.SEED_BANK.map(e => norm(e.q)));
const sets = [];
global.add = set => sets.push(set);
const setDir = path.join(ROOT, 'sets');
for (const f of fs.readdirSync(setDir).filter(f => f.endsWith('.js')).sort()) require(path.join(setDir, f));

// ---- validate
const problems = [];
const warn = [];
const seenQ = new Map();
let totalAnswers = 0;
function cleanPrompt(p, where) {
  if (!p || typeof p.q !== 'string' || !p.r) { problems.push(`${where}: missing q or r`); return p; }
  const nq = norm(p.q);
  if (seenQ.has(nq)) problems.push(`${where}: duplicate prompt "${p.q}" (also ${seenQ.get(nq)})`);
  seenQ.set(nq, where);
  if (bankQs.has(nq)) warn.push(`${where}: "${p.q}" is also in bank.js`);

  // constraint filter: f = {no:'a'} (letter must not appear) or {start:'b'} (must start with)
  const keepName = name => {
    if (!p.f) return true;
    const t = plain(name);
    if (p.f.no && t.includes(p.f.no)) return false;
    if (p.f.start && !t.replace(/^the\s+/, '').startsWith(p.f.start)) return false;
    return true;
  };
  const seen = new Set();
  const out = { q: p.q, r: p.r };
  let count = 0;
  let gemKey = null;
  if (p.k) {
    const i = p.k.indexOf('|');
    const names = (i < 0 ? p.k : p.k.slice(0, i)).split('~').map(x => x.trim()).filter(Boolean);
    const quip = i < 0 ? '' : p.k.slice(i + 1).trim();
    if (!quip) warn.push(`${where}: gem has no quip`);
    if (!keepName(names[0])) problems.push(`${where}: gem "${names[0]}" breaks the prompt's letter rule`);
    gemKey = norm(names[0]);
    seen.add(gemKey);
    out.k = names.join('~') + '|' + quip;
    count++;
  } else warn.push(`${where}: "${p.q}" has no Pearl`);
  for (const k of TIER_KEYS) {
    const items = String(p[k] || '').split('|').map(x => x.trim()).filter(Boolean);
    const kept = [];
    for (const item of items) {
      const names = item.split('~').map(x => x.trim()).filter(Boolean);
      const key = norm(names[0]);
      if (!key) continue;
      if (!keepName(names[0])) { warn.push(`${where}: dropped "${names[0]}" (breaks rule)`); continue; }
      if (seen.has(key)) { warn.push(`${where}: "${names[0]}" listed twice — kept the first`); continue; }
      seen.add(key);
      kept.push(names.filter(n => keepName(n) || n === names[0]).join('~'));
    }
    if (kept.length) out[k] = kept.join('|');
    count += kept.length;
  }
  const pCount = out.p ? out.p.split('|').length : 0;
  if (pCount < 5) problems.push(`${where}: "${p.q}" has only ${pCount} plankton answers`);
  if (count < 60) warn.push(`${where}: "${p.q}" has only ${count} answers`);
  totalAnswers += count;
  return out;
}
const cleanSets = sets.map((set, i) => {
  if (!Array.isArray(set) || set.length !== 7) problems.push(`set ${i}: has ${set && set.length} prompts, needs 7`);
  return set.map((p, j) => cleanPrompt(p, `set ${i} #${j + 1}`));
});

if (warn.length) console.log('Warnings:\n  ' + warn.join('\n  '));
if (problems.length) { console.error('Problems:\n  ' + problems.join('\n  ')); process.exit(1); }

// ---- write docs/
fs.rmSync(path.join(DOCS, 'dives'), { recursive: true, force: true });
fs.mkdirSync(path.join(DOCS, 'dives'), { recursive: true });
const index = { dives: {} };
cleanSets.forEach((prompts, i) => {
  const date = addDays(EPOCH, i);
  fs.writeFileSync(path.join(DOCS, 'dives', date + '.json'), JSON.stringify({ date, n: i + 1, prompts }));
  index.dives[date] = { n: i + 1, qs: prompts.map(p => p.q) };
});
fs.writeFileSync(path.join(DOCS, 'dives', 'index.json'), JSON.stringify(index));

const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Trench — the daily dive. Name the rarest answer you can; rarer answers sink deeper.">
<meta name="theme-color" content="#050a14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Trench">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
</head>
<body>
`;
fs.writeFileSync(path.join(DOCS, 'index.html'), head + page + '\n</body>\n</html>\n');
fs.copyFileSync(path.join(ROOT, 'bank.js'), path.join(DOCS, 'bank.js'));
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');
fs.writeFileSync(path.join(DOCS, 'manifest.webmanifest'), JSON.stringify({
  name: 'Trench', short_name: 'Trench', description: 'The daily dive: rarer answers sink deeper.',
  start_url: './', scope: './', display: 'standalone', background_color: '#050a14', theme_color: '#050a14',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));

const last = addDays(EPOCH, cleanSets.length - 1);
console.log(`Built ${cleanSets.length} daily dives (${cleanSets.length * 7} prompts, ${totalAnswers} answers): ${EPOCH} → ${last}`);
