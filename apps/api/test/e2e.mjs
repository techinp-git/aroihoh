/**
 * E2E สโม๊คเทสต์ — ยิง HTTP จริงเข้า API ที่รันอยู่ (ต้องมี DB migrate + seed ก่อน)
 * รัน:  node test/e2e.mjs        (ค่าเริ่มต้น API_BASE=http://localhost:3000/api)
 * ใช้ใน CI (.github/workflows/ci.yml งาน e2e) — ไม่พึ่ง lib นอก ใช้ fetch ของ Node ล้วน
 *
 * ครอบ "กติกาเหล็ก" ที่พังไม่ได้:
 *  - คิดเงินฝั่ง server (total = subtotal + fee)          [กติกา 2]
 *  - เช็คเขต server-side ตอนสร้างออเดอร์ (นอกเขต → 422)     [กติกา 5]
 *  - สร้างออเดอร์ idempotent (คีย์ซ้ำ → ออเดอร์เดิม)        [กติกา 4]
 *  - tenant isolation (ลูกค้าอื่นดูออเดอร์ไม่ได้ → 404)     [กติกา 1]
 *  - admin endpoint กัน customer JWT (RBAC)               [session decision]
 *  - status transition ไล่ลำดับ (ถอยหลัง → error)          [US-12]
 *  - พักรับออเดอร์ → order 422                              [US-16]
 */

const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || 'owner@chimchiva.local';
const ADMIN_PASS = process.env.ADMIN_SEED_PASSWORD || 'owner1234';

// พิกัด: ครัว seed อยู่ (13.7376, 100.5602) radius 5km, tiered ≤2km=1500
const IN_ZONE = { lat: 13.738, lng: 100.5605 }; // ~0.05km → fee 1500
const OUT_ZONE = { lat: 13.85, lng: 100.7 }; // ไกลเกิน 5km

let pass = 0;
let fail = 0;
const fails = [];

const is2xx = (s) => s >= 200 && s < 300;

