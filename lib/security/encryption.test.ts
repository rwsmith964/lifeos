import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  EncryptionKeyNotConfiguredError,
  isEncryptionConfigured,
} from "./encryption";

const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").subarray(0, 32).toString("base64");

describe("encryptSecret / decryptSecret", () => {
  const original = process.env.CALDAV_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CALDAV_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (original == null) delete process.env.CALDAV_ENCRYPTION_KEY;
    else process.env.CALDAV_ENCRYPTION_KEY = original;
  });

  it("round-trips a secret", () => {
    const encrypted = encryptSecret("my-app-specific-password");
    expect(decryptSecret(encrypted)).toBe("my-app-specific-password");
  });

  it("never stores the plaintext in the ciphertext field", () => {
    const encrypted = encryptSecret("super-secret-value");
    expect(encrypted.ciphertext).not.toContain("super-secret-value");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt if the auth tag was tampered with", () => {
    const encrypted = encryptSecret("tamper-test");
    const tampered = { ...encrypted, authTag: encryptSecret("other").authTag };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws EncryptionKeyNotConfiguredError when no key is set", () => {
    delete process.env.CALDAV_ENCRYPTION_KEY;
    expect(() => encryptSecret("anything")).toThrow(EncryptionKeyNotConfiguredError);
  });

  it("isEncryptionConfigured reflects whether a valid key is present", () => {
    expect(isEncryptionConfigured()).toBe(true);
    delete process.env.CALDAV_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("rejects a key that doesn't decode to exactly 32 bytes", () => {
    process.env.CALDAV_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
