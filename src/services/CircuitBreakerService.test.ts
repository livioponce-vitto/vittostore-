import { CircuitBreakerService } from './CircuitBreakerService';

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    // Reset all breakers before each test
    CircuitBreakerService.reset('TestAPI');
    CircuitBreakerService.reset('BancoChileAPI');
  });

  describe('State: CLOSED (healthy)', () => {
    it('should allow calls when CLOSED', async () => {
      const result = await CircuitBreakerService.execute(
        'TestAPI',
        () => Promise.resolve({ success: true }),
        { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 }
      );
      expect(result.success).toBe(true);
    });

    it('should start with CLOSED state', () => {
      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should reset failure count on successful call', async () => {
      await CircuitBreakerService.execute(
        'TestAPI',
        () => Promise.resolve({ success: true }),
        { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 }
      );

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('State: CLOSED → OPEN', () => {
    it('should open circuit after 3 failures in 30 seconds', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch (error) {
          // Expected
        }
      }

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
    });

    it('should reject calls with CB_OPEN error when circuit is OPEN', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      // Trigger 3 failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Next call should be rejected immediately
      await expect(
        CircuitBreakerService.execute('TestAPI', () => Promise.resolve({ success: true }), config)
      ).rejects.toThrow('Circuit breaker is OPEN');

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
    });

    it('should include CB state in error details', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      try {
        await CircuitBreakerService.execute('TestAPI', () => Promise.resolve({ success: true }), config);
      } catch (error: any) {
        expect(error.code).toBe('CB_OPEN');
        expect(error.cbState).toBe('OPEN');
      }
    });
  });

  describe('State: OPEN → HALF_OPEN', () => {
    it('should transition to HALF_OPEN after cooldown time', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 100, halfOpenRequests: 3, timeout: 5000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 120));

      // Next state check should show HALF_OPEN
      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('HALF_OPEN');
    });

    it('should allow limited test calls (halfOpenRequests) in HALF_OPEN state', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 4, failureWindow: 30000, cooldownTime: 100, halfOpenRequests: 3, timeout: 5000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 120));

      // Should allow 3 test calls in HALF_OPEN
      const successFn = () => Promise.resolve({ success: true });
      for (let i = 0; i < 3; i++) {
        const result = await CircuitBreakerService.execute('TestAPI', successFn, config);
        expect(result.success).toBe(true);
      }

      // 4th call should be rejected
      await expect(
        CircuitBreakerService.execute('TestAPI', successFn, config)
      ).rejects.toThrow('Circuit breaker HALF_OPEN: max test attempts reached');
    });
  });

  describe('State: HALF_OPEN → CLOSED', () => {
    it('should close circuit after successThreshold successes in HALF_OPEN', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const successFn = () => Promise.resolve({ success: true });
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 100, halfOpenRequests: 3, timeout: 5000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 120));

      // Verify HALF_OPEN
      let state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('HALF_OPEN');

      // Execute 2 successful calls
      await CircuitBreakerService.execute('TestAPI', successFn, config);
      await CircuitBreakerService.execute('TestAPI', successFn, config);

      // Should be back to CLOSED
      state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should reset counters when transitioning from HALF_OPEN to CLOSED', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const successFn = () => Promise.resolve({ success: true });
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 100, halfOpenRequests: 3, timeout: 5000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Wait and recover
      await new Promise(resolve => setTimeout(resolve, 120));
      await CircuitBreakerService.execute('TestAPI', successFn, config);
      await CircuitBreakerService.execute('TestAPI', successFn, config);

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.halfOpenAttempts).toBe(0);
    });
  });

  describe('State: HALF_OPEN → OPEN (recovery fails)', () => {
    it('should reopen circuit if half-open test fails', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const successFn = () => Promise.resolve({ success: true });
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 100, halfOpenRequests: 3, timeout: 5000 };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      // Wait for cooldown to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 120));

      // One success
      await CircuitBreakerService.execute('TestAPI', successFn, config);

      // One failure should reopen
      try {
        await CircuitBreakerService.execute('TestAPI', failFn, config);
      } catch {
        // Expected
      }

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.state).toBe('OPEN');
    });
  });

  describe('Failure window management', () => {
    it('should clear old failures after failureWindow time', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 100, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      // Create 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', failFn, config);
        } catch {
          // Expected
        }
      }

      let state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(2);

      // Wait for failure window to expire
      await new Promise(resolve => setTimeout(resolve, 120));

      // Check state - failures should be cleared
      state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe('CLOSED');
    });

    it('should track failure timestamps correctly', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      try {
        await CircuitBreakerService.execute('TestAPI', failFn, config);
      } catch {
        // Expected
      }

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.lastFailureTime).not.toBeNull();
      expect(state.lastFailureTime).toBeInstanceOf(Date);
    });
  });

  describe('Timeout handling', () => {
    it('should enforce timeout on API calls', async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 10000));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 100 };

      await expect(
        CircuitBreakerService.execute('TestAPI', slowFn, config)
      ).rejects.toThrow('Circuit breaker timeout');
    });

    it('should record timeout as failure metric', async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 10000));
      const config = { failureThreshold: 2, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 100 };

      for (let i = 0; i < 2; i++) {
        try {
          await CircuitBreakerService.execute('TestAPI', slowFn, config);
        } catch {
          // Expected
        }
      }

      const state = CircuitBreakerService.getState('TestAPI');
      expect(state.failureCount).toBe(2);
      expect(state.state).toBe('OPEN');
    });
  });

  describe('Multiple breakers (isolation)', () => {
    it('should isolate state per endpoint', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config = { failureThreshold: 3, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      // Open first breaker
      for (let i = 0; i < 3; i++) {
        try {
          await CircuitBreakerService.execute('API1', failFn, config);
        } catch {
          // Expected
        }
      }

      const state1 = CircuitBreakerService.getState('API1');
      const state2 = CircuitBreakerService.getState('API2');

      expect(state1.state).toBe('OPEN');
      expect(state2.state).toBe('CLOSED');
    });

    it('should allow different configs per breaker', async () => {
      const failFn = () => Promise.reject(new Error('API Failed'));
      const config1 = { failureThreshold: 1, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };
      const config2 = { failureThreshold: 5, successThreshold: 2, failureWindow: 30000, cooldownTime: 60000, halfOpenRequests: 3, timeout: 5000 };

      // API1 opens after 1 failure
      try {
        await CircuitBreakerService.execute('API1', failFn, config1);
      } catch {
        // Expected
      }

      // API2 needs 5 failures to open
      for (let i = 0; i < 4; i++) {
        try {
          await CircuitBreakerService.execute('API2', failFn, config2);
        } catch {
          // Expected
        }
      }

      const state1 = CircuitBreakerService.getState('API1');
      const state2 = CircuitBreakerService.getState('API2');

      expect(state1.state).toBe('OPEN');
      expect(state2.state).toBe('CLOSED');
    });
  });

  describe('Banco Chile specific', () => {
    it('should work with Banco Chile configuration', async () => {
      const successFn = () => Promise.resolve({ transactionId: 'bc_123' });
      const config = {
        failureThreshold: 3,
        successThreshold: 2,
        failureWindow: 30000,
        cooldownTime: 60000,
        halfOpenRequests: 3,
        timeout: 5000,
      };

      const result = await CircuitBreakerService.execute('BancoChileAPI', successFn, config);
      expect(result.transactionId).toBe('bc_123');

      const state = CircuitBreakerService.getState('BancoChileAPI');
      expect(state.state).toBe('CLOSED');
    });
  });
});
