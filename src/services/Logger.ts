import { VaultService } from './VaultService';

/**
 * Logger with PII redaction
 * Enforces: engineering-security/SKILL.md (PII redaction in logs)
 */
export class Logger {
  private static readonly PII_PATTERNS = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /\+?56\s?\d{2}\s?\d{4}\s?\d{4}|\d{9}/g,
    rut: /\d{1,2}\.\d{3}\.\d{3}-[0-9K]/g,
  };

  private static redactPII(message: any): any {
    if (typeof message !== 'string' && typeof message !== 'object') {
      return message;
    }

    let text = typeof message === 'string' ? message : JSON.stringify(message);

    // Redact email
    text = text.replace(this.PII_PATTERNS.email, (email: string) => {
      return VaultService.redact(email, 'email');
    });

    // Redact phone
    text = text.replace(this.PII_PATTERNS.phone, (phone: string) => {
      return VaultService.redact(phone, 'phone');
    });

    // Redact RUT
    text = text.replace(this.PII_PATTERNS.rut, (rut: string) => {
      return VaultService.redact(rut, 'rut');
    });

    return typeof message === 'string' ? text : JSON.parse(text);
  }

  static info(message: string, context?: any): void {
    const safe = this.redactPII(context || message);
    console.log(`[INFO] ${this.redactPII(message)}`, safe);
  }

  static warn(message: string, context?: any): void {
    const safe = this.redactPII(context || message);
    console.warn(`[WARN] ${this.redactPII(message)}`, safe);
  }

  static error(message: string, error?: Error, context?: any): void {
    const safe = this.redactPII(context);
    console.error(`[ERROR] ${this.redactPII(message)}`, error?.message, safe);
  }

  static debug(message: string, context?: any): void {
    if (process.env.DEBUG === 'true') {
      const safe = this.redactPII(context || message);
      console.debug(`[DEBUG] ${this.redactPII(message)}`, safe);
    }
  }
}
