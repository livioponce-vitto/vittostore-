# Bitácora de Proyecto: VITTOSTORE

## 1. Problemática
Las tiendas Shopify enfrentan desafíos en la recuperación de carritos abandonados, la automatización de campañas multicanal y la personalización de la experiencia del usuario. Además, requieren monitoreo en tiempo real, integración segura y cumplimiento de normativas, todo en una plataforma escalable y fácil de mantener.

## 2. Investigación
- Análisis de soluciones SaaS existentes para Shopify.
- Revisión de documentación oficial de Shopify, Firebase, Vertex AI y Gemini Pro.
- Evaluación de frameworks modernos: React 18, Vite, Express.js, Tailwind CSS, Framer Motion.
- Estudio de patrones de arquitectura modular y buenas prácticas DevOps.

## 3. Desarrollo
### 3.1 Configuración Inicial
- Inicialización del repositorio y estructura de carpetas.
- Instalación de dependencias clave: React, Vite, Express.js, Firebase, lucide-react, Gemini Pro SDK.
- Configuración de Firebase/Firestore en us-west2 y reglas de seguridad.

### 3.2 Solicitudes y Prompts a AI Studio
- Generación de prompts para arquitectura, refactorización y manejo de errores.
- Solicitud de ejemplos de mensajes de error amigables y logs técnicos.

### 3.3 Implementación
- Backend Express.js como middleware de Vite.
- Frontend en React 18 con Tailwind CSS y Framer Motion.
- Componentes creados: Layout, Dashboard, Campaigns, AIChat, StoreConfig, ErrorBoundary.
- Integración de Gemini Pro para IA predictiva y recomendaciones.
- Refactorización de geminiService.ts para manejo robusto de errores.
- Pruebas automatizadas y validación de compilación.

## 4. Resultados
- Plataforma SaaS robusta, modular y escalable.
- Dashboard interactivo con visualización de métricas y campañas multicanal.
- Manejo de errores amigable y logs técnicos para diagnóstico.
- Cumplimiento de normativas y documentación técnica actualizada.

## 5. Bibliografía
- [Shopify API Docs](https://shopify.dev/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Google Vertex AI](https://cloud.google.com/vertex-ai/docs)
- [Gemini Pro](https://ai.google.dev/gemini)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Express.js](https://expressjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)

## 6. Lista de Prompts Utilizados
- "Desarrolla una solución SaaS llamada VITTOSTORE para la gestión avanzada de tiendas Shopify..."
- "Refactoriza el archivo geminiService.ts para mejorar el manejo de errores..."
- "Genera un prompt para Google Vertex AI Studio orientado a IA predictiva y campañas multicanal."
- "Crea un componente ErrorBoundary en React para manejo de errores."
- "Integra el ícono TrendingUp de lucide-react en el dashboard."
- "Guía paso a paso para probar la app localmente."

---

Este documento se actualizará con cada avance relevante, nuevos hallazgos y mejoras implementadas en el proyecto.
