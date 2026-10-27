import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Builds shipped before FIELD_ENCRYPTION_KEY was honoured, so existing Aadhaar/PAN values are
 * encrypted with this publicly visible fallback. It is kept ONLY to read that old data until
 * `scripts/reencrypt-pii.ts` has migrated it; nothing is ever encrypted with it in production.
 */
const LEGACY_FALLBACK_SECRET = '0123456789abcdef0123456789abcdef';
const LEGACY_SCRYPT_SALT = 'salt';

const deriveLegacyKey = (secret: string): Buffer =>
  crypto.scryptSync(secret, LEGACY_SCRYPT_SALT, 32);

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  /** Key new data is written with. */
  private readonly key: Buffer;
  /** Key the old data was written with; null once nothing legacy can exist (never, until migrated). */
  private readonly legacyKey: Buffer = deriveLegacyKey(LEGACY_FALLBACK_SECRET);
  private readonly hashKey: Buffer;
  private readonly usingFallbackKey: boolean;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>('FIELD_ENCRYPTION_KEY')?.trim();
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    if (!configured && isProduction) {
      throw new Error('FIELD_ENCRYPTION_KEY must be set in production');
    }
    if (configured && configured.length < 32) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY must be at least 32 characters (use openssl rand -hex 32)',
      );
    }

    this.usingFallbackKey = !configured;
    this.key = configured ? EncryptionService.keyFrom(configured) : this.legacyKey;
    // Separate subkey so the hash key and the cipher key are never the same bytes.
    this.hashKey = crypto.createHmac('sha256', this.key).update('aadhaar-hash-v1').digest();
  }

  /** False when only the public legacy fallback exists, i.e. nothing real protects the data. */
  get hasDedicatedKey(): boolean {
    return !this.usingFallbackKey;
  }

  /** 64 hex chars are used as raw key bytes; anything else is stretched with scrypt. */
  private static keyFrom(secret: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
    return crypto.scryptSync(secret, 'shree-crystal-field-encryption-v1', 32);
  }

  encrypt(text: string): string {
    return this.encryptWith(this.key, text);
  }

  /** Decrypts with the current key, falling back to the legacy key for not-yet-migrated rows. */
  decrypt(encryptedText: string): string {
    try {
      return this.decryptWith(this.key, encryptedText);
    } catch (error) {
      if (this.usingFallbackKey) throw error;
      return this.decryptWith(this.legacyKey, encryptedText);
    }
  }

  /** True when this value is still encrypted with the legacy fallback key. */
  isLegacyCiphertext(encryptedText: string): boolean {
    if (this.usingFallbackKey) return false;
    try {
      this.decryptWith(this.key, encryptedText);
      return false;
    } catch {
      this.decryptWith(this.legacyKey, encryptedText);
      return true;
    }
  }

  /** Keyed hash used for the Aadhaar uniqueness check. */
  hash(text: string): string {
    return crypto.createHmac('sha256', this.hashKey).update(text).digest('hex');
  }

  /** The old unsalted SHA-256, kept so rows hashed before the migration are still found. */
  legacyHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /** Every hash an existing row for this value could carry. Use with `in` / `includes`. */
  hashCandidates(text: string): string[] {
    return [this.hash(text), this.legacyHash(text)];
  }

  private encryptWith(key: Buffer, text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decryptWith(key: Buffer, encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
