/**
 * US-22: ใบสรุปยอดผลิตให้ครัว + การจัดกลุ่มตามจุดส่ง (pure ไม่แตะ DB/Nest)
 *
 * ตัวเลขที่ธุรกิจใช้ตัดสินใจจริง:
 *  - เมนู × จำนวน ของรอบหนึ่ง = ยอดที่ครัวต้องผลิต (แบ่งรอบผลิตใกล้เวลาส่งตามกฎ 2 ชม.)
 *  - "กี่กล่องต่อจุดส่ง" = ตัวหารค่าส่ง ยิ่งหลายกล่องต่อจุดยิ่งคุ้ม
 */

export interface ProdOrderItem {
  menuItemId: string;
  nameSnapshot: string;
  qty: number;
}

export interface ProdOrder {
  id: string;
  status: string;
  brandId: string;
  brandName: string;
  customerName: string | null;
  paymentMethod: string;
  total: number;
  scheduledAt: Date | null;
  address: { detail: string; lat: number; lng: number } | null;
  items: ProdOrderItem[];
  note?: string | null;
}

/** ออเดอร์ที่ยกเลิกแล้วห้ามนับเข้ายอดผลิต — ครัวจะทำอาหารทิ้ง */
export function isProducible(o: Pick<ProdOrder, 'status'>): boolean {
  return o.status !== 'cancelled';
}

export interface MenuTotal {
  menuItemId: string;
  name: string;
  brandId: string;
  brandName: string;
  qty: number;
}

/**
 * ยอดรวมต่อเมนูของรอบหนึ่ง
 * แยกตามแบรนด์ด้วย ไม่รวมชื่อซ้ำข้ามแบรนด์ — ชื่อเหมือนกันแต่คนละแบรนด์คือคนละสูตร/คนละแพ็ก
 */
export function summarizeMenuTotals(orders: ProdOrder[]): MenuTotal[] {
  const acc = new Map<string, MenuTotal>();
  for (const o of orders.filter(isProducible)) {
    for (const it of o.items) {
      const key = `${o.brandId}|${it.menuItemId}`;
      const cur = acc.get(key);
      if (cur) cur.qty += it.qty;
      else
        acc.set(key, {
          menuItemId: it.menuItemId,
          name: it.nameSnapshot,
          brandId: o.brandId,
          brandName: o.brandName,
          qty: it.qty,
        });
    }
  }
  // เรียงมากไปน้อย — ครัวเริ่มทำตัวที่เยอะสุดก่อน
  return [...acc.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'th'));
}

export interface DropOrderLine {
  orderId: string;
  brandId: string;
  brandName: string;
  customerName: string | null;
  paymentMethod: string;
  total: number;
  boxes: number;
  note: string | null;
}

export interface DropGroup {
  key: string;
  detail: string;
  lat: number | null;
  lng: number | null;
  /** จำนวนกล่องรวมของจุดนี้ — ตัวหารค่าส่ง */
  boxes: number;
  orderCount: number;
  /** ยอดที่ต้องเก็บปลายทางรวมของจุดนี้ (COD เท่านั้น) */
  codTotal: number;
  orders: DropOrderLine[];
}

/** นับกล่องของออเดอร์ = ผลรวมจำนวนของทุกรายการ */
export function boxCount(o: ProdOrder): number {
  return o.items.reduce((a, i) => a + i.qty, 0);
}

/**
 * คีย์จุดส่ง — ปัดพิกัด 4 ตำแหน่ง (~11 เมตร) ให้คอนโด/ตึกเดียวกันรวมเป็นจุดเดียว
 * ละเอียดกว่านี้ = หมุดที่ลากต่างกัน 5 เมตรแยกเป็น 2 จุด · หยาบกว่านี้ = ข้ามซอยมารวมกัน
 */
export function dropKey(o: ProdOrder): string {
  if (!o.address) return 'no-address';
  return `${o.address.lat.toFixed(4)},${o.address.lng.toFixed(4)}`;
}

