// JSON-file storage for accounts/credits, same approach the original app used for usage tracking.
//
// HONEST LIMITATION: on free hosting tiers (Render, Railway free plans) the filesystem
// can be wiped on redeploy or when the service sleeps and wakes up, which would reset
// everyone's accounts. This is fine to launch and test with, but swap this for a real
// database (Supabase's free Postgres tier is a good next step) before relying on it long-term.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.json');

function emptyDB() {
  return { users: {}, pendingSignups: {}, dailyUsage: {}, checkoutSessions: {} };
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return emptyDB();
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function init() {
  if (!fs.existsSync(DB_PATH)) writeDB(emptyDB());
}

module.exports = { readDB, writeDB, init };
