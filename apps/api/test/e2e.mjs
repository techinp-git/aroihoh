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

import { createHmac } from 'node:crypto';

const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET || 'test-secret-e2e';
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

  // US-36: จัดการแบรนด์ — kitchens list + สร้างแบรนด์ + token refresh (brandIds เป็น cache)
  const kitchens = await req('GET', '/admin/kitchens', { token: adminToken });
  ok(kitchens.status === 200 && kitchens.body?.[0]?.id, 'GET /admin/kitchens (มีครัว seed)');
  const kid = kitchens.body[0].id;
  const uniqSlug = 'e2e-brand-' + Date.now().toString(36);
  const createdBrand = await req('POST', '/admin/brands', {
    token: adminToken, body: { name: 'E2E Brand', slug: uniqSlug, kitchenIds: [kid] },
  });
  ok(is2xx(createdBrand.status) && createdBrand.body?.brand?.id, 'POST /admin/brands สร้างแบรนด์ใหม่');
  ok(typeof createdBrand.body?.token === 'string', 'สร้างแบรนด์คืน token ใหม่ (refresh brandIds cache)');
  const newBrandId = createdBrand.body?.brand?.id;
  // token เก่า (ก่อนสร้าง) เข้าถึงแบรนด์ใหม่ไม่ได้ → พิสูจน์ว่า refresh จำเป็น
  const oldTokAccess = await req('PATCH', `/admin/brands/${newBrandId}/cod`, { token: adminToken, body: { enabled: false } });
  ok(oldTokAccess.status === 403, 'token เก่าเข้าถึงแบรนด์ใหม่ไม่ได้ (403) — brandIds เป็น snapshot');
  // token ใหม่เข้าถึงได้
  const newTokAccess = await req('PATCH', `/admin/brands/${newBrandId}/cod`, { token: createdBrand.body.token, body: { enabled: false } });
  ok(is2xx(newTokAccess.status), 'token ใหม่เข้าถึงแบรนด์ใหม่ได้ทันที');
  // ผูกครัวข้าม merchant ไม่ได้
  const badKitchen = await req('POST', '/admin/brands', {
    token: createdBrand.body.token, body: { name: 'X', slug: uniqSlug + '-x', kitchenIds: ['00000000-0000-0000-0000-000000000000'] },
  });
  ok(badKitchen.status === 400, 'ผูกครัวข้าม merchant → 400 (tenant isolation)');

  // US-36b: คัดลอกเมนู seed brand → แบรนด์ใหม่ (ว่าง) แล้วต้องมีเมนูตาม
  const copyRes = await req('POST', '/admin/menu/copy', {
    token: createdBrand.body.token, body: { sourceBrandId: brandId, targetBrandId: newBrandId },
  });
  ok(is2xx(copyRes.status) && copyRes.body?.items > 0, 'คัดลอกเมนูข้ามแบรนด์ (items > 0)', JSON.stringify(copyRes.body));
  const copiedMenu = await req('GET', `/admin/menu?brandId=${newBrandId}`, { token: createdBrand.body.token });
  ok(copiedMenu.body?.length === copyRes.body?.items, 'แบรนด์ใหม่มีเมนูตามจำนวนที่คัดลอก');
  const sameCopy = await req('POST', '/admin/menu/copy', {
    token: createdBrand.body.token, body: { sourceBrandId: newBrandId, targetBrandId: newBrandId },
  });
  ok(sameCopy.status === 400, 'คัดลอก source=target → 400');

  // US-44: จัดการครัว — สร้างครัว (มี flat fee) + list รายละเอียด + แก้ไข
  const newKitchen = await req('POST', '/admin/kitchens', {
    token: adminToken, body: { name: 'ครัว e2e', lat: 13.72, lng: 100.57, maxDistanceKm: 4, flatFee: 2000 },
  });
  ok(is2xx(newKitchen.status) && newKitchen.body?.id, 'POST /admin/kitchens สร้างครัว');
  const kDetail = await req('GET', '/admin/kitchens', { token: adminToken });
  const madeK = (kDetail.body || []).find((k) => k.id === newKitchen.body.id);
  ok(madeK && madeK.feeType === 'flat' && madeK.flatFee === 2000, 'ครัวใหม่มี flat fee 2000 (สั่งได้จริง)');
  const kUpd = await req('PATCH', `/admin/kitchens/${newKitchen.body.id}`, {
    token: adminToken, body: { maxDistanceKm: 6, flatFee: 2500 },
  });
  ok(is2xx(kUpd.status), 'PATCH /admin/kitchens แก้รัศมี+ค่าส่ง');

  // US-38: dashboard รวม merchant — total + แยกต่อแบรนด์ (โครงสร้างถูก)
  const mDaily = await req('GET', '/admin/reports/merchant-daily', { token: adminToken });
  ok(is2xx(mDaily.status) && mDaily.body?.total && Array.isArray(mDaily.body?.brands), 'GET merchant-daily (total + brands[])');

  // US-39: public brand info (LIFF ธีม) — ไม่ต้อง auth · ตั้งธีมแล้วอ่านคืนได้
  await req('PATCH', `/admin/brands/${brandId}`, { token: adminToken, body: { theme: { primaryColor: '#123456' } } });
  const pubBrand = await req('GET', `/brand/${brandId}`);
  ok(pubBrand.status === 200 && pubBrand.body?.name && pubBrand.body?.theme?.primaryColor === '#123456', 'GET /brand/:id (public) คืนชื่อ+ธีม');

  // 4) เมนู (เอา menuItemId สำหรับสร้างออเดอร์)
  const menu = await req('GET', `/admin/menu?brandId=${brandId}`, { token: adminToken });
  ok(menu.status === 200 && menu.body?.length > 0, 'GET /admin/menu มีเมนู');
  const item = (menu.body || []).find((m) => m.isAvailable) || menu.body[0];
  ok(!!item?.isAvailable, 'มีเมนูที่พร้อมขายอย่างน้อย 1 รายการ');
  const unitPrice = item.price; // 6000

  // 4b) เมนู CRUD (US-14 admin) — categories + create + update + delete
  const cats = await req('GET', `/admin/menu/categories?brandId=${brandId}`, { token: adminToken });
  ok(cats.status === 200 && Array.isArray(cats.body), 'GET /admin/menu/categories');
  const created = await req('POST', '/admin/menu/items', {
    token: adminToken,
    body: { brandId, name: 'E2E เมนูชั่วคราว', price: 9900 },
  });
  ok(is2xx(created.status) && created.body?.id, 'สร้างเมนูใหม่ (admin)', JSON.stringify(created.body));
  const newItemId = created.body?.id;
  const upd = await req('PATCH', `/admin/menu/items/${newItemId}?brandId=${brandId}`, {
    token: adminToken,
    body: { price: 8800, description: 'แก้แล้ว' },
  });
  ok(upd.status === 200 && upd.body?.price === 8800, 'แก้ไขเมนู (ราคา/รายละเอียด)');
  // cross-tenant guard: brandId มั่ว → ต้องไม่ให้ลบ
  const delWrong = await req('DELETE', `/admin/menu/items/${newItemId}?brandId=not-a-brand`, { token: adminToken });
  ok(delWrong.status === 403 || delWrong.status === 404, 'ลบเมนูข้ามแบรนด์ถูกปฏิเสธ', `ได้ ${delWrong.status}`);
  const del = await req('DELETE', `/admin/menu/items/${newItemId}?brandId=${brandId}`, { token: adminToken });
  ok(is2xx(del.status) && del.body?.deleted === true, 'ลบเมนู (admin)');

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

  // 11b) US-58: โปรไฟล์ + สมุดที่อยู่ (ปักได้หลายหมุด สูงสุด 5, ไม่แชร์ข้ามแบรนด์)
  //      ใช้ลูกค้าใหม่ทุกครั้งที่รัน เพื่อให้เทสต์เพดาน 5 หมุดซ้ำได้ (dev-login upsert ตามชื่อ)
  //      ⚠️ ต้องใช้ uuid() เต็ม — ขึ้นต้นด้วย 'e2e-<timestamp>' การตัดตัวหน้าจะได้ชื่อซ้ำข้ามรอบ
  const addrCust = await req('POST', '/auth/dev-login', {
    body: { brandId, name: 'e2e-addr-' + uuid() },
  });
  const addrToken = addrCust.body?.accessToken;

  const noAuth = await req('GET', '/me/profile');
  ok(noAuth.status === 401, 'GET /me/profile ไม่มี token → 401', `ได้ ${noAuth.status}`);

  const prof0 = await req('GET', '/me/profile', { token: addrToken });
  ok(is2xx(prof0.status), 'GET /me/profile', JSON.stringify(prof0.body));
  ok(Array.isArray(prof0.body?.addresses) && prof0.body.addresses.length === 0, 'ลูกค้าใหม่ยังไม่มีหมุด');
  ok(prof0.body?.addressLimit === 5, 'เพดานสมุดที่อยู่ = 5');
  ok(prof0.body?.hasPhone === false && prof0.body?.phoneLast4 === null, 'ยังไม่มีเบอร์โทร');
  ok(prof0.body?.phoneEnc === undefined, '/me/profile ไม่คืน phoneEnc (PDPA)');

  // หมุดแรก (ในเขต) → ต้องเป็นหมุดหลักอัตโนมัติ + ส่งถึงได้
  const a1 = await req('POST', '/me/addresses', {
    token: addrToken,
    body: { label: 'บ้าน', detail: 'คอนโดใกล้ครัว', note: 'ชั้น 12 ฝาก รปภ.', ...IN_ZONE },
  });
  ok(is2xx(a1.status) && a1.body?.created, 'เพิ่มหมุดแรกได้', JSON.stringify(a1.body));
  const homeId = a1.body?.created;
  const home = (a1.body?.addresses || []).find((x) => x.id === homeId);
  ok(home?.isDefault === true, 'หมุดแรกเป็นหมุดหลักอัตโนมัติ');
  ok(home?.deliverable === true, 'หมุดในเขต → deliverable true');
  ok(home?.note === 'ชั้น 12 ฝาก รปภ.', 'เก็บโน้ตจุดสังเกตได้');

  // หมุดนอกเขต — บันทึกได้ แต่ต้องบอกว่าส่งไม่ถึง
  const a2 = await req('POST', '/me/addresses', {
    token: addrToken,
    body: { label: 'ที่ทำงาน', detail: 'ออฟฟิศไกล', ...OUT_ZONE },
  });
  ok(is2xx(a2.status), 'บันทึกหมุดนอกเขตได้');
  const workId = a2.body?.created;
  const work = (a2.body?.addresses || []).find((x) => x.id === workId);
  ok(work?.deliverable === false, 'หมุดนอกเขต → deliverable false');

  // เพดาน 5 หมุด
  for (let i = 3; i <= 5; i++) {
    await req('POST', '/me/addresses', {
      token: addrToken,
      body: { label: 'หมุด ' + i, detail: 'ที่อยู่ ' + i, ...IN_ZONE },
    });
  }
  const a6 = await req('POST', '/me/addresses', {
    token: addrToken,
    body: { label: 'เกิน', detail: 'หมุดที่ 6', ...IN_ZONE },
  });
  ok(a6.status === 422 && a6.body?.code === 'ADDRESS_LIMIT', 'หมุดที่ 6 → 422 ADDRESS_LIMIT', `ได้ ${a6.status}`);

  // ตั้งหมุดหลักใหม่ → ต้องมีหมุดหลักอันเดียว
  const setDefault = await req('PATCH', `/me/addresses/${workId}`, {
    token: addrToken,
    body: { isDefault: true },
  });
  const defaults = (setDefault.body?.addresses || []).filter((x) => x.isDefault);
  ok(defaults.length === 1 && defaults[0].id === workId, 'ตั้งหมุดหลักใหม่ → มีหมุดหลักอันเดียว');
  ok(setDefault.body?.addresses?.[0]?.id === workId, 'หมุดหลักถูกเรียงขึ้นก่อน');

  // tenant/owner isolation — ลูกค้าอื่นแตะหมุดเราไม่ได้
  const peekAddr = await req('PATCH', `/me/addresses/${homeId}`, {
    token: otherToken,
    body: { label: 'ยึดหมุด' },
  });
  ok(peekAddr.status === 404, 'ลูกค้าอื่นแก้หมุดเรา → 404', `ได้ ${peekAddr.status}`);
  const delOther = await req('DELETE', `/me/addresses/${homeId}`, { token: otherToken });
  ok(delOther.status === 404, 'ลูกค้าอื่นลบหมุดเรา → 404', `ได้ ${delOther.status}`);

  // สั่งด้วยหมุดในสมุด — server ใช้พิกัดจาก DB และ snapshot ที่อยู่ลงออเดอร์
  const savedOrder = await req('POST', '/orders', {
    token: addrToken,
    body: {
      idempotencyKey: uuid(),
      items: [{ menuItemId: item.id, qty: 1 }],
      savedAddressId: homeId,
      paymentMethod: 'cod',
    },
  });
  ok(is2xx(savedOrder.status), 'สั่งด้วย savedAddressId สำเร็จ', JSON.stringify(savedOrder.body));
  const savedOrderId = savedOrder.body?.id;

  // หมุดนอกเขตต้องถูกปฏิเสธเหมือนกัน (เช็คเขตซ้ำ ไม่เชื่อว่าเคยบันทึกไว้แล้วแปลว่าส่งได้)
  const outSaved = await req('POST', '/orders', {
    token: addrToken,
    body: {
      idempotencyKey: uuid(),
      items: [{ menuItemId: item.id, qty: 1 }],
      savedAddressId: workId,
      paymentMethod: 'cod',
    },
  });
  ok(outSaved.status === 422, 'สั่งด้วยหมุดนอกเขต → 422', `ได้ ${outSaved.status}`);

  // หมุดของคนอื่น → 404 (ไม่บอกว่ามีอยู่จริง)
  const stolen = await req('POST', '/orders', {
    token: otherToken,
    body: {
      idempotencyKey: uuid(),
      items: [{ menuItemId: item.id, qty: 1 }],
      savedAddressId: homeId,
      paymentMethod: 'cod',
    },
  });
  ok(stolen.status === 404, 'สั่งด้วยหมุดของคนอื่น → 404', `ได้ ${stolen.status}`);

  // ไม่ส่งที่อยู่เลย → 400
  const noAddr = await req('POST', '/orders', {
    token: addrToken,
    body: { idempotencyKey: uuid(), items: [{ menuItemId: item.id, qty: 1 }], paymentMethod: 'cod' },
  });
  ok(noAddr.status === 400, 'ไม่ส่งที่อยู่เลย → 400', `ได้ ${noAddr.status}`);

  // ⭐ หัวใจของ US-58: แก้หมุดในสมุดแล้ว ที่อยู่บนออเดอร์เก่าต้องไม่เปลี่ยน (snapshot)
  await req('PATCH', `/me/addresses/${homeId}`, {
    token: addrToken,
    body: { detail: 'ย้ายบ้านแล้ว', note: 'บ้านใหม่' },
  });
  const kdsAfter = await req('GET', '/admin/kitchen/orders', { token: adminToken });
  const snap = (kdsAfter.body || []).find((o) => o.id === savedOrderId);
  ok(
    snap?.address?.detail === 'คอนโดใกล้ครัว',
    'แก้หมุดในสมุด → ที่อยู่บนออเดอร์เก่าไม่เปลี่ยน (snapshot)',
    `ได้ ${snap?.address?.detail}`,
  );

  // ลบหมุดหลัก → หมุดอื่นเลื่อนขึ้นเป็นหมุดหลักแทน (เช็คเอาต์ยังมีตัวเลือกตั้งต้น)
  const removed = await req('DELETE', `/me/addresses/${workId}`, { token: addrToken });
  ok(is2xx(removed.status), 'ลบหมุดได้');
  ok((removed.body?.addresses || []).every((x) => x.id !== workId), 'หมุดที่ลบหายจากสมุด');
  ok((removed.body?.addresses || []).filter((x) => x.isDefault).length === 1, 'ลบหมุดหลัก → เลื่อนหมุดอื่นขึ้นแทน');

  // saveAddress ตอนเช็คเอาต์ — ปักสด + ติ๊กบันทึก
  const beforeSave = (await req('GET', '/me/addresses', { token: addrToken })).body?.addresses?.length;
  await req('DELETE', `/me/addresses/${homeId}`, { token: addrToken }); // เว้นที่ให้ไม่ชนเพดาน
  await req('POST', '/orders', {
    token: addrToken,
    body: {
      idempotencyKey: uuid(),
      items: [{ menuItemId: item.id, qty: 1 }],
      deliveryAddress: { label: 'ที่ใหม่จากเช็คเอาต์', detail: 'ปักสดแล้วติ๊กบันทึก', ...IN_ZONE },
      saveAddress: true,
      paymentMethod: 'cod',
    },
  });
  const afterSave = (await req('GET', '/me/addresses', { token: addrToken })).body?.addresses || [];
  ok(
    afterSave.some((x) => x.label === 'ที่ใหม่จากเช็คเอาต์'),
    'saveAddress: ติ๊กบันทึกตอนเช็คเอาต์ → หมุดเข้าสมุด',
    `ก่อน ${beforeSave} หลัง ${afterSave.length}`,
  );

  // PATCH /me/profile — เบอร์โทร (เข้ารหัสเก็บ, คืนแค่ 4 ตัวท้าย) + opt-out ข่าวสาร (PDPA)
  const badPhone = await req('PATCH', '/me/profile', { token: addrToken, body: { phone: '123' } });
  ok(badPhone.status === 400, 'เบอร์ผิดรูปแบบ → 400', `ได้ ${badPhone.status}`);
  const setPhone = await req('PATCH', '/me/profile', {
    token: addrToken,
    body: { phone: '081-234-5678', marketingOptedOut: true },
  });
  ok(setPhone.body?.hasPhone === true && setPhone.body?.phoneLast4 === '5678', 'บันทึกเบอร์ → คืนแค่ 4 ตัวท้าย');
  ok(setPhone.body?.phone === undefined && setPhone.body?.phoneEnc === undefined, 'ไม่คืนเบอร์เต็ม/ค่าที่เข้ารหัส (PDPA)');
  ok(setPhone.body?.marketingOptedOut === true, 'ลูกค้ากด opt-out ข่าวสารเองได้ (PDPA)');
  const clearPhone = await req('PATCH', '/me/profile', { token: addrToken, body: { phone: '' } });
  ok(clearPhone.body?.hasPhone === false, 'ลบเบอร์ทิ้งได้');

  // 11c) US-50: แกนสะสมแต้ม (EP-14) — สแกน QR ได้แต้ม → แลกรางวัล → คนขายยืนยัน
  const loyCust = await req('POST', '/auth/dev-login', {
    body: { brandId, name: 'e2e-loy-' + uuid() },
  });
  const loyToken = loyCust.body?.accessToken;

  const me0 = await req('GET', '/loyalty/me', { token: loyToken });
  ok(is2xx(me0.status) && me0.body?.balance === 0, 'ลูกค้าใหม่ แต้ม = 0', JSON.stringify(me0.body));

  // สร้างล็อต QR (เริ่มที่ draft เสมอ)
  const batch = await req('POST', '/admin/loyalty/batches', {
    token: adminToken,
    body: { brandId, name: 'E2E ล็อตทดสอบ', points: 10, quantity: 3 },
  });
  ok(is2xx(batch.status) && batch.body?.codesCreated === 3, 'สร้างล็อต QR + ออกโค้ด 3 ใบ', JSON.stringify(batch.body));
  ok(batch.body?.status === 'draft', 'ล็อตใหม่เริ่มที่ draft (กันสแกนตั้งแต่โรงพิมพ์)');
  const batchId = batch.body?.id;

  const codesRes = await req('GET', `/admin/loyalty/batches/${batchId}/codes?brandId=${brandId}`, { token: adminToken });
  const codes = codesRes.body?.codes || [];
  ok(codes.length === 3 && codes[0]?.code?.length === 16, 'ดึงโค้ดทั้งล็อตได้ (ยาว 16 ตัว)');
  ok(new Set(codes.map((c) => c.code)).size === 3, 'โค้ดในล็อตไม่ซ้ำกัน');

  // ล็อตยัง draft → สแกนแล้วต้องยังไม่ได้แต้ม
  const earnDraft = await req('POST', '/loyalty/earn', { token: loyToken, body: { code: codes[0].code } });
  ok(earnDraft.status === 404, 'ล็อต draft → สแกนไม่ได้แต้ม (404)', `ได้ ${earnDraft.status}`);

  const activate = await req('PATCH', `/admin/loyalty/batches/${batchId}?brandId=${brandId}`, {
    token: adminToken, body: { status: 'active' },
  });
  ok(is2xx(activate.status), 'เปิดใช้ล็อต');

  // สแกนได้แต้มจริง
  const earn1 = await req('POST', '/loyalty/earn', { token: loyToken, body: { code: codes[0].code } });
  ok(is2xx(earn1.status) && earn1.body?.earned === 10 && earn1.body?.balance === 10, 'สแกน QR → ได้ 10 แต้ม', JSON.stringify(earn1.body));

  // ⭐ ใช้ซ้ำไม่ได้
  const earnAgain = await req('POST', '/loyalty/earn', { token: loyToken, body: { code: codes[0].code } });
  ok(earnAgain.status === 409, 'สแกนโค้ดเดิมซ้ำ → 409', `ได้ ${earnAgain.status}`);

  // คนอื่นก็ใช้โค้ดที่ถูกใช้แล้วไม่ได้
  const earnStolen = await req('POST', '/loyalty/earn', { token: custToken, body: { code: codes[0].code } });
  ok(earnStolen.status === 409, 'ลูกค้าอื่นสแกนโค้ดที่ใช้แล้ว → 409', `ได้ ${earnStolen.status}`);

  // พิมพ์รหัสเองแบบมีขีด/ตัวเล็ก ก็ต้องใช้ได้ (เส้นสำรองเมื่อกล้องสแกนไม่ติด)
  const human = codes[1].human.toLowerCase();
  const earnHuman = await req('POST', '/loyalty/earn', { token: loyToken, body: { code: human } });
  ok(is2xx(earnHuman.status) && earnHuman.body?.balance === 20, 'พิมพ์รหัสเอง (มีขีด/ตัวเล็ก) ใช้ได้', JSON.stringify(earnHuman.body));

  // รหัสมั่ว → 404 (ไม่บอกว่ามี/ไม่มีในระบบ)
  const earnBogus = await req('POST', '/loyalty/earn', { token: loyToken, body: { code: 'ZZZZZZZZZZZZZZZZ' } });
  ok(earnBogus.status === 404, 'รหัสมั่ว → 404', `ได้ ${earnBogus.status}`);

  // ⭐ ข้ามแบรนด์: โค้ดของแบรนด์นี้ ลูกค้าแบรนด์อื่นสแกนไม่ได้
  const otherBrandCust = await req('POST', '/auth/dev-login', { body: { brandId: newBrandId, name: 'e2e-loy-x-' + uuid() } });
  const crossEarn = await req('POST', '/loyalty/earn', {
    token: otherBrandCust.body?.accessToken, body: { code: codes[2].code },
  });
  ok(crossEarn.status === 404, 'สแกนโค้ดข้ามแบรนด์ → 404 (tenant isolation)', `ได้ ${crossEarn.status}`);

  // ledger ตรงกับยอดแต้ม
  const me1 = await req('GET', '/loyalty/me', { token: loyToken });
  const ledgerSum = (me1.body?.history || []).reduce((a, h) => a + h.points, 0);
  ok(me1.body?.balance === 20 && ledgerSum === 20, 'ยอดแต้ม = ผลรวม ledger', `balance=${me1.body?.balance} ledger=${ledgerSum}`);

  // รางวัล
  const rw = await req('POST', '/admin/loyalty/rewards', {
    token: adminToken, body: { brandId, name: 'E2E ข้าวฟรี', pointsCost: 20 },
  });
  ok(is2xx(rw.status) && rw.body?.id, 'สร้างรางวัล');
  const rewardId = rw.body?.id;
  const rwExpensive = await req('POST', '/admin/loyalty/rewards', {
    token: adminToken, body: { brandId, name: 'E2E รางวัลแพง', pointsCost: 9999 },
  });

  const rwList = await req('GET', '/loyalty/rewards', { token: loyToken });
  const affordable = (rwList.body?.rewards || []).find((r) => r.id === rewardId);
  ok(affordable?.affordable === true, 'รางวัลที่แต้มพอ → affordable true');
  ok((rwList.body?.rewards || []).find((r) => r.id === rwExpensive.body?.id)?.affordable === false, 'รางวัลที่แต้มไม่พอ → affordable false');

  // แต้มไม่พอ → 422
  const tooExpensive = await req('POST', '/loyalty/redemptions', { token: loyToken, body: { rewardId: rwExpensive.body?.id } });
  ok(tooExpensive.status === 422, 'ขอคูปองทั้งที่แต้มไม่พอ → 422', `ได้ ${tooExpensive.status}`);

  // ขอคูปอง — ยังไม่ตัดแต้ม
  const red1 = await req('POST', '/loyalty/redemptions', { token: loyToken, body: { rewardId } });
  ok(is2xx(red1.status) && red1.body?.token, 'ขอคูปองแลกแต้มได้', JSON.stringify(red1.body));
  const meAfterCoupon = await req('GET', '/loyalty/me', { token: loyToken });
  ok(meAfterCoupon.body?.balance === 20, '⭐ ออกคูปองแล้วยังไม่ตัดแต้ม (ตัดตอนคนขายยืนยัน)', `balance=${meAfterCoupon.body?.balance}`);

  // ขอใบใหม่ → ใบเก่าถูกยกเลิก (มี pending ได้ทีละ 1)
  const red2 = await req('POST', '/loyalty/redemptions', { token: loyToken, body: { rewardId } });
  const old = await req('GET', `/loyalty/redemptions/${red1.body?.id}`, { token: loyToken });
  ok(old.body?.status === 'cancelled', 'ขอคูปองใบใหม่ → ใบเก่าถูกยกเลิก (pending ได้ทีละ 1)', `ได้ ${old.body?.status}`);

  // คูปองของคนอื่น
  const peekCoupon = await req('GET', `/loyalty/redemptions/${red2.body?.id}`, { token: custToken });
  ok(peekCoupon.status === 404, 'ลูกค้าอื่นดูคูปองเรา → 404', `ได้ ${peekCoupon.status}`);

  // คนขายสแกน preview แล้วยืนยัน
  const preview = await req('GET', `/admin/loyalty/redemptions/${red2.body?.token}`, { token: adminToken });
  ok(is2xx(preview.status) && preview.body?.confirmable === true, 'คนขาย preview คูปอง → ยืนยันได้', JSON.stringify(preview.body));
  ok(preview.body?.pointsCost === 20 && preview.body?.rewardName === 'E2E ข้าวฟรี', 'preview บอกรางวัล + แต้มที่จะตัด');

  const confirm1 = await req('POST', `/admin/loyalty/redemptions/${red2.body?.token}/confirm`, { token: adminToken });
  ok(is2xx(confirm1.status) && confirm1.body?.balance === 0, 'ยืนยันแลก → ตัดแต้ม เหลือ 0', JSON.stringify(confirm1.body));

  // ⭐ ยืนยันซ้ำต้องไม่ตัดแต้มอีกรอบ
  const confirm2 = await req('POST', `/admin/loyalty/redemptions/${red2.body?.token}/confirm`, { token: adminToken });
  ok(confirm2.status === 409, 'ยืนยันคูปองซ้ำ → 409 ไม่ตัดแต้มซ้ำ', `ได้ ${confirm2.status}`);
  const meFinal = await req('GET', '/loyalty/me', { token: loyToken });
  ok(meFinal.body?.balance === 0, '⭐ ยอดแต้มไม่ติดลบหลังยืนยันซ้ำ', `balance=${meFinal.body?.balance}`);
  const finalLedger = (meFinal.body?.history || []).reduce((a, h) => a + h.points, 0);
  ok(finalLedger === 0, 'ledger ยังตรงกับยอดแต้มหลังแลก', `ledger=${finalLedger}`);

  // แต้มหมดแล้วขอคูปองอีกไม่ได้
  const afterSpent = await req('POST', '/loyalty/redemptions', { token: loyToken, body: { rewardId } });
  ok(afterSpent.status === 422, 'แต้มหมดแล้วขอคูปองอีก → 422', `ได้ ${afterSpent.status}`);

  // RBAC / tenant
  const custBatch = await req('POST', '/admin/loyalty/batches', { token: custToken, body: { brandId, name: 'x', points: 1, quantity: 1 } });
  ok(custBatch.status === 401 || custBatch.status === 403, 'customer JWT สร้างล็อต QR → 401/403', `ได้ ${custBatch.status}`);
  const crossBatch = await req('POST', '/admin/loyalty/batches', {
    token: adminToken, body: { brandId: 'not-a-brand', name: 'x', points: 1, quantity: 1 },
  });
  ok(crossBatch.status === 403 || crossBatch.status === 404, 'สร้างล็อตข้ามแบรนด์ถูกปฏิเสธ', `ได้ ${crossBatch.status}`);

  // US-53/54: ยืนยันด้วย "รหัสที่พิมพ์เอง" (ตัวเล็ก+มีขีด) — เส้นสำรองเมื่อกล้องสแกนไม่ติด
  await req('POST', '/loyalty/earn', { token: loyToken, body: { code: codes[2].code } }); // +10
  const rwTyped = await req('POST', '/admin/loyalty/rewards', {
    token: adminToken, body: { brandId, name: 'E2E รางวัลพิมพ์รหัส', pointsCost: 10 },
  });
  const redTyped = await req('POST', '/loyalty/redemptions', { token: loyToken, body: { rewardId: rwTyped.body?.id } });
  ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(redTyped.body?.code || ''), 'คูปองมีรหัสสั้น 3 กลุ่มให้พิมพ์เอง', redTyped.body?.code);
  const previewTyped = await req('GET', `/admin/loyalty/redemptions/${redTyped.body.code.toLowerCase()}`, { token: adminToken });
  ok(is2xx(previewTyped.status) && previewTyped.body?.confirmable === true, 'preview ด้วยรหัสตัวเล็ก+มีขีด ใช้ได้', `ได้ ${previewTyped.status}`);
  const confirmTyped = await req('POST', `/admin/loyalty/redemptions/${redTyped.body.code.toLowerCase()}/confirm`, { token: adminToken });
  ok(is2xx(confirmTyped.status) && confirmTyped.body?.balance === 0, 'ยืนยันด้วยรหัสที่พิมพ์เอง → ตัดแต้มสำเร็จ', JSON.stringify(confirmTyped.body));

  // US-53: ปิดรางวัล → ลูกค้าไม่เห็นในลิสต์อีก
  const off = await req('PATCH', `/admin/loyalty/rewards/${rwTyped.body?.id}?brandId=${brandId}`, {
    token: adminToken, body: { isActive: false },
  });
  ok(is2xx(off.status) && off.body?.isActive === false, 'ปิดรางวัลได้ (PATCH)');
  const rwAfterOff = await req('GET', '/loyalty/rewards', { token: loyToken });
  ok(!(rwAfterOff.body?.rewards || []).some((r) => r.id === rwTyped.body?.id), 'รางวัลที่ปิดแล้วหายจากลิสต์ฝั่งลูกค้า');
  const offCross = await req('PATCH', `/admin/loyalty/rewards/${rwTyped.body?.id}?brandId=${newBrandId}`, {
    token: adminToken, body: { isActive: true },
  });
  ok(offCross.status === 403 || offCross.status === 404, 'แก้รางวัลข้ามแบรนด์ถูกปฏิเสธ', `ได้ ${offCross.status}`);

  // การ์ดแต้มโผล่ในโปรไฟล์แล้ว (US-59 ผูกกับค่านี้)
  const profLoyalty = await req('GET', '/me/profile', { token: loyToken });
  ok(profLoyalty.body?.loyalty?.balance === 0, '/me/profile คืน loyalty แล้ว (แท็บแต้มใน LIFF ติดขึ้นมา)', JSON.stringify(profLoyalty.body?.loyalty));

  // 12) RBAC — customer JWT ห้ามเข้า admin endpoint
  const forbidden = await req('GET', `/admin/orders?brandId=${brandId}`, { token: custToken });
  ok(forbidden.status === 401 || forbidden.status === 403, 'customer JWT เข้า /admin → 401/403', `ได้ ${forbidden.status}`);

  // 13) admin เห็นออเดอร์
  const adminOrders = await req('GET', `/admin/orders?brandId=${brandId}`, { token: adminToken });
  ok(
    adminOrders.status === 200 && (adminOrders.body || []).some((o) => o.id === order.id),
    'admin เห็นออเดอร์ในลิสต์',
  );

  // SEC-2: IDOR — ใช้ brandId ที่ตัวเองมีสิทธิ์ แต่ entity id ของอีกแบรนด์ → ต้องไม่ผ่าน (verify ownership ไม่ใช่แค่ brandId param)
  // order อยู่ brandId(ชิมชีวา) · ลองสั่งงานผ่าน newBrandId (แบรนด์ที่ owner มีสิทธิ์เหมือนกัน) → order ไม่ได้อยู่แบรนด์นั้น
  const idorStatus = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${newBrandId}`, { token: adminToken, body: { status: 'confirmed' } });
  ok(idorStatus.status === 404 || idorStatus.status === 403, 'IDOR: เปลี่ยนสถานะ order ข้ามแบรนด์ (ownership) ถูกปฏิเสธ', `ได้ ${idorStatus.status}`);
  const idorPaid = await req('PATCH', `/admin/orders/${order.id}/mark-paid?brandId=${newBrandId}`, { token: adminToken });
  ok(idorPaid.status === 404 || idorPaid.status === 403, 'IDOR: mark-paid order ข้ามแบรนด์ ถูกปฏิเสธ', `ได้ ${idorPaid.status}`);

  // US-45: role kitchen — เข้า KDS ได้ แต่ customers(PII)/reports/chat ไม่ได้ (403)
  const kEmail = `kitchen-${uuid()}@e2e.local`;
  const mkKitchen = await req('POST', '/admin/users', { token: adminToken, body: { email: kEmail, password: 'kitchen12', name: 'ครัว e2e', role: 'kitchen', brandIds: [brandId] } });
  ok(is2xx(mkKitchen.status) && mkKitchen.body?.role === 'kitchen', 'สร้าง user role=kitchen (ผูกแบรนด์)');
  const kLogin = await req('POST', '/admin/auth/login', { body: { email: kEmail, password: 'kitchen12' } });
  const kTok = kLogin.body?.token;
  ok(!!kTok, 'kitchen login');
  ok((await req('GET', '/admin/kitchen/orders', { token: kTok })).status === 200, 'kitchen เข้า KDS ได้ (200)');
  ok((await req('GET', `/admin/customers?brandId=${brandId}`, { token: kTok })).status === 403, 'kitchen เข้า customers PII → 403');
  ok((await req('GET', `/admin/reports/daily?brandId=${brandId}`, { token: kTok })).status === 403, 'kitchen เข้า reports → 403');
  ok((await req('GET', '/admin/chat/conversations', { token: kTok })).status === 403, 'kitchen เข้า chat → 403');

  // US-46: chat presence — 2 แอดมิน heartbeat ห้องเดียวกัน ต้องเห็นกัน (กันตอบชนกัน)
  const caEmail = `agent-${uuid()}@e2e.local`;
  await req('POST', '/admin/users', { token: adminToken, body: { email: caEmail, password: 'agent123', name: 'เอเจนต์', role: 'chat_agent', brandIds: [brandId] } });
  const caTok = (await req('POST', '/admin/auth/login', { body: { email: caEmail, password: 'agent123' } })).body?.token;
  const pcust = 'presence-e2e-cust';
  await req('POST', `/admin/chat/${pcust}/presence?brandId=${brandId}`, { token: adminToken, body: { name: 'เจ้าของ' } });
  const caView = await req('POST', `/admin/chat/${pcust}/presence?brandId=${brandId}`, { token: caTok, body: { name: 'เอเจนต์' } });
  ok(is2xx(caView.status) && (caView.body?.viewers || []).includes('เจ้าของ'), 'presence: แอดมินคนที่ 2 เห็นคนแรกกำลังดูห้องเดียวกัน', JSON.stringify(caView.body));

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

  // US-41: flow ครัวมีสถานะ ready (confirmed → preparing → ready → delivering)
  const toPreparing = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${brandId}`, { token: adminToken, body: { status: 'preparing' } });
  ok(toPreparing.body?.status === 'preparing', 'confirmed → preparing');
  const toReady = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${brandId}`, { token: adminToken, body: { status: 'ready' } });
  ok(toReady.status === 200 && toReady.body?.status === 'ready', 'preparing → ready (US-41: ครัวจัดเสร็จ)');
  const skipReady = await req('PATCH', `/admin/orders/${order.id}/status?brandId=${brandId}`, { token: adminToken, body: { status: 'completed' } });
  ok(skipReady.status === 409 || skipReady.status === 400, 'ready ข้ามไป completed ถูกปฏิเสธ (ต้อง delivering ก่อน)');

  // US-37: จอครัว (KDS) — GET /admin/kitchen/orders รวมทุกแบรนด์ + ติด brandName
  const kds = await req('GET', '/admin/kitchen/orders', { token: adminToken });
  ok(kds.status === 200 && Array.isArray(kds.body), 'GET /admin/kitchen/orders (KDS)');
  ok(kds.body.some((o) => o.id === order.id && o.brand?.name), 'KDS มีออเดอร์ + ติด brandName · order ready อยู่ในคิว');
  // US-43: KDS ต้องมี customer + address (+ ไม่คืน phoneEnc) ไว้พิมพ์ label ไรเดอร์
  const kOrder = kds.body.find((o) => o.id === order.id);
  ok(kOrder && 'customer' in kOrder && 'address' in kOrder, 'KDS คืน customer+address (US-43 label)');
  ok(kOrder && kOrder.customer?.phoneEnc === undefined, 'KDS ไม่คืน phoneEnc (PDPA)');

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

  // 16) US-31 LINE broadcast + PDPA opt-out
  const prev0 = await req('POST', `/admin/broadcasts/preview?brandId=${brandId}`, { token: adminToken, body: {} });
  ok(is2xx(prev0.status) && typeof prev0.body?.audienceCount === 'number', 'broadcast preview (reach)', JSON.stringify(prev0.body));
  const baseAudience = prev0.body.audienceCount;
  // opt-out ลูกค้า e2e-buyer แล้ว reach ต้องลดลง — หา customerId จาก admin list
  const custList = await req('GET', `/admin/customers?brandId=${brandId}`, { token: adminToken });
  const buyer = (custList.body || []).find((c) => c.lineUserId === 'Udev-e2e-buyer');
  ok(!!buyer, 'พบลูกค้า e2e-buyer ในระบบ');
  const optOut = await req('PATCH', `/admin/customers/${buyer.id}/opt-out?brandId=${brandId}`, { token: adminToken, body: { optedOut: true } });
  ok(optOut.status === 200 && optOut.body?.marketingOptedOut === true, 'ตั้ง opt-out ลูกค้า (PDPA)');
  // SEC-2 IDOR: แก้ tag ลูกค้าโดยส่ง brandId อีกแบรนด์ (owner มีสิทธิ์) แต่ลูกค้าไม่ได้อยู่แบรนด์นั้น → ปฏิเสธ
  const idorCust = await req('PATCH', `/admin/customers/${buyer.id}/tags?brandId=${newBrandId}`, { token: adminToken, body: { tags: ['x'] } });
  ok(idorCust.status === 404 || idorCust.status === 403, 'IDOR: แก้ tag ลูกค้าข้ามแบรนด์ ถูกปฏิเสธ', `ได้ ${idorCust.status}`);
  const prev1 = await req('POST', `/admin/broadcasts/preview?brandId=${brandId}`, { token: adminToken, body: {} });
  ok(prev1.body?.audienceCount === baseAudience - 1 && prev1.body?.optedOut >= 1, 'opt-out ลด reach ลง 1 (กันส่งถึงคน opt-out)', `${baseAudience}→${prev1.body?.audienceCount}`);
  // สร้าง broadcast → queued + จอง message_logs
  const bc = await req('POST', `/admin/broadcasts?brandId=${brandId}`, { token: adminToken, body: { message: 'E2E promo 🔥' } });
  ok(is2xx(bc.status) && bc.body?.status === 'queued', 'สร้าง broadcast → queued', JSON.stringify(bc.body));
  ok(bc.body?.audienceCount === prev1.body.audienceCount, 'audienceCount ตรงกับ preview (หัก opt-out แล้ว)');
  const bcDetail = await req('GET', `/admin/broadcasts/${bc.body.id}?brandId=${brandId}`, { token: adminToken });
  ok(bcDetail.body?.byStatus?.queued === bc.body.audienceCount, 'message_logs queued = จำนวนผู้รับ (กันส่งซ้ำ)');
  // customer JWT เข้า broadcast ไม่ได้
  const custBcast = await req('POST', `/admin/broadcasts?brandId=${brandId}`, { token: custToken, body: { message: 'x' } });
  ok(custBcast.status === 401 || custBcast.status === 403, 'customer JWT ยิง broadcast → 401/403', `ได้ ${custBcast.status}`);
  // คืน opt-out
  await req('PATCH', `/admin/customers/${buyer.id}/opt-out?brandId=${brandId}`, { token: adminToken, body: { optedOut: false } });

  // 17) US-18 Content Library
  const content = await req('POST', `/admin/content?brandId=${brandId}`, {
    token: adminToken, body: { title: 'E2E คอนเทนต์', body: '🎉 โปร E2E ลด 20%' },
  });
  ok(is2xx(content.status) && content.body?.id, 'สร้าง content ในคลัง', JSON.stringify(content.body));
  const contentList = await req('GET', `/admin/content?brandId=${brandId}`, { token: adminToken });
  ok(contentList.status === 200 && contentList.body.some((c) => c.id === content.body.id), 'content list มีรายการที่สร้าง');
  const custContent = await req('GET', `/admin/content?brandId=${brandId}`, { token: custToken });
  ok(custContent.status === 401 || custContent.status === 403, 'customer JWT เข้า content → 401/403', `ได้ ${custContent.status}`);

  // 18) US-18 Saved Audiences (rules) — สั่ง ≥1 ครั้งใน 7 วัน
  const presets = await req('GET', '/admin/audiences/presets', { token: adminToken });
  ok(presets.status === 200 && presets.body.length === 3, 'audience presets = 3 (member/frequent/lapsed)');
  const aud = await req('POST', `/admin/audiences?brandId=${brandId}`, {
    token: adminToken,
    body: { name: 'E2E แอคทีฟ', rules: { match: 'all', criteria: [{ type: 'order_count_in_window', windowDays: 7, minCount: 1 }] } },
  });
  ok(is2xx(aud.status) && aud.body?.id, 'สร้าง audience จาก rules', JSON.stringify(aud.body));
  const audPrev = await req('GET', `/admin/audiences/${aud.body.id}/preview?brandId=${brandId}`, { token: adminToken });
  ok(is2xx(audPrev.status) && audPrev.body.audienceCount >= 1, 'preview audience (สั่งใน 7 วัน) ได้ผู้รับ ≥1', JSON.stringify(audPrev.body));
  // validate: rules พังต้อง 400
  const badAud = await req('POST', `/admin/audiences?brandId=${brandId}`, {
    token: adminToken, body: { name: 'พัง', rules: { match: 'all', criteria: [{ type: 'lapsed', inactiveDays: 0, lookbackDays: 5 }] } },
  });
  ok(badAud.status === 400, 'rules ผิด (inactiveDays=0) → 400', `ได้ ${badAud.status}`);

  // 19) Broadcast จาก content + audience
  const combo = await req('POST', `/admin/broadcasts?brandId=${brandId}`, {
    token: adminToken, body: { contentId: content.body.id, audienceId: aud.body.id },
  });
  ok(is2xx(combo.status) && combo.body?.message === '🎉 โปร E2E ลด 20%', 'broadcast ดึงข้อความจาก content');
  ok(combo.body?.audienceCount === audPrev.body.audienceCount, 'ผู้รับ broadcast = preview ของ audience');
  ok(combo.body?.contentId === content.body.id && combo.body?.audienceId === aud.body.id, 'broadcast ผูก contentId + audienceId');
  // cross-tenant guard
  const wrongAud = await req('GET', `/admin/audiences/${aud.body.id}/preview?brandId=not-a-brand`, { token: adminToken });
  ok(wrongAud.status === 403 || wrongAud.status === 404, 'audience ข้ามแบรนด์ถูกปฏิเสธ', `ได้ ${wrongAud.status}`);

  // 20) LINE webhook — verify x-line-signature (กติกาเหล็ก #3)
  const evBody = JSON.stringify({
    events: [{ type: 'message', message: { type: 'text', text: 'e2e webhook hi' }, source: { userId: 'Ue2e-webhook' } }],
  });
  const goodSig = createHmac('sha256', LINE_SECRET).update(Buffer.from(evBody)).digest('base64');
  const rawReq = (sig) =>
    fetch(`${BASE}/line/webhook/${brandId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sig ? { 'x-line-signature': sig } : {}) },
      body: evBody,
    }).then((r) => r.status);
  ok((await rawReq('WRONGSIG')) === 401, 'webhook signature ผิด → 401 (กัน event ปลอม)');
  ok((await rawReq(undefined)) === 401, 'webhook ไม่มี signature → 401');
  ok((await rawReq(goodSig)) === 200, 'webhook signature ถูก → 200');
  // ข้อความเข้า Chat Center จริง
  const chatCust = await req('GET', `/admin/customers?brandId=${brandId}`, { token: adminToken });
  const wh = (chatCust.body || []).find((c) => c.lineUserId === 'Ue2e-webhook');
  ok(!!wh, 'webhook สร้างลูกค้าใหม่จาก LINE userId');
  if (wh) {
    const thread = await req('GET', `/admin/chat/${wh.id}?brandId=${brandId}`, { token: adminToken });
    ok(thread.body?.messages?.some((m) => m.direction === 'inbound' && m.text === 'e2e webhook hi'), 'ข้อความ inbound เข้า Chat Center');
    ok(thread.body?.customer?.brand?.name, 'thread บอกว่าคุยผ่าน OA/แบรนด์ไหน (US-40)');
  }
  // US-40: Chat Center เดียว — ไม่ส่ง brandId = inbox รวมทุกแบรนด์ที่มีสิทธิ์ + ทุกห้องติดป้ายแบรนด์
  const inboxAll = await req('GET', '/admin/chat/conversations', { token: adminToken });
  ok(is2xx(inboxAll.status) && Array.isArray(inboxAll.body), 'GET conversations (ไม่ระบุ brandId) → inbox รวม');
  ok(inboxAll.body.some((c) => c.customerId === wh?.id && c.brandName), 'inbox รวมมีห้องจาก webhook + ติด brandName');
  // dispatch broadcast → skipped (ยังไม่มี access token ใน CI)
  const disp = await req('POST', `/admin/broadcasts/${combo.body.id}/dispatch?brandId=${brandId}`, { token: adminToken });
  ok(is2xx(disp.status) && disp.body?.skipped === true, 'dispatch broadcast → skipped (ยังไม่เชื่อม LINE)', JSON.stringify(disp.body));

  // 21) LINE config (US-25/SETUP-1) — owner only, ไม่คืน secret/token ดิบ
  const cfg0 = await req('GET', `/admin/line-config?brandId=${brandId}`, { token: adminToken });
  ok(is2xx(cfg0.status) && typeof cfg0.body?.webhookUrl === 'string', 'GET line-config (มี webhookUrl)');
  const cfgPut = await req('PUT', `/admin/line-config?brandId=${brandId}`, {
    token: adminToken, body: { channelId: '2000e2e', channelSecret: 'e2e-sec', channelAccessToken: 'e2e-tok' },
  });
  ok(cfgPut.body?.configured === true && cfgPut.body?.hasChannelSecret === true, 'PUT line-config → configured');
  ok(cfgPut.body?.channelSecret === undefined && cfgPut.body?.channelAccessToken === undefined, 'line-config ไม่คืน secret/token ดิบ (security)');
  const cfgTest = await req('POST', `/admin/line-config/test?brandId=${brandId}`, { token: adminToken });
  ok(cfgTest.body?.ok === false, 'test line-config (token ปลอม) → ok:false');
  const cfgCust = await req('GET', `/admin/line-config?brandId=${brandId}`, { token: custToken });
  ok(cfgCust.status === 401 || cfgCust.status === 403, 'customer JWT เข้า line-config → 401/403');
  const usage = await req('GET', `/admin/line-config/usage?brandId=${brandId}`, { token: adminToken });
  ok(is2xx(usage.status) && typeof usage.body?.reply === 'number' && typeof usage.body?.push === 'number', 'usage: นับ reply(ฟรี)/push(โควตา)', JSON.stringify(usage.body));
  // เคลียร์ค่าทดสอบ (กัน secret ปลอมค้าง → webhook รอบถัดไป fallback env ได้)
  await req('PUT', `/admin/line-config?brandId=${brandId}`, { token: adminToken, body: { channelId: '', channelSecret: '', channelAccessToken: '' } });

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
