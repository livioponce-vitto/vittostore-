// jobs/notificationCron.js
const cron = require('node-cron');
const NotificationJob = require('./NotificationJob');

// Ejecuta el job cada hora
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Ejecutando NotificationJob...');
  await NotificationJob.run();
  console.log('[CRON] NotificationJob terminado');
});

console.log('CRON NotificationJob programado cada hora');
