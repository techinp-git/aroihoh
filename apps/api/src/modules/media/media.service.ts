import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import { extForContentType, safeMediaName } from './media.filename';

/**
 * เก็บไฟล์รูปแชตบนดิสก์ (ไม่เก็บ binary ใน DB — DB จะบวม backup ช้า)
 *
 * โฟลเดอร์: env `MEDIA_DIR` — prod ชี้ไป Docker volume (persist ข้าม rebuild)
 * dev ไม่ตั้ง = `<cwd>/media` (apps/api/media) · gitignore ไว้
 *
 * ใน DB เก็บแค่ basename (`<uuid>.jpg`) → ย้ายโฟลเดอร์ทีหลังได้ ไม่ต้องอัปเดต DB
 */
@Injectable()
export class MediaService {
  private readonly log = new Logger('MediaService');

  dir(): string {
    const d = process.env.MEDIA_DIR?.trim();
    if (d && isAbsolute(d)) return d;
    return join(process.cwd(), d || 'media');
  }

  /** เขียนรูปลงดิสก์ → คืน basename ไว้เก็บใน DB */
  async save(buffer: Buffer, contentType: string | null): Promise<string> {
    const dir = this.dir();
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}${extForContentType(contentType)}`;
    await writeFile(join(dir, name), buffer);
    return name;
  }

  /** หา path จริงของไฟล์ (sanitize กัน traversal) — คืน null ถ้าชื่อไม่ผ่านหรือไฟล์หาย */
  resolveExisting(name: string): string | null {
    const safe = safeMediaName(name);
    if (!safe) return null;
    const full = join(this.dir(), safe);
    return existsSync(full) ? full : null;
  }

  stream(fullPath: string) {
    return createReadStream(fullPath);
  }
}
