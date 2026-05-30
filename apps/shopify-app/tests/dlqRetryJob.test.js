const DLQRetryJob = require('../app/jobs/DLQRetryJob');
const dlq = require('../app/services/dlq');
const oraculo = require('../app/services/oraculo');

jest.mock('../app/services/dlq');
jest.mock('../app/services/oraculo');

describe('DLQRetryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('debería procesar órdenes pendientes', async () => {
      const mockItems = [
        {
          queueId: 'dlq-1',
          order: { id: '100', email: 'test@example.com' },
          idempotencyKey: 'key-1',
          retries: 0
        },
        {
          queueId: 'dlq-2',
          order: { id: '101', email: 'test2@example.com' },
          idempotencyKey: 'key-2',
          retries: 1
        }
      ];

      dlq.getPendingRetries.mockReturnValue(mockItems);
      oraculo.syncOrder.mockResolvedValue({ success: true });

      await DLQRetryJob.run();

      expect(dlq.getPendingRetries).toHaveBeenCalled();
      expect(oraculo.syncOrder).toHaveBeenCalledTimes(2);
      expect(dlq.markSucceeded).toHaveBeenCalledTimes(2);
      expect(dlq.markSucceeded).toHaveBeenCalledWith('dlq-1');
      expect(dlq.markSucceeded).toHaveBeenCalledWith('dlq-2');
    });

    it('debería manejar órdenes sin reintentos pendientes', async () => {
      dlq.getPendingRetries.mockReturnValue([]);

      await DLQRetryJob.run();

      expect(dlq.getPendingRetries).toHaveBeenCalled();
      expect(oraculo.syncOrder).not.toHaveBeenCalled();
    });

    it('debería registrar intento en caso de error', async () => {
      const mockItem = {
        queueId: 'dlq-3',
        order: { id: '102', email: 'fail@example.com' },
        idempotencyKey: 'key-3',
        retries: 1
      };

      dlq.getPendingRetries.mockReturnValue([mockItem]);
      const error = new Error('Sync failed');
      oraculo.syncOrder.mockRejectedValue(error);

      await DLQRetryJob.run();

      expect(dlq.recordRetryAttempt).toHaveBeenCalledWith('dlq-3', error);
      expect(dlq.markSucceeded).not.toHaveBeenCalled();
    });

    it('debería continuar procesando después de un error', async () => {
      const mockItems = [
        {
          queueId: 'dlq-4',
          order: { id: '103', email: 'fail@example.com' },
          idempotencyKey: 'key-4',
          retries: 0
        },
        {
          queueId: 'dlq-5',
          order: { id: '104', email: 'success@example.com' },
          idempotencyKey: 'key-5',
          retries: 0
        }
      ];

      dlq.getPendingRetries.mockReturnValue(mockItems);
      oraculo.syncOrder
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ success: true });

      await DLQRetryJob.run();

      expect(oraculo.syncOrder).toHaveBeenCalledTimes(2);
      expect(dlq.recordRetryAttempt).toHaveBeenCalledTimes(1);
      expect(dlq.markSucceeded).toHaveBeenCalledTimes(1);
      expect(dlq.markSucceeded).toHaveBeenCalledWith('dlq-5');
    });
  });

  describe('processItem', () => {
    it('debería sincronizar y marcar como exitoso', async () => {
      const item = {
        queueId: 'dlq-6',
        order: { id: '105', email: 'ok@example.com' },
        idempotencyKey: 'key-6',
        retries: 0
      };

      oraculo.syncOrder.mockResolvedValue({ success: true });

      await DLQRetryJob.processItem(item);

      expect(oraculo.syncOrder).toHaveBeenCalledWith(item.order, item.idempotencyKey);
      expect(dlq.markSucceeded).toHaveBeenCalledWith('dlq-6');
    });

    it('debería registrar intento al fallar sincronización', async () => {
      const item = {
        queueId: 'dlq-7',
        order: { id: '106', email: 'fail@example.com' },
        idempotencyKey: 'key-7',
        retries: 2
      };

      const error = new Error('API error');
      oraculo.syncOrder.mockRejectedValue(error);

      await DLQRetryJob.processItem(item);

      expect(dlq.recordRetryAttempt).toHaveBeenCalledWith('dlq-7', error);
      expect(dlq.markSucceeded).not.toHaveBeenCalled();
    });

    it('debería manejar logger personalizado', async () => {
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      const item = {
        queueId: 'dlq-8',
        order: { id: '107', email: 'test@example.com' },
        idempotencyKey: 'key-8',
        retries: 0
      };

      oraculo.syncOrder.mockResolvedValue({ success: true });

      await DLQRetryJob.processItem(item, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retentando orden 107')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Orden 107 sincronizada exitosamente')
      );
    });
  });
});
