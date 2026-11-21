// تشخيص رد المزود: إخفاء الأكواد، التقاط الـ meta بدون ما يتغير شكل الرد، وتقرير الإدارة
const fs = require('fs'), path = require('path'), vm = require('vm');
const W = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const A = fs.readFileSync(path.join(__dirname, '..', 'admin.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok - ' + m); } else { fail++; console.log('FAIL - ' + m); } };
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < 0) { console.log('FAIL - لم أجد: ' + a + ' / ' + b); process.exit(1); } return src.slice(i, j); };

function mkWorker(fetchImpl) {
  const ctx = { RSC_BASE: 'https://resell.codes/api/v1', nowIso: () => '2026-11-21T00:00:00Z', httpError: (s, m) => Object.assign(new Error(m), { status: s }), AbortSignal: { timeout: () => undefined },
    fetch: fetchImpl, Object, JSON, Array, String, Number, Promise, Error, Set, Math };
  vm.createContext(ctx);
  vm.runInContext(cut(W, 'const RSC_HIDE', 'const RSC_GRP') + '\nthis.rscSafe=rscSafe; this.rscRawStore=rscRawStore; this.rscHdrs=rscHdrs; this.rscCall=rscCall;', ctx);
  return ctx;
}
const res = (status, body, headers = {}, badJson = false) => ({ ok: status < 400, status, headers: { forEach: f => Object.entries(headers).forEach(([k, v]) => f(v, k)) }, json: async () => { if (badJson) throw new Error('x'); return body; } });

