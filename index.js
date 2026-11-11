// Firebase Cloud Functions for LAMHA
// Deploy: firebase deploy --only functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// ==================== CUSTOM CLAIMS ====================
// الإدارة المالية كلها في Cloudflare Worker؛ هنا أدوار الإدارة والتدقيق ودورة حياة المستخدم فقط.

const isSuper = ctx => !!(ctx.auth && ctx.auth.token && ctx.auth.token.role === 'super_admin');
const ROLE_RE = /^[a-z_]{3,32}$/;

/**
 * Promote user to admin with Custom Claims (super_admin only)
 */
exports.setAdminRole = functions.https.onCall(async (data, context) => {
  if (!isSuper(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Only super_admin can do this');
  }

  const { uid, role = 'super_admin' } = data || {};

  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }
  if (typeof role !== 'string' || !ROLE_RE.test(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'invalid role');
  }

  try {
    await auth.setCustomUserClaims(uid, {
      admin: true,
      role,
      promoted_at: new Date().toISOString()
    });

    await db.collection('admins').doc(uid).set({
      uid,
      email: (await auth.getUser(uid)).email,
      name: data.name || 'Admin',
      role,
      created_at: new Date(),
      promoted_by: context.auth.uid
    }, { merge: true });

    return { success: true, message: `User promoted to ${role}`, uid };
  } catch (error) {
    console.error('setAdminRole error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Remove admin role (super_admin only)
 */
exports.removeAdminRole = functions.https.onCall(async (data, context) => {
  if (!isSuper(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Only super_admin can do this');
  }

  const { uid } = data || {};
  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot remove your own role');
  }

  try {
    await auth.setCustomUserClaims(uid, null);
    await db.collection('admins').doc(uid).delete();
    return { success: true, message: 'Admin role removed', uid };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Log settings changes for audit trail
 * Called whenever settings/main is updated
 */
exports.logSettingsAudit = functions.firestore
  .document('settings/main')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      
      const changes = {};
      
      // Compare before and after
      for (const key in after) {
        if (before[key] !== after[key]) {
          changes[key] = {
            before: before[key],
            after: after[key]
          };
        }
      }
      
      // Log to audit collection
      await db.collection('audit_logs').add({
        type: 'settings_update',
        timestamp: new Date(),
        changes,
        ip: context.sourceIp || 'unknown'
      });
      
      console.log('Settings audit logged:', changes);
      return { success: true };
    } catch (error) {
      console.error('Audit logging error:', error);
      return { error: error.message };
    }
  });

// ==================== CLEANUP JOBS ====================

// ==================== USER LIFECYCLE ====================

/**
 * On user creation: initialize user document
 */
exports.initializeUserOnSignup = functions.auth.user().onCreate(async (user) => {
  try {
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      display_name: user.displayName || 'User',
      wallet_balance: 0,
      created_at: new Date(),
      last_login: new Date(),
      banned: false,
      vip_status: null
    }, { merge: true });

    console.log(`User ${user.uid} initialized`);
    return { success: true };
  } catch (error) {
    console.error('initializeUserOnSignup error:', error);
  }
});

/**
 * On user deletion: archive only. Financial records are never deleted.
 */
exports.cleanupUserOnDelete = functions.auth.user().onDelete(async (user) => {
  try {
    const uid = user.uid;
    const now = new Date();
    const mark = { user_deleted: true, user_deleted_at: now };
    const refs = [db.collection('users').doc(uid)];

    for (const col of ['manual_card_orders', 'tickets']) {
      const snap = await db.collection(col).where('uid', '==', uid).get();
      snap.docs.forEach(doc => refs.push(doc.ref));
    }

    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(ref => batch.set(ref, mark, { merge: true }));
      await batch.commit();
    }

    await db.collection('deleted_users').doc(uid).set({
      uid,
      email: user.email || '',
      deleted_at: now,
      archived_docs: refs.length
    }, { merge: true });

    console.log(`User ${uid} archived (${refs.length} docs)`);
    return { success: true };
  } catch (error) {
    console.error('cleanupUserOnDelete error:', error);
  }
});
