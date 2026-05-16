/**
 * conversationSession.js
 * Gestor de contexto conversacional por número de teléfono.
 * Persiste en archivo JSON (reemplazable por Redis en producción).
 * TTL: 24 horas de inactividad limpia la sesión.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../../config/conversation-sessions.json");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

// ─── Persistencia ─────────────────────────────────────────────────────────────

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")); }
  catch { return {}; }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function purgeExpired(store) {
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(store)) {
    if (now - new Date(store[key].lastActivityAt).getTime() > SESSION_TTL_MS) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene o crea la sesión para un número de teléfono.
 * @param {string} phone — ej: "56912345678"
 * @returns {object} session
 */
function getSession(phone) {
  const store = readStore();
  purgeExpired(store);

  if (!store[phone]) {
    store[phone] = createEmptySession(phone);
    writeStore(store);
  }
  return store[phone];
}

/**
 * Actualiza campos de la sesión y bump de lastActivityAt.
 * @param {string} phone
 * @param {object} updates
 */
function updateSession(phone, updates) {
  const store = readStore();
  const existing = store[phone] || createEmptySession(phone);
  store[phone] = {
    ...existing,
    ...updates,
    lastActivityAt: new Date().toISOString(),
  };
  writeStore(store);
  return store[phone];
}

/**
 * Registra un mensaje entrante en el historial y actualiza contadores.
 * @param {string} phone
 * @param {string} text
 * @param {{ intent: string, action: string, confidence: number }} intentResult
 */
function recordIncoming(phone, text, intentResult) {
  const session = getSession(phone);
  const message = {
    direction: "in",
    text,
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    at: new Date().toISOString(),
  };
  return updateSession(phone, {
    messageCount: (session.messageCount || 0) + 1,
    lastIntent: intentResult.intent,
    lastAction: intentResult.action,
    lastConfidence: intentResult.confidence,
    history: [...(session.history || []).slice(-19), message], // mantiene últimos 20
  });
}

/**
 * Registra un mensaje saliente.
 * @param {string} phone
 * @param {string} text
 * @param {string} templateName — nombre del template usado (para A/B testing)
 */
function recordOutgoing(phone, text, templateName = "custom") {
  const session = getSession(phone);
  const message = {
    direction: "out",
    text,
    template: templateName,
    at: new Date().toISOString(),
  };
  return updateSession(phone, {
    outgoingCount: (session.outgoingCount || 0) + 1,
    history: [...(session.history || []).slice(-19), message],
  });
}

/**
 * Marca la sesión con flag de escalamiento a humano.
 */
function flagForHuman(phone, reason = "manual") {
  return updateSession(phone, {
    escalationFlag: true,
    escalationReason: reason,
    escalatedAt: new Date().toISOString(),
  });
}

/**
 * El humano tomó control — pausa el bot.
 */
function enableHumanTakeover(phone) {
  return updateSession(phone, { humanTakeover: true, humanTakeoverAt: new Date().toISOString() });
}

/**
 * El humano devuelve control al bot.
 */
function releaseHumanTakeover(phone) {
  return updateSession(phone, { humanTakeover: false, escalationFlag: false });
}

/**
 * ¿Está el humano en control actualmente?
 */
function isHumanControlled(phone) {
  const store = readStore();
  return !!(store[phone] && store[phone].humanTakeover);
}

/**
 * Destruye la sesión (opt-out, compra completada, expirada manualmente).
 */
function destroySession(phone) {
  const store = readStore();
  delete store[phone];
  writeStore(store);
}

/**
 * Lista sesiones que necesitan atención humana.
 */
function getPendingEscalations() {
  const store = readStore();
  purgeExpired(store);
  return Object.values(store)
    .filter((s) => s.escalationFlag && !s.humanTakeover)
    .sort((a, b) => new Date(b.escalatedAt) - new Date(a.escalatedAt));
}

// ─── Fábrica de sesión vacía ──────────────────────────────────────────────────

function createEmptySession(phone) {
  return {
    phone,
    messageCount: 0,
    outgoingCount: 0,
    lastIntent: null,
    lastAction: null,
    lastConfidence: null,
    escalationFlag: false,
    escalationReason: null,
    escalatedAt: null,
    humanTakeover: false,
    humanTakeoverAt: null,
    cartId: null,
    offeredDiscount: false,
    offeredPaymentPlan: false,
    history: [],
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}

module.exports = {
  getSession,
  updateSession,
  recordIncoming,
  recordOutgoing,
  flagForHuman,
  enableHumanTakeover,
  releaseHumanTakeover,
  isHumanControlled,
  destroySession,
  getPendingEscalations,
};
