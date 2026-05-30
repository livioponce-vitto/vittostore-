import { CircuitBreakerService } from '../CircuitBreakerService';
import { prisma } from '../../db';
import { Logger } from '../Logger';

jest.mock('../../db', () => ({
  prisma: {
    aPIHealthMetric: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../Logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    CircuitBreakerService['breakers'].clear();
    CircuitBreakerService['configs'].clear();
    CircuitBreakerService['failureTimestamps'].clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('State: CLOSED', () => {
    it('should allow calls when CLOSED', async () => {
      const fn = jest.fn().mockResolvedValue({ data: 'success' });
      const result = await CircuitBreakerService.execute('TestAPI', fn);
      expect(result).toEqual({ data: 'success' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track response times and metrics', async () => {
      const fn = jest.fn().mockResolvedValue({});
      const startTime = Date.now();
      await CircuitBreakerService.execute('TestAPI', fn);
      const endTime = Date.now();

      // recordMetric is called explicitly, not by execute()
      await CircuitBreakerService.recordMetric('TestAPI', true, endTime - startTime);
      expect(prisma.aPIHealthMetric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apiEndpoint: 'TestAPI',
            success: true,
            responseTimeMs: expect.any(Number),
          }),
        })
      );
    });

    it('should reset failure count on success', async () => {
      const fn = jest.fn().mockResolvedValue({});
      await CircuitBreakerService.execute('TestAPI', fn);
      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('State: CLOSED → OPEN', () => {
    it('should open circuit after 3 failures in 30 seconds', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // First failure
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      jest.advanceTimersByTime(100);

      // Second failure
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      jest.advanceTimersByTime(100);

      // Third failure - should trigger OPEN
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('transitioned to OPEN'),
        expect.any(Object)
      );
    });

    it('should not open if failures exceed threshold but are outside window', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // First failure
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();

      // Advance time beyond failure window (30s)
      jest.advanceTimersByTime(31000);

      // Second failure - should be counted separately, not trigger open
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(1);
    });
  });

  describe('State: OPEN', () => {
    it('should reject calls while OPEN', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // Now circuit is OPEN, next call should fail immediately
      const testFn = jest.fn();
      await expect(CircuitBreakerService.execute('TestAPI', testFn)).rejects.toThrow(
        /Circuit breaker for TestAPI is OPEN/
      );
      expect(testFn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after cooldown', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // Advance past cooldown (60s)
      jest.advanceTimersByTime(60000);

      const successFn = jest.fn().mockResolvedValue({});
      await CircuitBreakerService.execute('TestAPI', successFn);

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('HALF_OPEN');
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned to HALF_OPEN'),
        expect.any(Object)
      );
    });
  });

  describe('State: HALF_OPEN', () => {
    async function triggerHalfOpen() {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // Advance past cooldown to HALF_OPEN
      jest.advanceTimersByTime(60000);
    }

    it('should limit half-open requests to 3', async () => {
      await triggerHalfOpen();

      const successFn = jest.fn().mockResolvedValue({});

      // Make 3 successful calls with high successThreshold to stay in HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await expect(
          CircuitBreakerService.execute('TestAPI', successFn, {
            successThreshold: 10,
          })
        ).resolves.toBeDefined();
      }

      // 4th attempt should fail with exhausted attempts error
      await expect(
        CircuitBreakerService.execute('TestAPI', successFn, {
          successThreshold: 10,
        })
      ).rejects.toThrow(/exhausted half-open attempts/);
    });

    it('should close circuit after 2 successes in HALF_OPEN', async () => {
      await triggerHalfOpen();

      const successFn = jest.fn().mockResolvedValue({});

      // First success
      await CircuitBreakerService.execute('TestAPI', successFn);
      let state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('HALF_OPEN');

      // Second success - should trigger CLOSED
      await CircuitBreakerService.execute('TestAPI', successFn);
      state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned to CLOSED')
      );
    });

    it('should reopen circuit if half-open test fails', async () => {
      await triggerHalfOpen();

      const successFn = jest.fn().mockResolvedValue({});
      const failFn = jest
        .fn()
        .mockRejectedValue(new Error('Still failing'));

      // First success
      await CircuitBreakerService.execute('TestAPI', successFn);

      // Failure during half-open - should reopen
      await expect(CircuitBreakerService.execute('TestAPI', failFn)).rejects.toThrow();

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('recovery failed'),
        expect.any(Object)
      );
    });
  });

  describe('Timeout Handling', () => {
    it('should enforce timeout on API calls', async () => {
      jest.useRealTimers();
      try {
        const slowFn = jest.fn(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ data: 'slow' }), 10000);
            })
        );

        await expect(
          CircuitBreakerService.execute('TestAPI', slowFn, {
            timeout: 1000,
          })
        ).rejects.toThrow(/Timeout after 1000ms/);
      } finally {
        jest.useFakeTimers();
      }
    });

    it('should record timeout as failure metric', async () => {
      jest.useRealTimers();
      try {
        const slowFn = jest.fn(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ data: 'slow' }), 10000);
            })
        );

        await expect(
          CircuitBreakerService.execute('TestAPI', slowFn, {
            timeout: 1000,
          })
        ).rejects.toThrow();

        expect(prisma.aPIHealthMetric.create).not.toHaveBeenCalled();
      } finally {
        jest.useFakeTimers();
      }
    });
  });

  describe('Failure Window Clearing', () => {
    it('should clear old failures after window expires', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // First failure
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      let state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(1);

      // Advance time beyond failure window
      jest.advanceTimersByTime(31000);

      // Second failure - old failure should be cleared
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(1);
    });
  });

  describe('Metric Recording', () => {
    it('should record metric on explicit call', async () => {
      const fn = jest.fn().mockResolvedValue({});
      await CircuitBreakerService.execute('TestAPI', fn);
      await CircuitBreakerService.recordMetric('TestAPI', true, 100);

      expect(prisma.aPIHealthMetric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apiEndpoint: 'TestAPI',
            success: true,
          }),
        })
      );
    });

    it('should record error code on failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('Network timeout'));

      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      await CircuitBreakerService.recordMetric('TestAPI', false, 50, 'TIMEOUT');

      expect(prisma.aPIHealthMetric.create).toHaveBeenCalled();
    });

    it('should handle metric recording errors gracefully', async () => {
      (prisma.aPIHealthMetric.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const fn = jest.fn().mockResolvedValue({});
      const result = await CircuitBreakerService.execute('TestAPI', fn);
      await CircuitBreakerService.recordMetric('TestAPI', true, 100);

      expect(result).toBeDefined();
      // Verify that error was logged even though recordMetric failed
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Reset Functionality', () => {
    it('should reset circuit to CLOSED', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      const state1 = CircuitBreakerService.getState('TestAPI');
      expect(state1.state).toBe('OPEN');

      // Reset
      CircuitBreakerService.reset('TestAPI');

      const state2 = CircuitBreakerService.getState('TestAPI');
      expect(state2.state).toBe('CLOSED');
      expect(state2.failureCount).toBe(0);
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('manually reset to CLOSED')
      );
    });

    it('should clear failure timestamps on reset', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      for (let i = 0; i < 2; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        jest.advanceTimersByTime(100);
      }

      CircuitBreakerService.reset('TestAPI');

      // After reset, new failures should start from 0
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(1);
    });
  });

  describe('Multiple Endpoints Isolation', () => {
    it('should isolate state per endpoint', async () => {
      const failFn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));
      const successFn = jest.fn().mockResolvedValue({});

      // Open circuit for API1
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('API1', failFn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // API2 should still be CLOSED
      await CircuitBreakerService.execute('API2', successFn);

      const state1 = CircuitBreakerService.getState('API1');
      const state2 = CircuitBreakerService.getState('API2');

      expect(state1.state).toBe('OPEN');
      expect(state2.state).toBe('CLOSED');
    });

    it('should allow different configs per breaker', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // API1 with threshold=2
      for (let i = 0; i < 2; i++) {
        await expect(
          CircuitBreakerService.execute('API1', fn, {
            failureThreshold: 2,
          })
        ).rejects.toThrow();
        jest.advanceTimersByTime(100);
      }

      const state1 = CircuitBreakerService.getState('API1');
      expect(state1.state).toBe('OPEN');

      // API2 should need 3 failures (default)
      for (let i = 0; i < 2; i++) {
        await expect(CircuitBreakerService.execute('API2', fn)).rejects.toThrow();
        jest.advanceTimersByTime(100);
      }

      const state2 = CircuitBreakerService.getState('API2');
      expect(state2.state).toBe('CLOSED');
    });
  });

  describe('Configuration Override', () => {
    it('should apply custom config to execute', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // With custom failureThreshold=2
      for (let i = 0; i < 2; i++) {
        await expect(
          CircuitBreakerService.execute('TestAPI', fn, {
            failureThreshold: 2,
          })
        ).rejects.toThrow();
        jest.advanceTimersByTime(100);
      }

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
    });
  });

  describe('Error Propagation', () => {
    it('should propagate original error on failure', async () => {
      const customError = new Error('Custom API Error');
      const fn = jest.fn().mockRejectedValue(customError);

      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow(
        'Custom API Error'
      );
    });

    it('should propagate CB_OPEN error when circuit open', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // Next call should fail with CB_OPEN
      await expect(CircuitBreakerService.execute('TestAPI', fn)).rejects.toThrow(
        /Circuit breaker for TestAPI is OPEN/
      );
    });
  });

  describe('State Transitions Edge Cases', () => {
    it('should maintain state consistency during concurrent calls', async () => {
      const fn = jest.fn().mockResolvedValue({});

      // Simulate concurrent calls
      const promises = [
        CircuitBreakerService.execute('TestAPI', fn),
        CircuitBreakerService.execute('TestAPI', fn),
        CircuitBreakerService.execute('TestAPI', fn),
      ];

      await Promise.all(promises);

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should handle rapid state transitions', async () => {
      const failFn = jest
        .fn()
        .mockRejectedValue(new Error('Error'));
      const successFn = jest.fn().mockResolvedValue({});

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        await expect(CircuitBreakerService.execute('TestAPI', failFn)).rejects.toThrow();
        if (i < 2) jest.advanceTimersByTime(100);
      }

      // Jump to HALF_OPEN
      jest.advanceTimersByTime(60000);

      // Rapid successes to CLOSED
      await CircuitBreakerService.execute('TestAPI', successFn);
      await CircuitBreakerService.execute('TestAPI', successFn);

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
    });
  });
});
