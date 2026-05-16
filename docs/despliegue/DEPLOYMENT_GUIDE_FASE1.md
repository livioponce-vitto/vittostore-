# 🚀 GUÍA DE DEPLOY FASE 1 - SISTEMA FINANCIERO VITTOSTORE

**Fecha:** 2026-05-08  
**Objetivo:** Deploy manual de 7 archivos base en Google Apps Script  
**Tiempo estimado:** 15-20 minutos  

---

## 📋 CHECKLIST PRE-DEPLOY

Antes de empezar, verifica que tengas:

- [ ] Google Sheet "Libro Maestro VITTOSTORE" abierto
- [ ] Extensiones > Apps Script editor abierto en otra pestaña
- [ ] Script properties configuradas (FINANCE_SPREADSHEET_ID, GEMINI_API_KEY, etc.)
- [ ] Carpeta `google-workspace-finance-automation` con archivos locales a mano

---

## 🔧 PASO 1: ARCHIVOS A CREAR (EN ESTE ORDEN)

### Archivo 1: ContingencyService.gs
**Estado:** NUEVO  
**Líneas:** ~520  
**Función:** Registro automático de fallos de integración (Gemini, FX, Gmail, Calendar)

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 2: DataQualityService.gs
**Estado:** NUEVO  
**Líneas:** ~410  
**Función:** 14 reglas de validación automática del Libro Mayor

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 3: ReviewQueueService.gs
**Estado:** NUEVO  
**Líneas:** ~480  
**Función:** Bandeja operativa para corrección y reproceso de rechazados

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 4: DashboardService.gs
**Estado:** NUEVO  
**Líneas:** ~580  
**Función:** 14 KPIs, bloqueo cierre mes, actualización automática

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 5: SheetPresentationService.gs
**Estado:** NUEVO  
**Líneas:** ~550  
**Función:** Colores, semáforos, formato visual ejecutivo

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 6: SheetSecurityService.gs
**Estado:** NUEVO  
**Líneas:** ~450  
**Función:** Protecciones por rol (FINANCE, MARKETING, CEO)

**Contenido** → Copia desde la carpeta local o solicita el archivo completo

### Archivo 7: Config.gs (REEMPLAZAR)
**Estado:** MODIFICADO  
**Líneas:** ~200  
**Función:** Añadidos SHEETS y HEADERS para las 7 nuevas hojas

**Cambios clave:**
```javascript
DATA_QUALITY: 'Control_Calidad_Datos',
REJECTED_RECORDS: 'Registros_Rechazados',
REVIEW_QUEUE: 'Bandeja_Revision_Rechazados',
INTEGRATION_CONTINGENCY: 'Contingencia_Integraciones',
EXECUTIVE_DASHBOARD: 'Dashboard_Ejecutivo',
FINANCE_VIEW: 'Vista_Finanzas',
COMMERCIAL_VIEW: 'Vista_Comercial',
MANAGEMENT_VIEW: 'Vista_Gerencia'
```

---

## 📥 PASO 2: COPIAR/PEGAR EN APPS SCRIPT

### Instrucciones de Copia:

1. **Abre VS Code** con la carpeta `google-workspace-finance-automation`
2. **Para cada archivo (en orden):**
   - Click derecho en archivo → "Copy"
   - Ve a Google Apps Script
   - Click "+" → "Archivo de secuencia de comandos"
   - Pega el contenido
   - Renombra con el nombre exacto del archivo (.gs)

3. **Cuando termines**, deberías tener en Apps Script:
   ```
   ├─ ContingencyService.gs
   ├─ DataQualityService.gs
   ├─ ReviewQueueService.gs
   ├─ DashboardService.gs
   ├─ SheetPresentationService.gs
   ├─ SheetSecurityService.gs
   ├─ Config.gs (REEMPLAZADO)
   ├─ [Archivos existentes ya presentes]
   ```

---

## ✅ PASO 3: VERIFICAR SINTAXIS

En la consola de Apps Script, ejecuta:

```javascript
// Verifica que no haya errores de sintaxis
// Debería imprimir: "Config OK"
FinanceConfig.validateRequiredProperties();
```

**Resultado esperado:**
```
Config OK
```

Si hay error, revisa que las Script Properties estén configuradas correctamente.

---

