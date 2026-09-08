# Checklist ตั้ง Secrets สำหรับ CD (GHCR image + pull)

ทำครั้งเดียวก่อน merge branch `ci-cd-ghcr` เข้า `main` — ไม่งั้น deploy job จะ fail
(รายละเอียดโฟลว์ดู [`deploy-hetzner.md`](deploy-hetzner.md) หัวข้อ "CD อัตโนมัติ")

ค่าตัวอย่างอิง prod ปัจจุบัน: `root@49.13.57.24`, repo ที่ `/opt/aroihoh`

---

## A. สร้าง SSH key เฉพาะ deploy (บนเครื่อง dev)

อย่าใช้ key ส่วนตัว — สร้างคู่ใหม่ให้ GitHub Actions โดยเฉพาะ

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aroihoh_deploy -C "gh-actions-deploy" -N ""
```

เอา public key ขึ้น VPS:

```bash
ssh-copy-id -i ~/.ssh/aroihoh_deploy.pub root@49.13.57.24
```

เทสต์ว่า key ใหม่เข้าได้ + docker ใช้ได้:

```bash
ssh -i ~/.ssh/aroihoh_deploy root@49.13.57.24 'echo OK && docker --version'
```

## B. สร้าง CR_PAT (ให้ VPS ดึง image จาก GHCR)

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Note: `aroihoh-ghcr-pull`
3. scope เดียว: **`read:packages`**
4. Generate → คัดลอกเก็บ (เห็นครั้งเดียว)

> ทางเลือก: ทำ GHCR package เป็น **public** แล้วข้าม CR_PAT ได้
> (repo → Packages → package settings → Change visibility) — แล้วตัด `CR_PAT` + บรรทัด `docker login` ใน `deploy.yml` ทิ้ง

## C. ใส่ค่าใน GitHub repo

**repo → Settings → Secrets and variables → Actions**

### Secrets (New repository secret)
- [ ] `SSH_HOST` = `49.13.57.24`
- [ ] `SSH_USER` = `root`
- [ ] `SSH_KEY` = เนื้อ **private key** ทั้งไฟล์ (รวม `-----BEGIN...`/`-----END...`) — `cat ~/.ssh/aroihoh_deploy`
- [ ] `CR_PAT` = token จากขั้น B
- [ ] `SSH_PORT` = *(ข้ามได้ ถ้า port 22)*

### Variables (New repository variable)
- [ ] `VITE_API_BASE_URL` = `https://aroihoh-api.jivecode.click/api`  ⚠️ ต้องมี `/api`
- [ ] `VITE_LIFF_ID` = LIFF ID ของแบรนด์  ⚠️ ลืม = LIFF ตกไป dev-login → 403
- [ ] `VITE_PRIVACY_URL` = *(เว้นได้ = ไม่โชว์ลิงก์ policy)*
- [ ] `VITE_BRAND_ID` = *(เว้นได้ ถ้า LIFF endpoint ใช้ `?brandId=`)*

ดูค่า LIFF ID จริงบน prod:

```bash
ssh root@49.13.57.24 'docker compose -f /opt/aroihoh/docker-compose.prod.yml --env-file /opt/aroihoh/.env.prod exec -T postgres psql -U aroihoh -d aroihoh -c "SELECT name, \"liffId\" FROM brands;"'
```

## D. เตรียม VPS (ครั้งเดียว)

- [ ] repo ที่ `/opt/aroihoh` track `main`:

```bash
ssh root@49.13.57.24 'cd /opt/aroihoh && git remote -v && git branch --show-current'
```

- [ ] `.env.prod` มี `AROIHOH_TAG=latest` (ตัวใหม่จาก `.env.prod.example`):

```bash
ssh root@49.13.57.24 'grep -c AROIHOH_TAG /opt/aroihoh/.env.prod || echo "ยังไม่มี — เพิ่ม AROIHOH_TAG=latest"'
```

- [ ] VPS login GHCR ได้ (เทสต์ CR_PAT — แทน `<user>`/`<PAT>`):

```bash
ssh root@49.13.57.24 'echo "<PAT>" | docker login ghcr.io -u <github-user> --password-stdin'
```

## E. รอบแรก & ตรวจผล

- [ ] Merge เข้า `main` → **Actions → CI** ผ่าน → **Deploy** เริ่มเอง
      (หรือลองก่อน merge: **Actions → Deploy → Run workflow**)
- [ ] repo → **Packages** เห็น `aroihoh-api` + `aroihoh-static`
- [ ] เปิด `https://aroihoh-api.jivecode.click/api/health` = 200

---

## เช็คด่วน — ขั้นต่ำ 6 ตัว
Secrets: `SSH_HOST` `SSH_USER` `SSH_KEY` `CR_PAT`
Variables: `VITE_API_BASE_URL` `VITE_LIFF_ID`
ที่เหลือ optional

## Rollback
image tag ด้วย git sha ค้างบน GHCR — ย้อนเวอร์ชันได้:

```bash
ssh root@49.13.57.24 'cd /opt/aroihoh && bash scripts/deploy.sh <sha เก่า>'
```
