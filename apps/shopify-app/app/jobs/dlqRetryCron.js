// app/jobs/dlqRetryCron.js
const cron = require('node-cron');
const DLQRetryJob = require('./DLQRetryJob');

// Ejecuta el job cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  console.log('[CRON] Ejecutando DLQRetryJob...');
  await DLQRetryJob.run();
  console.log('[CRON] DLQRetryJob terminado');
});

console.log('[CRON] DLQRetryJob programado cada 5 minutos');
