npm install --save-dev jest# Checklist Final de Lanzamiento VITTOSTORE

## 1. Pruebas y validación

## 2. Seguridad

## 3. Rendimiento y monitoreo

## 4. Accesibilidad y usabilidad

## 5. Documentación y soporte

## 6. Despliegue


Marca cada punto antes de lanzar tu app en Shopify.

# Checklist Final de Lanzamiento

- [ ] .env completo y seguro
- [ ] Todos los endpoints probados
- [ ] Seguridad activa (helmet, cors, xss, mongoSanitize, rateLimit, hpp, csrf)
- [ ] Métricas Prometheus activas
- [ ] Documentación actualizada
- [ ] Onboarding y feedback claros
- [ ] Endpoints y flujos intuitivos sugeridos y validados
- [ ] Docker y Nginx listos
- [ ] Certificados SSL activos
- [ ] App registrada en Shopify Partners
- [ ] Prueba de instalación y flujo real
- [ ] Validación de UX/UI
- [ ] Checklist completado
# Ayuda para despliegue en producción

1. **Prepara tu servidor o servicio cloud (VPS, AWS, GCP, etc.)**
2. Copia tu proyecto y archivos .env al servidor
3. Ejecuta `docker compose up -d` para levantar la app, Prometheus y Grafana
4. Configura un proxy inverso (Nginx, Traefik) para HTTPS y redirección de puertos
5. Verifica que la app responde en el dominio/producto final
6. Prueba todos los endpoints y monitoreo en producción
7. Habilita backups y monitoreo de logs

¿Quieres una guía detallada para Nginx, Traefik o despliegue en algún proveedor específico?
