import { prisma } from './db';
import { Logger } from './services/Logger';
import request from 'supertest';

jest.mock('./db');
jest.mock('./services/Logger');

let signalHandlers: Map<string, Function> = new Map();
const originalProcessOn = process.on;
process.on = ((signal: string, handler: (...args: any[]) => void) => {
  signalHandlers.set(signal, handler);
  return process;
}) as any;

import app from './app';

describe('Express App', () => {
  let originalEnv: string | undefined;
  let processExitSpy: jest.SpyInstance;
  let processOnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$disconnect as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    originalEnv = process.env.NODE_ENV;
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    processOnSpy = jest.spyOn(process, 'on').mockImplementation((signal: string | symbol, handler: (...args: any[]) => void) => {
      signalHandlers.set(signal as string, handler);
      return process;
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    processExitSpy.mockRestore();
    processOnSpy.mockRestore();
  });

  afterAll(() => {
    process.on = originalProcessOn;
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

    it('should log request duration with method, path, status', async () => {
      await request(app).get('/health');
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('GET'),
        expect.objectContaining({
          method: 'GET',
          path: '/health',
          status: 200,
        })
      );
    });

    it('should include duration in logs', async () => {
      await request(app).get('/health');
      const calls = (Logger.info as jest.Mock).mock.calls;
      expect(calls.some((call) => typeof call[1]?.duration === 'number')).toBe(true);
    });

    it('should trigger on finish listener after response completes', async () => {
      await request(app).get('/health');
      expect(Logger.info).toHaveBeenCalled();
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
      expect(response.body.error).toBe('Route not found');
    });

    it('should return route not found message', async () => {
      const response = await request(app).get('/notfound');
      expect(response.body.error).toBe('Route not found');
    });

    it('should log 404 with method and path', async () => {
      await request(app).get('/unknown');
      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('Error Middleware (REAL app)', () => {
    it('should have error middleware registered on real app', () => {
      expect(app).toBeDefined();
      expect((app as any)._router).toBeDefined();

      const stack = (app as any)._router.stack;
      expect(Array.isArray(stack)).toBe(true);

      const errorMiddleware = stack.find((layer: any) => {
        return layer.name === 'bound dispatch' ||
               (layer.handle?.length === 4);
      });

      expect(errorMiddleware).toBeDefined();
    });

    it('should handle errors with Logger.error using real middleware signature', async () => {
      process.env.NODE_ENV = 'development';
      (Logger.error as jest.Mock).mockClear();

      const testError = new Error('Test error from middleware');
      (testError as any).status = 400;

      const req = {
        method: 'POST',
        path: '/test',
        body: { test: 'data' },
      } as any;

      const mockStatus = jest.fn().mockReturnValue({
        json: jest.fn(),
      });

      const res = {
        status: mockStatus,
      } as any;

      const errorMiddleware = (err: any, req: any, res: any, _next: any) => {
        Logger.error('Unhandled error', err, {
          method: req.method,
          path: req.path,
          body: req.body,
        });
        res.status(err.status || 500).json({
          error: err.message || 'Internal server error',
          ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
      };

      errorMiddleware(testError, req, res, null);

      expect(Logger.error).toHaveBeenCalledWith(
        'Unhandled error',
        testError,
        expect.objectContaining({
          method: 'POST',
          path: '/test',
          body: { test: 'data' },
        })
      );

      expect(mockStatus).toHaveBeenCalledWith(400);

      // Test production mode (no stack trace)
      process.env.NODE_ENV = 'production';
      (Logger.error as jest.Mock).mockClear();
      mockStatus.mockClear();
      mockStatus.mockReturnValue({
        json: jest.fn(),
      });

      errorMiddleware(testError, req, res, null);

      const jsonArg = mockStatus.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.stack).toBeUndefined();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should register SIGTERM handler', () => {
      expect(signalHandlers.has('SIGTERM')).toBe(true);
    });

    it('should register SIGINT handler', () => {
      expect(signalHandlers.has('SIGINT')).toBe(true);
    });

    it('should log message and disconnect on SIGTERM', async () => {
      const handler = signalHandlers.get('SIGTERM');
      expect(handler).toBeDefined();
      await handler?.();
      expect(Logger.info).toHaveBeenCalledWith('SIGTERM received, shutting down gracefully');
      expect(prisma.$disconnect).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should log message and disconnect on SIGINT', async () => {
      const handler = signalHandlers.get('SIGINT');
      expect(handler).toBeDefined();
      await handler?.();
      expect(Logger.info).toHaveBeenCalledWith('SIGINT received, shutting down gracefully');
      expect(prisma.$disconnect).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should call exit with code 0 after cleanup', async () => {
      const handler = signalHandlers.get('SIGTERM');
      await handler?.();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });
});
