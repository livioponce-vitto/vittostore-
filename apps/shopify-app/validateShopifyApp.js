const https = require('https');

const SHOP_URL = 'https://test-shop.myshopify.com/admin/apps'; // URL de apps de la tienda de prueba
const APP_URL = process.env.SHOPIFY_APP_URL || 'https://crystal-daytime-trial.ngrok-free.dev'; // Cambia si tu .env tiene otra URL

function checkAppUrl() {
  https.get(APP_URL, (res) => {
    console.log(`Verificando URL de la app: ${APP_URL}`);
    console.log(`Código de respuesta: ${res.statusCode}`);
    if (res.statusCode === 200) {
      console.log('✅ La URL de la app responde correctamente.');
    } else {
      console.log('❌ La URL de la app no responde correctamente.');
    }
  }).on('error', (e) => {
    console.error('❌ Error al conectar con la URL de la app:', e.message);
  });
}

function showInstructions() {
  console.log('\nPara validar la instalación:');
  console.log(`1. Ingresa a ${SHOP_URL} con un usuario admin de la tienda.`);
  console.log('2. Busca tu app (VittoStore) en la lista de apps instaladas.');
  console.log('3. Haz clic en la app y verifica que abre sin errores.');
}

checkAppUrl();
showInstructions();
