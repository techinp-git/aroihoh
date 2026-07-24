import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryOrigin } from './api';

/**
 * เลือกจุดส่งบนแผนที่ (US-03)
 *
 * ระยะ/ค่าส่งยัง **คิดฝั่ง server เท่านั้น** (กติกาเหล็ก #2/#5) — ตัวนี้ทำหน้าที่เดียวคือหา lat/lng
 * ที่ตรงกับที่ลูกค้าอยู่จริง แล้วส่งขึ้นไปให้ `/delivery/check` ตัดสิน วงกลมบนแผนที่เป็นแค่ภาพช่วยมอง
 *
 * แผนที่: Leaflet + OSM tiles (ไม่ต้องมี API key)
 * ค้นหา: Nominatim — ยิงเมื่อกดค้นหา/Enter เท่านั้น ไม่ยิงทุกตัวอักษร (นโยบายการใช้ของ OSM)
 */

// ใช้ divIcon เพื่อไม่ต้องพึ่งไฟล์รูป marker ของ Leaflet (Vite จะหาไม่เจอ ขึ้นรูปแตก)
const pinIcon = (color: string, label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:14px;line-height:1">${label}</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

interface SearchHit {
  display_name: string;
  lat: string;
  lon: string;
}

export default function AddressPicker({
  origin,
  value,
  onChange,
}: {
  origin: DeliveryOrigin | null;
  value: { lat: number; lng: number };
  onChange: (p: { lat: number; lng: number }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const zoneRef = useRef<L.Circle | null>(null);

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState('');

  // ให้ callback ล่าสุดเสมอ โดยไม่ต้องสร้างแผนที่ใหม่ทุก render
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { center: [value.lat, value.lng], zoom: 15, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const marker = L.marker([value.lat, value.lng], { draggable: true, icon: pinIcon('#e05e2b', '📍') }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      onChangeRef.current({ lat: p.lat, lng: p.lng });
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // กรอบใน LIFF ขนาดยังไม่นิ่งตอน mount — ถ้าไม่บอก Leaflet ว่าขนาดเปลี่ยน
    // มันจะวาด tile ตามขนาดเก่า เหลือขอบเทารอบแผนที่
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current);

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // วาดครัว + วงเขตส่ง เมื่อโหลด origin เสร็จ
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;
    L.marker([origin.lat, origin.lng], { icon: pinIcon('#2f7d32', '🍳'), interactive: false })
      .addTo(map)
      .bindTooltip(origin.name, { direction: 'top' });
    if (origin.maxDistanceKm > 0) {
      zoneRef.current = L.circle([origin.lat, origin.lng], {
        radius: origin.maxDistanceKm * 1000,
        color: '#2f7d32',
        weight: 1,
        fillColor: '#2f7d32',
        fillOpacity: 0.06,
      }).addTo(map);
      // ต้อง invalidateSize ก่อน fitBounds ไม่งั้นคำนวณจากขนาดกรอบเก่าแล้วซูมผิด
      // ยิงซ้ำอีกรอบตอน 300ms เผื่อกรอบใน LIFF ยังยืดไม่นิ่ง (ResizeObserver ไม่ครอบทุกเคส)
      const fit = () => {
        map.invalidateSize();
        if (zoneRef.current) map.fitBounds(zoneRef.current.getBounds(), { padding: [20, 20] });
      };
      fit();
      const t = setTimeout(fit, 300);
      return () => clearTimeout(t);
    }
  }, [origin]);

  // หมุดตามค่าที่ parent ถือไว้ (เช่นกดใช้ตำแหน่งปัจจุบัน/เลือกผลค้นหา)
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;
    const cur = marker.getLatLng();
    if (Math.abs(cur.lat - value.lat) < 1e-7 && Math.abs(cur.lng - value.lng) < 1e-7) return;
    marker.setLatLng([value.lat, value.lng]);
    map.panTo([value.lat, value.lng]);
  }, [value.lat, value.lng]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setNote('เครื่องนี้ไม่รองรับการหาตำแหน่ง');
    setLocating(true);
    setNote('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      (err) => {
        setLocating(false);
        // ผู้ใช้กดไม่อนุญาต = เรื่องปกติ ไม่ใช่ error ของระบบ บอกทางออกให้แทน
        setNote(
          err.code === err.PERMISSION_DENIED
            ? 'ไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — ค้นหาชื่อสถานที่ หรือลากหมุดเองได้'
            : 'หาตำแหน่งไม่สำเร็จ — ลากหมุดเองได้',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setNote('');
    setHits(null);
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=th' +
        `&accept-language=th&q=${encodeURIComponent(term)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as SearchHit[];
      setHits(data);
      if (data.length === 0) setNote('ไม่พบสถานที่นี้ — ลองพิมพ์ชื่อถนน/ซอย หรือลากหมุดเอง');
    } catch {
      setNote('ค้นหาไม่สำเร็จ — ลากหมุดบนแผนที่แทนได้');
    } finally {
      setSearching(false);
    }
  };

  const pick = (h: SearchHit) => {
    const lat = parseFloat(h.lat);
    const lng = parseFloat(h.lon);
    setHits(null);
    setQ(h.display_name.split(',')[0]);
    onChange({ lat, lng });
    mapRef.current?.setView([lat, lng], 17);
  };

  return (
    <div className="picker">
      <div className="picker-search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="ค้นหาสถานที่ เช่น ตึกช้าง, ซอยอโศก 5"
        />
        <button className="btn ghost" onClick={search} disabled={searching}>
          {searching ? <div className="spinner" /> : '🔎'}
        </button>
      </div>

      {hits && hits.length > 0 && (
        <div className="picker-hits">
          {hits.map((h, i) => (
            <button key={i} className="hit" onClick={() => pick(h)}>
              {h.display_name}
            </button>
          ))}
        </div>
      )}

      <div ref={boxRef} className="picker-map" />

      <div className="picker-actions">
        <button className="btn ghost" onClick={useMyLocation} disabled={locating}>
          {locating ? <div className="spinner" /> : '📡 ใช้ตำแหน่งปัจจุบัน'}
        </button>
        <span className="picker-hint">แตะบนแผนที่ หรือลากหมุด 📍 เพื่อปักจุดส่ง</span>
      </div>

      {note && <div className="picker-note">{note}</div>}
    </div>
  );
}
