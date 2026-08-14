const crypto = require('crypto');
const { readDB, writeDB } = require('./db');

// All functions below are declared `async` to match a future database-backed implementation,
// but internally do a synchronous read-modify-write with no `await` in between. Since Node.js
// is single-threaded, that means nothing else can interleave mid-operation, which is what keeps
// useCredit() and tryRecordFreeUse() safe against concurrent requests.

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getUserById(userId) {
  const db = readDB();
  return db.users[userId] || null;
}

async function getUserByEmail(email) {
  const db = readDB();
  const lower = email.toLowerCase();
  return Object.values(db.users).find((u) => u.email === lower) || null;
}

async function createUser(email, passwordHash, isAdmin) {
  const db = readDB();
  const id = crypto.randomUUID();
  const user = {
    id,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    is_admin: Boolean(isAdmin),
    free_access: false,
    credits: 0,
    created_at: new Date().toISOString()
  };
  db.users[id] = user;
  writeDB(db);
  return user;
}

async function updateUserPassword(userId, passwordHash) {
  const db = readDB();
  if (!db.users[userId]) return;
  db.users[userId].password_hash = passwordHash;
  writeDB(db);
}

async function updateUserEmail(userId, newEmail) {
  const db = readDB();
  if (!db.users[userId]) return;
  db.users[userId].email = newEmail.toLowerCase();
  writeDB(db);
}

async function setFreeAccess(email, freeAccess) {
  const db = readDB();
  const lower = email.toLowerCase();
  const user = Object.values(db.users).find((u) => u.email === lower);
  if (!user) return null;
  user.free_access = freeAccess;
  writeDB(db);
  return user;
}

async function listUsers() {
  const db = readDB();
  return Object.values(db.users)
    .map((u) => ({
      id: u.id,
      email: u.email,
      is_admin: u.is_admin,
      free_access: u.free_access,
      credits: u.credits,
      created_at: u.created_at
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// --- pending signups (email verification) ---

async function createPendingSignup(email, codeHash, expiresAt) {
  const db = readDB();
  db.pendingSignups[email.toLowerCase()] = {
    email: email.toLowerCase(),
    code_hash: codeHash,
    verified: false,
    attempts: 0,
    expires_at: expiresAt.toISOString(),
    last_sent_at: new Date().toISOString()
  };
  writeDB(db);
}

async function getPendingSignup(email) {
  const db = readDB();
  return db.pendingSignups[email.toLowerCase()] || null;
}

async function incrementPendingSignupAttempts(email) {
  const db = readDB();
  const pending = db.pendingSignups[email.toLowerCase()];
  if (!pending) return;
  pending.attempts += 1;
  writeDB(db);
}

async function markPendingSignupVerified(email) {
  const db = readDB();
  const pending = db.pendingSignups[email.toLowerCase()];
  if (!pending) return;
  pending.verified = true;
  writeDB(db);
}

async function deletePendingSignup(email) {
  const db = readDB();
  delete db.pendingSignups[email.toLowerCase()];
  writeDB(db);
}

// --- password resets (forgot password) ---

async function createPasswordReset(email, codeHash, expiresAt) {
  const db = readDB();
  db.passwordResets[email.toLowerCase()] = {
    email: email.toLowerCase(),
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt.toISOString(),
    last_sent_at: new Date().toISOString()
  };
  writeDB(db);
}

async function getPasswordReset(email) {
  const db = readDB();
  return db.passwordResets[email.toLowerCase()] || null;
}

async function incrementPasswordResetAttempts(email) {
  const db = readDB();
  const reset = db.passwordResets[email.toLowerCase()];
  if (!reset) return;
  reset.attempts += 1;
  writeDB(db);
}

async function deletePasswordReset(email) {
  const db = readDB();
  delete db.passwordResets[email.toLowerCase()];
  writeDB(db);
}

// --- daily free usage, keyed by user ---
// Atomic (no await between read and write): only succeeds, and only increments,
// if the user is still under freeLimit, so concurrent requests can't both slip through.

async function tryRecordFreeUse(userId, freeLimit) {
  const db = readDB();
  const key = `${userId}:${todayKey()}`;
  const current = db.dailyUsage[key] || 0;
  if (current >= freeLimit) return false;
  db.dailyUsage[key] = current + 1;
  writeDB(db);
  return true;
}

// Rollback for a reserved free use when the generation that consumed it fails.
async function undoFreeUse(userId) {
  const db = readDB();
  const key = `${userId}:${todayKey()}`;
  db.dailyUsage[key] = Math.max(0, (db.dailyUsage[key] || 0) - 1);
  writeDB(db);
}

// --- credits ---

async function getCredits(userId) {
  const db = readDB();
  const user = db.users[userId];
  return user ? user.credits : 0;
}

async function useCredit(userId) {
  const db = readDB();
  const user = db.users[userId];
  if (!user || user.credits <= 0) return false;
  user.credits -= 1;
  writeDB(db);
  return true;
}

async function addCredits(userId, credits) {
  const db = readDB();
  const user = db.users[userId];
  if (!user) return;
  user.credits += credits;
  writeDB(db);
}

// Idempotent: calling twice for the same Stripe session_id only grants credits once.
async function grantCreditsForSession(sessionId, userId, credits) {
  const db = readDB();
  if (db.checkoutSessions[sessionId]) return false;
  db.checkoutSessions[sessionId] = { userId, credits, createdAt: new Date().toISOString() };
  const user = db.users[userId];
  if (user) user.credits += credits;
  writeDB(db);
  return true;
}

module.exports = {
  getUserById,
  getUserByEmail,
  createUser,
  updateUserPassword,
  updateUserEmail,
  setFreeAccess,
  listUsers,
  createPendingSignup,
  getPendingSignup,
  incrementPendingSignupAttempts,
  markPendingSignupVerified,
  deletePendingSignup,
  createPasswordReset,
  getPasswordReset,
  incrementPasswordResetAttempts,
  deletePasswordReset,
  tryRecordFreeUse,
  undoFreeUse,
  getCredits,
  useCredit,
  addCredits,
  grantCreditsForSession
};
