# Ejemplos de Roles y Autenticación Avanzada

## 1. Middleware para roles (Express)

```js
// app/middleware/roles.js
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }
    next();
  };
}

module.exports = { requireRole };

// Uso en rutas:
// const { requireRole } = require('../middleware/roles');
// app.use('/admin', requireAuth, requireRole('admin'), adminRoutes);
```

## 2. Autenticación con JWT (JSON Web Token)

```js
// app/middleware/jwtAuth.js
const jwt = require('jsonwebtoken');

function jwtAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

module.exports = { jwtAuth };

// Uso en rutas:
// const { jwtAuth } = require('../middleware/jwtAuth');
// app.use('/api', jwtAuth, apiRoutes);
```

---

Estos ejemplos permiten proteger rutas según el rol del usuario y autenticar usando tokens JWT, recomendados para APIs modernas y seguras.
