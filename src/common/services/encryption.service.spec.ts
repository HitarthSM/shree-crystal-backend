import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { planReencryption } from '../../members/pii-reencryption';

const KEY = 'a'.repeat(32) + 'b'.repeat(32);
const configWith = (values: Record<string, string>) => new ConfigService(values);

/** What older builds did: no real key configured, so the public fallback was used. */
const legacy = () => new EncryptionService(configWith({}));
const current = () => new EncryptionService(configWith({ FIELD_ENCRYPTION_KEY: KEY }));

describe('EncryptionService', () => {
  it('round-trips with the configured key', () => {
    const service = current();
    expect(service.decrypt(service.encrypt('123456789012'))).toBe('123456789012');
  });

  it('still reads data written by older builds with the fallback key', () => {
    const old = legacy().encrypt('123456789012');
    const service = current();

    expect(service.decrypt(old)).toBe('123456789012');
    expect(service.isLegacyCiphertext(old)).toBe(true);
  });

  it('writes new data that the fallback key cannot read', () => {
    const fresh = current().encrypt('123456789012');

    expect(() => legacy().decrypt(fresh)).toThrow();
    expect(current().isLegacyCiphertext(fresh)).toBe(false);
  });

  it('refuses to start in production without a key', () => {
    expect(() => new EncryptionService(configWith({ NODE_ENV: 'production' }))).toThrow(
      /FIELD_ENCRYPTION_KEY/,
    );
  });

  it('rejects a short key', () => {
    expect(() => new EncryptionService(configWith({ FIELD_ENCRYPTION_KEY: 'short' }))).toThrow();
  });

  it('uses a keyed hash that differs from plain SHA-256', () => {
    const service = current();
    const keyed = service.hash('123456789012');

    expect(keyed).not.toBe(service.legacyHash('123456789012'));
    expect(keyed).toBe(current().hash('123456789012'));
    expect(
      new EncryptionService(configWith({ FIELD_ENCRYPTION_KEY: 'c'.repeat(64) })).hash(
        '123456789012',
      ),
    ).not.toBe(keyed);
    expect(service.hashCandidates('123456789012')).toEqual([
      keyed,
      service.legacyHash('123456789012'),
    ]);
  });
});

describe('planReencryption', () => {
  const oldRow = () => {
    const old = legacy();
    return {
      id: 'm1',
      aadhaarHash: old.legacyHash('123456789012'),
      aadhaarEncrypted: old.encrypt('123456789012'),
      panEncrypted: old.encrypt('ABCDE1234F'),
    };
  };

  it('migrates a legacy row and the result decrypts to the same values', () => {
    const service = current();
    const update = planReencryption(service, oldRow())!;

    expect(update.aadhaarHash).toBe(service.hash('123456789012'));
    expect(service.decrypt(update.aadhaarEncrypted!)).toBe('123456789012');
    expect(service.decrypt(update.panEncrypted!)).toBe('ABCDE1234F');
    expect(service.isLegacyCiphertext(update.aadhaarEncrypted!)).toBe(false);
  });

  it('is a no-op for a row that is already migrated, so re-running is safe', () => {
    const service = current();
    const update = planReencryption(service, oldRow())!;
    const migrated = {
      id: 'm1',
      aadhaarHash: update.aadhaarHash!,
      aadhaarEncrypted: update.aadhaarEncrypted!,
      panEncrypted: update.panEncrypted!,
    };

    expect(planReencryption(service, migrated)).toBeNull();
  });

  it('handles a member without a PAN', () => {
    const service = current();
    const update = planReencryption(service, { ...oldRow(), panEncrypted: null })!;

    expect(update.panEncrypted).toBeUndefined();
  });

  it('throws on data neither key can read instead of overwriting it', () => {
    const other = new EncryptionService(configWith({ FIELD_ENCRYPTION_KEY: 'd'.repeat(64) }));
    const row = { ...oldRow(), aadhaarEncrypted: other.encrypt('123456789012') };

    expect(() => planReencryption(current(), row)).toThrow();
  });
});
