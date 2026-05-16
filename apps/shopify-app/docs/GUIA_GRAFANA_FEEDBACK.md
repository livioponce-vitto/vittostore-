# Guía para Configurar Dashboards en Grafana y Analizar Feedback de Usuarios

## 1. Configuración básica de Grafana para monitoreo

### a) Instala Prometheus y Grafana
- Usa Docker Compose o instala localmente:
  ```yaml
  version: '3.8'
  services:
    prometheus:
      image: prom/prometheus
      ports:
        - "9090:9090"
      volumes:
        - ./prometheus.yml:/etc/prometheus/prometheus.yml
    grafana:
      image: grafana/grafana
      ports:
        - "3000:3000"
  ```

### b) Configura Prometheus para scrapear tu app
- Ejemplo de prometheus.yml:
  ```yaml
  scrape_configs:
    - job_name: 'vittostore'
      static_configs:
        - targets: ['host.docker.internal:3000'] # Cambia por la IP/host de tu app
  ```

### c) Agrega Prometheus como fuente de datos en Grafana
- Ingresa a Grafana (http://localhost:3000, usuario: admin/admin)
- Ve a "Configuration > Data Sources" y agrega Prometheus (URL: http://prometheus:9090)

### d) Crea un dashboard básico
- Ve a "Create > Dashboard > Add new panel"
- Ejemplos de métricas:
  - `http_requests_total` (conteo de peticiones)
  - `process_cpu_seconds_total` (uso de CPU)
  - `process_resident_memory_bytes` (memoria)
  - `http_requests_total{status=~"5.."}` (errores 5xx)
- Personaliza alertas y visualizaciones según tus necesidades.

---

## 2. Ejemplos para recolectar y analizar feedback de usuarios

### a) Recolección de feedback
- Agrega un formulario de contacto o encuesta en la app (ejemplo con Google Forms o Typeform).
- Solicita feedback tras acciones clave (compra, soporte, cierre de sesión).
- Centraliza tickets de soporte en una herramienta (por ejemplo, Trello, Jira, Notion).

### b) Análisis de feedback
- Clasifica comentarios por tipo: bugs, mejoras, dudas, felicitaciones.
- Prioriza según frecuencia e impacto.
- Usa gráficos (en Notion, Excel, Google Sheets) para visualizar tendencias.
- Ejemplo de tabla:
  | Fecha       | Usuario      | Tipo     | Descripción                | Estado   |
  |-------------|--------------|----------|----------------------------|----------|
  | 2026-04-22  | juan@ej.com  | Bug      | No carga productos         | Abierto  |
  | 2026-04-22  | ana@ej.com   | Mejora   | Agregar filtro por precio  | Cerrado  |

---

Esta guía te ayudará a monitorear tu app en tiempo real y mejorarla según el feedback de tus usuarios.
