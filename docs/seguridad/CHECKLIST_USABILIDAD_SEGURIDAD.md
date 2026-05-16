# Checklist de Usabilidad, Seguridad y Proactividad

## 1. Usabilidad API y Mensajes

- [x] Todas las respuestas de error deben incluir `ok: false`, `error` y, si aplica, un campo `next` con sugerencia de acción.
- [ ] Revisar que los endpoints protegidos devuelvan 401 con mensaje claro si la sesión expira.

## 2. Endpoints y Flujos Intuitivos

- [x] Mantener endpoints REST predecibles (`/products`, `/orders`, `/campaigns`).
- [ ] Añadir endpoint `/me` o `/status` para que el usuario pueda verificar sesión y permisos.
- [ ] Documentar todos los endpoints principales, parámetros y ejemplos de respuesta.

## 3. Documentación y Onboarding

- [x] README con pasos de despliegue local y producción.
- [ ] Agregar sección "Primeros pasos" y tabla de endpoints.
- [ ] Incluir "FAQ" de errores comunes y cómo resolverlos.

## 4. Interfaz Web y Experiencia de Usuario

- [x] Panel mobile-first, accesible y navegación clara.
- [ ] Añadir tooltips o ayuda contextual en formularios.
- [ ] Validar formularios en frontend antes de enviar (campos obligatorios, formatos, etc).
- [ ] Mejorar el “tour visual” con pasos guiados para onboarding.
- [x] Mostrar mensajes de éxito/error siempre visibles (toast).

## 5. Seguridad y Proactividad

- [x] Middlewares de seguridad activos (`helmet`, `cors`, `xss-clean`, `mongo-sanitize`, `hpp`, `express-rate-limit`, `csurf`).
- [x] Revisar logs de acceso y errores periódicamente.
- [x] Limitar intentos de login o acciones sensibles (rate limiting activo).
- [x] Mantener dependencias actualizadas y monitorear avisos de seguridad (`npm audit`).
- [x] Revisar que los tokens y sesiones se invaliden correctamente al desinstalar la app o cerrar sesión.

## 6. Proactividad y Resolutividad

- [x] Monitorear métricas y alertas de negocio en el dashboard.
- [ ] Revisar periódicamente feedback de usuarios y ajustar flujos.
- [ ] Automatizar pruebas de integración y cobertura.

---

**Recomendación:**

- Revisar este checklist en cada release.
- Marcar los puntos completados y asignar responsables para los pendientes.
- Actualizar la documentación y el onboarding con cada cambio relevante.

---

_Elaborado por GitHub Copilot, Abril 2026._
