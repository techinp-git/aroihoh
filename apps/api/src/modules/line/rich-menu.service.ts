import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from './line.client';
import { MediaService } from '../media/media.service';
import {
  buildRichMenuFromZones,
  validateRichMenu,
  RICH_MENU_ZONE_PRESETS,
  type RichMenuZone,
} from './richmenu';
import { generateRichMenuImage } from './richmenu-image';
import {
  planAssignments,
  groupChanges,
  chooseMenuForCustomer,
  type AssignableCustomer,
  type GroupMenu,
} from './richmenu-assign';
import type { AudienceRules } from '../audiences/rules';

export interface CreateRichMenuInput {
  name: string;
  audienceId?: string | null; // null/undefined = default menu
  priority?: number;
  preset?: string; // key ใน RICH_MENU_ZONE_PRESETS
  zones?: RichMenuZone[];
  chatBarText?: string;
}

// customer fields ที่ต้องใช้จัดกลุ่ม + ผูกเมนู (superset ของ AudienceCustomer)
const ASSIGN_SELECT = {
  id: true,
  lineUserId: true,
  assignedRichMenuId: true,
  createdAt: true,
  tags: true,
  marketingOptedOut: true,
  marketingConsentAt: true,
  pointsBalance: true,
  orders: { select: { createdAt: true } },
} as const;

@Injectable()
export class RichMenuService {
  private readonly log = new Logger('RichMenuService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineClient,
    private readonly media: MediaService,
  ) {}

