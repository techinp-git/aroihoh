import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class EarnDto {
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
}

export class CreateRedemptionDto {
  @IsString() @IsNotEmpty() rewardId: string;
}

export class CreateBatchDto {
  @IsString() @IsNotEmpty() brandId: string;
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsInt() @Min(1) @Max(10000) points: number;
  @IsInt() @Min(1) @Max(2000) quantity: number;
  @IsOptional() @IsString() menuItemId?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class BatchStatusDto {
  @IsIn(['draft', 'active', 'revoked']) status: 'draft' | 'active' | 'revoked';
}

export class CreateRewardDto {
  @IsString() @IsNotEmpty() brandId: string;
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsInt() @Min(1) pointsCost: number;
  @IsOptional() @IsIn(['free_item', 'discount']) type?: 'free_item' | 'discount';
  @IsOptional() @IsString() menuItemId?: string;
  @IsOptional() @IsInt() @Min(0) discountAmount?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** แก้รางวัล — ส่งเฉพาะฟิลด์ที่เปลี่ยน */
export class UpdateRewardDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsInt() @Min(1) pointsCost?: number;
  @IsOptional() @IsInt() @Min(0) discountAmount?: number;
  @IsOptional() @IsString() menuItemId?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** US-55: ปรับแต้มด้วยมือ (owner) — ต้องมีเหตุผลเสมอ เพราะลง ledger + audit log */
export class AdjustPointsDto {
  @IsInt() points: number;
  @IsString() @IsNotEmpty() @MaxLength(200) note: string;
}

/** US-55/56: ตั้งค่าสะสมแต้มของแบรนด์ (0 = ปิด/กลับค่าเริ่มต้น) */
export class LoyaltySettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) dailyEarnCap?: number;
  /** ทุกกี่บาทได้ 1 แต้มเมื่อออเดอร์ส่งสำเร็จ — 0 = ปิดการให้แต้มอัตโนมัติ */
  @IsOptional() @IsInt() @Min(0) @Max(100000) bahtPerPoint?: number;
}
