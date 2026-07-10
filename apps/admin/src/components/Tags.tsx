export function TagEditor({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  disabled?: boolean;
}) {
  const add = () => {
    const t = window.prompt('เพิ่มแท็ก (เช่น VIP, ลูกค้าประจำ)');
    if (t?.trim() && !tags.includes(t.trim())) onChange([...tags, t.trim()]);
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));
  return (
    <div className="tags">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          {!disabled && <span className="x" onClick={() => remove(t)}>×</span>}
        </span>
      ))}
      {!disabled && <button className="tag-add" onClick={add}>+ แท็ก</button>}
      {tags.length === 0 && disabled && <span className="pay">— ไม่มีแท็ก —</span>}
    </div>
  );
}
