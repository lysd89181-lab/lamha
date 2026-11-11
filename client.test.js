// اختبارات دوال الواجهة (تنظيف رابط SHEIN وأسماء الدول) — من app.js الحقيقي
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const grab = (re) => { const m = src.match(re); if (!m) throw new Error('missing ' + re); return m[0]; };
const code = [grab(/const shOkHost = [^\n]+/), grab(/function shClean\(text\) \{[\s\S]*?\n\}\n/), grab(/function rscNameParts\(name\) \{[\s\S]*?\n\}\n/), grab(/const shTimerText = [^\n]+/), grab(/const shUsd = [^\n]+/)].join('\n');
const ctx = { URL, String, Set, Intl, Array, RegExp }; vm.createContext(ctx); vm.runInContext(code + '\nthis.api={shClean,rscNameParts,shTimerText,shUsd};', ctx);
const { shClean, rscNameParts, shTimerText, shUsd } = ctx.api; let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
t('رسالة مشاركة SHEIN الطويلة تتحول لرابط نظيف فقط', () => {
  const msg = 'لقد وجدت بعض المنتجات الرائعة في شي إن! يمكنك الحصول عليها بخصم 🎁 https://onelink.shein.com/53/62iq4f9ff9cz?shc=2_RcGyFlOGYsS. اضغط للشراء!';
  assert.strictEqual(shClean(msg), 'https://onelink.shein.com/53/62iq4f9ff9cz?shc=2_RcGyFlOGYsS');
});
t('روابط shein.top مقبولة، ورابط غير SHEIN أو مزيّف يُحذف، والتكرار يُدمج', () => {
  assert.strictEqual(shClean('https://shein.top/abc123'), 'https://shein.top/abc123');
  assert.strictEqual(shClean('https://evil.com/shein.com https://shein.com.evil.io/x'), ''); assert.strictEqual(shClean('hello'), '');
  assert.strictEqual(shClean('https://us.shein.com/a-p-123456.html\nhttps://us.shein.com/a-p-123456.html'), 'https://us.shein.com/a-p-123456.html');
  assert.strictEqual(shClean('https://us.shein.com/a-p-1.html،'), 'https://us.shein.com/a-p-1.html');
});
t('اسم القسم مع الدولة: علم واسم عربي كامل بدل النص المقطوع', () => {
  const a = rscNameParts('App Store & iTunes (AE)'); assert.strictEqual(a.title, 'App Store & iTunes'); assert.strictEqual(a.cc, 'AE'); assert.strictEqual(a.flag, '🇦🇪');
  const b = rscNameParts('iTunes - US'); assert.strictEqual(b.cc, ''); assert.strictEqual(b.title, 'iTunes - US');
  const c = rscNameParts('PlayStation [US]'); assert.strictEqual(c.title, 'PlayStation'); assert.strictEqual(c.flag, '🇺🇸'); assert.strictEqual(rscNameParts('ببجي').title, 'ببجي');
});
t('مؤقت العرض: 30 دقيقة = 30:00، ويتناقص، ولا يصير سالبًا', () => { assert.strictEqual(shTimerText(1800000), '30:00'); assert.strictEqual(shTimerText(1799000), '29:59'); assert.strictEqual(shTimerText(65000), '01:05'); assert.strictEqual(shTimerText(-5), '00:00'); });
t('عرض الدولار كما في SHEIN: $13.07', () => { assert.strictEqual(shUsd(13.07), '$13.07'); assert.strictEqual(shUsd(9), '$9.00'); });

