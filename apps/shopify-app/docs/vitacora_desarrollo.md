# Bitácora de Desarrollo VITTOSTORE

## Configuración Inicial y Solicitudes a AI Studio
- Configuración de Firebase Database en región us-west2 (Los Angeles).
- Solicitud de prompt para desarrollo en Google Vertex AI Studio.
- Generación de prompt para IA: integración de modelos predictivos, campañas multicanal, dashboards y orquestación de jobs.

## Correcciones y Mejoras
- Instalación del paquete de iconos `lucide-react` para uso de TrendingUp en React.
- Creación de componentes:
  - `src/components/DashboardView.jsx` (uso de TrendingUp)
  - `src/components/ErrorBoundary.jsx` (manejo de errores en React)
  - `src/App.jsx` (integración de ErrorBoundary y DashboardView)
  - `src/index.js` (punto de entrada de la app)
- Refactor sugerido para `geminiService.ts` para manejo robusto y mensajes amigables de error en llamadas a la API de IA.

## Pruebas y Validaciones
- Ejecución de la app en entorno local (`npm run dev` / `npm start`).
- Validación visual del dashboard y funcionamiento del ícono TrendingUp.
- Confirmación de mensajes informativos de Shopify API y funcionamiento del backend.

---

Esta bitácora se irá actualizando con cada cambio relevante, solicitud a IA y corrección aplicada en el proyecto.
