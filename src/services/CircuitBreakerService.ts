export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  failureWindow: number;
  cooldownTime: number;
  halfOpenRequests: number;
  timeout: number;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  openedAt: Date | null;
  halfOpenAttempts: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  failureWindow: 30000,
  cooldownTime: 60000,
  halfOpenRequests: 3,
  timeout: 5000,
};

interface BreakerInstance {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  openedAt: Date | null;
  halfOpenAttempts: number;
  config: CircuitBreakerConfig;
}

export class CircuitBreakerService {
  private static breakers: Map<string, BreakerInstance> = new Map();

  private static getOrCreateBreaker(
    endpointName: string,
    config?: Partial<CircuitBreakerConfig>
  ): BreakerInstance {
    if (!this.breakers.has(endpointName)) {
      this.breakers.set(endpointName, {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAttempts: 0,
        config: { ...DEFAULT_CONFIG, ...config },
      });
    }

    const breaker = this.breakers.get(endpointName)!;
    if (config) {
      breaker.config = { ...breaker.config, ...config };
    }

    return breaker;
  }

  private static clearOldFailures(breaker: BreakerInstance): void {
    if (breaker.lastFailureTime) {
      const timeSinceFailure = Date.now() - breaker.lastFailureTime.getTime();
      if (timeSinceFailure > breaker.config.failureWindow) {
        breaker.failureCount = 0;
        breaker.lastFailureTime = null;
      }
    }
  }

  private static transitionToHalfOpen(breaker: BreakerInstance): void {
    breaker.state = 'HALF_OPEN';
    breaker.halfOpenAttempts = 0;
    breaker.successCount = 0;
    breaker.failureCount = 0;
  }

  static async execute<T>(
    endpointName: string,
    fn: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(endpointName, config);

    // Check if we should transition from OPEN to HALF_OPEN
    if (breaker.state === 'OPEN' && breaker.openedAt) {
      const timeSinceOpened = Date.now() - breaker.openedAt.getTime();
      if (timeSinceOpened > breaker.config.cooldownTime) {
        this.transitionToHalfOpen(breaker);
      }
    }

    // Reject if circuit is OPEN
    if (breaker.state === 'OPEN') {
      const error = new Error('Circuit breaker is OPEN');
      (error as any).code = 'CB_OPEN';
      (error as any).cbState = 'OPEN';
      throw error;
    }

    // Reject if HALF_OPEN and max attempts reached
    if (breaker.state === 'HALF_OPEN' && breaker.halfOpenAttempts >= breaker.config.halfOpenRequests) {
      const error = new Error('Circuit breaker HALF_OPEN: max test attempts reached');
      (error as any).code = 'CB_HALF_OPEN_LIMIT';
      (error as any).cbState = 'HALF_OPEN';
      throw error;
    }

    if (breaker.state === 'HALF_OPEN') {
      breaker.halfOpenAttempts++;
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error('Circuit breaker timeout')),
            breaker.config.timeout
          )
        ),
      ]);

      // Success
      if (breaker.state === 'CLOSED') {
        breaker.failureCount = 0;
        breaker.lastFailureTime = null;
      } else if (breaker.state === 'HALF_OPEN') {
        breaker.successCount++;
        if (breaker.successCount >= breaker.config.successThreshold) {
          breaker.state = 'CLOSED';
          breaker.failureCount = 0;
          breaker.successCount = 0;
          breaker.halfOpenAttempts = 0;
          breaker.openedAt = null;
        }
      }

      return result;
    } catch (error) {
      breaker.lastFailureTime = new Date();

      if (breaker.state === 'CLOSED') {
        this.clearOldFailures(breaker);
        breaker.failureCount++;

        if (breaker.failureCount >= breaker.config.failureThreshold) {
          breaker.state = 'OPEN';
          breaker.openedAt = new Date();
        }
      } else if (breaker.state === 'HALF_OPEN') {
        breaker.state = 'OPEN';
        breaker.openedAt = new Date();
        breaker.failureCount = 0;
        breaker.successCount = 0;
        breaker.halfOpenAttempts = 0;
      }

      throw error;
    }
  }

  static getState(endpointName: string): CircuitBreakerState {
    const breaker = this.getOrCreateBreaker(endpointName);
    this.clearOldFailures(breaker);

    // Check if we should transition from OPEN to HALF_OPEN
    if (breaker.state === 'OPEN' && breaker.openedAt) {
      const timeSinceOpened = Date.now() - breaker.openedAt.getTime();
      if (timeSinceOpened > breaker.config.cooldownTime) {
        this.transitionToHalfOpen(breaker);
      }
    }

    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      successCount: breaker.successCount,
      lastFailureTime: breaker.lastFailureTime,
      openedAt: breaker.openedAt,
      halfOpenAttempts: breaker.halfOpenAttempts,
    };
  }

  static async recordMetric(
    endpointName: string,
    success: boolean,
    responseTimeMs: number,
    errorCode?: string,
    orderId?: string
  ): Promise<void> {
    // This is async but called without await from PaymentService
    // Fire-and-forget to avoid blocking payment processing
    import('../db').then(({ prisma }) => {
      if (!prisma) return;

      prisma.aPIHealthMetric.create({
        data: {
          apiEndpoint: endpointName,
          success,
          responseTimeMs,
          errorCode: errorCode || null,
          orderId: orderId || null,
        },
      }).catch(() => {
        // Silently fail - metrics recording failure should not block payment processing
      });
    }).catch(() => {
      // Silently fail db import - metrics recording is non-critical
    });
  }

  static reset(endpointName: string): void {
    if (this.breakers.has(endpointName)) {
      const breaker = this.breakers.get(endpointName)!;
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.lastFailureTime = null;
      breaker.openedAt = null;
      breaker.halfOpenAttempts = 0;
    }
  }
}