const sIdx = src.indexOf('const shM = '), eIdx = src.indexOf('function shConfetti()');
const shCode = src.slice(sIdx, eIdx);
const S = { config: { shein: { rate: 9.5, commission_pct: 10, deposit_pct: 40, kg_lyd: 60 }, ezone: { on: true, min: 5, max: 5000 } }, profile: { kyc_status: 'approved' }, sh: null, page: 'shein' };
const q = { qid: 'ABCDEF123456', exp: Date.now() + 1800000, rate: 9.5, commission_pct: 10, deposit_pct: 40, kg_lyd: 60, skipped: 0, items: [{ i: 0, name: 'تيشرت', img: '', avail: true, sale: 10, retail: 12, options: 'M' }, { i: 1, name: 'حذاء', img: '', avail: true, sale: 20, retail: 20, variants: [{ n: '40', sale: 20 }, { n: '41', sale: 22 }] }, { i: 2, name: 'نفد', avail: false, sale: 5 }] };
const sx = { S, esc: x => String(x == null ? '' : x), svg: () => '<svg/>', I: { next: '', wallet2: '', paycard: '' }, ktop: t => '<div class="ktop">' + t + '</div>', fennec: () => '', wBalOf: () => 500, shLoadOrders() {}, shHead: x => x, Date, Math, Number, String, Object, Array, Set, document: {}, window: {}, matchMedia: null, toast() {}, render() {}, console, URL, RegExp };
vm.createContext(sx); vm.runInContext(shCode + '\nthis.api={vSheinPage,shCalc,shState,shClean,shBar};', sx);
const V = sx.api;
t('onelink.me مقبول في الواجهة ويُرفض المقلّد', () => { assert.strictEqual(V.shClean('انظر https://onelink.me/abc123 شكرا'), 'https://onelink.me/abc123'); assert.strictEqual(V.shClean('https://onelink.me.evil.io/x'), ''); });
t('حساب السلة: المقاس المختار والكمية والعمولة والعربون 40%', () => {
  const sh = V.shState(); sh.q = q; sh.qty = { 0: 2, 1: 1, 2: 3 }; sh.pick = { 0: 0, 1: 1 };
  const c = V.shCalc(); assert.strictEqual(c.usd, 42); assert.strictEqual(c.goods, 399); assert.strictEqual(c.commission, 39.9); assert.strictEqual(c.total, 438.9); assert.strictEqual(c.deposit, 176); assert.strictEqual(c.count, 3);
});
t('كل شاشات SHEIN الثمانية تُرسم بلا undefined أو NaN وبعناصرها الأساسية', () => {
  const sh = V.shState(); const chk = (html, ...must) => { assert.ok(!/undefined|NaN|\[object/.test(html), html.slice(0, 200)); must.forEach(m => assert.ok(html.includes(m), 'missing ' + m)); };
  sh.tab = 'new'; sh.q = null; sh.busy = false; chk(V.vSheinPage(), 'id="shGo"', 'id="shBrowse"', 'ربط سلة SHEIN');
  sh.busy = true; sh.pct = 42; chk(V.vSheinPage(), 'id="shRing"', '42%'); sh.busy = false;
  sh.q = q; sh.qty = { 0: 1, 1: 1 }; sh.pick = { 0: 0, 1: 0 }; sh.removed = new Set(); sh.mode = '';
  sh.step = 'items'; chk(V.vSheinPage(), 'sx-grid', 'data-shq="0:1"', 'id="shNext"', 'غير متوفر');
  sh.step = 'sum'; chk(V.vSheinPage(), 'ملخص الطلب', 'data-to="confirm"', '60');
  sh.step = 'confirm'; chk(V.vSheinPage(), 'تأكيد السعر', 'data-to="pay"');
  sh.step = 'pay'; chk(V.vSheinPage(), 'data-shmode="wallet"', 'data-shmode="ezone"', 'id="shPayGo"');
  sh.oid = 'SH-1'; sh.step = 'done'; chk(V.vSheinPage(), 'id="shDetail"', 'id="shAgain"', 'SH-1');
  sh.tab = 'list'; sh.orders = []; chk(V.vSheinPage(), 'ما عندك طلبات');
});
t('الدفع: المحفظة غير الكافية تعطّل الزر، والدفع الفوري يظهر وهو متاح', () => {
  const sh = V.shState(); sh.tab = 'new'; sh.q = q; sh.step = 'pay'; sh.qty = { 0: 20, 1: 20 }; sh.pick = { 0: 0, 1: 0 }; sh.mode = 'wallet'; sh.paying = false;
  const h = V.vSheinPage(); assert.ok(/id="shPayGo"[^>]*disabled/.test(h)); assert.ok(h.includes('غير كافٍ'));
  sh.mode = 'ezone'; const h2 = V.vSheinPage(); assert.ok(!/id="shPayGo"[^>]*disabled/.test(h2));
});
console.log(`\n${n} passed`);
