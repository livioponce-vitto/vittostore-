import app, { initializeRetryWorker } from './app';
import { Logger } from './services/Logger';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, async () => {
  Logger.info(`VittoStore server started on port ${PORT} (${NODE_ENV})`, {
    port: PORT,
    env: NODE_ENV,
  });

  await initializeRetryWorker();
});

server.on('error', (error) => {
  Logger.error('Server error', error as Error);
  process.exit(1);
});
