const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(__dirname, "../../config/sessions");

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionPath(shop) {
  const safe = shop.replace(/[^a-zA-Z0-9.-]/g, "_");
  return path.join(SESSIONS_DIR, `${safe}.json`);
}

function saveSession(session) {
  ensureDir();
  fs.writeFileSync(sessionPath(session.shop), JSON.stringify(session, null, 2));
}


function loadSession(id) {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR);
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8");
    const session = JSON.parse(raw);
    if (session.id === id) {
      // Validar expiración
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        // Sesión expirada, eliminar
        deleteSession(id);
        return undefined;
      }
      return session;
    }
  }
  return undefined;
}

function deleteSession(id) {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR);
  for (const file of files) {
    const full = path.join(SESSIONS_DIR, file);
    const raw = fs.readFileSync(full, "utf8");
    const session = JSON.parse(raw);
    if (session.id === id) {
      fs.unlinkSync(full);
      return true;
    }
  }
  return false;
}

module.exports = { saveSession, loadSession, deleteSession };
