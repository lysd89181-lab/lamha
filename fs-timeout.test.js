// مهلة قراءات Firestore: القراءات تنقطع بعد 8 ثوانٍ، والكتابة/المعاملات بلا مهلة أبدًا
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const a = src.indexOf('const FS_READ_TIMEOUT_MS'), b = src.indexOf('async function fsGetFS');
if (a < 0 || b < 0) { console.log('FAIL - لم أجد الدوال في worker.js'); process.exit(1); }
const code = src.slice(a, b);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok - ' + m); } else { fail++; console.log('FAIL - ' + m); } };

function mk(fetchImpl) {
  const calls = [], reqMs = [];
  const ctx = {
    FS_BASE: 'https://fs.test', console: { error() {} },
    getAccessToken: async () => 'tok',
    httpError: (status, msg) => Object.assign(new Error(msg), { status }),
    countReads() {}, _quotaHitAt: 0, Array, JSON, String, Math, Date, Promise, Error,
    AbortSignal: { timeout: ms => { reqMs.push(ms); return AbortSignal.timeout(Math.min(ms, 40)); } },   // نسرّع الاختبار، ونسجّل المهلة المطلوبة
    fetch: (url, init) => { calls.push({ url, init }); return fetchImpl(url, init); },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.fsFetch = fsFetch; this.fsIsWrite = fsIsWrite; this.T = FS_READ_TIMEOUT_MS;', ctx);
  return { ctx, calls, reqMs };
}
const hang = (url, init) => new Promise((res, rej) => { if (init && init.signal) init.signal.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' }))); });
const okRes = body => async () => ({ ok: true, status: 200, json: async () => body });

const keep = setInterval(() => {}, 1000);   // مؤقّت AbortSignal.timeout لا يُبقي Node حيًا لوحده
(async () => {
  // تصنيف الطلبات
  const { ctx } = mk(okRes({}));
  ok(ctx.T === 8000, 'مهلة القراءة 8000ms');
  ok(!ctx.fsIsWrite('/settings/main', {}), 'GET عادي = قراءة');
  ok(!ctx.fsIsWrite(':runQuery', { method: 'POST' }), 'runQuery = قراءة');
  ok(!ctx.fsIsWrite(':runAggregationQuery', { method: 'POST' }), 'runAggregationQuery = قراءة');
  ok(!ctx.fsIsWrite(':listCollectionIds', { method: 'POST' }), 'listCollectionIds = قراءة');
  ok(ctx.fsIsWrite(':commit', { method: 'POST' }), 'commit = كتابة');
  ok(ctx.fsIsWrite(':beginTransaction', { method: 'POST' }), 'beginTransaction = كتابة');
  ok(ctx.fsIsWrite(':rollback', { method: 'POST' }), 'rollback = كتابة');
  ok(ctx.fsIsWrite('/users/x', { method: 'PATCH' }), 'PATCH = كتابة');

  // قراءة معلّقة → 503 سريع برسالة واضحة
  { const m = mk(hang); let err = null; const t0 = Date.now();
    try { await m.ctx.fsFetch({ FIREBASE_PROJECT_ID: 'p' }, '/settings/main'); } catch (e) { err = e; }
    ok(err && err.status === 503 && /بطيئة/.test(err.message), 'قراءة معلّقة تنتهي بـ 503 برسالة واضحة');
    ok(Date.now() - t0 < 1000, 'ولا تنتظر أكثر من المهلة');
    ok(m.reqMs.length === 1 && m.reqMs[0] === 8000, 'المهلة المطلوبة فعليًا = 8000ms'); }

  // runQuery يأخذ مهلة
  { const m = mk(okRes([])); await m.ctx.fsFetch({ FIREBASE_PROJECT_ID: 'p' }, ':runQuery', { method: 'POST', body: '{}' });
    ok(!!m.calls[0].init.signal, 'runQuery يُرسَل مع signal'); }

  // الكتابة بلا signal إطلاقًا، وتكمل حتى لو تأخرت
  { let release; const slow = () => new Promise(r => { release = () => r({ ok: true, status: 200, json: async () => ({ writeResults: [] }) }); });
    const m = mk(slow);
    const p = m.ctx.fsFetch({ FIREBASE_PROJECT_ID: 'p' }, ':commit', { method: 'POST', body: '{}' });
    await new Promise(r => setTimeout(r, 120));           // أطول من المهلة المختصرة (40ms) بكثير
    ok(m.calls[0].init.signal === undefined && m.reqMs.length === 0, 'commit بلا signal ولا مهلة');
    release(); const r = await p;
    ok(r && Array.isArray(r.writeResults), 'commit بطيء يكمل وينجح ولا يُقطع'); }

  // نجاح عادي يمرّ كما هو
  { const m = mk(okRes({ fields: {} })); const r = await m.ctx.fsFetch({ FIREBASE_PROJECT_ID: 'p' }, '/a/b');
    ok(r && r.fields, 'قراءة ناجحة تُرجع البيانات كما هي'); }

  // التوكن: مهلة موجودة في المصدر
  ok(/oauth2\.googleapis\.com\/token[\s\S]{0,200}AbortSignal\.timeout\(8000\)/.test(src), 'طلب التوكن عليه مهلة 8 ثوانٍ');

  clearInterval(keep);
  console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\n${pass}/${pass} passed`);
  process.exit(fail ? 1 : 0);
})();
