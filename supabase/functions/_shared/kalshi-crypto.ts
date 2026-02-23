// Shared Kalshi RSA-PSS signing — deduplicated from kalshi-proxy and poll-markets

/**
 * Wrap a PKCS#1 (RSA PRIVATE KEY) DER blob in a PKCS#8 envelope.
 * WebCrypto's importKey("pkcs8", ...) requires PKCS#8 format, but Kalshi
 * generates keys in PKCS#1 format.
 *
 * PKCS#8 structure:
 *   SEQUENCE {
 *     INTEGER 0 (version)
 *     SEQUENCE { OID rsaEncryption, NULL }
 *     OCTET STRING { <PKCS#1 DER bytes> }
 *   }
 */
function wrapPkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // ASN.1 DER for: SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }
  const algorithmId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);

  // Version INTEGER 0
  const version = new Uint8Array([0x02, 0x01, 0x00]);

  // Wrap PKCS#1 bytes in an OCTET STRING
  const octetHeader = encodeDerLength(0x04, pkcs1Der.length);

  // Total inner content length
  const innerLen =
    version.length + algorithmId.length + octetHeader.length + pkcs1Der.length;
  const seqHeader = encodeDerLength(0x30, innerLen);

  // Concatenate: SEQUENCE header + version + algorithmId + OCTET STRING(pkcs1)
  const pkcs8 = new Uint8Array(
    seqHeader.length + version.length + algorithmId.length + octetHeader.length + pkcs1Der.length
  );
  let offset = 0;
  pkcs8.set(seqHeader, offset); offset += seqHeader.length;
  pkcs8.set(version, offset); offset += version.length;
  pkcs8.set(algorithmId, offset); offset += algorithmId.length;
  pkcs8.set(octetHeader, offset); offset += octetHeader.length;
  pkcs8.set(pkcs1Der, offset);

  return pkcs8;
}

/** Encode a DER tag + length prefix */
function encodeDerLength(tag: number, length: number): Uint8Array {
  if (length < 0x80) {
    return new Uint8Array([tag, length]);
  } else if (length < 0x100) {
    return new Uint8Array([tag, 0x81, length]);
  } else {
    return new Uint8Array([tag, 0x82, (length >> 8) & 0xff, length & 0xff]);
  }
}

export async function importRsaPrivateKey(pemKey: string): Promise<CryptoKey> {
  const isPkcs1 = pemKey.includes("BEGIN RSA PRIVATE KEY");

  const pemBody = pemKey
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  let binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  // Kalshi generates PKCS#1 keys — wrap them in PKCS#8 for WebCrypto
  if (isPkcs1) {
    binaryDer = new Uint8Array(wrapPkcs1ToPkcs8(binaryDer));
  }

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function signKalshiRequest(
  privateKey: CryptoKey,
  timestamp: string,
  method: string,
  path: string
): Promise<string> {
  const pathWithoutQuery = path.split("?")[0];
  const message = new TextEncoder().encode(timestamp + method + pathWithoutQuery);
  const signature = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    privateKey,
    message
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
