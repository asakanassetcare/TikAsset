# Condo Rental Management — SPEC.md
> ระบบบริหารการปล่อยเช่าคอนโด — Phase 1 Core
> เอกสารนี้เป็น single source of truth สำหรับ Claude Code

---

## 1. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Backend | Supabase (PostgreSQL 15+) |
| Auth | Supabase Auth (email + password) |
| Storage | Supabase Storage (5 private buckets) |
| Realtime | Supabase Realtime |
| PDF | `@react-pdf/renderer` หรือ `pdfmake` (Sarabun font) |
| Excel | `xlsx` (SheetJS) |
| Date | `dayjs` + plugin `buddhistEra` |
| App type | PWA (Phase 1 web only, Phase 3 LINE LIFF) |
| Language | ไทยอย่างเดียว |
| Currency | บาท |
| Date display | ค.ศ. ใน DB, พ.ศ. ใน UI |
| Font | Sarabun (UI + PDF) |
| Theme | Light / สีขาว |

---

## 2. Roles & Permissions

5 roles. Staff เห็นทุกห้องเหมือนกัน

| Role | สิทธิ์หลัก |
|---|---|
| **super_admin** | ทุกอย่าง + manage users + edit settings |
| **executive** | อนุมัติ/ปฏิเสธสัญญา · ดู dashboard + reports · read-only ส่วนอื่น |
| **accounting** | อนุมัติการชำระเงิน · จัดการ owner_transfers · อนุมัติ move-out · ยืนยัน settlement · ออก/แก้ invoice |
| **head_staff** | ทุกอย่างใน operational + เลือก staff ผู้ดูแลใหม่ (กรณี staff คนเดิมออก) |
| **staff** | เพิ่มห้อง · เพิ่มผู้เช่า · สร้าง booking/contract (assign ตัวเองเป็นผู้ดูแล) · แจ้งซ่อม · บันทึก payment · กดเข้าพัก/ย้ายออก |

**ไม่มี soft delete ไม่มี inactive** — เก็บข้อมูลทั้งหมดถาวร

---

## 3. Main Menus

`Dashboard · Calendar · Projects · Rooms · Owners · Tenants · Bookings · Contracts · Invoices · Payments · Owner Transfers · Move-outs · Maintenance · Documents · Reports · Notifications · Settings · Users & Roles`

---

## 4. Property Structure

```
Project (โครงการ/คอนโด)
  └── Building (อาคาร)
        └── Floor + Room (ห้อง)
```

Owner (เจ้าของห้องฝากบริหาร) อยู่นอก hierarchy นี้ link เข้า `rooms.owner_id`

---

## 5. Domain Rules (สำคัญมาก — Claude Code อ่านให้ครบ)

### 5.1 Property
- 1 ห้อง 1 ผู้เช่าเท่านั้น (ไม่รองรับผู้เช่าร่วม)
- ห้อง ownership: `owned` (ของบริษัท) | `managed` (ฝากบริหาร — ต้องมี `owner_id`)
- ห้องสามารถเปลี่ยน owner ได้ (เปลี่ยน `room.owner_id` ตรงๆ — เปลี่ยนได้ใน Settings/Rooms)
- Room status: `available`, `occupied`, `reserved`, `maintenance`, `blocked`
- `is_rentable` toggle ปิด/เปิดปล่อยเช่าได้

### 5.2 Booking
- 1 ห้องมี booking `waiting` ได้แค่ 1 รายการ (enforce by unique partial index)
- สร้าง booking → ห้อง = `reserved`
- ไม่มีวันหมดอายุ
- Convert booking → contract: link `contracts.booking_id` + เงินจองนำมาหักใน `contracts.booking_deposit_applied`
- Cancel booking → ห้องว่าง + ระบุ `deposit_action` = `kept` / `refunded`

### 5.3 Contract Lifecycle
สถานะ: `pending_approve` → `approved` → `active` → `expired` | `terminated` | `rejected` | `cancelled`

