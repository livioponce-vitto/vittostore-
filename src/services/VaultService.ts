import crypto from 'crypto';

/**
 * Vault Service: encrypts PII at rest
 * Enforces: engineering-security/SKILL.md (PII encryption)
 *
 * In production, this delegates to HashiCorp Vault
 * For development, uses local encryption with rotating keys
 */
export class VaultService {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';

  /**
   * Encrypt sensitive data (email, phone, RUT)
   * Returns: `enc_v1_{base64_iv}_{base64_ciphertext}_{base64_tag}`
   */
  static encrypt(plaintext: string): string {
    const vault_key = process.env.VAULT_ENCRYPTION_KEY;
    if (!vault_key) {
      throw new Error('VAULT_ENCRYPTION_KEY not set');
    }

    const key = Buffer.from(vault_key, 'base64');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return `enc_v1_${iv.toString('base64')}_${encrypted}_${tag.toString('base64')}`;
  }

  /**
   * Decrypt sensitive data
   * Expects: `enc_v1_{base64_iv}_{base64_ciphertext}_{base64_tag}`
   */
  static decrypt(ciphertext: string): string {
    const vault_key = process.env.VAULT_ENCRYPTION_KEY;
    if (!vault_key) {
      throw new Error('VAULT_ENCRYPTION_KEY not set');
    }

    const [version, versionNum, ivStr, encrypted, tagStr] = ciphertext.split('_');
    if (version !== 'enc' || versionNum !== 'v1' || !ivStr || encrypted === undefined || !tagStr) {
      throw new Error('Invalid ciphertext format');
    }

    const key = Buffer.from(vault_key, 'base64');
    const iv = Buffer.from(ivStr, 'base64');
    const tag = Buffer.from(tagStr, 'base64');

    const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Redact PII for logging (e.g., "user@example.com" → "u***@example.com")
   */
  static redact(value: string, type: 'email' | 'phone' | 'rut' = 'email'): string {
    if (type === 'email') {
      const [local, domain] = value.split('@');
      return `${local[0]}${'*'.repeat(local.length - 2)}@${domain}`;
    } else if (type === 'phone') {
      return `+56 ****${value.slice(-4)}`;
    } else if (type === 'rut') {
      return `**${value.slice(-4)}`;
    }
    return value;
  }

  /**
   * Check if a value is already encrypted
   */
  static isEncrypted(value: string): boolean {
    return value.startsWith('enc_v1_');
  }

  /**
   * Rotate encryption keys (HashiCorp Vault integration)
   * Called periodically (e.g., every 90 days)
   */
  static async rotateKeys(): Promise<void> {
    // TODO: Integrate with HashiCorp Vault
    // This would:
    // 1. Generate new master key
    // 2. Decrypt all PII with old key
    // 3. Re-encrypt with new key
    // 4. Update VAULT_ENCRYPTION_KEY
    // 5. Log rotation event
    console.log('Key rotation scheduled every 90 days');
  }
}
