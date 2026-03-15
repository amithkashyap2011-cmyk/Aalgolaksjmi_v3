/*
 * ─── AES-256-GCM Crypto Unit Tests ────────────────────
 *
 * Tests encrypt/decrypt round-trip, uniqueness of IVs,
 * and tamper detection.
 */

/* Set up a valid 32-byte ENCRYPTION_KEY for testing */
process.env.ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

import { encrypt, decrypt, type Encrypted } from "../src/lib/crypto";

describe("AES-256-GCM Crypto", () => {
  /* ── TC-51: encrypt returns correct structure ──── */
  test("TC-51: encrypt returns ciphertext, iv, authTag (all base64)", () => {
    const result = encrypt("hello world");
    expect(result).toHaveProperty("ciphertext");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("authTag");
    // base64 strings should be non-empty
    expect(result.ciphertext.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
    expect(result.authTag.length).toBeGreaterThan(0);
  });

  /* ── TC-52: decrypt recovers plaintext ─────────── */
  test("TC-52: decrypt(encrypt(plaintext)) === plaintext", () => {
    const plaintext = "MySecretApiKey_12345!@#";
    const encrypted = encrypt(plaintext);
    const recovered = decrypt(encrypted);
    expect(recovered).toBe(plaintext);
  });

  /* ── TC-53: different IVs each time ────────────── */
  test("TC-53: two encryptions of same plaintext produce different ciphertexts", () => {
    const plaintext = "same-text";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    // IVs should differ (random 12 bytes)
    expect(a.iv).not.toBe(b.iv);
    // Ciphertexts should differ
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  /* ── TC-54: empty string round-trips ───────────── */
  test("TC-54: empty string encrypts and decrypts correctly", () => {
    const encrypted = encrypt("");
    const recovered = decrypt(encrypted);
    expect(recovered).toBe("");
  });

  /* ── TC-55: unicode round-trips ────────────────── */
  test("TC-55: unicode text round-trips correctly", () => {
    const plaintext = "AALGOLAKSHMI 🪙💰 ₹83.50/USDT";
    const encrypted = encrypt(plaintext);
    const recovered = decrypt(encrypted);
    expect(recovered).toBe(plaintext);
  });

  /* ── TC-56: tampered ciphertext throws ─────────── */
  test("TC-56: tampered ciphertext throws on decrypt", () => {
    const encrypted = encrypt("sensitive data");
    // Flip a character in the ciphertext
    const tampered: Encrypted = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -1) + (encrypted.ciphertext.endsWith("A") ? "B" : "A"),
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  /* ── TC-57: tampered authTag throws ────────────── */
  test("TC-57: tampered authTag throws on decrypt", () => {
    const encrypted = encrypt("sensitive data");
    const tampered: Encrypted = {
      ...encrypted,
      authTag: Buffer.from("bad-tag-12345678").toString("base64"),
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  /* ── TC-58: long text round-trips ──────────────── */
  test("TC-58: long API key string round-trips", () => {
    const key = "a".repeat(1000);
    const encrypted = encrypt(key);
    expect(decrypt(encrypted)).toBe(key);
  });
});

describe("Crypto edge cases", () => {
  /* ── TC-59: invalid ENCRYPTION_KEY ─────────────── */
  test("TC-59: throws if ENCRYPTION_KEY is wrong length", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be 64 hex chars");
    process.env.ENCRYPTION_KEY = original;
  });

  /* ── TC-60: wrong IV length in decrypt ─────────── */
  test("TC-60: garbage IV throws on decrypt", () => {
    const encrypted = encrypt("test");
    const tampered: Encrypted = {
      ...encrypted,
      iv: "not-valid-base64!!!!",
    };
    expect(() => decrypt(tampered)).toThrow();
  });
});
