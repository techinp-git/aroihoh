import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** US-61: ล็อกอินแอดมินด้วยบัญชี LINE ที่ผูกไว้แล้ว (โหมดพนักงานใน LIFF) */
export class AdminLineLoginDto {
  // ID token จาก liff.getIDToken() — verify ฝั่ง server กับ Login channel ของแบรนด์
  @IsString()
  @IsNotEmpty()
  idToken: string;

  // แบรนด์ที่เปิด LIFF เข้ามา (tenant key) — ใช้เลือก Login channel ที่ถูกตัว
  @IsString()
  @IsNotEmpty()
  brandId: string;
}

/**
 * ผูกบัญชี LINE เข้ากับแอดมินที่ล็อกอิน (อีเมล/รหัสผ่าน) อยู่ตอนนี้
 * ไม่ส่ง idToken = ไม่ผูก แค่ถามว่าแบรนด์นี้เปิดโหมดพนักงานให้ไหม (dev / เปิดนอก LINE)
 */
export class AdminLineLinkDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idToken?: string;

  @IsString()
  @IsNotEmpty()
  brandId: string;
}

/** เลิกผูก — ไม่ส่ง brandId = เลิกผูกทุกแบรนด์ของคนนี้ */
export class AdminLineUnlinkDto {
  @IsOptional()
  @IsString()
  brandId?: string;
}
