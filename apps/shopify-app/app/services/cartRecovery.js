/**
 * cartRecovery.js — service
 *
 * State machine for abandoned cart recovery sequences.
 * States: pending → notified_1h → notified_24h → recovered | expired
 *
 * Scheduler polls every 60 seconds and:
 *   - pending carts idle >30 min   → send first recovery message (1h mark)
 *   - notified_1h carts idle >24h  → send second recovery message (24h mark)
 *   - notified_24h carts idle >72h → mark expired
 */
const fs = require("fs");
const path = require("path");
const metaWhatsapp = require("./metaWhatsapp");

const STORE_FILE = path.join(__dirname, "../../config/abandoned-carts.json");
const POLL_INTERVAL_MS = 60_000; // 1 minute

// ── persistence ───────────────────────────────────────────────────────────────

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

// ── CRUD ──────────────────────────────────────────────────────────────────────

function upsertCart(shopifyCheckout) {
  const store = readStore();
  const id = String(shopifyCheckout.id);
  const shop = shopifyCheckout.shop || "unknown";
  const existing = store[id];
  if (existing && existing.state === "recovered") return existing; // don't re-open recovered

  store[id] = {
    id,
    shop,
    email: shopifyCheckout.email || null,
    phone: shopifyCheckout.phone || null,
    totalPrice: shopifyCheckout.total_price || "0",
    currency: shopifyCheckout.currency || "CLP",
    lineItemsCount: (shopifyCheckout.line_items || []).length,
    checkoutUrl: shopifyCheckout.abandoned_checkout_url || null,
    abandonedAt: shopifyCheckout.abandoned_checkout_url
      ? (shopifyCheckout.updated_at || new Date().toISOString())
      : new Date().toISOString(),
    state: existing ? existing.state : "pending",
    notificationsSent: existing ? existing.notificationsSent : [],
    recoveredAt: existing ? existing.recoveredAt : null,
    discountCode: existing ? existing.discountCode : null,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store[id];
}

function listCarts(shop) {
  const store = readStore();
  return Object.values(store)
    .filter((c) => c.shop === shop)
    .sort((a, b) => new Date(b.abandonedAt) - new Date(a.abandonedAt));
}

function getCart(id) {
  return readStore()[String(id)] || null;
}

function updateCart(id, updates) {
  const store = readStore();
  if (!store[String(id)]) return null;
  store[String(id)] = { ...store[String(id)], ...updates, updatedAt: new Date().toISOString() };
  writeStore(store);
  return store[String(id)];
}

function markRecovered(id) {
  return updateCart(id, { state: "recovered", recoveredAt: new Date().toISOString() });
}

// ── notification stubs ────────────────────────────────────────────────────────
// ── notifications ────────────────────────────────────────────────────────────


async function sendRecoveryNotification(cart, sequence) {
  // sequence: 1 = first nudge (30min), 2 = second nudge (24h)
  const discountCode = sequence === 2 ? generateDiscount(cart) : null;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;
  let attempt = 0;
  let lastError = null;

  // WhatsApp requires a phone number
  if (cart.phone) {
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        if (sequence === 1) {
          await metaWhatsapp.sendCartRecovery1(
            cart.phone,
            null, // productName: no disponible en checkout simplificado
            cart.checkoutUrl,
            `${cart.currency} ${cart.totalPrice}`
          );
        } else {
          await metaWhatsapp.sendCartRecovery2(
            cart.phone,
            discountCode,
            cart.checkoutUrl,
            `${cart.currency} ${cart.totalPrice}`
          );
        }
        console.log(`[CartRecovery] WhatsApp seq ${sequence} → cart ${cart.id} (${cart.phone}) intento ${attempt}`);
        // Registrar intento exitoso
        return { sent: true, channel: "whatsapp", discountCode, attempts: attempt, lastError: null };
      } catch (err) {
        lastError = err.message;
        console.error(`[CartRecovery] WhatsApp send failed (intento ${attempt}) para cart ${cart.id}: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    // Registrar intento fallido tras reintentos
    return { sent: false, channel: "whatsapp", error: lastError, discountCode, attempts: attempt };
  }

  // Fallback: solo log si no hay teléfono (email no implementado todavía)
  console.log(`[CartRecovery] No phone for cart ${cart.id} (${cart.email}) — skip seq ${sequence}`);
  return { sent: false, channel: "none", reason: "no_phone", discountCode, attempts: 0 };
}

function generateDiscount(cart) {
  const code = `VITTO${Date.now().toString(36).toUpperCase().slice(-6)}`;
  updateCart(cart.id, { discountCode: code });
  return code;
}

// ── stats ─────────────────────────────────────────────────────────────────────

function getStats(shop) {
  const all = listCarts(shop);
  const total = all.length;
  const recovered = all.filter((c) => c.state === "recovered").length;
  const pending = all.filter((c) => c.state === "pending").length;
  const notified = all.filter((c) => ["notified_1h", "notified_24h"].includes(c.state)).length;
  const expired = all.filter((c) => c.state === "expired").length;
  const recoveryRate = total > 0 ? ((recovered / total) * 100).toFixed(1) : "0.0";
  const lostRevenue = all
    .filter((c) => c.state !== "recovered")
    .reduce((sum, c) => sum + parseFloat(c.totalPrice || 0), 0);
  return { total, recovered, pending, notified, expired, recoveryRate: `${recoveryRate}%`, lostRevenue };
}

// ── scheduler ─────────────────────────────────────────────────────────────────

let schedulerStarted = false;

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[CartRecovery] Scheduler started");

  setInterval(() => {
    (async () => {
      try {
        const store = readStore();
        const now = Date.now();
        const carts = Object.values(store);

        for (const cart of carts) {
          const idle = now - new Date(cart.abandonedAt).getTime();
          const MIN30 = 30 * 60_000;
          const H24 = 24 * 60 * 60_000;
          const H72 = 72 * 60 * 60_000;

          if (cart.state === "pending" && idle >= MIN30) {
            const result = await sendRecoveryNotification(cart, 1);
            updateCart(cart.id, {
              state: "notified_1h",
              notificationsSent: [
                ...cart.notificationsSent,
                {
                  seq: 1,
                  sentAt: new Date().toISOString(),
                  attempts: result.attempts,
                  success: result.sent,
                  error: result.error || null,
                  channel: result.channel,
                  discountCode: result.discountCode || null,
                },
              ],
            });
          } else if (cart.state === "notified_1h" && idle >= H24) {
            const result = await sendRecoveryNotification(cart, 2);
            updateCart(cart.id, {
              state: "notified_24h",
              notificationsSent: [
                ...cart.notificationsSent,
                {
                  seq: 2,
                  sentAt: new Date().toISOString(),
                  attempts: result.attempts,
                  success: result.sent,
                  error: result.error || null,
                  channel: result.channel,
                  discountCode: result.discountCode || null,
                },
              ],
            });
          } else if (cart.state === "notified_24h" && idle >= H72) {
            updateCart(cart.id, { state: "expired" });
          }
        }
      } catch (err) {
        console.error("[CartRecovery] Scheduler error:", err.message);
      }
    })();
  }, POLL_INTERVAL_MS);
}

module.exports = {
  upsertCart,
  listCarts,
  getCart,
  updateCart,
  markRecovered,
  getStats,
  startScheduler,
};
