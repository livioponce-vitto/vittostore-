import app from './app';
import { Logger } from './services/Logger';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, () => {
  Logger.info(`VittoStore server started on port ${PORT} (${NODE_ENV})`, {
    port: PORT,
    env: NODE_ENV,
  });
});

server.on('error', (error) => {
  Logger.error('Server error', error as Error);
  process.exit(1);
});
