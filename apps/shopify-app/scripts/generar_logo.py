"""
Genera el logo VittoStore: carrito de compras con gradiente amarillo->naranja->rosa
Salida: d:/APP_VITTO_STORE/VITTOSTORE/public/images/vittostore-icon-1200.png
1200x1200 px, fondo blanco, menos de 1 MB
"""

from PIL import Image, ImageDraw
import math
import os

# ── Configuracion ────────────────────────────────────────────────────────────
W, H = 1200, 1200
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images", "vittostore-icon-1200.png")
OUT = os.path.normpath(OUT)

# Paleta gradiente: amarillo -> naranja -> rosa/rojo
COLOR_A  = (255, 214, 0)    # amarillo
COLOR_B  = (255, 140, 0)    # naranja
COLOR_C  = (255, 45, 110)   # rosa-rojo
PINK     = (255, 45, 110)
WHITE    = (255, 255, 255)

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def gradient_color(t):
    """t en [0,1]: 0=amarillo, 0.5=naranja, 1=rosa"""
    if t < 0.5:
        return lerp_color(COLOR_A, COLOR_B, t * 2)
    else:
        return lerp_color(COLOR_B, COLOR_C, (t - 0.5) * 2)

# ── Crear imagen base ────────────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), WHITE + (255,))

# Capa de gradiente (horizontal) para recorte posterior
grad_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for x in range(W):
    t = x / W
    r, g, b = gradient_color(t)
    for y in range(H):
        grad_layer.putpixel((x, y), (r, g, b, 255))

# Mascara de formas: todo lo que se pinta queda opaco
mask = Image.new("L", (W, H), 0)
mdraw = ImageDraw.Draw(mask)

# ── Escala base: la imagen original es ~512 px, escalamos a 1200 ──────────────
S = 1200 / 512  # factor de escala ≈ 2.34

def sc(v):
    return int(v * S)

# ── Dibujar formas sobre la mascara ─────────────────────────────────────────
lw = sc(22)   # grosor de linea principal

# -- Ruedas (circulos rellenos) -----------------------------------------------
# rueda izquierda
rx1, ry1, rr = sc(175), sc(400), sc(32)
mdraw.ellipse([rx1-rr, ry1-rr, rx1+rr, ry1+rr], fill=255)

# rueda derecha
rx2, ry2 = sc(330), sc(400)
mdraw.ellipse([rx2-rr, ry2-rr, rx2+rr, ry2+rr], fill=255)

# -- Forma del carrito / B (tres arcos apilados con extremos curvos) ----------
# El carrito se dibuja como lineas curvas gruesas usando polígonos

def draw_thick_arc(draw, cx, cy, rx, ry, angle_start, angle_end, thickness, steps=120):
    """Dibuja un arco grueco como poligono cerrado (borde exterior e interior)."""
    outer_pts = []
    inner_pts = []
    for i in range(steps + 1):
        a = math.radians(angle_start + (angle_end - angle_start) * i / steps)
        ox = cx + (rx + thickness/2) * math.cos(a)
        oy = cy + (ry + thickness/2) * math.sin(a)
        ix = cx + (rx - thickness/2) * math.cos(a)
        iy = cy + (ry - thickness/2) * math.sin(a)
        outer_pts.append((ox, oy))
        inner_pts.append((ix, iy))
    poly = outer_pts + list(reversed(inner_pts))
    draw.polygon(poly, fill=255)

def draw_rounded_line(draw, pts, thickness):
    """Dibuja una polilínea con caps redondeados."""
    for i in range(len(pts)-1):
        x1,y1 = pts[i]
        x2,y2 = pts[i+1]
        draw.line([x1,y1,x2,y2], fill=255, width=thickness)
        r = thickness//2
        draw.ellipse([x1-r,y1-r,x1+r,y1+r], fill=255)
        draw.ellipse([x2-r,y2-r,x2+r,y2+r], fill=255)

# Centro del "B" / cuerpo del carrito
cx = sc(295)

# Arco superior (parte alta de la B y asa del carrito)
draw_thick_arc(mdraw, cx, sc(175), sc(115), sc(90), -160, 10, lw)

# Arco inferior (parte baja de la B / base carrito)
draw_thick_arc(mdraw, cx, sc(295), sc(115), sc(85), -160, 10, lw)

# Linea vertical izquierda que une los dos arcos (palo de la B)
draw_rounded_line(mdraw, [(sc(170), sc(100)), (sc(170), sc(375))], lw)

# Linea horizontal central (travesaño medio de la B)
draw_rounded_line(mdraw, [(sc(170), sc(255)), (sc(270), sc(255))], lw)

# -- Lineas de velocidad (izquierda) ------------------------------------------
# Tres rayitas horizontales que indican movimiento
speed_y    = [sc(165), sc(205), sc(245)]
speed_xend = sc(130)
lengths    = [sc(55), sc(80), sc(55)]
sp_lw      = sc(14)

for i, sy in enumerate(speed_y):
    x2 = speed_xend
    x1 = x2 - lengths[i]
    draw_rounded_line(mdraw, [(x1, sy), (x2, sy)], sp_lw)

# ── Aplicar gradiente usando la mascara ──────────────────────────────────────
# Convertir mascara en canal alpha de grad_layer
grad_layer.putalpha(mask)

# Componer sobre fondo blanco
img = Image.alpha_composite(img, grad_layer)
img_rgb = img.convert("RGB")

# ── Guardar ──────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img_rgb.save(OUT, "PNG", optimize=True)

size_kb = os.path.getsize(OUT) / 1024
print(f"Logo guardado en: {OUT}")
print(f"Dimensiones: {img_rgb.size[0]}x{img_rgb.size[1]} px")
print(f"Tamaño: {size_kb:.1f} KB ({size_kb/1024:.2f} MB)")
print("OK - Listo para subir a Shopify" if size_kb < 1024 else "ADVERTENCIA: supera 1 MB")
