import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from '../delivery/delivery.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { encryptSecret, decryptSecret } from '../../common/crypto';
import { shouldAskConsent } from '../../common/marketing-consent';
import {
  MAX_SAVED_ADDRESSES,
  canAddSavedAddress,
  normalizeLabel,
  normalizeThaiPhone,
  nextDefaultAfterRemoval,
  phoneLast4,
  sortAddressBook,
} from './address-book';
import { SaveAddressDto, UpdateAddressDto } from './dto/save-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** ตัวตนลูกค้าที่ผ่าน JwtAuthGuard แล้ว — brandId/customerId มาจาก JWT ห้ามรับจาก body */
export interface CustomerScope {
  customerId: string;
  brandId: string;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private readonly addressSelect = {
    id: true,
    label: true,
    detail: true,
    note: true,
    lat: true,
    lng: true,
    isDefault: true,
    updatedAt: true,
  };

  /** หมุดในสมุดของลูกค้าคนนี้ (ยังไม่ถูกลบ) — กรอง brandId ด้วยเสมอ แม้ customerId จะผูกแบรนด์อยู่แล้ว */
  private savedWhere(scope: CustomerScope) {
    return {
      customerId: scope.customerId,
      brandId: scope.brandId,
      isSaved: true,
      deletedAt: null,
    };
  }

  /**
   * ติดป้าย "ส่งถึงไหม" ให้แต่ละหมุด — คำนวณสดทุกครั้ง ไม่เก็บลง DB
   * เพราะรัศมี/ตำแหน่งครัวเปลี่ยนได้ (US-44) ค่าที่เก็บไว้จะเก่าทันทีที่ร้านย้าย
   * ยิงทีละหมุด (≤5) ผ่าน delivery.quote ตัวเดียวกับตอนสร้างออเดอร์ เพื่อไม่ให้กติกาเขตแตกเป็นสองที่
   */
  private async withDeliverable(
    brandId: string,
    rows: { lat: number; lng: number }[],
  ) {
    return Promise.all(
      rows.map(async (a) => {
        try {
          return await this.delivery.isDeliverable(brandId, { lat: a.lat, lng: a.lng });
        } catch {
          // แบรนด์ยังไม่ผูกครัว/zone polygon → ไม่รู้ว่าส่งได้ไหม ดีกว่าทำทั้งหน้าโปรไฟล์พัง
          return { deliverable: null, distanceKm: null, deliveryFee: null };
        }
      }),
    );
  }

  private async listAddressRows(scope: CustomerScope) {
    const rows = await this.prisma.address.findMany({
      where: this.savedWhere(scope),
      select: this.addressSelect,
    });
    const sorted = sortAddressBook(rows);
    const zones = await this.withDeliverable(scope.brandId, sorted);
    return sorted.map((a, i) => ({
      ...a,
      deliverable: zones[i].deliverable,
      distanceKm: zones[i].distanceKm,
      deliveryFee: zones[i].deliveryFee,
    }));
  }

