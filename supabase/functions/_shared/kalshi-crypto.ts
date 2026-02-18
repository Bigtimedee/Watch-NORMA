// Shared Kalshi RSA-PSS signing — deduplicated from kalshi-proxy and poll-markets

export async function importRsaPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemBody = pemKey
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

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
