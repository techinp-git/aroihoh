import { LineService } from './line.service';

// mock LineClient + PrismaService — เทส logic เลือก reply/push ล้วน (ไม่ยิง LINE จริง)
function make(replyRes: any, pushRes: any) {
  const created: any[] = [];
  const line = {
    replyText: jest.fn().mockResolvedValue(replyRes),
    pushText: jest.fn().mockResolvedValue(pushRes),
  };
  const prisma = {
    messageLog: { create: jest.fn(async ({ data }: any) => { created.push(data); return data; }) },
  };
  const media = { save: jest.fn(), resolveExisting: jest.fn(), stream: jest.fn() };
  const richMenu = { assignForFollower: jest.fn().mockResolvedValue(undefined) };
  const svc = new LineService(prisma as any, line as any, media as any, richMenu as any);
  return { svc, line, prisma, created };
}

describe('sendToCustomer — เลือก reply(ฟรี) vs push(โควตา)', () => {
  it('มี replyToken + reply สำเร็จ → ใช้ reply, log channel=reply', async () => {
    const { svc, line, created } = make({ ok: true }, { ok: true });
    const r = await svc.sendToCustomer('b', 'U1', 'hi', { replyToken: 'tok', type: 'auto_reply' });
    expect(r).toMatchObject({ via: 'reply', ok: true });
    expect(line.replyText).toHaveBeenCalled();
    expect(line.pushText).not.toHaveBeenCalled(); // ไม่ push เพราะ reply สำเร็จ
    expect(created[0].channel).toBe('reply');
  });

  it('reply token หมดอายุ (ok:false) → fallback push, log channel=push', async () => {
    const { svc, line, created } = make({ ok: false }, { ok: true });
    const r = await svc.sendToCustomer('b', 'U1', 'hi', { replyToken: 'expired', type: 'auto_reply' });
    expect(r).toMatchObject({ via: 'push', ok: true });
    expect(line.pushText).toHaveBeenCalled(); // ตกลงมา push
    expect(created[0].channel).toBe('push');
  });

  it('ไม่มี replyToken → push ตรง', async () => {
    const { svc, line, created } = make({ ok: false }, { ok: true });
    const r = await svc.sendToCustomer('b', 'U1', 'hi', { type: 'chat' });
    expect(r.via).toBe('push');
    expect(line.replyText).not.toHaveBeenCalled();
    expect(created[0].channel).toBe('push');
  });

  it('ยังไม่ผูก LINE (skipped) → ไม่ log, ไม่นับ', async () => {
    const { svc, created } = make({ ok: false, skipped: true }, { ok: false, skipped: true });
    const r = await svc.sendToCustomer('b', 'U1', 'hi', { replyToken: 'tok', type: 'welcome' });
    expect(r.skipped).toBe(true);
    expect(created).toHaveLength(0); // ไม่บันทึกตอน dev skip (ตัวเลขไม่เพี้ยน)
  });

  it('push ล้มเหลว → log status=failed channel=push', async () => {
    const { svc, created } = make({ ok: false }, { ok: false });
    const r = await svc.sendToCustomer('b', 'U1', 'hi', { type: 'chat' });
    expect(r.ok).toBe(false);
    expect(created[0]).toMatchObject({ channel: 'push', status: 'failed' });
  });
});
