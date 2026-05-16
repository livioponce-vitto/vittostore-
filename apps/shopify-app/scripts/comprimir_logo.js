const sharp = require('sharp');

sharp('public/images/icono_1024.png')
  .png({ quality: 80, compressionLevel: 9 })
  .toFile('public/images/icono_1024_compressed.png', (err, info) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Imagen comprimida:', info);
    }
  });
