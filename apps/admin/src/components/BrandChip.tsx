// ป้ายแบรนด์สีคงที่จากชื่อ (deterministic) — ใช้ในจอครัว + แชต บอกว่าออเดอร์/ห้องนี้ของแบรนด์ไหน
const brandHue = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

export default function BrandChip({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const hue = brandHue(name);
  const big = size === 'md';
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: big ? 13 : 10,
        fontWeight: 600,
        padding: big ? '2px 10px' : '1px 7px',
        borderRadius: 999,
        background: `hsl(${hue} 70% 92%)`,
        color: `hsl(${hue} 60% 32%)`,
        border: `1px solid hsl(${hue} 55% 78%)`,
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  );
}
