const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "../../config/campaigns.json");

function ensureStore() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2));
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(FILE_PATH, "utf8");
  return JSON.parse(raw || "[]");
}

function writeAll(items) {
  ensureStore();
  fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2));
}

function listByShop(shop) {
  return readAll().filter((c) => c.shop === shop);
}

function createCampaign(campaign) {
  const all = readAll();
  all.unshift(campaign);
  writeAll(all);
  return campaign;
}

function updateCampaign(id, shop, patch) {
  const all = readAll();
  const index = all.findIndex((c) => c.id === id && c.shop === shop);
  if (index < 0) return null;
  all[index] = { ...all[index], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[index];
}

function findCampaign(id, shop) {
  return readAll().find((c) => c.id === id && c.shop === shop) || null;
}

module.exports = {
  listByShop,
  createCampaign,
  updateCampaign,
  findCampaign,
};
