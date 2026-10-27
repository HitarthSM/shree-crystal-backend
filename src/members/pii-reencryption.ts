import { EncryptionService } from '../common/services/encryption.service';

export interface PiiRow {
  id: string;
  aadhaarHash: string;
  aadhaarEncrypted: string;
  panEncrypted: string | null;
}

export interface PiiUpdate {
  aadhaarHash?: string;
  aadhaarEncrypted?: string;
  panEncrypted?: string;
}

/**
 * Works out what one member row needs so that it is protected by the current key and the keyed
 * hash. Returns null when the row is already up to date, so re-running the migration is safe.
 * Every new value is decrypted again before it is returned: a bad value is never handed back.
 */
export function planReencryption(encryption: EncryptionService, row: PiiRow): PiiUpdate | null {
  const update: PiiUpdate = {};

  const aadhaar = encryption.decrypt(row.aadhaarEncrypted);

  if (encryption.isLegacyCiphertext(row.aadhaarEncrypted)) {
    const next = encryption.encrypt(aadhaar);
    if (encryption.decrypt(next) !== aadhaar)
      throw new Error(`Aadhaar round trip failed for ${row.id}`);
    update.aadhaarEncrypted = next;
  }

  const nextHash = encryption.hash(aadhaar);
  if (row.aadhaarHash !== nextHash) update.aadhaarHash = nextHash;

  if (row.panEncrypted && encryption.isLegacyCiphertext(row.panEncrypted)) {
    const pan = encryption.decrypt(row.panEncrypted);
    const next = encryption.encrypt(pan);
    if (encryption.decrypt(next) !== pan) throw new Error(`PAN round trip failed for ${row.id}`);
    update.panEncrypted = next;
  }

  return Object.keys(update).length > 0 ? update : null;
}
