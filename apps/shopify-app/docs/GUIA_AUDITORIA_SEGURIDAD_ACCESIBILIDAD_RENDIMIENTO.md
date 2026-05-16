# Guía Detallada de Auditoría

## 1. Seguridad

### Pasos
1. Ejecuta `npm audit` en la raíz del proyecto y corrige vulnerabilidades reportadas.
2. Revisa el archivo `docs/CHECKLIST_SEGURIDAD.md` y valida cada punto.
3. Usa herramientas como [ZAP](https://www.zaproxy.org/) o [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) para pruebas de penetración básicas:
   - Inyección SQL/NoSQL
   - XSS (Cross-site scripting)
   - CSRF (Cross-site request forgery)
4. Verifica que las rutas protegidas requieran autenticación y roles.

### Interpretación de resultados
- Vulnerabilidades críticas deben corregirse antes de producción.
- Si encuentras rutas expuestas, revisa los middlewares de autenticación.
- Documenta y soluciona cada hallazgo.

---

## 2. Accesibilidad

### Pasos
1. Abre la app en Chrome y ejecuta Lighthouse (Ctrl+Shift+I > Lighthouse > Accessibility).
2. Revisa el archivo `docs/CHECKLIST_USABILIDAD.md` y valida cada punto.
3. Usa [axe DevTools](https://www.deque.com/axe/devtools/) para análisis avanzado.

### Interpretación de resultados
- Puntuación >90 es ideal, corrige errores de contraste, navegación y etiquetas.
- Si hay errores, Lighthouse y axe te indican el elemento y la solución sugerida.
- Prioriza problemas que afectan a usuarios con discapacidad.

---

## 3. Rendimiento

### Pasos
1. Ejecuta Lighthouse (Performance) y revisa métricas como FCP, TTI y LCP.
2. Usa el script de carga de k6 (`docs/EJEMPLOS_CARGA_MONITOREO.md`) para simular usuarios concurrentes:
   - `k6 run script.js`
3. Monitorea `/metrics` y revisa logs para detectar lentitud o errores 5xx.

### Interpretación de resultados
- Lighthouse: busca puntuaciones bajas en FCP/LCP, optimiza imágenes y recursos.
- k6: si hay muchos errores o tiempos altos, revisa cuellos de botella en endpoints y base de datos.
- /metrics: errores 5xx o latencias altas indican problemas a resolver.

---

Esta guía te ayudará a auditar y mejorar la seguridad, accesibilidad y rendimiento de VITTOSTORE. Si tienes resultados específicos, compártelos y te ayudo a interpretarlos y priorizar acciones.
