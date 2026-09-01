// Module 4 (QUEUE-016): application-level encryption for credentials that
// are meaningfully more sensitive than a random secret URL — specifically
// CalDAV app-specific passwords, which are real reusable credentials to a
// person's Apple/Microsoft account. AES-256-GCM keyed by CALDAV_ENCRYPTION_KEY
// (32 raw bytes, base64-encoded in the env var). No unsafe fallback: if the
// key isn't configured, encryptSecret throws rather than ever persisting a
// secret in plaintext — same "no key, no unsafe stand-in" posture the repo
// already uses for RESEND_API_KEY.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

export class EncryptionKeyNotConfiguredError extends Error {
  constructor() {
    super(
      "CALDAV_ENCRYPTION_KEY is not configured — refusing to store a calendar credential unencrypted. Set a 32-byte base64 key to enable CalDAV account connections."
    );
    this.name = "EncryptionKeyNotConfiguredError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.CALDAV_ENCRYPTION_KEY;
  if (!raw) throw new EncryptionKeyNotConfiguredError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CALDAV_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256-GCM.");
  }
  return key;
}

/** True when a real key is configured — use to gate UI/API affordances that would otherwise fail. */
export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/** Encrypts `plaintext` with AES-256-GCM. Throws EncryptionKeyNotConfiguredError if no key is set. */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Decrypts a secret produced by encryptSecret. Throws if the key is missing or the data was tampered with. */
export function decryptSecret(encrypted: EncryptedSecret): string {
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
