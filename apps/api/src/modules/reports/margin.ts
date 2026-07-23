/**
 * US-19 — มาร์จิ้นต่อกล่อง + จุดคุ้มทุนรายวัน (pure, unit-testable)
 *
 * ที่มาของตัวเลข (แผนธุรกิจ One Price 60฿):
 *   contribution/กล่อง = ราคาขาย − ต้นทุนผันแปร(อาหาร)
 *   จุดคุ้มทุน (กล่อง/วัน) = ค่าใช้จ่ายคงที่ต่อวัน ÷ contribution/กล่อง
 *
 * ข้อควรระวังที่ตั้งใจ handle:
 *  - เมนูที่ยังไม่กรอกต้นทุน (unitCost = null) ทำให้ margin "ดูดีเกินจริง"
 *    → รายงานคืน `costCoverage` เสมอ ถ้าไม่ถึง 100% ห้ามเอาไปตัดสินใจราคาโอน
 *  - ค่าส่งไม่ใช่กำไรของอาหาร แยกออกจาก contribution (ส่วนมากจ่ายไรเดอร์ต่อ)
 *  - เงินเป็นสตางค์ (Int) ทุกจุด — ห้าม float
 */

export interface MarginOrderItem {
  qty: number;
  unitPrice: number; // สตางค์ (snapshot ตอนสั่ง)
  unitCost: number | null; // สตางค์ · null = ยังไม่กรอกต้นทุน
  lineTotal: number; // สตางค์
}

export interface MarginOrder {
  status: string;
  subtotal: number; // ค่าอาหาร (ไม่รวมค่าส่ง)
  deliveryFee: number;
  discount: number;
  total: number;
  items: MarginOrderItem[];
}

export interface MarginSummary {
  /** จำนวนออเดอร์ที่นับ (ตัด cancelled ทิ้ง) */
  orders: number;
  /** จำนวนกล่อง/จาน รวม */
  boxes: number;

  revenue: number; // ยอดขายรวม (total ที่ไม่ยกเลิก)
  foodRevenue: number; // เฉพาะค่าอาหาร (subtotal − discount)
  deliveryRevenue: number; // ค่าส่งที่เก็บได้
  foodCost: number; // ต้นทุนวัตถุดิบรวม (เท่าที่มีข้อมูล)

  grossProfit: number; // foodRevenue − foodCost
  marginPct: number; // grossProfit / foodRevenue × 100 (ทศนิยม 1 ตำแหน่ง)

  avgPricePerBox: number; // ราคาขายเฉลี่ยต่อกล่อง
  avgCostPerBox: number; // ต้นทุนเฉลี่ยต่อกล่อง
  contributionPerBox: number; // กำไรส่วนเกินต่อกล่อง

  /** สัดส่วนกล่องที่มีข้อมูลต้นทุน (0–100) — ต่ำกว่า 100 = ตัวเลขยังเชื่อไม่ได้เต็มที่ */
  costCoverage: number;
  /** จำนวนกล่องที่ยังไม่มีต้นทุน (ไว้เตือนให้ไปกรอก) */
  boxesMissingCost: number;
}

