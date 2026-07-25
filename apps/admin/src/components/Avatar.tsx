import { useState } from 'react';

// สีประจำชื่อ (deterministic) — ใช้กับ avatar สำรอง + BrandChip
export const nameHue = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

/** avatar โปรไฟล์ LINE — ไม่มีรูป/โหลดพัง = วงกลมตัวอักษรแรกสีตามชื่อ */
export function Avatar({ name, url, size = 38 }: { name: string | null; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const label = (name || '?').trim().charAt(0).toUpperCase();
  const hue = nameHue(name || '?');
  const common = { width: size, height: size, borderRadius: '50%', flexShrink: 0 } as const;
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        style={{ ...common, objectFit: 'cover', background: '#eee' }}
      />
    );
  }
  return (
    <div
      style={{
        ...common,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.42,
        background: `hsl(${hue} 65% 90%)`,
        color: `hsl(${hue} 55% 34%)`,
      }}
    >
      {label}
    </div>
  );
}
