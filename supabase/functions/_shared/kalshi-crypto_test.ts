// Tests for AES-GCM credential encryption added in P1-10

import { encryptPrivateKey, decryptPrivateKey } from "./kalshi-crypto.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FAKE_KEY = "test-encryption-key-32-bytes-long!!";
const PLAINTEXT = "-----BEGIN RSA PRIVATE KEY-----\nfakekeydata\n-----END RSA PRIVATE KEY-----";

Deno.test("roundtrip: decrypt(encrypt(plaintext)) === plaintext", async () => {
  const encrypted = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  const decrypted = await decryptPrivateKey(encrypted, FAKE_KEY);
  assertEquals(decrypted, PLAINTEXT);
});

Deno.test("ciphertext differs from plaintext", async () => {
  const encrypted = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  assertNotEquals(encrypted, PLAINTEXT);
});

Deno.test("two encryptions of the same plaintext produce different ciphertexts (random IV)", async () => {
  const enc1 = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  const enc2 = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  assertNotEquals(enc1, enc2);
});

Deno.test("decryption with wrong key throws", async () => {
  const encrypted = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  let threw = false;
  try {
    await decryptPrivateKey(encrypted, "wrong-key-entirely-different-xxx");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Expected decryption with wrong key to throw");
});

Deno.test("ciphertext is base64-encoded (no raw binary in output)", async () => {
  const encrypted = await encryptPrivateKey(PLAINTEXT, FAKE_KEY);
  // base64 chars only: A-Z a-z 0-9 + / =
  const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(encrypted);
  assertEquals(isBase64, true, `Expected base64 but got: ${encrypted.slice(0, 40)}`);
});
