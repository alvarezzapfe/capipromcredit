import {
  generateSecret as otpGenerateSecret,
  generateURI,
  generateSync,
  verifySync,
} from "otplib";
import QRCode from "qrcode";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    console.error(
      "TOTP_ENCRYPTION_KEY is missing or invalid. Generate one with:\n  openssl rand -hex 32\nThen add to .env.local as TOTP_ENCRYPTION_KEY=<value>"
    );
    throw new Error("TOTP encryption key not configured");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateSecret(): string {
  return otpGenerateSecret();
}

export async function generateQRCode(
  email: string,
  secret: string
): Promise<string> {
  const uri = generateURI({
    issuer: "CapiProm",
    label: email,
    secret,
  });
  return QRCode.toDataURL(uri, { width: 220, margin: 2 });
}

export function verifyToken(token: string, secret: string): boolean {
  const result = verifySync({ token, secret });
  return result.valid;
}
