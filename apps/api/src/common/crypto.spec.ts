import { encryptSecret, decryptSecret, isEncrypted } from './crypto';

describe('SEC-1: crypto (AES-256-GCM at-rest)', () => {
  const OLD = process.env.ENCRYPTION_KEY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = OLD;
  });

  it('round-trip เมื่อมีคีย์ — ciphertext ไม่ใช่ plaintext', () => {
    process.env.ENCRYPTION_KEY = 'test-key-สุ่มยาวๆ';
    const secret = 'my-line-channel-secret-abc123';
    const enc = encryptSecret(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('iv สุ่ม — เข้ารหัสค่าเดิมสองครั้งได้ ciphertext ต่างกัน', () => {
    process.env.ENCRYPTION_KEY = 'k';
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('backward-compat: ค่า plaintext เดิม (ไม่มี prefix) อ่านออกตรง ๆ', () => {
    process.env.ENCRYPTION_KEY = 'k';
    expect(decryptSecret('legacy-plaintext-token')).toBe('legacy-plaintext-token');
    expect(isEncrypted('legacy-plaintext-token')).toBe(false);
  });

  it('ไม่มีคีย์ = passthrough (dev/CI)', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(encryptSecret('x')).toBe('x');
    expect(decryptSecret('x')).toBe('x');
  });

  it('เข้ารหัสไว้แต่ไม่มีคีย์ → คืน null (กันหลุด)', () => {
    process.env.ENCRYPTION_KEY = 'k';
    const enc = encryptSecret('secret');
    delete process.env.ENCRYPTION_KEY;
    expect(decryptSecret(enc)).toBeNull();
  });

  it('tamper: แก้ ciphertext แล้ว decrypt ต้อง throw (auth tag)', () => {
    process.env.ENCRYPTION_KEY = 'k';
    const enc = encryptSecret('secret');
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('null/empty → null', () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret('')).toBeNull();
  });
});