export interface BreakevenResult {
  /** ต้องขายกี่กล่อง/วันถึงเท่าทุน — null = คำนวณไม่ได้ (ยังไม่ตั้งค่าคงที่ หรือ contribution ≤ 0) */
  boxesPerDay: number | null;
  /** ยอดขายที่ต้องทำต่อวัน (สตางค์) */
  revenuePerDay: number | null;
  /** ขายจริงวันนี้กี่กล่อง */
  actualBoxes: number;
  /** เกิน/ขาดจากจุดคุ้มทุนกี่กล่อง (บวก = กำไร) */
  gap: number | null;
  /** ถึงจุดคุ้มทุนแล้วหรือยัง */
  reached: boolean;
  /** กำไรสุทธิโดยประมาณของวัน = contribution รวม − ค่าใช้จ่ายคงที่ */
  netProfit: number | null;
  /** เหตุผลที่คำนวณไม่ได้ (ให้ UI แสดงคำแนะนำ) */
  reason?: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** สรุปมาร์จิ้นจากรายการออเดอร์ (ตัดออเดอร์ที่ยกเลิกทิ้ง) */
export function summarizeMargin(orders: MarginOrder[]): MarginSummary {
  const live = orders.filter((o) => o.status !== 'cancelled');

  let boxes = 0;
  let revenue = 0;
  let foodRevenue = 0;
  let deliveryRevenue = 0;
  let foodCost = 0;
  let boxesWithCost = 0;

  for (const o of live) {
    revenue += o.total;
    foodRevenue += o.subtotal - o.discount;
    deliveryRevenue += o.deliveryFee;
    for (const it of o.items) {
      boxes += it.qty;
      if (it.unitCost !== null && it.unitCost !== undefined) {
        foodCost += it.unitCost * it.qty;
        boxesWithCost += it.qty;
      }
    }
  }

  const grossProfit = foodRevenue - foodCost;
  const marginPct = foodRevenue > 0 ? round1((grossProfit / foodRevenue) * 100) : 0;

  return {
    orders: live.length,
    boxes,
    revenue,
    foodRevenue,
    deliveryRevenue,
    foodCost,
    grossProfit,
    marginPct,
    avgPricePerBox: boxes > 0 ? Math.round(foodRevenue / boxes) : 0,
    // เฉลี่ยจากเฉพาะกล่องที่มีข้อมูล — ไม่งั้นกล่องที่ไม่มีต้นทุนจะดึงค่าเฉลี่ยให้ต่ำเกินจริง
    avgCostPerBox: boxesWithCost > 0 ? Math.round(foodCost / boxesWithCost) : 0,
    contributionPerBox:
      boxesWithCost > 0 ? Math.round(foodRevenue / Math.max(boxes, 1)) - Math.round(foodCost / boxesWithCost) : 0,
    costCoverage: boxes > 0 ? round1((boxesWithCost / boxes) * 100) : 0,
    boxesMissingCost: boxes - boxesWithCost,
  };
}

/**
 * จุดคุ้มทุนรายวัน
 * @param fixedCostDaily ค่าใช้จ่ายคงที่ต่อวัน (สตางค์) — null/0 = ยังไม่ตั้งค่า
 */
export function computeBreakeven(summary: MarginSummary, fixedCostDaily: number | null): BreakevenResult {
  const base = { actualBoxes: summary.boxes, boxesPerDay: null, revenuePerDay: null, gap: null, netProfit: null };

  if (!fixedCostDaily || fixedCostDaily <= 0) {
    return { ...base, reached: false, reason: 'ยังไม่ได้ตั้งค่าใช้จ่ายคงที่ต่อวัน' };
  }
  if (summary.contributionPerBox <= 0) {
    return {
      ...base,
      reached: false,
      reason:
        summary.costCoverage === 0
          ? 'ยังไม่ได้กรอกต้นทุนเมนู'
          : 'กำไรส่วนเกินต่อกล่อง ≤ 0 (ต้นทุนสูงกว่าราคาขาย)',
    };
  }

  const boxesPerDay = Math.ceil(fixedCostDaily / summary.contributionPerBox);
  const netProfit = summary.contributionPerBox * summary.boxes - fixedCostDaily;

  return {
    boxesPerDay,
    revenuePerDay: boxesPerDay * summary.avgPricePerBox,
    actualBoxes: summary.boxes,
    gap: summary.boxes - boxesPerDay,
    reached: summary.boxes >= boxesPerDay,
    netProfit,
  };
}

/** เมนูขายดี + มาร์จิ้นต่อเมนู — ไว้ดูว่าตัวไหนขายดีแต่กำไรบาง */
export interface MenuMarginRow {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  hasCost: boolean;
}

export function marginByMenu(
  items: Array<MarginOrderItem & { nameSnapshot: string }>,
): MenuMarginRow[] {
  const acc = new Map<string, { qty: number; revenue: number; cost: number; withCost: number }>();

  for (const it of items) {
    const cur = acc.get(it.nameSnapshot) ?? { qty: 0, revenue: 0, cost: 0, withCost: 0 };
    cur.qty += it.qty;
    cur.revenue += it.lineTotal;
    if (it.unitCost !== null && it.unitCost !== undefined) {
      cur.cost += it.unitCost * it.qty;
      cur.withCost += it.qty;
    }
    acc.set(it.nameSnapshot, cur);
  }

  return [...acc.entries()]
    .map(([name, v]) => {
      const hasCost = v.withCost > 0;
      const profit = hasCost ? v.revenue - v.cost : 0;
      return {
        name,
        qty: v.qty,
        revenue: v.revenue,
        cost: v.cost,
        profit,
        marginPct: hasCost && v.revenue > 0 ? round1((profit / v.revenue) * 100) : 0,
        hasCost,
      };
    })
    .sort((a, b) => b.qty - a.qty);
}