(async () => {
  const c = mkWorker(async () => res(200, {}));
  // --- إخفاء الأكواد ---
  const s1 = c.rscSafe({ number: 'A1', status: 'completed', charged_usd: '2.0097', codes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'], idempotency_key: 'abc', nested: { items: [{ pin: '1234', serial: 'S1', note: 'ok' }] } });
  ok(s1.codes === '[hidden ×2]', 'مصفوفة codes تُخفى مع بقاء عددها');
  ok(s1.nested.items[0].pin === '[hidden]' && s1.nested.items[0].serial === '[hidden]' && s1.nested.items[0].note === 'ok', 'pin/serial داخل كائنات متداخلة تُخفى والباقي يبقى');
  ok(s1.number === 'A1' && s1.status === 'completed' && s1.charged_usd === '2.0097', 'الرقم والحالة والمبلغ المخصوم تبقى ظاهرة');
  ok(s1.idempotency_key === 'abc', 'حقل idempotency_key (لو وُجد) يبقى ظاهرًا — نبيه في التشخيص');
  ok(c.rscSafe({ data: 'ABCD-1234-WXYZ-9876' }).data === '[hidden]', 'نص يشبه الكود (XXXX-XXXX-XXXX) يُخفى حتى لو المفتاح اسمه عادي');
  ok(c.rscSafe({ offer_id: 'monthly_premium_battle_pass' }).offer_id === 'monthly_premium_battle_pass', 'معرّفات العروض العادية ما تُخفى');
  ok(c.rscSafe('x'.repeat(500)).length <= 161, 'النصوص الطويلة تُقصّ');
  ok(JSON.stringify(c.rscSafe({ a: { b: { c: { d: { e: { f: 1 } } } } } })).includes('[…]'), 'عمق التداخل محدود');
  // --- التخزين ---
  const j = Object.defineProperty({ number: 'N9', codes: ['AAAA-BBBB-CCCC'] }, '__meta', { value: { status: 201, headers: { 'x-request-id': 'r1' } }, enumerable: false });
  const st = c.rscRawStore(j); const p = JSON.parse(st);
  ok(p.http === 201 && p.headers['x-request-id'] === 'r1' && p.body.codes === '[hidden ×1]' && !st.includes('AAAA'), 'التخزين يحتوي HTTP والـ headers ولا يحتوي الكود أبدًا');
  const big = c.rscRawStore({ list: Array.from({ length: 20 }, (_, i) => ({ k: 'v'.repeat(150) + i })), more: 'y'.repeat(150), a: Array.from({ length: 20 }, () => 'z'.repeat(150)) });
  ok(big.length <= 3800 && !!JSON.parse(big), 'الرد الكبير يبقى JSON صالحًا وتحت 3800 حرف');
  // --- headers ---
  const h = c.rscHdrs({ forEach: f => { f('1', 'Idempotency-Replayed'); f('abc', 'Authorization'); f('c=1', 'Set-Cookie'); f('r2', 'X-Request-Id'); f('nginx', 'Server'); f('10', 'RateLimit-Remaining'); } });
  ok(h['idempotency-replayed'] === '1' && h['x-request-id'] === 'r2' && h['ratelimit-remaining'] === '10', 'headers المفيدة تُلتقط');
  ok(!('authorization' in h) && !('set-cookie' in h) && !('server' in h), 'authorization و set-cookie وغير المفيد لا تُلتقط');
  // --- rscCall: الشكل ما تغيّر ---
  const c2 = mkWorker(async () => res(200, { number: '77', status: 'created', codes: ['A'] }, { 'x-request-id': 'q' }));
  const r = await c2.rscCall({ RSC_API_KEY: 'k' }, 'GET', '/orders/77');
  ok(JSON.stringify(r) === '{"number":"77","status":"created","codes":["A"]}', 'JSON الرد نفسه بدون أي إضافة');
  ok(!Object.keys(r).includes('__meta') && r.__meta.status === 200 && r.__meta.headers['x-request-id'] === 'q', '__meta مخفي (غير قابل للعدّ) لكنه موجود للتشخيص');
  const c3 = mkWorker(async () => res(200, null, {}, true));
  const r3 = await c3.rscCall({ RSC_API_KEY: 'k' }, 'GET', '/x');
  ok(JSON.stringify(r3) === '{}' && r3.__meta.status === 200, 'رد غير JSON يرجع {} كما كان');
  const c4 = mkWorker(async () => res(404, { error: { type: 'not_found', message: 'No category' } }));
  let e4; try { await c4.rscCall({ RSC_API_KEY: 'k' }, 'GET', '/x'); } catch (e) { e4 = e; }
  ok(e4 && e4.rscStatus === 404 && e4.rscType === 'not_found', 'أخطاء المزود ما تغيّرت (rscStatus و rscType)');
  let e5; try { await c4.rscCall({}, 'GET', '/x'); } catch (e) { e5 = e; }
  ok(e5 && e5.status === 503, 'بدون مفتاح → 503 كما كان');
  // --- تقرير الإدارة ---
  const actx = { esc: s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])), Object, JSON, Math, Number, Set, Array };
  vm.createContext(actx); vm.runInContext(cut(A, 'function rscDiagReport', 'function rscSyncNote') + '\nthis.rep=rscDiagReport;', actx);
  const base = { order: { cat_name: 'App Store', offer_name: '2 USD', status: 'completed', number: '9', cost_usd: 2.01, charged_usd: 2.0097 }, post: { http: 201, headers: { 'idempotency-replayed': 'false' }, body: { number: '9', status: 'created' } }, final: { body: { status: 'completed', codes: '[hidden ×1]' } } };
  let t = actx.rep(base).text;
  ok(t.includes('✅') && t.includes('number, status') && t.includes('idempotency-replayed'), 'تقرير: سعر مطابق + حقول الرد + header الـ idempotency');
  t = actx.rep({ ...base, order: { ...base.order, charged_usd: 2.5 } }).text;
  ok(t.includes('⚠') && t.includes('0.49'), 'تقرير: فرق في السعر يظهر مع قيمته');
  t = actx.rep({ ...base, order: { ...base.order, charged_usd: 0 }, post: null, final: null }).text;
  ok(t.includes('❔') && t.includes('غير محفوظ'), 'تقرير: بدون charged_usd أو رد محفوظ يقولها بصراحة');
  const hh = actx.rep({ ...base, post: { http: 200, headers: {}, body: {} } });
  ok(hh.text.includes('ما ظهر أي header') && hh.text.includes('لا يعني'), 'تقرير: غياب headers ما يُفسَّر كأنه غير مدعوم');
  ok(!actx.rep({ ...base, order: { ...base.order, cat_name: '<script>x</script>' } }).html.includes('<script>'), 'HTML التقرير يهرّب النصوص');
  console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\n${pass}/${pass} passed`);
  process.exit(fail ? 1 : 0);
})();
