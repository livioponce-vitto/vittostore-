# Ejemplos de Refresh Tokens e Integración con OAuth

## 1. Implementación básica de Refresh Token (JWT)

```js
// Al autenticar:
const jwt = require('jsonwebtoken');
const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
// Guarda refreshToken en BD o memoria segura

// Endpoint para renovar accessToken:
app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const newAccessToken = jwt.sign({ userId: payload.userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token inválido' });
  }
});
```

## 2. Integración básica con OAuth 2.0 (ejemplo con Passport.js y Google)

```js
// Instalación: npm install passport passport-google-oauth20
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  // Aquí puedes buscar o crear el usuario en tu BD
  return done(null, profile);
}));

// Rutas de autenticación:
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  // Autenticación exitosa
  res.redirect('/dashboard');
});
```

---

Estos ejemplos te permiten implementar sesiones seguras y autenticación con proveedores externos.
