/**
 * ตรวจ LINE ID token กับ LINE verify endpoint แล้วคืน payload ที่เชื่อถือได้
 * ดู: https://developers.line.biz/en/reference/line-login/#verify-id-token
 * ต้อง verify ฝั่ง server เสมอ — ห้ามเชื่อ profile ที่ client ส่งมาตรง ๆ
 */
export interface LineIdTokenPayload {
  sub: string; // LINE userId
  name?: string;
  picture?: string;
}

export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
): Promise<LineIdTokenPayload> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE verify failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as LineIdTokenPayload & { aud?: string };
  if (!data.sub) {
    throw new Error('LINE verify: missing sub in payload');
  }
  return { sub: data.sub, name: data.name, picture: data.picture };
}
