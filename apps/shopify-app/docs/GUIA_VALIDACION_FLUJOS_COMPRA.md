# Guía paso a paso para validar flujos de compra y sincronización en VITTOSTORE

## 1. Preparación
- Asegúrate de tener una tienda Shopify de desarrollo conectada a tu app.
- Verifica que los webhooks estén configurados en Shopify para órdenes, productos y clientes.
- Inicia tu app en modo desarrollo o producción.

## 2. Validación de flujos de compra
1. Realiza una compra de prueba en Shopify (puedes usar modo test o productos de $0).
2. Verifica en tu app:
   - Que la orden aparece en el dashboard o base de datos.
   - Que los datos de la orden (productos, cliente, estado) son correctos.
   - Que los logs muestran la recepción y procesamiento del webhook correspondiente.
3. Cambia el estado de la orden (pagada, enviada, cancelada) en Shopify y revisa que se refleje en tu app.

## 3. Validación de sincronización
1. Modifica un producto o crea uno nuevo en Shopify.
2. Ejecuta la sincronización manual:
   - Realiza un POST a `/shopify/sync` o espera la sincronización programada.
   - Verifica que el producto nuevo o modificado aparece en tu app.
3. Elimina o actualiza una orden en Shopify y repite la sincronización.
4. Comprueba que los datos en tu app y Shopify coinciden.

## 4. Validación con datos de prueba (automatizada)
- Ejecuta `npm test` para correr las pruebas automatizadas de webhooks y sincronización.
- Revisa que todos los tests pasen y corrige cualquier error detectado.

## 5. Interpretación de resultados y depuración
- Si una orden/producto no aparece:
  - Revisa los logs estructurados (logs/app.log) buscando errores o advertencias.
  - Verifica que el webhook fue recibido (endpoint correcto, firma HMAC válida).
  - Comprueba la respuesta de tu app a Shopify (debe ser 200 OK).
- Si hay datos inconsistentes:
  - Compara los datos en Shopify y tu app.
  - Revisa la lógica de sincronización (servicios en app/services/shopify.js).
- Si hay errores en pruebas automatizadas:
  - Lee el mensaje de error y el stack trace.
  - Asegúrate de tener datos y configuraciones de entorno correctos.

## 6. Recomendaciones
- Usa Postman para simular webhooks y probar endpoints manualmente.
- Monitorea el endpoint `/metrics` para detectar errores 5xx o cuellos de botella.
- Documenta cualquier hallazgo y solución aplicada.

---

Esta guía te ayudará a validar y depurar los flujos críticos de venta y sincronización en VITTOSTORE.