/** จัดกลุ่มออเดอร์ของรอบเดียวกันตามจุดส่ง เรียงจุดที่มีกล่องมากสุดก่อน */
export function groupByDropPoint(orders: ProdOrder[]): DropGroup[] {
  const acc = new Map<string, DropGroup>();
  for (const o of orders.filter(isProducible)) {
    const key = dropKey(o);
    const boxes = boxCount(o);
    const line: DropOrderLine = {
      orderId: o.id,
      brandId: o.brandId,
      brandName: o.brandName,
      customerName: o.customerName,
      paymentMethod: o.paymentMethod,
      total: o.total,
      boxes,
      note: o.note ?? null,
    };
    const cur = acc.get(key);
    if (cur) {
      cur.boxes += boxes;
      cur.orderCount += 1;
      if (o.paymentMethod === 'cod') cur.codTotal += o.total;
      cur.orders.push(line);
    } else {
      acc.set(key, {
        key,
        detail: o.address?.detail ?? '— ไม่มีที่อยู่ —',
        lat: o.address?.lat ?? null,
        lng: o.address?.lng ?? null,
        boxes,
        orderCount: 1,
        codTotal: o.paymentMethod === 'cod' ? o.total : 0,
        orders: [line],
      });
    }
  }
  return [...acc.values()].sort((a, b) => b.boxes - a.boxes || a.detail.localeCompare(b.detail, 'th'));
}

export interface ProductionGroup {
  /** null = bucket "ไม่ตรงรอบ" (ออเดอร์จองไว้ก่อนเจ้าของแก้เวลารอบ) */
  slotId: string | null;
  name: string;
  startTime: string | null;
  endTime: string | null;
  startAt: string | null;
  endAt: string | null;
  orderCount: number;
  /** จำนวนกล่องที่ครัวต้องผลิตในรอบนี้ */
  boxCount: number;
  /** จำนวนจุดส่ง — กล่อง ÷ จุด คือตัวเลขที่บอกว่ารวมรอบได้คุ้มหรือยัง */
  dropCount: number;
  revenue: number;
  menuTotals: MenuTotal[];
  drops: DropGroup[];
}

export interface SlotWindow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
}

/**
 * แบ่งออเดอร์ที่จองไว้เข้ารอบตามช่วงเวลาของรอบ แล้วสรุปยอดผลิต/จุดส่งของแต่ละรอบ
 *
 * ⚠️ ออเดอร์ที่ไม่ตรงช่วงของรอบไหนเลยต้องไม่หายไปจากตาครัว → ไปอยู่ bucket slotId=null
 * (เกิดได้เมื่อเจ้าของแก้เวลารอบหลังมีคนจองไปแล้ว หรือปิดรอบนั้นทิ้ง)
 */
export function buildProductionSummary(
  orders: ProdOrder[],
  windows: SlotWindow[],
): ProductionGroup[] {
  const buckets = new Map<string | null, ProdOrder[]>();
  for (const w of windows) buckets.set(w.id, []);

  for (const o of orders.filter(isProducible)) {
    const at = o.scheduledAt?.getTime();
    const w =
      at == null
        ? undefined
        : windows.find(
            (x) => at >= new Date(x.startAt).getTime() && at <= new Date(x.endAt).getTime(),
          );
    const key = w ? w.id : null;
    const list = buckets.get(key) ?? [];
    list.push(o);
    buckets.set(key, list);
  }

  const groups: ProductionGroup[] = windows.map((w) => {
    const list = buckets.get(w.id) ?? [];
    const drops = groupByDropPoint(list);
    return {
      slotId: w.id,
      name: w.name,
      startTime: w.startTime,
      endTime: w.endTime,
      startAt: w.startAt,
      endAt: w.endAt,
      orderCount: list.length,
      boxCount: list.reduce((a, o) => a + boxCount(o), 0),
      dropCount: drops.length,
      revenue: list.reduce((a, o) => a + o.total, 0),
      menuTotals: summarizeMenuTotals(list),
      drops,
    };
  });

  const orphans = buckets.get(null) ?? [];
  if (orphans.length > 0) {
    const drops = groupByDropPoint(orphans);
    groups.push({
      slotId: null,
      name: 'ไม่ตรงรอบ (ตรวจด้วยมือ)',
      startTime: null,
      endTime: null,
      startAt: null,
      endAt: null,
      orderCount: orphans.length,
      boxCount: orphans.reduce((a, o) => a + boxCount(o), 0),
      dropCount: drops.length,
      revenue: orphans.reduce((a, o) => a + o.total, 0),
      menuTotals: summarizeMenuTotals(orphans),
      drops,
    });
  }
  return groups;
}