  /** US-58: ทุกอย่างที่หน้าโปรไฟล์ต้องใช้ ในคำขอเดียว (LIFF เปิดหน้าเดียวจบ) */
  async getProfile(scope: CustomerScope) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: scope.customerId, brandId: scope.brandId },
      select: {
        displayName: true,
        pictureUrl: true,
        phoneEnc: true,
        marketingOptedOut: true,
        marketingConsentAt: true,
        marketingConsentSource: true,
        policyAcceptedVersion: true,
        pointsBalance: true,
        createdAt: true,
      },
    });
    if (!customer) throw new NotFoundException('ไม่พบโปรไฟล์');

    const [addresses, orders, loyalty] = await Promise.all([
      this.listAddressRows(scope),
      this.prisma.order.findMany({
        where: { customerId: scope.customerId, brandId: scope.brandId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
          items: { select: { nameSnapshot: true, qty: true } },
        },
      }),
      // US-50: การ์ดแต้ม + แท็บ "แต้ม" ใน LIFF ติดขึ้นมาเองเมื่อ endpoint นี้คืนค่าไม่ใช่ null
      this.loyalty.summaryForProfile(scope, customer.pointsBalance).catch(() => null),
    ]);

    const phone = decryptSecret(customer.phoneEnc);
    return {
      displayName: customer.displayName,
      pictureUrl: customer.pictureUrl,
      memberSince: customer.createdAt,
      // PDPA: ไม่คืนเบอร์เต็ม — พอให้ลูกค้าจำได้ว่าเป็นเบอร์ไหน
      hasPhone: !!phone,
      phoneLast4: phoneLast4(phone),
      marketingOptedOut: customer.marketingOptedOut,
      // PDPA: LIFF ใช้ 2 ค่านี้ตัดสินว่าจะโชว์การ์ดขอความยินยอม/แถบแจ้งครั้งแรกไหม
      askMarketingConsent: shouldAskConsent(customer),
      policyAcknowledged: customer.policyAcceptedVersion != null,
      addresses,
      addressLimit: MAX_SAVED_ADDRESSES,
      recentOrders: orders,
      loyalty,
    };
  }

  /** US-58/US-60: ลูกค้าแก้เบอร์ + เลือกรับ/ไม่รับข่าวสารเอง (PDPA self-service) */
  async updateProfile(scope: CustomerScope, dto: UpdateProfileDto) {
    const data: {
      phoneEnc?: string | null;
      marketingOptedOut?: boolean;
      marketingConsentAt?: Date | null;
      marketingConsentSource?: string | null;
      policyAcceptedVersion?: string;
      policyAcceptedAt?: Date;
    } = {};

    if (dto.phone !== undefined) {
      const raw = (dto.phone ?? '').trim();
      if (!raw) {
        data.phoneEnc = null; // ลบเบอร์ทิ้ง
      } else {
        const normalized = normalizeThaiPhone(raw);
        // ห้ามใส่เบอร์ที่ผู้ใช้พิมพ์ลงข้อความ error (PDPA — error ไปโผล่ใน log ได้)
        if (!normalized) throw new BadRequestException('รูปแบบเบอร์โทรไม่ถูกต้อง');
        data.phoneEnc = encryptSecret(normalized);
      }
    }
    if (dto.marketingOptedOut !== undefined) {
      data.marketingOptedOut = dto.marketingOptedOut;
      // PDPA: กดรับข่าวสาร = ให้ความยินยอม ต้องบันทึกว่าเมื่อไรและมาจากไหน (ต้องพิสูจน์ได้)
      // กดปฏิเสธ = ถอนความยินยอม ลบวันที่ทิ้งด้วย ไม่ใช่แค่ตั้งธง
      if (dto.marketingOptedOut === false) {
        data.marketingConsentAt = new Date();
        data.marketingConsentSource = 'liff';
      } else {
        data.marketingConsentAt = null;
        data.marketingConsentSource = null;
      }
    }
    // รับทราบนโยบายความเป็นส่วนตัว (แถบแจ้งครั้งแรกใน LIFF)
    if (dto.acceptPolicyVersion) {
      data.policyAcceptedVersion = dto.acceptPolicyVersion;
      data.policyAcceptedAt = new Date();
    }
    if (Object.keys(data).length === 0) return this.getProfile(scope);

    await this.prisma.customer.updateMany({
      where: { id: scope.customerId, brandId: scope.brandId },
      data,
    });
    return this.getProfile(scope);
  }

  /**
   * PDPA สิทธิขอลบข้อมูล — ยังไม่ลบให้อัตโนมัติ เพราะต้องตรวจก่อนว่ามีออเดอร์ค้าง
   * หรือหน้าที่ทางบัญชีที่ต้องเก็บไว้ไหม · ส่งเข้ากล่องแชตของร้านเพื่อให้เจ้าของเห็นและดำเนินการ
   * ตามขั้นตอนใน docs/pdpa/data-subject-requests.md (กฎหมายให้เวลาตอบ 30 วัน)
   */
  async requestDeletion(scope: CustomerScope) {
    const recent = await this.prisma.chatMessage.findFirst({
      where: {
        customerId: scope.customerId,
        brandId: scope.brandId,
        direction: 'inbound',
        text: { startsWith: '[คำขอลบข้อมูล]' },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    // กดซ้ำในวันเดียวกันไม่ต้องแจ้งร้านซ้ำ แต่ตอบลูกค้าเหมือนเดิม (เขาไม่ต้องรู้กลไกข้างใน)
    if (!recent) {
      await this.prisma.chatMessage.create({
        data: {
          brandId: scope.brandId,
          customerId: scope.customerId,
          direction: 'inbound',
          text: '[คำขอลบข้อมูล] ลูกค้าขอใช้สิทธิให้ลบข้อมูลส่วนบุคคล — ต้องตอบภายใน 30 วัน (ดู docs/pdpa/data-subject-requests.md)',
          isRead: false,
        },
      });
    }
    return { received: true, respondWithinDays: 30 };
  }

  /**
   * ทุก endpoint ของสมุดที่อยู่คืน "รายการทั้งหมดหลังการเปลี่ยนแปลง" เสมอ
   * LIFF จึงแทนที่ state ได้ในคำขอเดียว ไม่ต้องยิง GET ตามทุกครั้ง (หน้าจอไม่กระพริบ)
   */
  async listAddresses(scope: CustomerScope) {
    return { addresses: await this.listAddressRows(scope) };
  }

  /** เพิ่มหมุด — เพดาน 5, หมุดแรกเป็นหมุดหลักอัตโนมัติ */
  async createAddress(scope: CustomerScope, dto: SaveAddressDto) {
    const count = await this.prisma.address.count({ where: this.savedWhere(scope) });
    if (!canAddSavedAddress(count)) {
      throw new UnprocessableEntityException({
        code: 'ADDRESS_LIMIT',
        message: `บันทึกที่อยู่ได้สูงสุด ${MAX_SAVED_ADDRESSES} แห่ง ลบที่ไม่ใช้แล้วก่อน`,
        limit: MAX_SAVED_ADDRESSES,
      });
    }
    const makeDefault = dto.isDefault === true || count === 0;

    let createdId = '';
    await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { ...this.savedWhere(scope), isDefault: true },
          data: { isDefault: false },
        });
      }
      const row = await tx.address.create({
        data: {
          brandId: scope.brandId,
          customerId: scope.customerId,
          label: normalizeLabel(dto.label),
          detail: dto.detail.trim(),
          note: dto.note?.trim() || null,
          lat: dto.lat,
          lng: dto.lng,
          isSaved: true,
          isDefault: makeDefault,
        },
        select: { id: true },
      });
      createdId = row.id;
    });
    return { created: createdId, addresses: await this.listAddressRows(scope) };
  }

  async updateAddress(scope: CustomerScope, id: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({
      where: { id, ...this.savedWhere(scope) },
      select: { id: true },
    });
    // ไม่ใช่ของเรา → 404 ไม่ใช่ 403 (ไม่บอกว่าหมุดนี้มีอยู่จริงในระบบ)
    if (!existing) throw new NotFoundException('ไม่พบที่อยู่นี้');

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { ...this.savedWhere(scope), isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.address.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: normalizeLabel(dto.label) } : {}),
          ...(dto.detail !== undefined ? { detail: dto.detail.trim() } : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
          ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
          ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
    return { addresses: await this.listAddressRows(scope) };
  }

  /**
   * ลบหมุด = soft delete (ออเดอร์เก่าไม่ได้ชี้แถวนี้อยู่แล้ว แต่เก็บไว้ให้ audit ตามรอยได้)
   * ลบหมุดหลัก → เลื่อนหมุดที่แก้ล่าสุดขึ้นแทน เพื่อให้เช็คเอาต์ยังมีตัวเลือกตั้งต้น
   */
  async removeAddress(scope: CustomerScope, id: string) {
    const target = await this.prisma.address.findFirst({
      where: { id, ...this.savedWhere(scope) },
      select: { id: true, isDefault: true },
    });
    if (!target) throw new NotFoundException('ไม่พบที่อยู่นี้');

    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id },
        data: { isSaved: false, isDefault: false, deletedAt: new Date() },
      });
      const remaining = await tx.address.findMany({
        where: this.savedWhere(scope),
        select: { id: true, isDefault: true, updatedAt: true },
      });
      const promote = nextDefaultAfterRemoval(remaining, target.isDefault);
      if (promote) {
        await tx.address.update({ where: { id: promote }, data: { isDefault: true } });
      }
    });
    return { addresses: await this.listAddressRows(scope) };
  }
}
