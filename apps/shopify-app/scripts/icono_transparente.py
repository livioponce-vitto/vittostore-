# Script para crear un ícono 1024x1024 px con fondo transparente
# Requiere: pip install pillow numpy

from PIL import Image
import numpy as np


# Ruta del logo original y del icono generado
target_file = 'public/images/vittostore-icon-1200.png'  # Archivo seleccionado por el usuario
output_file = 'public/images/icono_1024.png'

# Abrir imagen
i = Image.open(target_file).convert('RGBA')
arr = np.array(i)

# Detectar fondo blanco (ajusta el umbral si es necesario)
white = np.all(arr[:, :, :3] > 240, axis=2)
arr[white, 3] = 0  # Hacer transparente

# Crear imagen nueva
img_no_bg = Image.fromarray(arr)

# Redimensionar a 1024x1024 manteniendo proporción y centrando
img_final = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
img_resized = img_no_bg.copy()
img_resized.thumbnail((1024, 1024), Image.LANCZOS)

# Centrar
x = (1024 - img_resized.width) // 2
y = (1024 - img_resized.height) // 2
img_final.paste(img_resized, (x, y), img_resized)

# Guardar
img_final.save(output_file)
print(f'Icono guardado como {output_file}')
