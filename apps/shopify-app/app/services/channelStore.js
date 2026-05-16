/**
 * channelStore.js
 * File-based encrypted storage for ad channel credentials (Meta, Google, TikTok).
 * Credentials are stored AES-256-GCM encrypted, keyed by shop + channel.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "../../config/channels.json");
const ALGO = "aes-256-gcm";

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length < 64) throw new Error("ENCRYPTION_KEY invalida o ausente");
  return Buffer.from(hex.slice(0, 64), "hex");
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(":");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Save channel credentials for a shop.
 * @param {string} shop
 * @param {string} channel  - "meta" | "google" | "tiktok"
 * @param {object} creds    - { accessToken, accountId, ...extra }
 */

function saveChannel(shop, channel, creds) {
  if (!shop || typeof shop !== 'string') throw new Error('[channelStore] shop requerido o inválido');
  if (!channel || typeof channel !== 'string') throw new Error('[channelStore] channel requerido o inválido');
  if (!creds || typeof creds !== 'object' || !creds.accessToken || !creds.accountId) throw new Error('[channelStore] creds incompletos');
  const store = readStore();
  if (!store[shop]) store[shop] = {};
  store[shop][channel] = {
    channel,
    accountId: creds.accountId,
    encryptedToken: encrypt(creds.accessToken),
    connectedAt: new Date().toISOString(),
    extra: creds.extra || {},
  };
  writeStore(store);
  console.log(`[channelStore] Canal guardado: ${channel} para shop ${shop}`);
  return store[shop][channel];
}

/**
 * List channels connected for a shop (tokens redacted).
 */
function listChannels(shop) {
  const store = readStore();
  const channels = store[shop] || {};
  return Object.values(channels).map(({ encryptedToken: _t, ...rest }) => rest);
}

/**
 * Get credentials for a specific channel (decrypted).
 */
function getChannelCreds(shop, channel) {
  const store = readStore();
  const entry = (store[shop] || {})[channel];
  if (!entry) return null;
  return {
    channel: entry.channel,
    accountId: entry.accountId,
    accessToken: decrypt(entry.encryptedToken),
    extra: entry.extra || {},
  };
}

/**
 * Remove a channel connection.
 */

function removeChannel(shop, channel) {
  if (!shop || typeof shop !== 'string') throw new Error('[channelStore] shop requerido o inválido en remove');
  if (!channel || typeof channel !== 'string') throw new Error('[channelStore] channel requerido o inválido en remove');
  const store = readStore();
  if (store[shop]) delete store[shop][channel];
  writeStore(store);
  console.log(`[channelStore] Canal eliminado: ${channel} para shop ${shop}`);
}

module.exports = { saveChannel, listChannels, getChannelCreds, removeChannel };
