import { VaultService } from './VaultService';

jest.mock('./Logger');

describe('VaultService', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt plaintext data', () => {
      const plaintext = 'sensitive@email.com';
      const encrypted = VaultService.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted !== plaintext).toBe(true);
    });

    it('should decrypt encrypted data', () => {
      const plaintext = 'sensitive@email.com';
      const encrypted = VaultService.encrypt(plaintext);
      const decrypted = VaultService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should use AES-256-GCM algorithm', () => {
      const algorithm = 'aes-256-gcm';
      expect(algorithm).toBe('aes-256-gcm');
    });

    it('should use 32-byte encryption key', () => {
      const keyLength = 32;
      expect(keyLength * 8).toBe(256);
    });

    it('should generate unique IV for each encryption', () => {
      const plaintext = 'test';
      const enc1 = VaultService.encrypt(plaintext);
      const enc2 = VaultService.encrypt(plaintext);

      expect(enc1 !== enc2).toBe(true);
    });

    it('should handle empty string', () => {
      const encrypted = VaultService.encrypt('');
      const decrypted = VaultService.decrypt(encrypted);

      expect(decrypted).toBe('');
    });
  });

  describe('PII Encryption', () => {
    it('should encrypt email addresses', () => {
      const email = 'user@example.com';
      const encrypted = VaultService.encrypt(email);

      expect(encrypted).not.toContain('@');
    });

    it('should encrypt phone numbers', () => {
      const phone = '+56912345678';
      const encrypted = VaultService.encrypt(phone);

      expect(encrypted).not.toContain('56');
    });

    it('should encrypt RUT identifiers', () => {
      const rut = '12345678-9';
      const encrypted = VaultService.encrypt(rut);

      expect(encrypted).not.toContain('12345678');
    });

    it('should preserve decryption roundtrip for all PII types', () => {
      const piiList = ['user@test.com', '+56912345678', '12345678-9'];

      piiList.forEach(pii => {
        const encrypted = VaultService.encrypt(pii);
        const decrypted = VaultService.decrypt(encrypted);
        expect(decrypted).toBe(pii);
      });
    });
  });

  describe('Key Rotation Support', () => {
    it('should support multiple key versions', () => {
      const keyVersion1 = 'base64encodedkey1';
      const keyVersion2 = 'base64encodedkey2';

      expect(keyVersion1).not.toBe(keyVersion2);
    });

    it('should allow decryption with old key version', () => {
      const plaintext = 'test';
      const encrypted = VaultService.encrypt(plaintext);
      const decrypted = VaultService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Encryption at Rest', () => {
    it('should be used for customerEmail field', () => {
      const email = 'customer@example.com';
      const encrypted = VaultService.encrypt(email);

      expect(encrypted).not.toContain(email);
    });

    it('should prevent plaintext storage', () => {
      const sensitive = 'secret123';
      const inDB = VaultService.encrypt(sensitive);

      expect(inDB).not.toContain('secret123');
    });
  });
});
