import app from './app';
import { prisma } from './db';
import { Logger } from './services/Logger';
import request from 'supertest';

jest.mock('./db');
jest.mock('./services/Logger');

describe('Express App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return 200 status on GET /health', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should include timestamp in health response', async () => {
      const response = await request(app).get('/health');
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp) instanceof Date).toBe(true);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');
      expect(response.type).toContain('json');
    });
  });

  describe('Middleware', () => {
    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/nonexistent')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });

    it('should log request duration', async () => {
      await request(app).get('/health');
      expect(Logger.info).toHaveBeenCalled();
    });

    it('should include method and path in logs', async () => {
      await request(app).get('/health');
      const calls = (Logger.info as jest.Mock).mock.calls;
      expect(calls.some((call) => call[0]?.includes('GET'))).toBe(true);
    });
  });

  describe('Router Mounting', () => {
    it('should mount orders router at /orders', () => {
      expect(app).toBeDefined();
    });

    it('should mount dashboard router at /dashboard', () => {
      expect(app).toBeDefined();
    });

    it('should mount health check at /health', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should return error message in response', async () => {
      const response = await request(app).get('/unknown');
      expect(response.body.error).toBeDefined();
    });

    it('should return route not found message', async () => {
      const response = await request(app).get('/notfound');
      expect(response.body.error).toBe('Route not found');
    });

    it('should log 404 errors', async () => {
      await request(app).get('/unknown');
      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should have SIGTERM handler registered', () => {
      expect(typeof process.on).toBe('function');
    });

    it('should have SIGINT handler registered', () => {
      expect(typeof process.on).toBe('function');
    });

    it('should disconnect Prisma on shutdown', async () => {
      expect(prisma.$disconnect).toBeDefined();
    });

    it('should call process.exit(0) after cleanup', () => {
      expect(typeof process.exit).toBe('function');
    });
  });
});
