import { createHmac } from 'crypto';
import { verifyLineSignature } from './line-signature';

const SECRET = 'test-channel-secret';
const sign = (body: string) => createHmac('sha256', SECRET).update(Buffer.from(body)).digest('base64');

describe('verifyLineSignature', () => {
  const body = JSON.stringify({ events: [{ type: 'message' }] });

  it('signature ถูก → true', () => {
    expect(verifyLineSignature(SECRET, body, sign(body))).toBe(true);
  });

  it('signature ผิด → false', () => {
    expect(verifyLineSignature(SECRET, body, 'ZmFrZQ==')).toBe(false);
  });

  it('body ถูกแก้ (tamper) → false', () => {
    const good = sign(body);
    expect(verifyLineSignature(SECRET, body + ' ', good)).toBe(false);
  });

  it('secret ผิด → false', () => {
    expect(verifyLineSignature('wrong-secret', body, sign(body))).toBe(false);
  });

  it('ไม่มี signature / secret → false (ไม่ throw)', () => {
    expect(verifyLineSignature(SECRET, body, undefined)).toBe(false);
    expect(verifyLineSignature('', body, sign(body))).toBe(false);
  });

  it('รับ Buffer ได้เท่ากับ string', () => {
    expect(verifyLineSignature(SECRET, Buffer.from(body), sign(body))).toBe(true);
  });
});
