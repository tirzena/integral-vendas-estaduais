/**
 * Token assinado do link de descadastro. Só o servidor sabe assinar e
 * conferir; o link expira e não pode ser adivinhado.
 */

const ENC = new TextEncoder();
const TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 dias

function secret() {
  const s = process.env["CAMPAIGNS_WEBHOOK_SECRET"];
  if (!s) throw new Error("Descadastro não configurado.");
  return s;
}

function b64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmac(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, ENC.encode(message)));
}

export async function signUnsubscribeToken(jobId: string, issuedAt = Date.now()) {
  return `${issuedAt}.${await hmac(`${jobId}.${issuedAt}`)}`;
}

export async function verifyUnsubscribeToken(jobId: string, token: string) {
  const [ts, sig] = (token ?? "").split(".");
  if (!ts || !sig) return false;
  const issued = Number(ts);
  if (!Number.isFinite(issued) || Date.now() - issued > TTL_MS) return false;
  const expected = await hmac(`${jobId}.${issued}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Compara duas assinaturas em tempo constante. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 em hexadecimal (assinatura de webhooks). */
export async function hmacHex(key: string, raw: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    ENC.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, ENC.encode(raw));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA1 em base64 (Twilio). */
export async function hmacSha1Base64(key: string, raw: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    ENC.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, ENC.encode(raw));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
