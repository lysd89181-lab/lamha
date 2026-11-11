const assert = require('assert'), Module = require('module'), path = require('path');
const calls = { del: 0, set: [], claims: [] };
const mk = () => { const col = n => ({ doc: id => ({ _p: n + '/' + id, set: async () => {}, delete: async () => { calls.del++; } }), where: () => ({ get: async () => ({ docs: [{ ref: { _p: n + '/x' } }] }) }) });
  return { collection: col, batch: () => { const ops = []; return { set: (r, d) => ops.push(['set', r._p, d]), delete: () => { calls.del++; }, commit: async () => { ops.forEach(o => calls.set.push(o)); } }; } }; };
const fb = { initializeApp() {}, firestore: Object.assign(() => mk(), { }), auth: () => ({ setCustomUserClaims: async (u, c) => calls.claims.push([u, c]), getUser: async () => ({ email: 'a@b.c' }) }) };
const fn = { https: { onCall: h => h, HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } }, firestore: { document: () => ({ onUpdate: h => h }) }, pubsub: { schedule: () => ({ timeZone: () => ({ onRun: h => h }), onRun: h => h }) }, auth: { user: () => ({ onCreate: h => h, onDelete: h => h }) } };
const orig = Module._load; Module._load = function (r, ...a) { return r === 'firebase-functions' ? fn : r === 'firebase-admin' ? fb : orig.call(this, r, ...a); };
const ex = require(path.join(__dirname, '..', 'index.js')); Module._load = orig;
let n = 0; const t = async (name, f) => { try { await f(); console.log('ok -', name); n++; } catch (e) { console.log('FAIL -', name, '\n   ', e.message); process.exitCode = 1; } };
const ctx = (role, admin = true) => ({ auth: { uid: 'caller', token: { admin, role } } });
const rejects = async (p, code) => { try { await p; } catch (e) { assert.strictEqual(e.code, code); return; } assert.fail('should reject'); };
(async () => {
  await t('دوال المال والبطاقات القديمة محذوفة من الملف', () => { for (const k of ['executeWalletTransaction', 'getWalletBalance', 'createCardOrder', 'fulfillCardOrder', 'cleanupExpiredReveals', 'auditBalances']) assert.ok(!ex[k], k); });
  await t('setAdminRole: support/finance/أدمن عادي وغير المسجّل مرفوضون', async () => { for (const c of [ctx('support'), ctx('finance'), ctx(undefined), { auth: null }, { auth: { token: { admin: true } } }]) await rejects(ex.setAdminRole({ uid: 'u1', role: 'super_admin' }, c), 'permission-denied'); assert.strictEqual(calls.claims.length, 0); });
  await t('setAdminRole: super_admin فقط ينجح، والدور يُتحقق شكله', async () => { const r = await ex.setAdminRole({ uid: 'u1', role: 'finance' }, ctx('super_admin')); assert.ok(r.success); assert.strictEqual(calls.claims[0][1].role, 'finance'); await rejects(ex.setAdminRole({ uid: 'u1', role: 'x;DROP' }, ctx('super_admin')), 'invalid-argument'); await rejects(ex.setAdminRole({}, ctx('super_admin')), 'invalid-argument'); });
  await t('removeAdminRole: super_admin فقط ولا يحذف نفسه', async () => { await rejects(ex.removeAdminRole({ uid: 'u1' }, ctx('support')), 'permission-denied'); await rejects(ex.removeAdminRole({ uid: 'caller' }, ctx('super_admin')), 'failed-precondition'); assert.ok((await ex.removeAdminRole({ uid: 'u1' }, ctx('super_admin'))).success); });
  await t('cleanupUserOnDelete: أرشفة فقط، صفر عمليات حذف، وتُعلَّم الوثائق', async () => { calls.del = 0; calls.set.length = 0; await ex.cleanupUserOnDelete({ uid: 'u9', email: 'z@z.z' }); assert.strictEqual(calls.del, 0); assert.ok(calls.set.length >= 3 && calls.set.every(o => o[0] === 'set' && o[2].user_deleted === true)); });
  console.log(`\n${n}/5 passed`);
})();
