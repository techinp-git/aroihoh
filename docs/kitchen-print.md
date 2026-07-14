# พิมพ์ใบครัว + label ไรเดอร์ (80mm) — ตั้งค่าเครื่องพิมพ์ที่ครัว

ระบบพิมพ์ผ่านเบราว์เซอร์ (`window.print()` + CSS 80mm) → ต่อเครื่องพิมพ์ความร้อน 80mm เข้ากับคอม/มือถือที่เปิดจอครัว

## จังหวะพิมพ์อัตโนมัติ (หน้า "ครัว (KDS)")
- กด **"รับออเดอร์"** (pending→confirmed) → พิมพ์ **ใบครัว** (เมนู/จำนวน/หมายเหตุ ตัวใหญ่)
- กด **"จัดเสร็จ"** (preparing→ready) → พิมพ์ **label ติดถุง** (#order/แบรนด์/ชื่อ/ที่อยู่/ยอดเก็บ COD)
- ปุ่ม 🖨️ บนการ์ด = พิมพ์ซ้ำ (ใบครัว หรือ label ตามสถานะ)

## พิมพ์เงียบ (ไม่ต้องกดยืนยันทุกครั้ง)
ปกติ `window.print()` เด้ง dialog ทุกครั้ง — ให้เปิด Chrome ที่เครื่องครัวด้วยโหมด kiosk-printing:

**macOS**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --kiosk-printing --app=https://admin.jivecode.click
```
**Windows**
```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk-printing --app=https://admin.jivecode.click
```
**Linux**
```bash
google-chrome --kiosk-printing --app=https://admin.jivecode.click
```

`--kiosk-printing` = พิมพ์ออกเครื่อง **default** ทันทีไม่มี dialog · `--app=` = เปิดแบบเต็มจอไม่มีแถบเบราว์เซอร์

## ตั้งเครื่องพิมพ์ 80mm เป็น default
1. ต่อเครื่องพิมพ์ (USB/Bluetooth/LAN) + ลงไดรเวอร์
2. ตั้งเป็น **Default printer** ของ OS
3. ตั้งขนาดกระดาษ 80mm (หรือ 72mm) ในไดรเวอร์
4. ทดสอบ: กด 🖨️ บนการ์ดออเดอร์ในหน้าครัว

## หมายเหตุ
- มือถือ Android: ใช้เครื่องพิมพ์ Bluetooth + Chrome ได้ (kiosk-printing ไม่รองรับบนมือถือ — จะมี dialog)
- ต้องการพิมพ์อัตโนมัติจริงจังหลายเครื่อง/หลายจุด → ค่อยพิจารณา print server (PrintNode/Raspberry Pi + ESC/POS) ภายหลัง
