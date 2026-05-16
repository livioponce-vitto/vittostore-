# Checklist de Seguridad - VITTOSTORE

## Auditoría de dependencias
- [ ] Ejecutar `npm audit` y corregir vulnerabilidades.
- [ ] Mantener dependencias actualizadas.

## Manejo de secretos
- [ ] Variables sensibles solo en `.env` (nunca en el código).
- [ ] No subir `.env` ni claves al repositorio.

## Control de acceso
- [ ] Todas las rutas sensibles requieren autenticación.
- [ ] Roles y permisos definidos para cada usuario.
- [ ] Validar siempre el usuario en endpoints críticos.

## Protección de datos
- [ ] Cifrado de contraseñas y datos sensibles.
- [ ] Uso de HTTPS en producción.
- [ ] No exponer información sensible en respuestas o logs.

## Pruebas y monitoreo
- [ ] Realizar pruebas de penetración periódicas.
- [ ] Monitorear accesos y errores sospechosos.

---

# Ejemplo 1: Middleware de control de acceso (Express)

```js
// app/middleware/auth.js
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  next();
}

module.exports = { requireAuth };

// Uso en rutas:
// const { requireAuth } = require('../middleware/auth');
// app.use('/dashboard', requireAuth, dashboardRoutes);
```

# Ejemplo 2: Configuración básica de HTTPS con Express y certificados

```js
// server.js
const fs = require('fs');
const https = require('https');
const app = require('./app'); // tu instancia de express

const options = {
  key: fs.readFileSync('ruta/privkey.pem'),
  cert: fs.readFileSync('ruta/fullchain.pem')
};

https.createServer(options, app).listen(443, () => {
  console.log('Servidor HTTPS escuchando en el puerto 443');
});
```

// En producción, usa un proxy inverso (Nginx/Traefik) para gestionar HTTPS y redirigir a tu app Node.js.
