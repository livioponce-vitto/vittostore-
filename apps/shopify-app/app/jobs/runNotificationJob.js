// jobs/runNotificationJob.js
const NotificationJob = require('./NotificationJob');

(async () => {
  console.log('Ejecutando NotificationJob manualmente...');
  await NotificationJob.run();
  console.log('NotificationJob terminado');
})();
