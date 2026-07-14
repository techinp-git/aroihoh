import { canTransition, isTerminal, nextStatus } from './status';

describe('order status machine', () => {
  it('nextStatus เดินตามลำดับ', () => {
    expect(nextStatus('pending')).toBe('confirmed');
    expect(nextStatus('preparing')).toBe('ready'); // US-41: แทรก ready ก่อน delivering
    expect(nextStatus('ready')).toBe('delivering');
    expect(nextStatus('delivering')).toBe('completed');
    expect(nextStatus('completed')).toBeNull();
    expect(nextStatus('cancelled')).toBeNull();
  });

  it('isTerminal เฉพาะ completed/cancelled', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
  });

  it('เดินหน้าได้ทีละขั้นเท่านั้น', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'preparing')).toBe(false); // ข้ามขั้น
    expect(canTransition('confirmed', 'pending')).toBe(false); // ถอยหลัง
    expect(canTransition('delivering', 'completed')).toBe(true);
  });

  it('ยกเลิกได้จากสถานะที่ยังไม่ terminal', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('preparing', 'cancelled')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });
});
