// فحوص ثابتة لملفات الواجهة: روابط الأصول، توازن CSS، صياغة JS، توافق CSP، تحميل الصور والخطوط
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok - ' + m); } else { fail++; console.log('FAIL - ' + m); } };

const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const shopVers = new Set();
for (const p of pages) {
  const h = rd(p);
  // 1) كل أصل محلي موجود
  const refs = [...h.matchAll(/(?:href|src)="\.\/([^"?#]+)/g)].map(m => m[1]);
  const missing = refs.filter(r => !fs.existsSync(path.join(root, r)));
  ok(!missing.length, `${p}: كل الأصول المحلية موجودة${missing.length ? ' — ناقص: ' + missing.join(', ') : ''}`);
  // 2) لا معالجات inline (تتعارض مع CSP)
  ok(!/\son(click|load|error|submit|change)\s*=/i.test(h), `${p}: بلا معالجات أحداث inline`);
  // 3) الخطوط: غير حاجبة + fallback
  if (/fonts\.googleapis\.com\/css2/.test(h)) {
    ok(/media="print" id="gf"/.test(h) && /<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis/.test(h) && /fonts\.js/.test(h), `${p}: خطوط Google غير حاجبة مع noscript و fonts.js`);
  }
  for (const m of h.matchAll(/kardo-shop\.css\?v=(\d+)/g)) shopVers.add(m[1]);
}
ok(shopVers.size === 1 && [...shopVers][0] === '86', 'نسخة kardo-shop.css موحّدة (86) في كل الصفحات');

// 4) توازن الأقواس في كل CSS
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.css'))) {
  const t = rd(f).replace(/\/\*[\s\S]*?\*\//g, '');
  ok((t.match(/{/g) || []).length === (t.match(/}/g) || []).length, `${f}: أقواس CSS متوازنة`);
}

// 5) صياغة JS
for (const f of ['app.js', 'admin.js', 'worker.js', 'sw.js', 'fonts.js', 'boot.js', 'gate.js', 'login.js']) {
  const tmp = path.join(os.tmpdir(), 'chk_' + f.replace('.js', '.mjs'));
  fs.writeFileSync(tmp, rd(f));
  const r = cp.spawnSync(process.execPath, ['--check', tmp]);
  ok(r.status === 0, `${f}: صياغة JS سليمة`);
}

// 6) الصور القادمة من البيانات تُحمَّل كسولًا
const app = rd('app.js');
const dyn = [...app.matchAll(/<img[^>]*src="\$\{[^>]*>/g)].map(m => m[0]).filter(s => !/QR Binance|avatar|referrerpolicy/.test(s));
const notLazy = dyn.filter(s => !/loading="lazy"/.test(s));
ok(!notLazy.length, `صور البيانات كلها loading=lazy (${dyn.length})${notLazy.length ? ' — بدون: ' + notLazy.length : ''}`);

// 7) sw: الكاش يشمل fonts.js والإصدار تغيّر
const sw = rd('sw.js');
ok(/'\.\/fonts\.js'/.test(sw) && /lamha-v86/.test(sw), 'sw.js: يشمل fonts.js وإصدار الكاش v86');

// 8) الشريط السفلي: aria-current
ok(/aria-current/.test(app), 'الشريط السفلي يحدّد الصفحة الحالية لقارئات الشاشة');

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\n${pass}/${pass} passed`);
process.exit(fail ? 1 : 0);
