# Flujo de Recuperación de Carritos Abandonados

Este documento describe el flujo completo para la recuperación de carritos abandonados en la app VITTOSTORE.

---

## Diagrama del Flujo

![Flujo de recuperación de carritos abandonados](cart_recovery_flow_mermaid.png)

---

## 1. Detección y Registro
- Un carrito se marca como abandonado por webhook de Shopify o evento interno.
- Se crea un registro en la base de datos con el estado `abandoned`.

## 2. Evaluación y Notificación
- El job `NotificationJob` revisa periódicamente los carritos abandonados.
- Si corresponde, envía una notificación al cliente (email, SMS, etc.).

## 3. Recuperación
- Si el cliente recupera el carrito (ejemplo: completa la compra), el estado se actualiza a `recovered`.
- Si no hay recuperación tras varios intentos, se cierra la secuencia.

---

## Ejemplo de Payload de Webhook
```json
{
  "id": 123456,
  "email": "cliente@ejemplo.com",
  "line_items": [...],
  "abandoned_checkout_url": "https://...",
  "created_at": "2026-04-22T12:00:00Z"
}
```

**Respuesta esperada:**
```json
{ "status": "ok" }
```

---

## Endpoints Involucrados
- `POST /cart-recovery/webhook` (recepción de evento)
- `GET /cart-recovery` (listar carritos)
- `POST /cart-recovery/:id/trigger` (disparar notificación)
- `POST /cart-recovery/:id/recovered` (marcar como recuperado)

---

## Buenas Prácticas de Privacidad
- Los datos de clientes solo se usan para la recuperación y se eliminan tras el cierre del flujo o por solicitud (webhook redact).
- Tokens y datos sensibles encriptados.
- No exponer información personal en logs.

---

## Pruebas End-to-End
1. Simula un carrito abandonado vía webhook o API.
2. Verifica la creación del registro en `/cart-recovery`.
3. Ejecuta el job `NotificationJob` y revisa el envío de notificación.
4. Marca el carrito como recuperado y valida el cambio de estado.
5. Prueba el webhook de redacción para eliminar datos.

---


---

## Optimización sugerida

Si el volumen de carritos crece, migra el almacenamiento de archivos JSON a una base de datos (ej: MongoDB, PostgreSQL) para mejorar rendimiento y escalabilidad en consultas y actualizaciones.

Para más detalles, consulta la documentación de endpoints y privacidad.