## 🚀 PASO 4: INICIALIZAR SISTEMA

En la consola de Apps Script, ejecuta:

```javascript
// INICIALIZACIÓN COMPLETA DEL SISTEMA
Setup.initializeFinanceAutomation();
```

### ¿Qué hace este comando?

1. ✅ Valida configuración (Script Properties)
2. ✅ Crea/verifica 17 hojas (Libro_Mayor, Control_Calidad_Datos, etc.)
3. ✅ Instala triggers automáticos (horarios, mensuales)
4. ✅ Añade menu items (botones en la hoja)
5. ✅ Actualiza dashboard con KPIs iniciales
6. ✅ Aplica formato visual
7. ✅ Aplica protecciones por rol

### Resultado esperado en Logs:

```
[INFO] Validacion de config completada
[INFO] Hojas core creadas/verificadas: 17 hojas
[INFO] Triggers instalados: 7 triggers
[INFO] Menu items creados: 14 opciones
[INFO] Dashboard_Ejecutivo actualizado
[INFO] Formato ejecutivo aplicado
[INFO] Protecciones por rol aplicadas
[INFO] Inicializacion completa - Sistema financiero listo
```

---

## 🔍 PASO 5: VERIFICAR EN GOOGLE SHEETS

Regresa a tu Google Sheet y verifica:

### Nuevas Hojas Creadas (debajo de Libro_Mayor):

```
✓ Control_Calidad_Datos      (16 columnas)
✓ Registros_Rechazados       (8 columnas)
✓ Bandeja_Revision_Rechazados (28 columnas - editable)
✓ Contingencia_Integraciones (11 columnas)
✓ Dashboard_Ejecutivo        (4 columnas - con KPIs)
✓ Vista_Finanzas             (4 columnas - finanzas)
✓ Vista_Comercial            (4 columnas - comercial)
✓ Vista_Gerencia             (4 columnas - gerencia)
```

### Menu Items Nuevos (Extensiones > Menu VITTOSTORE):

```
✓ Control de calidad de datos
✓ Sincronizar bandeja rechazados
✓ Procesar bandeja rechazados
✓ Resumen contingencia integraciones
✓ Actualizar dashboard ejecutivo
✓ Aplicar formato ejecutivo
✓ Aplicar protecciones por rol
```

### Triggers Instalados (Extensiones > All your triggers):

```
✓ runWeeklyDataQualitySummary - Lunes 11:00 AM
✓ runWeeklyIntegrationContingencySummary - Lunes 12:00 PM
✓ runExecutiveDashboardRefresh - Lunes 1:00 PM (13:00)
```

---

## ⚠️ TROUBLESHOOTING - FASE 1

### Error: "Cannot find property FINANCE_SPREADSHEET_ID"

**Solución:**
```
Extensiones > App Script
Proyecto Settings → Script Properties
Añade las 8 propiedades obligatorias:
- FINANCE_SPREADSHEET_ID
- GEMINI_API_KEY
- CEO_EMAIL
- FINANCE_ALERT_EMAILS
- MARKETING_REPORT_EMAILS
- ALLOWED_BILLING_SENDERS
- SHOPIFY_ORDER_SENDERS
- SIGNATURE_BASE_URL
```

### Error: "Cannot find function ContingencyService"

**Solución:**  
Verifica que ContingencyService.gs esté en Apps Script y bien copiado (sin truncar). Lee los primeros 20 caracteres de la consola.

### Las hojas no se crean

**Solución:**  
Ejecuta manualmente:
```javascript
LedgerService.ensureCoreSheets();
```

---

## 📊 FASE 1: COMPLETADA ✅

Cuando termines el Paso 5 sin errores, avísame y pasamos a **FASE 2: Deploy de Servicios Modificados**.

**Próximas fases (sequential):**
- Fase 2: Modificar 7 archivos existentes (GmailIngestion, Setup, etc.)
- Fase 3: Test ingestion real
- Fase 4-7: Testing de cada subsistema

---

## 📞 AYUDA

Si algo no funciona:

1. **Revisa el log de errores** en Extensiones > App Script > Execution log
2. **Copia el error exacto** y comparte conmigo
3. **Valida contenido de archivos** con: `FinanceConfig.validateRequiredProperties()`

**¡Adelante! 🚀**
