const { doubleCsrf } = require('csrf-csrf');

const isProduction = process.env.NODE_ENV === 'production';

const { doubleCsrfProtection: csrfMiddleware, generateToken } = doubleCsrf({
  getSecret: () => process.env.ENCRYPTION_KEY || 'default-secret-change-me',
  getSessionIdentifier: (req) =>
    (req.cookies && req.cookies['__Host-vitto-csrf-token']) ||
    (req.headers && req.headers['x-shopify-shop-domain']) ||
    req.ip ||
    'anonymous',
  cookieName: isProduction ? '__Host-vitto-csrf-token' : 'vitto-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Wrapper: omitir CSRF para webhooks (HMAC) y para tests
function doubleCsrfProtection(req, res, next) {
  // Webhooks Shopify: validados por HMAC, no por CSRF
  if (req.headers['x-shopify-hmac-sha256']) {
    return next();
  }
  // Tests: bypass para no requerir setup de cookies en supertest
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  return csrfMiddleware(req, res, next);
}

module.exports = { doubleCsrfProtection, generateToken };