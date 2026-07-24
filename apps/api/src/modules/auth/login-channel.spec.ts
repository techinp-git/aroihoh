import { loginChannelIdFromLiffId, resolveLoginChannelId } from './login-channel';

describe('loginChannelIdFromLiffId', () => {
  it('ตัดเลข Login channel ออกจาก LIFF ID', () => {
    expect(loginChannelIdFromLiffId('2010670184-iFdmCQYB')).toBe('2010670184');
  });

  it('ไม่มี suffix ก็ยังใช้ได้', () => {
    expect(loginChannelIdFromLiffId('2010670184')).toBe('2010670184');
  });

  it('ค่าว่าง/ไม่ใช่ตัวเลข = เดาไม่ได้', () => {
    expect(loginChannelIdFromLiffId('')).toBeNull();
    expect(loginChannelIdFromLiffId(null)).toBeNull();
    expect(loginChannelIdFromLiffId(undefined)).toBeNull();
    expect(loginChannelIdFromLiffId('abc-1234')).toBeNull();
    expect(loginChannelIdFromLiffId('-iFdmCQYB')).toBeNull();
  });
});

describe('resolveLoginChannelId', () => {
  it('ใช้ค่าที่ owner กรอกเองก่อนเสมอ', () => {
    expect(
      resolveLoginChannelId({
        lineLoginChannelId: '1111111111',
        liffId: '2010670184-iFdmCQYB',
        lineChannelId: '2010670239',
      }),
    ).toBe('1111111111');
  });

  it('ไม่ได้กรอก → เดาจาก LIFF ID (ไม่ใช่ Messaging channel)', () => {
    expect(
      resolveLoginChannelId({
        liffId: '2010670184-iFdmCQYB',
        lineChannelId: '2010670239',
      }),
    ).toBe('2010670184');
  });

  it('ไม่มี LIFF ID → ตกมาใช้ lineChannelId ของเดิม (backward compat)', () => {
    expect(resolveLoginChannelId({ lineChannelId: '2010670239' })).toBe('2010670239');
  });

  it('LIFF ID เพี้ยน → ไม่เดามั่ว ตกมาใช้ lineChannelId', () => {
    expect(
      resolveLoginChannelId({ liffId: 'not-a-liff-id', lineChannelId: '2010670239' }),
    ).toBe('2010670239');
  });

  it('ไม่มีอะไรเลย = null (ให้ caller โยน error บอกว่ายังไม่ได้ตั้งค่า)', () => {
    expect(resolveLoginChannelId({})).toBeNull();
    expect(
      resolveLoginChannelId({ lineLoginChannelId: '  ', liffId: '', lineChannelId: '' }),
    ).toBeNull();
  });
});
