# Cumplimiento de Privacidad y Seguridad Shopify

Esta app cumple con los requisitos de privacidad y seguridad exigidos por Shopify para aplicaciones públicas:

## Webhooks de Privacidad

- **Desinstalación de la tienda:**
  - Se elimina toda la información asociada a la tienda al recibir el webhook `app/uninstalled`.
- **Solicitudes de datos y redacción:**
  - Se eliminan o anonimizan los datos personales de clientes y tiendas al recibir los webhooks:
    - `customers/data_request`
    - `customers/redact`
    - `shop/redact`

## Seguridad de Datos

- **Tokens y credenciales:**
  - Todos los tokens de acceso y credenciales se almacenan encriptados (AES-256-GCM).
  - Nunca se exponen en logs ni respuestas de API.
- **Transporte seguro:**
  - La app debe ejecutarse bajo HTTPS en producción.
- **Variables de entorno:**
  - El archivo `.env` nunca debe subirse a repositorios públicos.

## Buenas Prácticas

- Se documentan los endpoints y flujos de privacidad en `docs/`.
- Se recomienda revisar y actualizar periódicamente las políticas de privacidad y seguridad.

## Referencias
- [Shopify App Store Requirements](https://shopify.dev/docs/apps/store/requirements)
- [Shopify Webhook Privacy Guide](https://shopify.dev/docs/api/usage/webhooks/mandatory-webhooks)
