# Sesión Vittostore.cl — 18 Mayo 2026

## Resumen de tareas completadas

### 1. Canonical URL — Mercado Chile
- Eliminado webPresence subfolder `/es-cl/`
- Creado nuevo webPresence en dominio raíz `vittostore.cl/`
- Chile ahora indexa correctamente sin duplicado de URL

### 2. Judge.me — Reseñas con estrellas
- Bloque `rating` agregado al template `templates/product.json` del tema publicado
- Orden de bloques: vendor → title → price → **rating** → variant_picker → quantity_selector → buy_buttons → description → share
- `show_rating: true` activado en sección `related-products`
- Pendiente: completar instalación del widget en Shopify admin (Paso 1 del checklist de Judge.me)

### 3. llms.txt — Visibilidad en IA
- Página creada: `gid://shopify/Page/161997553952` (handle: `llms-txt`)
- Contenido: 20 productos, 7 colecciones, FAQ de MOLIAE Beauty
- URL redirect activo: `/llms.txt` → `/pages/llms-txt`

### 4. Blog "El Ritual"
- Blog renombrado: `gid://shopify/Blog/123148763424`
- Nombre: "El Ritual — MOLIAE Beauty Blog"
- 5 artículos SEO creados con metafields

### 5. Problema "Agotado" — RESUELTO
- Diagnóstico: CDN cache lag en storefront (Admin mostraba 100 unidades, storefront mostraba 0)
- Fix: `inventorySetOnHandQuantities` → 200 unidades en ubicación Luis Carrera para los 38 variantes
- Resultado: "Agotado" desapareció del storefront

### 6. Tema publicado
- Tema activo: Dawn — Premium + Footer Legal (v15.4.1)
- ID: `188560343328`
- Publicado por el usuario

### 7. Imágenes Kit de Masaje Ritual
- Producto: `gid://shopify/Product/10305517060384`
- Eliminadas 4 imágenes incorrectas (1 original + 3 que resultaron ser screenshots)
- Restauradas 4 imágenes vía staged upload desde carpeta Descargas
- Problema detectado: archivos `6.jpg`, `7.jpg`, `8.jpg` en Descargas eran **screenshots del admin de Shopify**
- Acción correctiva: eliminados los 3 screenshots del producto
- Estado final: producto con 6 imágenes válidas
- Imágenes reales disponibles en: `C:\Users\livio\Downloads\SET MOLIAE BEAUTY\Media Kit _ Gift Box Kits (692 x 822 px)-20260514T030734Z-3-001.zip` (46 imágenes, numeradas 1-46)

## Estado de la tienda al cierre
- Órdenes totales: 2 (#1001 test, #1002 Priscilla Brisso)
- Inventario Kit de Masaje: 200 unidades (Luis Carrera)
- Tema activo: Dawn v15.4.1
- Judge.me: instalado, pendiente activar widget en tema

## Recursos clave
- Shopify Admin: admin.shopify.com/store/vittostore
- Ubicación inventario: `gid://shopify/Location/114428150048` (Luis Carrera)
- ZIP imágenes Gift Box: `SET MOLIAE BEAUTY\Media Kit _ Gift Box Kits...zip`
- ZIP drive general: `SET MOLIAE BEAUTY\drive-download-20260514T030716Z-3-001.zip`
