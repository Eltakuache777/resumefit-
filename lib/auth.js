const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'rf_session';
const SESSION_DAYS = 30;

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function issueSession(res, userId) {
  const token = jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  const isHttps = (process.env.PUBLIC_URL || '').startsWith('https');
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function readSessionUserId(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.uid;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const uid = readSessionUserId(req);
  if (!uid) return res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'Please sign in to continue.' });
  req.userId = uid;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateCode,
  issueSession,
  clearSession,
  readSessionUserId,
  requireAuth
};
