import { Logger } from './Logger';
import { prisma } from '../db';

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

class CircuitBreakerServiceImpl {
  private breakers: Map<string, CircuitBreakerState> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();
  private failureTimestamps: Map<string, number[]> = new Map();

  async execute<T>(
    endpointName: string,
    fn: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<T> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    this.configs.set(endpointName, fullConfig);

    const state = this.getOrCreateState(endpointName);

    if (state.state === 'OPEN') {
      const timeSinceOpen = Date.now() - (state.openedAt?.getTime() || 0);
      if (timeSinceOpen >= fullConfig.cooldownTime) {
        state.state = 'HALF_OPEN';
        state.successCount = 0;
        state.halfOpenAttempts = 0;
        Logger.info(`CircuitBreaker ${endpointName} transitioned to HALF_OPEN`, {
          timeSinceOpen,
          cooldownTime: fullConfig.cooldownTime,
        });
      } else {
        throw new Error(
          `Circuit breaker for ${endpointName} is OPEN. Retry after ${fullConfig.cooldownTime - timeSinceOpen}ms`,
        );
      }
    }

    if (state.state === 'HALF_OPEN') {
      if (state.halfOpenAttempts >= fullConfig.halfOpenRequests) {
        throw new Error(`Circuit breaker for ${endpointName} has exhausted half-open attempts`);
      }
      state.halfOpenAttempts++;
    }

    const timeoutPromise = new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout after ${fullConfig.timeout}ms`)),
        fullConfig.timeout,
      ),
    );

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      this.recordSuccess(endpointName, fullConfig);
      return result;
    } catch (error) {
      this.recordFailure(endpointName, fullConfig);
      throw error;
    }
  }

  private recordSuccess(endpointName: string, config: CircuitBreakerConfig): void {
    const state = this.getOrCreateState(endpointName);

    if (state.state === 'HALF_OPEN') {
      state.successCount++;
      if (state.successCount >= config.successThreshold) {
        state.state = 'CLOSED';
        state.failureCount = 0;
        state.successCount = 0;
        state.lastFailureTime = null;
        state.openedAt = null;
        this.failureTimestamps.delete(endpointName);
        Logger.info(`CircuitBreaker ${endpointName} transitioned to CLOSED`);
      }
    } else if (state.state === 'CLOSED') {
      state.failureCount = 0;
    }
  }

  private recordFailure(endpointName: string, config: CircuitBreakerConfig): void {
    const state = this.getOrCreateState(endpointName);
    const now = Date.now();

    state.lastFailureTime = new Date(now);

    let timestamps = this.failureTimestamps.get(endpointName) || [];
    timestamps = timestamps.filter((ts) => now - ts < config.failureWindow);
    timestamps.push(now);
    this.failureTimestamps.set(endpointName, timestamps);

    state.failureCount = timestamps.length;

    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
      state.openedAt = new Date(now);
      state.successCount = 0;
      state.halfOpenAttempts = 0;
      Logger.warn(`CircuitBreaker ${endpointName} transitioned to OPEN (recovery failed)`, {
        failureCount: state.failureCount,
      });
    } else if (state.state === 'CLOSED') {
      if (state.failureCount >= config.failureThreshold) {
        state.state = 'OPEN';
        state.openedAt = new Date(now);
        Logger.warn(`CircuitBreaker ${endpointName} transitioned to OPEN`, {
          failureCount: state.failureCount,
          threshold: config.failureThreshold,
        });
      }
    }
  }

  getState(endpointName: string): CircuitBreakerState {
    return this.getOrCreateState(endpointName);
  }

  private getOrCreateState(endpointName: string): CircuitBreakerState {
    if (!this.breakers.has(endpointName)) {
      this.breakers.set(endpointName, {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAttempts: 0,
      });
    }
    return this.breakers.get(endpointName)!;
  }

  reset(endpointName: string): void {
    this.breakers.set(endpointName, {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      openedAt: null,
      halfOpenAttempts: 0,
    });
    this.failureTimestamps.delete(endpointName);
    Logger.info(`CircuitBreaker ${endpointName} manually reset to CLOSED`);
  }

  async recordMetric(
    endpointName: string,
    success: boolean,
    responseTimeMs: number,
    errorCode?: string,
    orderId?: string,
  ): Promise<void> {
    try {
      await prisma.aPIHealthMetric.create({
        data: {
          apiEndpoint: endpointName,
          timestamp: new Date(),
          responseTimeMs,
          success,
          errorCode: errorCode || null,
          errorMessage: errorCode ? `${endpointName} error: ${errorCode}` : null,
          retryAttempt: 0,
          orderId: orderId || null,
        },
      });
    } catch (error) {
      Logger.error(`Failed to record API health metric for ${endpointName}`, error as Error, {
        success,
        responseTimeMs,
        errorCode,
      });
    }
  }
}

export const CircuitBreakerService = new CircuitBreakerServiceImpl();
