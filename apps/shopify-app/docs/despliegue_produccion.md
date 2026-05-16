# Guía de Despliegue y Producción – VittoStore Shopify App

Esta guía cubre los pasos recomendados para desplegar VittoStore en un entorno de producción seguro y robusto.

---

## 1. Requisitos previos
- Tener una cuenta de Shopify Partners y una tienda de prueba.
- Configurar correctamente el archivo `.env` con todas las variables requeridas.
- Certificado SSL válido (HTTPS obligatorio).

## 2. Instalación y build
1. Instala dependencias:
   ```bash
   npm install
   ```
2. Realiza el build de la app:
   ```bash
   npm run build
   ```

## 3. Configuración de entorno
- Usa `.env` para todas las credenciales y URLs sensibles.
- Protege `.env` y nunca lo subas a git.
- Configura variables como:
  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `ENCRYPTION_KEY`, `SHOPIFY_APP_URL`, `HOST`, etc.

## 4. Ejecución en producción
- Usa un proceso robusto (PM2, systemd, Docker, etc.):
  ```bash
  npm start
  ```
- Verifica que la app responde en el puerto configurado (`PORT`).

## 5. Seguridad
- Solo acepta conexiones HTTPS.
- Revisa los logs de advertencia sobre `.env` y credenciales.
- Mantén actualizadas las dependencias (`npm audit`).
- Limita el acceso a endpoints administrativos.

## 6. Configuración en Shopify Partners
- Registra el dominio público y las URLs de redirección en el panel de la app.
- Verifica que los webhooks estén configurados correctamente.

## 7. Monitoreo y alertas
- Expón `/metrics` para Prometheus.
- Configura alertas usando la métrica `vitto_errors_5xx_total`.
- Integra Alertmanager para recibir notificaciones críticas.

## 8. Checklist final
- [ ] HTTPS activo y certificado válido
- [ ] `.env` completo y protegido
- [ ] Todos los endpoints y webhooks funcionales
- [ ] Monitoreo y alertas activos
- [ ] Documentación técnica y de usuario actualizada
- [ ] Cumplimiento de privacidad y seguridad

---

¡Tu app está lista para producción y para ser publicada en Shopify App Store!
