const state = {
  shop: localStorage.getItem("vittoShop") || "vittostore.myshopify.com",
  currentTab: "home",
  overview: null,
  products: [],
  orders: [],
  campaigns: [],
  channels: [],
  carts: [],
  cartStats: null,
};
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function money(v) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));
}
function setStatus(server, oauth) {
  $("#status-server").textContent = `Servidor: ${server}`;
  $("#status-server").className = `pill ${server === "online" ? "ok" : "warn"}`;
  const oauthClass = oauth === "connected" ? "ok" : "warn";
  const oauthText = oauth === "connected" ? "OAuth conectado" : "Sin sesion OAuth";
  $("#status-oauth").textContent = oauthText;
  $("#status-oauth").className = `pill ${oauthClass}`;
  $("#status-shop").textContent = `Tienda: ${state.shop}`;
}
async function api(path, options = {}) {
  const r = await fetch(path, options);
  const contentType = r.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await r.json() : await r.text();
  if (!r.ok) {
    const message = body && body.error ? body.error : `Error HTTP ${r.status}`;
    throw new Error(message);
  }
  return body;
}
function toast(msg, isError = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = isError ? "#ffc6d2" : "#b8e8d7";
  el.style.background = isError ? "#fff1f4" : "#ecfbf5";
  el.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.style.display = "none";
  }, 2300);
}
function renderOverview() {
  if (!state.overview) return;
  const { kpis, alerts, status } = state.overview;
  setStatus(status.server, status.oauth);
  $("#kpi-orders").textContent = kpis.ordersToday;
  $("#kpi-products").textContent = kpis.productsActive;
  $("#kpi-revenue").textContent = money(kpis.revenueToday);
  $("#kpi-stock").textContent = kpis.lowStock;
  const campaignAlerts = state.campaigns
    .flatMap((c) => (c.alerts || []).map((a) => ({ ...a, description: `${c.name}: ${a.description}` })))
    .slice(0, 2);
  const allAlerts = [...alerts, ...campaignAlerts].slice(0, 4);
  const alertBox = $("#alerts");
  alertBox.innerHTML = allAlerts
    .map(
      (a) => `
      <article class="alert ${a.type === "warn" ? "warning" : a.type}">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.description}</div>
      </article>
    `
    )
    .join("");
}
function renderProducts() {
  const box = $("#products-list");
  if (!box) return;
  if (!state.products.length) {
    box.innerHTML = '<div class="item-sub">Sin productos para mostrar.</div>';
    return;
  }
  box.innerHTML = state.products
    .map((p) => {
      const v = (p.variants && p.variants[0]) || {};
      return `
        <article class="item">
          <div class="item-title">${p.title}</div>
          <div class="item-sub">Precio: ${money(v.price)} · Stock: ${v.inventory_quantity ?? "-"}</div>
        </article>
      `;
    })
    .join("");
}
function renderOrders() {
  const box = $("#orders-list");
  if (!box) return;
  if (!state.orders.length) {
    box.innerHTML = '<div class="item-sub">Sin ordenes para mostrar.</div>';
    return;
  }
  box.innerHTML = state.orders
    .map(
      (o) => `
      <article class="item">
        <div class="item-title">Orden #${o.order_number}</div>
        <div class="item-sub">${money(o.current_total_price)} · ${o.financial_status} · ${o.fulfillment_status || "unfulfilled"}</div>
        <div class="item-actions">
          <button class="btn-lite" data-close-order="${o.id}">Cerrar</button>
        </div>
      </article>
    `
    )
    .join("");
  $$('[data-close-order]').forEach((btn) => {
    btn.addEventListener("click", () => closeOrder(btn.dataset.closeOrder));
  });
}
function renderCampaigns() {
  const box = $("#campaigns-list");
  if (!box) return;
  if (!state.campaigns.length) {
    box.innerHTML = '<div class="item-sub">Sin campanas aun. Crea la primera arriba.</div>';
    return;
  }
  box.innerHTML = state.campaigns
    .map((c) => {
      const ctr = c.metrics && c.metrics.impressions > 0
        ? ((c.metrics.clicks / c.metrics.impressions) * 100).toFixed(2)
        : "0.00";
      const roas = c.metrics && c.metrics.spend > 0
        ? (c.metrics.revenue / c.metrics.spend).toFixed(2)
        : "0.00";
      const synced = c.externalId
        ? `<span class="pill ok">Sincronizado ${c.channel.toUpperCase()}</span>`
        : `<button class="btn-lite" data-sync-campaign="${c.id}">Sincronizar canal</button>`;
      return `
        <article class="item">
          <div class="item-title">${c.name}</div>
          <div class="item-sub">${c.channel.toUpperCase()} · Obj: ${c.objective} · Presupuesto: ${money(c.budgetCurrent)}</div>
          <div class="item-sub">CTR: ${ctr}% · ROAS: ${roas}</div>
          <div class="item-actions">
            <button class="btn-lite" data-optimize-campaign="${c.id}">Optimizar</button>
            <button class="btn-lite" data-abtest-campaign="${c.id}">A/B test</button>
            ${synced}
            ${c.externalId ? `<button class="btn-lite" data-metrics-campaign="${c.id}">Metricas reales</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
  $$('[data-optimize-campaign]').forEach((btn) => {
    btn.addEventListener("click", () => optimizeCampaign(btn.dataset.optimizeCampaign));
  });
  $$('[data-abtest-campaign]').forEach((btn) => {
    btn.addEventListener("click", () => abTestCampaign(btn.dataset.abtestCampaign));
  });
  $$('[data-sync-campaign]').forEach((btn) => {
    btn.addEventListener("click", () => syncCampaign(btn.dataset.syncCampaign));
  });
  $$('[data-metrics-campaign]').forEach((btn) => {
    btn.addEventListener("click", () => fetchCampaignMetrics(btn.dataset.metricsCampaign));
  });
}
function renderChannels() {
  const box = $("#channels-list");
  if (!box) return;
  if (!state.channels.length) {
    box.innerHTML = '<div class="item-sub">Sin canales conectados.</div>';
    return;
  }
  box.innerHTML = state.channels
    .map((ch) => `
      <article class="item">
        <div class="item-title">${ch.channel.toUpperCase()}</div>
        <div class="item-sub">Cuenta: ${ch.accountId} · Conectado: ${new Date(ch.connectedAt).toLocaleDateString("es-CL")}</div>
        <div class="item-actions">
          <button class="btn-lite" data-disconnect="${ch.channel}">Desconectar</button>
        </div>
      </article>
    `)
    .join("");
  $$('[data-disconnect]').forEach((btn) => {
    btn.addEventListener("click", () => disconnectChannel(btn.dataset.disconnect));
  });
}
function renderCartRecovery() {
  const stats = state.cartStats;
  if (stats) {
    const tot = $("#cr-total"); if (tot) tot.textContent = stats.total;
    const rec = $("#cr-recovered"); if (rec) rec.textContent = stats.recovered;
    const rate = $("#cr-rate"); if (rate) rate.textContent = stats.recoveryRate;
  }
  const box = $("#carts-list");
  if (!box) return;
  if (!state.carts.length) {
    box.innerHTML = '<div class="item-sub">Sin carritos abandonados.</div>';
    return;
  }
  box.innerHTML = state.carts.slice(0, 10)
    .map((c) => `
      <article class="item">
        <div class="item-title">${c.email || c.phone || "Anonimo"} · ${c.currency} ${parseFloat(c.totalPrice).toLocaleString("es-CL")}</div>
        <div class="item-sub">${c.lineItemsCount} item(s) · Estado: <strong>${c.state}</strong></div>
        <div class="item-actions">
          ${c.state !== "recovered" && c.state !== "expired"
            ? `<button class="btn-lite" data-trigger-cart="${c.id}">Disparar recovery</button>`
            : ""}
          ${c.state !== "recovered"
            ? `<button class="btn-lite" data-recover-cart="${c.id}">Marcar recuperado</button>`
            : '<span class="pill ok">Recuperado</span>'}
        </div>
      </article>
    `)
    .join("");
  $$('[data-trigger-cart]').forEach((btn) => {
    btn.addEventListener("click", () => triggerCartRecovery(btn.dataset.triggerCart));
  });
  $$('[data-recover-cart]').forEach((btn) => {
    btn.addEventListener("click", () => markCartRecovered(btn.dataset.recoverCart));
  });
}
function setTab(tab) {
  state.currentTab = tab;
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const target = $(`#screen-${tab}`);
  if (target) target.classList.add("active");
  $$(".nav-btn").forEach((n) => n.classList.remove("active"));
  const activeBtn = $(`.nav-btn[data-tab='${tab}']`);
  if (activeBtn) activeBtn.classList.add("active");
}
async function closeOrder(id) {
  try {
    await api(`/dashboard/quick-actions/orders/${id}/close?shop=${encodeURIComponent(state.shop)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    toast("Orden cerrada");
    await loadOrders();
  } catch (e) {
    toast(e.message, true);
  }
}
async function optimizeCampaign(id) {
  try {
    const data = await api(`/campaigns/${id}/optimize?shop=${encodeURIComponent(state.shop)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = (data.actions || ["Optimizado"]).join(" ");
    toast(text);
    await loadCampaigns();
    renderOverview();
  } catch (e) {
    toast(e.message, true);
  }
}
async function abTestCampaign(id) {
  try {
    const data = await api(`/campaigns/${id}/ab-test?shop=${encodeURIComponent(state.shop)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    toast(data.result?.message || "A/B test ejecutado");
    await loadCampaigns();
    renderOverview();
  } catch (e) {
    toast(e.message, true);
  }
}
async function loadOverview() {
  try {
    const data = await api(`/dashboard/overview?shop=${encodeURIComponent(state.shop)}`);
    state.overview = data;
    renderOverview();
  } catch (e) {
    setStatus("online", "disconnected");
    $("#alerts").innerHTML = `<article class="alert warning"><div class="alert-title">Falta conexion OAuth</div><div class="alert-desc">${e.message}</div></article>`;
  }
}
async function loadProducts() {
  try {
    const data = await api(`/dashboard/products?shop=${encodeURIComponent(state.shop)}`);
    state.products = data.items || [];
    renderProducts();
  } catch (e) {
    $("#products-list").innerHTML = `<div class='item-sub'>${e.message}</div>`;
  }
}
async function loadOrders() {
  try {
    const data = await api(`/dashboard/orders?shop=${encodeURIComponent(state.shop)}`);
    state.orders = data.items || [];
    renderOrders();
  } catch (e) {
    $("#orders-list").innerHTML = `<div class='item-sub'>${e.message}</div>`;
  }
}
async function loadCampaigns() {
  try {
    const data = await api(`/campaigns?shop=${encodeURIComponent(state.shop)}`);
    state.campaigns = data.items || [];
    renderCampaigns();
  } catch (e) {
    const box = $("#campaigns-list");
    if (box) box.innerHTML = `<div class='item-sub'>${e.message}</div>`;
  }
}
async function loadChannels() {
  try {
    const data = await api(`/channels?shop=${encodeURIComponent(state.shop)}`);
    state.channels = data.items || [];
    renderChannels();
  } catch (e) {
    state.channels = [];
    renderChannels();
  }
}
async function loadCartRecovery() {
  try {
    const [items, stats] = await Promise.all([
      api(`/cart-recovery?shop=${encodeURIComponent(state.shop)}`),
      api(`/cart-recovery/stats?shop=${encodeURIComponent(state.shop)}`),
    ]);
    state.carts = items.items || [];
    state.cartStats = stats;
    renderCartRecovery();
  } catch (e) {
    state.carts = [];
    renderCartRecovery();
  }
}
async function createQuickProduct(ev) {
  ev.preventDefault();
  const title = $("#quick-title").value.trim();
  const price = $("#quick-price").value;
  const inventory = $("#quick-stock").value;
  if (!title) return toast("Ingresa un titulo", true);
  try {
    await api(`/dashboard/quick-actions/create-product?shop=${encodeURIComponent(state.shop)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, price, inventory }),
    });
    toast("Producto creado en borrador");
    ev.target.reset();
    await Promise.all([loadOverview(), loadProducts()]);
    setTab("products");
  } catch (e) {
    toast(e.message, true);
  }
}
async function createCampaign(ev) {
  ev.preventDefault();
  const name = $("#camp-name").value.trim();
  const channel = $("#camp-channel").value;
  const objective = $("#camp-objective").value;
  const budgetDaily = Number($("#camp-budget").value || 0);
  if (!name) return toast("Ingresa nombre de campana", true);
  if (!budgetDaily || budgetDaily < 2500) return toast("Presupuesto minimo 2500", true);
  try {
    await api(`/campaigns?shop=${encodeURIComponent(state.shop)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, channel, objective, budgetDaily }),
    });
    ev.target.reset();
    toast("Campana creada");
    await loadCampaigns();
    renderOverview();
    setTab("campaigns");
  } catch (e) {
    toast(e.message, true);
  }
}
async function syncCampaign(campaignId) {
  try {
    const data = await api(`/channels/sync-campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: state.shop, campaignId }),
    });
    toast(`Sincronizado! ID externo: ${data.externalId}`);
    await loadCampaigns();
  } catch (e) {
    toast(e.message, true);
  }
}
async function fetchCampaignMetrics(campaignId) {
  try {
    const data = await api(
      `/channels/metrics?shop=${encodeURIComponent(state.shop)}&campaignId=${campaignId}`
    );
    toast(`Metricas actualizadas: ${data.metrics.impressions} impresiones`);
    await loadCampaigns();
  } catch (e) {
    toast(e.message, true);
  }
}
async function connectChannel(ev) {
  ev.preventDefault();
  const channel = $("#ch-channel").value;
  const accountId = $("#ch-account").value.trim();
  const accessToken = $("#ch-token").value.trim();
  if (!accountId || !accessToken) return toast("Completa todos los campos del canal", true);
  try {
    await api(`/channels/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: state.shop, channel, accountId, accessToken }),
    });
    ev.target.reset();
    toast(`Canal ${channel.toUpperCase()} conectado`);
    await loadChannels();
  } catch (e) {
    toast(e.message, true);
  }
}
async function disconnectChannel(channel) {
  if (!confirm(`Desconectar ${channel.toUpperCase()}?`)) return;
  try {
    await api(`/channels/${channel}?shop=${encodeURIComponent(state.shop)}`, { method: "DELETE" });
    toast(`Canal ${channel.toUpperCase()} desconectado`);
    await loadChannels();
  } catch (e) {
    toast(e.message, true);
  }
}
async function triggerCartRecovery(id) {
  try {
    await api(`/cart-recovery/${id}/trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    toast("Secuencia de recovery disparada");
    await loadCartRecovery();
  } catch (e) {
    toast(e.message, true);
  }
}
async function markCartRecovered(id) {
  try {
    await api(`/cart-recovery/${id}/recovered`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    toast("Carrito marcado como recuperado");
    await loadCartRecovery();
  } catch (e) {
    toast(e.message, true);
  }
}
function bind() {
  $("#shop-input").value = state.shop;
  $("#shop-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const value = $("#shop-input").value.trim();
    if (!value) return;
    state.shop = value;
    localStorage.setItem("vittoShop", value);
    $("#status-shop").textContent = `Tienda: ${state.shop}`;
    await Promise.all([loadOverview(), loadProducts(), loadOrders(), loadCampaigns(), loadChannels(), loadCartRecovery()]);
  });
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  $("#refresh-btn").addEventListener("click", async () => {
    await Promise.all([loadOverview(), loadProducts(), loadOrders(), loadCampaigns(), loadChannels(), loadCartRecovery()]);
    toast("Panel actualizado");
  });
  $("#quick-product-form").addEventListener("submit", createQuickProduct);
  $("#campaign-form").addEventListener("submit", createCampaign);
  const chForm = $("#channel-form");
  if (chForm) chForm.addEventListener("submit", connectChannel);
}
async function init() {
  bind();
  setTab("home");
  setStatus("online", "disconnected");
  await Promise.all([loadOverview(), loadProducts(), loadOrders(), loadCampaigns(), loadChannels(), loadCartRecovery()]);
}
// Tour visual básico
const tourSteps = [
  {
    html: '<strong>Bienvenido a VittoStore</strong><br>Conecta tu tienda Shopify aquí para comenzar.',
  },
  {
    html: 'Panel de KPIs y alertas de negocio. Aquí ves el resumen de tu tienda.',
  },
  {
    html: 'Crea productos rápidamente desde la pestaña Productos.',
  },
  {
    html: 'Gestiona campañas publicitarias y conecta canales.',
  },
  {
    html: 'Consulta órdenes y ventas en la pestaña Órdenes.',
  },
  {
    html: 'Administra tu cuenta y verifica la conexión en Cuenta.',
  },
];
let tourIndex = 0;
function showTourStep(idx) {
  const modal = document.getElementById('tour-modal');
  const content = document.getElementById('tour-content');
  modal.style.display = 'flex';
  content.innerHTML = tourSteps[idx].html;
  document.getElementById('tour-prev').disabled = idx === 0;
  document.getElementById('tour-next').textContent = idx === tourSteps.length - 1 ? 'Finalizar' : 'Siguiente';
}
function closeTour() {
  document.getElementById('tour-modal').style.display = 'none';
}
function setupTour() {
  document.getElementById('tour-btn').addEventListener('click', () => {
    tourIndex = 0;
    showTourStep(tourIndex);
  });
  document.getElementById('tour-close').addEventListener('click', closeTour);
  document.getElementById('tour-prev').addEventListener('click', () => {
    if (tourIndex > 0) {
      tourIndex--;
      showTourStep(tourIndex);
    }
  });
  document.getElementById('tour-next').addEventListener('click', () => {
    if (tourIndex < tourSteps.length - 1) {
      tourIndex++;
      showTourStep(tourIndex);
    } else {
      closeTour();
    }
  });
}

function setupAccessibility() {
  // Mejoras mínimas: navegación por tab, roles y aria-label ya agregados en index.html
  // Puedes expandir aquí si lo deseas
}

window.addEventListener('DOMContentLoaded', () => {
  setupTour();
  setupAccessibility();
});

init();
