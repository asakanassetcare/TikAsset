# Condo Rental Management System

ระบบบริหารการปล่อยเช่าคอนโด — Phase 1 Core

## โครงสร้างไฟล์

```
condo-rental/
├── docs/
│   ├── SPEC.md                      ← Single source of truth
│   ├── RLS_MATRIX.md                ← Permission matrix
│   └── CLAUDE_CODE_BUILD_PLAN.md    ← 9-phase build guide
└── supabase/
    └── migrations/
        ├── 01_schema.sql            ← Tables + enums + indexes
        ├── 02_rls_policies.sql      ← Row Level Security
        ├── 03_triggers_functions.sql ← Audit, lifecycle, invoice gen
        ├── 04_cron_jobs.sql         ← pg_cron schedules
        └── 05_seed.sql              ← Default settings + room types
```

## วิธีเริ่ม

### 1. สร้าง Supabase project ใหม่
- ไปที่ supabase.com → New project
- เปิด extension `pg_cron` ใน Dashboard → Database → Extensions
- เปิด extension `pgcrypto` (ปกติเปิดอยู่แล้ว)

### 2. ตั้ง encryption key
ใน Supabase Dashboard → Database → Configuration → Custom Postgres Config
```
app.encryption_key = <สุ่มมา 32+ ตัวอักษร>
```

### 3. รัน migrations ตามลำดับ
ไปที่ SQL Editor แล้ว paste + run แต่ละไฟล์:
```
01_schema.sql
02_rls_policies.sql
03_triggers_functions.sql
04_cron_jobs.sql
05_seed.sql
```

### 4. สร้าง Storage buckets (private ทั้งหมด)
- `tenant-docs`
- `contract-pdfs`
- `payment-slips`
- `maintenance-photos`
- `owner-docs`

### 5. สร้าง Super Admin ครั้งแรก
ใน SQL Editor:
```sql
-- 5.1 สร้างผู้ใช้ใน Authentication → Users → Invite user
-- (จด user_id ที่ได้)

-- 5.2 ใส่ profile ของ super_admin (เป็น row แรก — ข้าม RLS เพราะรันใน editor)
insert into profiles(id, email, full_name, role)
values ('<paste-user-id-here>', '<email>', 'Super Admin', 'super_admin');
```

### 6. เริ่ม Claude Code
```bash
mkdir condo-rental-app && cd condo-rental-app
claude
```

วาง prompt:
```
อ่านไฟล์ docs/SPEC.md และ docs/CLAUDE_CODE_BUILD_PLAN.md ทั้งหมด
แล้วเริ่มทำ Phase 1 ของ build plan
```

> หลังจาก Phase 1 เสร็จและ test แล้ว ค่อยสั่ง Phase 2 ต่อ

---

## ⚠️ ก่อนรัน migrations

### Encryption key — ตั้งให้เสร็จก่อนรัน 03
Migration 03 มี function ที่อ่าน `current_setting('app.encryption_key')` —
ถ้ายังไม่ตั้ง function จะ raise error ตอนเรียกใช้ (ไม่ใช่ตอนสร้าง — สร้างผ่านปกติ)

### pg_cron
ต้องเปิด extension `pg_cron` ใน Dashboard ก่อนรัน 04 ไม่งั้น migration จะ error

### ลำดับการรัน
ห้ามรันสลับ — 02 พึ่ง 01, 03 พึ่ง 01+02, 04 พึ่ง 03

---

## หลัก concept

| สิ่ง | หลัก |
|---|---|
| **ผู้เช่า** | 1 ห้อง 1 คน |
| **เงิน** | NUMERIC(12,2), บาท |
| **วันที่** | DB ค.ศ., UI พ.ศ. |
| **Invoice** | ออกอัตโนมัติทุกวันที่ 25 (ของเดือนถัดไป), prorated เดือนแรกถ้าเข้ากลางเดือน |
| **Payment day** | ทุกคนจ่ายวันที่ 1 |
| **Settlement** | คืนเงินภายใน 15 วันหลัง move-out |
| **ID card** | encrypted (pgcrypto) |
| **Audit log** | auto trigger |
| **Delete** | ไม่มี — เก็บทุกอย่าง |
| **Sarabun** | font ทั่ว app + PDF |

---

ดูรายละเอียดเต็มใน `docs/SPEC.md`
