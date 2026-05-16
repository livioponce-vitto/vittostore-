// middleware/authSession.js
const { loadSession } = require("../services/sessionStorage");
const { decryptToken } = require("../routes/auth");

module.exports = function authSession(req, res, next) {
  const shop = req.query.shop || req.body.shop;
  if (!shop) {
    return res.status(400).json({
      ok: false,
      error: "Falta parámetro shop",
      next: "Incluye ?shop=tu-tienda.myshopify.com en la petición.",
    });
  }

  const session = loadSession(`offline_${shop}`);

  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "No existe sesión para esta tienda.",
      next: `Instala la app primero en /auth?shop=${shop}`,
    });
  }

  // Verificar expiración explícita
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({
      ok: false,
      error: "La sesión ha expirado.",
      next: `Renueva la autenticación en /auth?shop=${shop}`,
    });
  }

  req.shop = shop;
  req.scope = session.scope;
  req.accessToken = session.isEncrypted
    ? decryptToken(session.accessToken)
    : session.accessToken;
  next();
};