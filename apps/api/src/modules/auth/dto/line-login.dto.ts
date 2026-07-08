import { IsString, IsNotEmpty } from 'class-validator';

export class LineLoginDto {
  // ID token จาก liff.getIDToken() ฝั่ง LIFF
  @IsString()
  @IsNotEmpty()
  idToken: string;

  // แบรนด์ที่ลูกค้าเปิด LIFF เข้ามา (tenant key) — ใช้เลือก LINE channel ที่ถูกต้อง
  @IsString()
  @IsNotEmpty()
  brandId: string;
}