**Workflow:**
1. Staff สร้างสัญญา → status = `pending_approve` (auto notify executive)
2. ต้องระบุ `assigned_staff_id` = ตัวเอง (head_staff เปลี่ยนทีหลังได้)
3. Executive อนุมัติ → status = `approved` + auto-generate **contract_initial invoice** (เงินประกัน + ค่าเช่าล่วงหน้า)
4. Executive ปฏิเสธ → status = `rejected` + ห้องกลับ `available` + booking (ถ้ามี) กลับเป็น `waiting`
5. ผู้เช่าจ่ายเงินตามใบแจ้งหนี้ contract_initial → status ใบนี้ = `paid` (เมื่อ accounting อนุมัติ)
6. Staff กดปุ่ม **"เข้าพัก"** → set `actual_move_in_at` → contract = `active` + room = `occupied` + ถ้า move-in ไม่ใช่วันที่ 1 → auto-gen **prorated first invoice**
7. ทุกวันที่ 25 → pg_cron generate ใบแจ้งหนี้รายเดือนของเดือนถัดไปสำหรับสัญญา active ทุกฉบับ (due date = วันที่ 1)
8. Staff กดปุ่ม **"ย้ายออก"** → สร้าง move_out (accounting อนุมัติ) → contract = `expired` หรือ `terminated` + room = `available`

**Renewal:** ใช้ `previous_contract_id` link กับสัญญาเก่า (สร้างสัญญาใหม่ทั้งใบ)

### 5.4 Invoice Types
| Type | ออกตอนไหน | คนสร้าง |
|---|---|---|
| `contract_initial` | Executive approve contract | auto |
| `monthly_rent` | วันที่ 25 ของเดือนก่อนหน้า + prorated ตอน move-in | auto |
| `addon` | แล้วแต่ (rare) | manual |
| `final_settlement` | ตอน move-out (ส่วน excess charge) | auto |
| `booking_deposit` | ตอนสร้าง booking ถ้าอยากออกใบ | manual |

**กฎ:**
- 1 contract 1 period 1 monthly_rent invoice (unique constraint)
- ห้ามจ่ายแบ่ง (partial payment) — invoice 1 ใบ จ่ายเต็มเท่านั้น
- ชำระโดยโอนเท่านั้น
- Invoice number: `INV-2026-00001` sequential
- `late_fee_enabled` setting อยู่ที่ false ใน Phase 1

### 5.5 Payment Approval
- Staff หรือผู้เช่า (Phase 2) บันทึก payment + แนบสลิป
- Accounting อนุมัติ → invoice = `paid`
- Accounting ปฏิเสธ → invoice = `cancelled` (ตามที่ตกลง — สามารถสร้างใบใหม่ได้)

### 5.6 Owner Transfers (โอนให้เจ้าของห้องฝากบริหาร)
- หลังจาก monthly_rent invoice = `paid` สำหรับ `managed` room
- **Accounting** สร้าง owner_transfer record (status = `pending_staff`)
- **Staff** ตรวจสอบ + กดยืนยันโอนแล้ว แนบสลิป → status = `transferred_by_staff`
- **Accounting** ยืนยัน final → status = `confirmed`
- Management fee ของห้องฝากบริหาร เก็บครั้งเดียว 1 เดือนต่อสัญญา 12 เดือน (เจ้าของโอนมาให้แยก ไม่หักจากค่าเช่ารายเดือน) → เก็บใน `contracts.management_fee_amount`

### 5.7 Move-out & Settlement
1. Staff สร้าง move_out record (status = `pending_accounting`)
2. กรอก checklist สภาพห้องตอนออก + ค่าซ่อม + ค่าปรับ
3. คำนวณ: `refund_amount = deposit - repair - penalty - other` (>= 0) หรือ `additional_charge` ถ้าติดลบ
4. **Accounting อนุมัติ** → status = `approved` + auto:
   - contract = `expired` หรือ `terminated`
   - room = `available`
   - สร้าง `settlements` record (deadline = move_out_date + 15 วัน)
5. Staff โอนเงินคืน + แนบสลิป → settlement = `paid_by_staff`
6. Accounting ยืนยัน → settlement = `completed`
7. ถ้าถึง deadline ยังไม่ paid → cron แจ้งเตือน accounting + head_staff