function ok(cond, name, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

async function waitForApi(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await req('GET', '/health');
      if (r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API ไม่ตอบที่ ${BASE}/health ภายในเวลา`);
}

function uuid() {
  // ไม่พึ่ง crypto.randomUUID เพื่อความเข้ากันได้ — พอสำหรับ idempotencyKey
  return 'e2e-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

async function main() {
  console.log(`\nE2E → ${BASE}`);
  await waitForApi();

  // 1) health
  const health = await req('GET', '/health');
  ok(health.status === 200 && health.body?.status === 'ok', 'health = ok');

  // 2) admin login
  const login = await req('POST', '/admin/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  ok(is2xx(login.status), 'admin login สำเร็จ', JSON.stringify(login.body));
  const adminToken = login.body?.token;
  ok(!!adminToken, 'ได้ admin token');
  ok(login.body?.admin?.role === 'owner', 'บทบาท owner');

  // 3) หา brandId จาก seed
  const brands = await req('GET', '/admin/brands', { token: adminToken });
  ok(brands.status === 200 && Array.isArray(brands.body), 'GET /admin/brands');
  const brand = (brands.body || []).find((b) => b.slug === 'one-price-60') || brands.body?.[0];
  ok(!!brand?.id, 'พบแบรนด์ seed one-price-60');
  const brandId = brand.id;

  // 4) เมนู (เอา menuItemId สำหรับสร้างออเดอร์)
  const menu = await req('GET', `/admin/menu?brandId=${brandId}`, { token: adminToken });
  ok(menu.status === 200 && menu.body?.length > 0, 'GET /admin/menu มีเมนู');
  const item = (menu.body || []).find((m) => m.isAvailable) || menu.body[0];
  ok(!!item?.isAvailable, 'มีเมนูที่พร้อมขายอย่างน้อย 1 รายการ');
  const unitPrice = item.price; // 6000

  // 5) customer dev-login
  const cust = await req('POST', '/auth/dev-login', { body: { brandId, name: 'e2e-buyer' } });
  ok(is2xx(cust.status), 'customer dev-login', JSON.stringify(cust.body));
  const custToken = cust.body?.accessToken;
  ok(!!custToken, 'ได้ customer token');

  // 6) เช็คเขต: ในเขต
  const inZone = await req('POST', '/delivery/check', {
    token: custToken,
    body: { brandId, ...IN_ZONE },
  });
  ok(is2xx(inZone.status) && inZone.body?.inZone === true, 'delivery/check ในเขต = inZone true', `status=${inZone.status}`);
  ok(inZone.body?.deliveryFee === 1500, `ค่าส่งในเขต 15฿ (=1500 สตางค์) ได้ ${inZone.body?.deliveryFee}`);

  // 7) เช็คเขต: นอกเขต
  const outZone = await req('POST', '/delivery/check', {
    token: custToken,
    body: { brandId, ...OUT_ZONE },
  });
  ok(is2xx(outZone.status) && outZone.body?.inZone === false, 'delivery/check นอกเขต = inZone false', `status=${outZone.status}`);

  // 8) สร้างออเดอร์ในเขต — คิดเงินฝั่ง server
  const key1 = uuid();
  const orderBody = {
    idempotencyKey: key1,
    items: [{ menuItemId: item.id, qty: 2 }],
    deliveryAddress: { detail: 'คอนโดใกล้ครัว', ...IN_ZONE },
    paymentMethod: 'promptpay',
  };
  const create1 = await req('POST', '/orders', { token: custToken, body: orderBody });
  ok(is2xx(create1.status), 'สร้างออเดอร์ในเขตสำเร็จ', JSON.stringify(create1.body));
  const order = create1.body;
  const expectedSubtotal = unitPrice * 2;
  ok(order?.subtotal === expectedSubtotal, `subtotal server = ${expectedSubtotal} ได้ ${order?.subtotal}`);
  ok(order?.deliveryFee === 1500, `deliveryFee server = 1500 ได้ ${order?.deliveryFee}`);
  ok(order?.total === expectedSubtotal + 1500, `total = subtotal+fee (${expectedSubtotal + 1500}) ได้ ${order?.total}`);

  // 9) idempotent — คีย์เดิม → ออเดอร์เดิม ไม่สร้างซ้ำ
  const create1again = await req('POST', '/orders', { token: custToken, body: orderBody });
  ok(
    is2xx(create1again.status) && create1again.body?.id === order.id,
    'idempotent: คีย์ซ้ำคืนออเดอร์เดิม',
    `status=${create1again.status} id=${create1again.body?.id} เทียบ ${order?.id}`,
  );

  // 10) นอกเขต → 422
  const outOrder = await req('POST', '/orders', {
    token: custToken,
    body: { ...orderBody, idempotencyKey: uuid(), deliveryAddress: { detail: 'นอกเขต', ...OUT_ZONE } },
  });
  ok(outOrder.status === 422, 'ออเดอร์นอกเขต → 422', `ได้ ${outOrder.status}`);

  // 11) tenant isolation — ลูกค้าอื่นดูออเดอร์นี้ไม่ได้
  const other = await req('POST', '/auth/dev-login', { body: { brandId, name: 'e2e-other' } });
  const otherToken = other.body?.accessToken;
  const peek = await req('GET', `/orders/${order.id}`, { token: otherToken });
  ok(peek.status === 404, 'ลูกค้าอื่นดูออเดอร์ → 404', `ได้ ${peek.status}`);
  const mine = await req('GET', `/orders/${order.id}`, { token: custToken });
  ok(mine.status === 200 && mine.body?.id === order.id, 'เจ้าของดูออเดอร์ตัวเองได้');

  // 12) RBAC — customer JWT ห้ามเข้า admin endpoint
  const forbidden = await req('GET', `/admin/orders?brandId=${brandId}`, { token: custToken });
  ok(forbidden.status === 401 || forbidden.status === 403, 'customer JWT เข้า /admin → 401/403', `ได้ ${forbidden.status}`);

  // 13) admin เห็นออเดอร์
  const adminOrders = await req('GET', `/admin/orders?brandId=${brandId}`, { token: adminToken });
  ok(
    adminOrders.status === 200 && (adminOrders.body || []).some((o) => o.id === order.id),
    'admin เห็นออเดอร์ในลิสต์',
  );

  // 14) status transition ไล่ลำดับ + กันถอยหลัง
  const toConfirmed = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${brandId}`, {
    token: adminToken,
    body: { status: 'confirmed' },
  });
  ok(toConfirmed.status === 200 && toConfirmed.body?.status === 'confirmed', 'pending → confirmed');
  const backward = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${brandId}`, {
    token: adminToken,
    body: { status: 'pending' },
  });
  ok(backward.status === 409 || backward.status === 400, 'ถอยหลัง confirmed → pending ถูกปฏิเสธ', `ได้ ${backward.status}`);

  // 15) US-16 พักรับออเดอร์ → order ใหม่ 422
  const pause = await req('PATCH', `/admin/store/pause?brandId=${brandId}`, {
    token: adminToken,
    body: { isOpen: false },
  });
  ok(pause.status === 200 && pause.body?.isOpen === false, 'พักร้าน (isOpen=false)');
  const whilePaused = await req('POST', '/orders', {
    token: custToken,
    body: { ...orderBody, idempotencyKey: uuid() },
  });
  ok(whilePaused.status === 422, 'พักอยู่ → สร้างออเดอร์ 422', `ได้ ${whilePaused.status}`);
  // คืนสถานะเปิด
  const resume = await req('PATCH', `/admin/store/pause?brandId=${brandId}`, {
    token: adminToken,
    body: { isOpen: true },
  });
  ok(resume.status === 200 && resume.body?.isOpen === true, 'เปิดร้านคืน');

  // สรุป
  console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}E2E: ${pass} ผ่าน / ${fail} ล้มเหลว\x1b[0m`);
  if (fail > 0) {
    console.log('ล้มเหลว:\n  - ' + fails.join('\n  - '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\x1b[31mE2E error:\x1b[0m', e);
  process.exit(1);
});