  // ── helpers ────────────────────────────────────────────────
  private async brandForImage(brandId: string) {
    const b = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { name: true, liffId: true, theme: true, richMenuId: true },
    });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');
    return b;
  }

  private primaryColor(theme: unknown): string | undefined {
    return (theme as { primaryColor?: string } | null)?.primaryColor;
  }

  /** แปลง input → zones (จาก preset หรือ zones ที่ส่งมา) + validate เบื้องต้น */
  private resolveZones(input: CreateRichMenuInput): RichMenuZone[] {
    let zones = input.zones;
    if ((!zones || zones.length === 0) && input.preset) {
      const p = RICH_MENU_ZONE_PRESETS[input.preset];
      if (!p) throw new BadRequestException(`ไม่รู้จัก preset: ${input.preset}`);
      zones = p.zones;
    }
    if (!zones || zones.length === 0) zones = RICH_MENU_ZONE_PRESETS.default.zones;
    if (zones.length > 6) throw new BadRequestException('Rich Menu ได้สูงสุด 6 ปุ่ม');
    for (const z of zones) {
      if (!z.label?.trim()) throw new BadRequestException('ทุกปุ่มต้องมี label');
      if (z.action?.type === 'message' && !z.action.text?.trim())
        throw new BadRequestException('ปุ่ม message ต้องมีข้อความ');
      if (z.action?.type !== 'message' && z.action?.type !== 'liff')
        throw new BadRequestException('action ต้องเป็น liff หรือ message');
    }
    return zones;
  }

  private async assertAudience(brandId: string, audienceId?: string | null) {
    if (!audienceId) return;
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, brandId }, select: { id: true } });
    if (!a) throw new NotFoundException('ไม่พบกลุ่มเป้าหมาย (audience) ของแบรนด์นี้');
  }

  // ── list / get ─────────────────────────────────────────────
  async list(brandId: string) {
    const menus = await this.prisma.richMenu.findMany({
      where: { brandId },
      orderBy: [{ audienceId: 'asc' }, { priority: 'asc' }],
      include: { audience: { select: { name: true } } },
    });
    // นับลูกค้าที่ผูกอยู่จริงต่อเมนู (assignedRichMenuId = lineRichMenuId)
    const counts = await this.prisma.customer.groupBy({
      by: ['assignedRichMenuId'],
      where: { brandId, assignedRichMenuId: { not: null } },
      _count: { _all: true },
    });
    const countBy = new Map(counts.map((c) => [c.assignedRichMenuId, c._count._all]));
    return menus.map((m) => ({
      id: m.id,
      name: m.name,
      isDefault: m.audienceId === null,
      audienceId: m.audienceId,
      audienceName: m.audience?.name ?? null,
      priority: m.priority,
      chatBarText: m.chatBarText,
      published: !!m.lineRichMenuId,
      enabled: m.enabled,
      assignedCount: m.lineRichMenuId ? countBy.get(m.lineRichMenuId) ?? 0 : 0,
      hasImage: !!m.imagePath,
      updatedAt: m.updatedAt,
    }));
  }

  async get(brandId: string, id: string) {
    const m = await this.prisma.richMenu.findFirst({ where: { id, brandId } });
    if (!m) throw new NotFoundException('ไม่พบ Rich Menu');
    return m;
  }

  /** ใช้โดย image controller (หลัง verify token + assertBrandAccess) */
  async imageMeta(id: string) {
    return this.prisma.richMenu.findUnique({
      where: { id },
      select: { brandId: true, imagePath: true },
    });
  }

  // ── preview (ไม่ยิง LINE / ไม่สร้าง row) ─────────────────────
  async preview(brandId: string, input: CreateRichMenuInput) {
    const zones = this.resolveZones(input);
    const brand = await this.brandForImage(brandId);
    const menu = buildRichMenuFromZones(zones, {
      liffId: brand.liffId,
      brandName: brand.name,
      chatBarText: input.chatBarText,
    });
    const check = validateRichMenu(menu);
    const img = generateRichMenuImage(zones, { brandName: brand.name, primaryColor: this.primaryColor(brand.theme) });
    const imagePath = await this.media.save(img.buffer, img.mime);
    return {
      valid: check.ok,
      errors: check.errors,
      hasLiff: !!brand.liffId,
      warning: brand.liffId ? undefined : 'ยังไม่ได้ตั้ง LIFF ID — ปุ่ม deep link จะใช้การส่งข้อความแทน',
      zones,
      menu,
      imagePath, // ดูรูปได้ที่ /admin/rich-menus/preview-image/:imagePath?token= (หรือ create แล้วดูของจริง)
    };
  }

  // ── create ─────────────────────────────────────────────────
  async create(brandId: string, adminId: string, input: CreateRichMenuInput) {
    if (!input.name?.trim()) throw new BadRequestException('ต้องตั้งชื่อเมนู');
    const audienceId = input.audienceId ?? null;
    await this.assertAudience(brandId, audienceId);

    if (audienceId === null) {
      const existingDefault = await this.prisma.richMenu.findFirst({
        where: { brandId, audienceId: null },
        select: { id: true },
      });
      if (existingDefault)
        throw new BadRequestException('มีเมนู default อยู่แล้ว — แก้ที่เมนูเดิม หรือลบก่อนสร้างใหม่');
    }

    const zones = this.resolveZones(input);
    const brand = await this.brandForImage(brandId);
    const menu = buildRichMenuFromZones(zones, {
      liffId: brand.liffId,
      brandName: brand.name,
      chatBarText: input.chatBarText,
    });
    const check = validateRichMenu(menu);
    if (!check.ok) throw new BadRequestException(`Rich Menu ไม่ถูกต้อง: ${check.errors.join(', ')}`);

    const img = generateRichMenuImage(zones, { brandName: brand.name, primaryColor: this.primaryColor(brand.theme) });
    const imagePath = await this.media.save(img.buffer, img.mime);

    const row = await this.prisma.richMenu.create({
      data: {
        brandId,
        name: input.name.trim(),
        audienceId,
        priority: input.priority ?? (audienceId === null ? 1000 : 100),
        zones: zones as object,
        chatBarText: menu.chatBarText,
        imagePath,
        createdBy: adminId,
      },
    });

    // publish ถ้าผูก LINE แล้ว (dev ไม่มี token → เก็บ row ไว้ก่อน publish ทีหลัง)
    const pub = await this.publishRow(brandId, row.id).catch((e) => ({ published: false, error: (e as Error).message }));
    const fresh = await this.get(brandId, row.id);
    return { ...this.dto(fresh), publish: pub };
  }

  private dto(m: { id: string; name: string; audienceId: string | null; priority: number; published?: boolean; lineRichMenuId?: string | null; enabled: boolean }) {
    return {
      id: m.id,
      name: m.name,
      isDefault: m.audienceId === null,
      audienceId: m.audienceId,
      priority: m.priority,
      published: !!m.lineRichMenuId,
      enabled: m.enabled,
    };
  }

  /**
   * publish/re-publish row ขึ้น LINE: create richmenu + upload รูป (+ setDefault ถ้าเป็น default)
   * dev/ไม่มี token → คืน { published:false, skipped:true } ไม่ error
   * สร้างตัวใหม่สำเร็จก่อนค่อยลบตัวเก่า (กันช่วงคาบเกี่ยวลูกค้าไม่มีเมนู)
   */
  async publishRow(brandId: string, id: string) {
    const row = await this.get(brandId, id);
    if (!row.enabled) return { published: false, skipped: true, reason: 'disabled' };

    const brand = await this.brandForImage(brandId);
    const zones = row.zones as unknown as RichMenuZone[];
    const menu = buildRichMenuFromZones(zones, {
      liffId: brand.liffId,
      brandName: brand.name,
      chatBarText: row.chatBarText,
    });
    const check = validateRichMenu(menu);
    if (!check.ok) throw new BadRequestException(`Rich Menu ไม่ถูกต้อง: ${check.errors.join(', ')}`);

    const created = await this.line.createRichMenu(brandId, menu);
    if (created.skipped) return { published: false, skipped: true };
    if (!created.ok || !created.richMenuId) throw new BadRequestException(created.error ?? 'สร้าง Rich Menu ไม่สำเร็จ');

    const img = generateRichMenuImage(zones, { brandName: brand.name, primaryColor: this.primaryColor(brand.theme) });
    const up = await this.line.uploadRichMenuImageBuffer(brandId, created.richMenuId, img.buffer, img.mime);
    if (!up.ok) {
      await this.line.deleteRichMenu(brandId, created.richMenuId);
      throw new BadRequestException(up.error ?? 'อัปโหลดรูปไม่สำเร็จ');
    }

    if (row.audienceId === null) {
      const applied = await this.line.setDefaultRichMenu(brandId, created.richMenuId);
      if (!applied.ok) {
        await this.line.deleteRichMenu(brandId, created.richMenuId);
        throw new BadRequestException(applied.error ?? 'ตั้งเมนูเริ่มต้นไม่สำเร็จ');
      }
      await this.prisma.brand.update({ where: { id: brandId }, data: { richMenuId: created.richMenuId } });
    }

    // สำเร็จแล้วค่อยลบเมนูเก่าของ row นี้ที่ LINE (ถ้ามี)
    if (row.lineRichMenuId) await this.line.deleteRichMenu(brandId, row.lineRichMenuId);
    await this.prisma.richMenu.update({ where: { id }, data: { lineRichMenuId: created.richMenuId } });
    return { published: true, lineRichMenuId: created.richMenuId };
  }

  // ── update ─────────────────────────────────────────────────
  async update(
    brandId: string,
    id: string,
    input: Partial<CreateRichMenuInput> & { enabled?: boolean },
  ) {
    const row = await this.get(brandId, id);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.chatBarText !== undefined) data.chatBarText = (input.chatBarText.trim() || 'เมนู').slice(0, 14);
    if (input.enabled !== undefined) data.enabled = input.enabled;

    let zonesChanged = false;
    if (input.zones || input.preset) {
      const zones = this.resolveZones({ ...input, name: row.name });
      data.zones = zones as object;
      const brand = await this.brandForImage(brandId);
      const img = generateRichMenuImage(zones, { brandName: brand.name, primaryColor: this.primaryColor(brand.theme) });
      data.imagePath = await this.media.save(img.buffer, img.mime);
      zonesChanged = true;
    }

    await this.prisma.richMenu.update({ where: { id }, data });

    // ถ้า publish อยู่แล้ว + เนื้อหาเปลี่ยน → republish (สร้างตัวใหม่ทับ)
    let publish: unknown = undefined;
    if (row.lineRichMenuId && (zonesChanged || input.chatBarText !== undefined)) {
      publish = await this.publishRow(brandId, id).catch((e) => ({ published: false, error: (e as Error).message }));
    }
    return { ...this.dto(await this.get(brandId, id)), publish };
  }

  // ── delete ─────────────────────────────────────────────────
  async remove(brandId: string, id: string) {
    const row = await this.get(brandId, id);
    if (row.audienceId === null) {
      const groups = await this.prisma.richMenu.count({ where: { brandId, audienceId: { not: null } } });
      if (groups > 0)
        throw new BadRequestException('ลบเมนู default ไม่ได้ขณะยังมีเมนูกลุ่มอยู่ (ลูกค้าที่ไม่เข้ากลุ่มจะไม่มีเมนู) — ลบเมนูกลุ่มก่อน');
    }
    if (row.lineRichMenuId) await this.line.deleteRichMenu(brandId, row.lineRichMenuId);
    if (row.audienceId === null) {
      await this.prisma.brand.update({ where: { id: brandId }, data: { richMenuId: null } });
    } else if (row.lineRichMenuId) {
      // ปลดลูกค้าที่ผูกเมนูนี้อยู่ กลับ default + ล้าง assigned
      const affected = await this.prisma.customer.findMany({
        where: { brandId, assignedRichMenuId: row.lineRichMenuId },
        select: { lineUserId: true },
      });
      if (affected.length) await this.line.bulkUnlinkRichMenu(brandId, affected.map((c) => c.lineUserId));
      await this.prisma.customer.updateMany({
        where: { brandId, assignedRichMenuId: row.lineRichMenuId },
        data: { assignedRichMenuId: null },
      });
    }
    await this.prisma.richMenu.delete({ where: { id } });
    return { deleted: true };
  }

  // ── sync (reconcile รายคน ตามกลุ่ม) ─────────────────────────
  async sync(brandId: string) {
    if (!(await this.line.isConfigured(brandId))) {
      return { skipped: true, reason: 'ยังไม่ได้ผูก LINE (ไม่มี access token)' };
    }
    const rows = await this.prisma.richMenu.findMany({
      where: { brandId, enabled: true, audienceId: { not: null }, lineRichMenuId: { not: null } },
      include: { audience: { select: { name: true, rules: true } } },
    });
    const menus: (GroupMenu & { name: string })[] = rows
      .filter((r) => r.audience)
      .map((r) => ({
        lineRichMenuId: r.lineRichMenuId as string,
        rules: r.audience!.rules as unknown as AudienceRules,
        priority: r.priority,
        name: r.name,
      }));

    const customers = (await this.prisma.customer.findMany({
      where: { brandId },
      select: ASSIGN_SELECT,
    })) as unknown as AssignableCustomer[];

    const { changes, unchanged } = planAssignments(customers, menus, Date.now());
    const { link, unlinkUserIds } = groupChanges(changes);

    const perMenu: { name: string; count: number }[] = [];
    for (const grp of link) {
      const r = await this.line.bulkLinkRichMenu(brandId, grp.lineRichMenuId, grp.userIds);
      if (r.ok) {
        await this.prisma.customer.updateMany({
          where: { brandId, lineUserId: { in: grp.userIds } },
          data: { assignedRichMenuId: grp.lineRichMenuId },
        });
      }
      perMenu.push({ name: menus.find((m) => m.lineRichMenuId === grp.lineRichMenuId)?.name ?? '?', count: grp.userIds.length });
    }
    if (unlinkUserIds.length) {
      const r = await this.line.bulkUnlinkRichMenu(brandId, unlinkUserIds);
      if (r.ok) {
        await this.prisma.customer.updateMany({
          where: { brandId, lineUserId: { in: unlinkUserIds } },
          data: { assignedRichMenuId: null },
        });
      }
    }
    return { changed: changes.length, unchanged, perMenu, movedToDefault: unlinkUserIds.length };
  }

  /**
   * ผูกเมนูให้ลูกค้าตอน follow (เรียกจาก LineService) — คนใหม่/เข้า default ไม่ต้องทำอะไร
   * void catch ไว้ที่ผู้เรียก ไม่ให้พัง follow flow
   */
  async assignForFollower(brandId: string, customerId: string) {
    const rows = await this.prisma.richMenu.findMany({
      where: { brandId, enabled: true, audienceId: { not: null }, lineRichMenuId: { not: null } },
      include: { audience: { select: { rules: true } } },
    });
    if (!rows.length) return;
    const menus: GroupMenu[] = rows
      .filter((r) => r.audience)
      .map((r) => ({ lineRichMenuId: r.lineRichMenuId as string, rules: r.audience!.rules as unknown as AudienceRules, priority: r.priority }));

    const cust = (await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: ASSIGN_SELECT,
    })) as unknown as AssignableCustomer | null;
    if (!cust) return;

    const to = chooseMenuForCustomer(cust, menus, Date.now());
    const from = cust.assignedRichMenuId ?? null;
    if (to === from) return;
    if (to) {
      const r = await this.line.linkUserRichMenu(brandId, cust.lineUserId, to);
      if (r.ok) await this.prisma.customer.update({ where: { id: customerId }, data: { assignedRichMenuId: to } });
    } else {
      const r = await this.line.unlinkUserRichMenu(brandId, cust.lineUserId);
      if (r.ok) await this.prisma.customer.update({ where: { id: customerId }, data: { assignedRichMenuId: null } });
    }
  }
}