### 5.8 Maintenance
- Status: `reported` → `in_progress` → `completed` / `cancelled`
- รูปก่อน + หลังซ่อม (`maintenance_before`, `maintenance_after`)
- บันทึกค่าใช้จ่าย + vendor

---

## 6. Database Schema

ดูไฟล์ migrations:
- `01_schema.sql` — Tables, enums, indexes, constraints
- `02_rls_policies.sql` — Row Level Security ทุก table
- `03_triggers_functions.sql` — Audit log, number generators, lifecycle triggers, invoice generators, notification helpers
- `04_cron_jobs.sql` — pg_cron schedules
- `05_seed.sql` — Default settings + room types

### Tables (21 ตาราง)
profiles, settings, projects, buildings, room_types, owners, rooms, tenants, bookings, contracts, contract_versions, contract_checklists, contract_addons, invoices, invoice_items, payments, owner_transfers, move_outs, settlements, maintenance_requests, documents, notifications, activity_logs

### Key Constraints
- All money: `NUMERIC(12,2)`
- Unique `bookings.room_id where status='waiting'`
- Unique `contracts.room_id where status in (pending_approve, approved, active)`
- Unique `invoices(contract_id, billing_period, invoice_type)`
- Unique `owner_transfers(room_id, period)`
- Unique `move_outs.contract_id`

### Encryption
- `tenants.id_card_encrypted` — pgcrypto pgp_sym_encrypt
- เก็บ `id_card_last4` + `id_card_hash` (SHA-256) สำหรับค้นหา
- Key มาจาก `current_setting('app.encryption_key')` — ตั้งใน Supabase Dashboard ก่อน deploy

---

## 7. Storage Buckets

| Bucket | Use | Public |
|---|---|---|
| `tenant-docs` | บัตร ปชช., ทะเบียนรถ | No |
| `contract-pdfs` | สัญญา + addendum (มี version) | No |
| `payment-slips` | สลิปโอนเงิน + owner transfer slips | No |
| `maintenance-photos` | รูปก่อน-หลังซ่อม | No |
| `owner-docs` | เอกสารเจ้าของห้อง | No |

ทุก bucket private + signed URLs (TTL 1 hour)

---

## 8. Notification Triggers (in-app)

| Event | แจ้ง |
|---|---|
| สัญญารออนุมัติ | Executive |
| สัญญาอนุมัติ | Staff ผู้ดูแล |
| สัญญาถูกปฏิเสธ | Staff ผู้ดูแล |
| Invoice generated | Staff ผู้ดูแล |
| Slip uploaded | Accounting |
| Payment overdue (เลย due > 3 วัน) | Staff + Head Staff |
| สัญญาใกล้หมด 30 วัน | Staff + Head Staff |
| Maintenance ใหม่ | Head Staff |
| Move-out รออนุมัติ | Accounting |
| Settlement deadline 15 วัน | Accounting + Head Staff |
| Owner transfer pending | Staff |
| Owner transfer confirmed | Accounting |

---

## 9. Dashboard (เห็นเหมือนกันทุก role)

Cards:
- ห้องทั้งหมด · ห้องว่าง · สัญญาใกล้ครบใน 30 วัน · ค้างชำระ · จองล่วงหน้า
- รายได้เดือนนี้ · รายการรออนุมัติสัญญา · รายการรอบัญชียืนยันรับเงิน · งานซ่อมค้าง

Calendar:
- วันครบกำหนดชำระ · วันเข้าพัก · วันหมดสัญญา · วันย้ายออก · งานซ่อม

---

## 10. Reports (Excel + PDF)

- ห้องว่าง / ห้องมีผู้เช่า
- สัญญาใกล้หมด
- ค้างชำระ
- รายได้รายเดือน (per project / per building / per ownership type)
- Booking
- Payment
- Maintenance cost
- Move-out + คืนประกัน
- Owner statement (รายเดือน per owner — แสดงค่าเช่าที่ได้, owner_transfer ที่โอนแล้ว, status)

---

## 11. PDF Documents

