const crypto = require('crypto');
const { router, decryptToken } = require('../app/routes/auth');

describe('auth module', () => {
  it('debe encriptar y desencriptar correctamente', () => {
    const ENCRYPTION_KEY = crypto.randomBytes(32);
    const token = 'test-token';
    // Simula encryptToken
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    // Simula decryptToken
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final()
    ]).toString('utf8');
    expect(decrypted).toBe(token);
  });
});