| เอกสาร | Template |
|---|---|
| สัญญาเช่า | แบบเดียว — Sarabun, มี logo, รองรับ contract addendum (version) |
| ใบแจ้งหนี้ | Sarabun, มี logo |
| ใบเสร็จรับเงินชั่วคราว | Sarabun, มี logo (ไม่ใช่ใบเสร็จจริง) |
| เอกสารย้ายออก / settlement | Sarabun, มี logo |

ลายเซ็นดิจิทัล: รองรับ (Phase 1 อัปโหลด image signature)

---

## 12. System Features (Phase 1)

✅ Activity log (auto trigger ทุก table สำคัญ)
✅ Global search
✅ Advanced filter
✅ Mobile camera scan เอกสาร
✅ Drag & drop upload
✅ Status color
✅ Internal room note
✅ Toggle ปิดห้องชั่วคราว
✅ PWA installable
✅ Sarabun font ทั่ว app

**ไม่มี:** soft delete, dark mode, autosave draft, multi-language, blacklist, archive

---

## 13. Phase Roadmap

### Phase 1 — Core (เริ่มก่อน)
Auth · Project/Building/Room · Owner · Tenant · Booking · Contract · Invoice (auto-gen) · Payment (manual record + accounting approve) · Owner transfer · Move-out + Settlement · Dashboard · PDF contract + invoice · Excel reports · Activity log · Notifications in-app

### Phase 2 — Operations
Maintenance (full) · Contract checklist · Document version · Calendar · Advanced filter

### Phase 3 — LINE LIFF
ผู้เช่าแนบสลิป · ดูบิล · แจ้งซ่อม · แจ้งเตือนผ่าน LINE

---

## 14. Folder Structure (frontend)

```
src/
├── components/
│   ├── ui/                # Button, Input, Modal, Badge, Card, Table
│   ├── layout/            # AppShell, Sidebar, Topbar, NotificationBell
│   ├── rooms/             # RoomCard, RoomGrid, RoomFormModal
│   ├── tenants/           # TenantForm, TenantList, IdCardField
│   ├── contracts/         # ContractForm, ContractKanban, ApprovalModal
│   ├── invoices/          # InvoiceList, InvoiceDetail, PaymentModal
│   ├── moveouts/          # MoveOutForm, SettlementPanel, ChecklistEditor
│   ├── owners/            # OwnerForm, OwnerStatement
│   └── reports/           # ReportFilters, ExportButtons
├── pages/
│   ├── auth/              # Login, ChangePassword
│   ├── Dashboard.jsx
│   ├── Calendar.jsx
│   ├── projects/          # ProjectList, BuildingDetail
│   ├── rooms/             # RoomsPage, RoomDetail
│   ├── owners/
│   ├── tenants/
│   ├── bookings/
│   ├── contracts/
│   ├── invoices/
│   ├── payments/
│   ├── owner-transfers/
│   ├── move-outs/
│   ├── maintenance/
│   ├── documents/
│   ├── reports/
│   ├── notifications/
│   └── settings/          # CompanySettings, InvoiceSettings, UsersAndRoles
├── hooks/                 # useAuth, useRole, useNotifications, useSettings
├── lib/
│   ├── supabase.js
│   ├── pdf/               # ContractPDF, InvoicePDF
│   ├── excel/             # exportRooms, exportPayments, ...
│   ├── date.js            # toBuddhist(), formatThaiDate()
│   └── permissions.js     # role-based UI gating
└── App.jsx
```

---

## 15. Conventions

- **Currency display**: `฿12,000.00` (toLocaleString th-TH)
- **Date display**: `5 พ.ค. 2569` (ค.ศ.+543)
- **Number generation**: server-side via SECURITY DEFINER (`set_*_number` triggers)
- **All mutations through Supabase client** (no custom backend in Phase 1)
- **RLS-aware**: front-end never assumes permissions — let Postgres reject
- **Audit logging**: 100% automatic via trigger (don't manually insert)
- **Test data**: seed `05_seed.sql` only contains settings + room types — NO sample tenants/rooms

---

## 16. Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# DB session settings (set in Supabase Dashboard → Database → Configuration)
app.encryption_key=<random 32+ char string for ID card encryption>
```
