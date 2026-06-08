# Claude Code Build Plan — Condo Rental Management
> 9 phases. ทำตามลำดับ ห้ามข้าม. หลังแต่ละ phase รัน build + manual smoke test ก่อนไปต่อ.

---

## ⚠️ ก่อนเริ่ม

1. อ่าน `docs/SPEC.md` ทั้งหมดก่อน — เป็น source of truth
2. อ่าน `docs/RLS_MATRIX.md` เพื่อเข้าใจสิทธิ์
3. SQL migrations อยู่ใน `supabase/migrations/01-05` รันตามลำดับ
4. ทุกครั้งที่ context หาย ให้กลับมาอ่าน SPEC.md

---

## Phase 1 — Scaffold + Auth + Database Setup

**Goal:** project รันได้ + login ได้ + tables พร้อมใช้

### งาน
1. สร้าง Vite + React project, ติดตั้ง Tailwind, dayjs (+buddhistEra), @supabase/supabase-js
2. ติดตั้ง font Sarabun (Google Fonts) + apply เป็น default font
3. ตั้งค่า theme: สีขาว, light, สีหลัก = น้ำเงิน (`#2563eb`)
4. สร้าง `src/lib/supabase.js` client
5. สร้าง `src/lib/date.js` helper สำหรับ พ.ศ.: `toBE()`, `formatThaiDate()`, `formatThaiMonth()`
6. รัน migration 01–05 ใน Supabase SQL Editor ตามลำดับ
7. ตั้ง DB parameter `app.encryption_key` ใน Supabase Dashboard → Database → Configuration
8. สร้าง buckets (private): `tenant-docs`, `contract-pdfs`, `payment-slips`, `maintenance-photos`, `owner-docs`
9. สร้าง Super Admin user ใน Supabase Auth ด้วยมือ + insert profiles แถวแรก
10. สร้าง `<Login>` page (email + password)
11. สร้าง `useAuth` hook ที่อ่าน session + profile + role
12. สร้าง `<RequireRole roles={[...]}>` HOC
13. สร้าง `<AppShell>`: Sidebar + Topbar + NotificationBell (badge)
14. สร้าง `<ChangePassword>` page (เรียก `supabase.auth.updateUser`)

### Deliverable
- Login ใช้งานได้
- เห็น Sidebar ตาม role
- เปลี่ยนรหัสผ่านได้

---

## Phase 2 — Settings, Users & Roles, Profile

**Goal:** Super Admin manage ระบบและ users ได้

### งาน
1. หน้า `Settings → Company` — แก้ name, tax_id, address, phone, logo (upload + preview)
2. หน้า `Settings → Invoice` — prefix, footer_note, bank_account
3. หน้า `Settings → Contract Defaults` — deposit_months, advance_months, payment_day
4. หน้า `Settings → Notifications` — contract_expiring_days, overdue_alert_days
5. หน้า `Users & Roles` (super_admin only):
   - List ทุก profile
   - ปุ่ม "เพิ่ม user" → modal (email, full_name, phone, role)
   - กดสร้าง → call Edge Function `invite-user` ที่ใช้ service_role key:
     - `supabase.auth.admin.createUser({email, password, email_confirm: true})`
     - call `create_profile_for_user(user_id, email, full_name, role, phone)`
     - return temporary password เพื่อให้ admin บอก user (ไปเปลี่ยนทีหลัง)
   - แก้ role / full_name / phone ของ user ได้

### Edge Function
สร้าง `supabase/functions/invite-user/index.ts` — รับ `{email, full_name, role, phone}` คืน `{user_id, temporary_password}`

### Deliverable
- Super admin สร้าง user ใหม่ได้
- Settings ทุกหน้าบันทึก/อ่านได้

---

## Phase 3 — Projects, Buildings, Rooms, Room Types

**Goal:** จัดการ property structure ได้

### งาน
1. หน้า `Projects` — list + create + edit (name, address, note)
2. หน้า `Project Detail` — แสดง buildings ของโครงการนี้ + ปุ่มเพิ่ม
3. หน้า `Buildings` — รวมทุก building ในทุก project + filter by project
4. หน้า `Building Detail` — แสดง rooms grouped by floor
5. หน้า `Rooms` (รวม) — grid card view
   - Filter: project, building, floor, status, ownership, room_type
   - Sort: room_number, rent, status
   - Search: room_number, internal_note
   - การ์ดแสดง: room_number, type, size, rent, status badge (สี), owner name (ถ้า managed)
6. Room form (modal):
   - building, room_number, floor, room_type, size_sqm
   - base_rent, base_deposit, base_advance
   - electric_meter_number, water_meter_number
   - ownership (`owned` / `managed`) — ถ้า managed บังคับเลือก owner
   - status, is_rentable toggle, status_color, internal_note
7. หน้า `Room Types` (settings) — list + crud
8. Room status badge colors:
   - available = เขียว, occupied = น้ำเงิน, reserved = ส้ม, maintenance = เหลือง, blocked = แดง

### Deliverable
- เพิ่ม/แก้ project, building, room ได้
- กรอง/ค้นหา/sort ห้อง

---

## Phase 4 — Owners + Tenants

**Goal:** จัดการเจ้าของห้องและผู้เช่า

### งาน

#### Owners
1. หน้า `Owners` — list + filter + search
2. Owner form: full_name, phone, line_id, email, bank info, note
3. Tab "ห้องของเจ้าของ" — แสดง rooms ที่ owner_id ตรงกัน
4. Upload documents → bucket `owner-docs` (ใช้ documents table)

#### Tenants
1. หน้า `Tenants` — list + filter + search (ค้นด้วยชื่อ/เบอร์/last4 ของบัตร ปชช.)
2. Tenant form:
   - full_name, phone, email, line_id
   - **id_card**: input mask แสดงเฉพาะ last 4 ถ้ามีค่าเดิม + ปุ่ม "แสดง" (เรียก RPC `decrypt_id_card`)
   - address, emergency contact (name + phone)
   - vehicle_plate, fingerprint_code
3. บันทึก id_card:
   - **ไม่ส่ง plain text ไป Postgres ผ่านตาราง**
   - เรียก RPC `set_tenant_id_card(tenant_id, p_id_card)` (SECURITY DEFINER)
4. Upload เอกสารบัตร ปชช. → bucket `tenant-docs` + insert documents (doc_type = `id_card_front` / `id_card_back`)
5. Tab "ประวัติการเช่า" — แสดง contracts ของ tenant นี้ทั้งหมด
6. Tab "ประวัติการชำระ" — payments ของ tenant
7. Tab "ประวัติการย้ายออก" — move_outs

### Deliverable
- CRUD owners + tenants
- Encrypt/decrypt id_card ทำงาน
- Upload documents

---

## Phase 5 — Bookings + Contracts

**Goal:** จองและทำสัญญา

### งาน

#### Bookings
1. หน้า `Bookings` — list + filter (status, room, tenant) + create
2. ที่หน้า Room Detail → ปุ่ม "สร้าง booking" (ถ้าห้อง available)
3. Booking form: tenant (select หรือ inline create), deposit_amount, note
4. สร้าง booking → room = reserved (auto trigger)
5. Booking detail:
   - ปุ่ม "Convert to Contract" → เปิด contract form พร้อม pre-fill
   - ปุ่ม "Cancel" → modal: เลือก kept/refunded + reason

#### Contracts
1. หน้า `Contracts` — list + filter (status, building, end_date soon, assigned_staff) + create
2. ที่ Room Detail → ปุ่ม "สร้างสัญญา" (ถ้าห้อง available หรือ reserved)
3. Contract form:
   - room (lock ถ้ามาจาก room/booking), tenant
   - contract_start_date, contract_end_date, move_in_date
   - monthly_rent (default = room.base_rent), deposit_amount, advance_rent_amount
   - payment_day (default 1, max 28)
   - booking_deposit_applied (auto-fill ถ้ามี booking)
   - electric_meter_start, water_meter_start
   - assigned_staff_id (default = current user)
   - **ถ้าห้อง managed**: management_fee_amount (default = 1 เดือน) + management_fee_collected_at
   - vehicle_plate, fingerprint_code, note
4. กดบันทึก → contract = pending_approve (auto notify executive)
5. Contract detail:
   - แสดงข้อมูลครบ + tab Invoices / Payments / Documents
   - ปุ่ม "อนุมัติ" / "ปฏิเสธ" (executive only)
   - **อนุมัติ** → status = approved → call RPC `generate_contract_initial_invoice(contract_id)` (auto deposit + advance invoice)
   - **ปฏิเสธ** → ใส่ rejection_reason → status = rejected (trigger จะ free room + booking)
   - ปุ่ม "เข้าพัก" (staff/head_staff) — แสดงเมื่อ status = approved + initial invoice paid:
     - set `actual_move_in_at = now()` → trigger เปลี่ยน status = active + room = occupied
     - call RPC `generate_prorated_first_invoice(contract_id)`
   - ปุ่ม "เปลี่ยน assigned staff" (head_staff only)
   - ปุ่ม "Upload contract PDF version" → bucket `contract-pdfs` + insert contract_versions

### Deliverable
- Booking workflow ครบ
- Contract approval workflow ทำงาน
- เข้าพักแล้ว → ห้อง occupied + prorated invoice ออกถูกต้อง

---

## Phase 6 — Invoices + Payments + Owner Transfers

**Goal:** ใบแจ้งหนี้ + รับเงิน + โอนเจ้าของ

### งาน

#### Invoices
1. หน้า `Invoices` — list + filter (status, type, building, period) + search
2. Card view สีตาม status: pending=เทา, overdue=แดง, paid=เขียว, paid_pending_approve=เหลือง
3. Invoice detail:
   - แสดง items + total
   - ปุ่ม "บันทึกการชำระ" → modal:
     - amount (lock = total), paid_date, bank_reference, slip upload, note
     - insert payments(status = pending_approve)
4. ปุ่ม "ออก PDF ใบแจ้งหนี้" / "ออก PDF ใบเสร็จชั่วคราว"
5. ปุ่ม "ยกเลิก invoice" (accounting/super_admin) → status = cancelled + reason
6. ปุ่ม "สร้าง invoice เพิ่มเติม (addon)" — manual create เผื่อกรณีพิเศษ

#### Payments
1. หน้า `Payments` — list (filter by status, invoice, period)
2. Payments รออนุมัติ → accounting เห็นเป็น "Queue"
3. ปุ่ม "อนุมัติ" → status = approved (trigger จะ update invoice = paid)
4. ปุ่ม "ปฏิเสธ" → ใส่เหตุผล → status = rejected (trigger จะ update invoice = cancelled)

#### Owner Transfers (สำหรับห้อง managed)
1. หน้า `Owner Transfers` — list per period + filter owner / status
2. Auto-suggest: monthly invoice ที่ paid แล้วและห้อง managed แต่ยังไม่มี owner_transfer
3. Accounting "สร้าง owner_transfer" → status = pending_staff
4. Staff เห็นใน queue → กรอก slip + bank_reference → "ยืนยันโอนแล้ว" → transferred_by_staff
5. Accounting "ยืนยัน final" → confirmed

### Deliverable
- Generate invoice อัตโนมัติ (manual trigger ที่หน้า Invoices มีปุ่ม "Generate next month" ด้วย เผื่อ test cron)
- Payment approval flow ครบ
- Owner transfer 2-step ครบ

---

## Phase 7 — Move-outs + Settlements + Maintenance

**Goal:** ย้ายออก + คืนเงิน + แจ้งซ่อม

### งาน

#### Move-outs
1. ที่ Contract Detail → ปุ่ม "ย้ายออก" (เมื่อ status = active)
2. Move-out form:
   - move_out_date, reason, is_early_termination
   - electric_meter_end, water_meter_end
   - deposit_amount (auto จาก contract — lock)
   - repair_cost, penalty_cost, other_deduction
   - คำนวณ refund_amount หรือ additional_charge อัตโนมัติ
   - upload รูปสภาพห้อง (checklist phase = `move_out`)
3. หน้า `Move-outs` — list + filter status
4. Move-out detail:
   - Accounting "อนุมัติ" → status = approved (trigger:
     - contract = expired/terminated
     - room = available
     - settlement record created (deadline = +15 วัน)
   )
5. Settlement panel ใน move-out detail:
   - Staff "บันทึกการโอนเงินคืน" → slip + amount → settlement = paid_by_staff
   - Accounting "ยืนยัน" → completed
   - แสดง countdown deadline + เตือนถ้าเกิน

#### Maintenance
1. หน้า `Maintenance` — list + filter status, building, room
2. Maintenance form:
   - building (optional), room (optional), area_description
   - title, description, รูปก่อนซ่อม
3. Update status: reported → in_progress → completed
4. Completion: cost, vendor_name, รูปหลังซ่อม

### Deliverable
- Move-out + settlement flow ครบ
- Maintenance basic ใช้งานได้

---

## Phase 8 — Dashboard + Calendar + Notifications + Reports

**Goal:** หน้าสรุป + ปฏิทิน + รายงาน

### งาน

#### Dashboard
Cards (เห็นเหมือนกันทุก role):
- ห้องทั้งหมด / ห้องว่าง / สัญญาใกล้ครบใน 30 วัน
- ค้างชำระ (count invoices.status='overdue')
- จองล่วงหน้า (bookings.status='waiting')
- รายได้เดือนนี้ (sum payments.amount where status=approved + paid_date in current month)
- รายการรออนุมัติสัญญา (contracts.status='pending_approve')
- รายการรอบัญชียืนยัน (payments.status='pending_approve')
- งานซ่อมค้าง (maintenance.status in reported/in_progress)
- รายการ owner_transfers รอ confirmed
- Settlements ใกล้ deadline

#### Calendar (FullCalendar หรือ custom grid)
Events:
- Invoice due_date (สีแยก paid/unpaid)
- contracts.move_in_date / actual_move_in_at
- contracts.contract_end_date
- move_outs.move_out_date
- maintenance.reported_at

#### Notifications (Bell + dropdown)
- Realtime ด้วย Supabase subscription on `notifications` where recipient_id = current user
- Badge count = unread
- คลิก → ไปที่ link_url + mark read_at
- ปุ่ม "Mark all read"

#### Reports
สร้างหน้า `Reports` ที่มีปุ่ม Excel export สำหรับ:
1. ห้องว่าง / ห้องมีผู้เช่า
2. สัญญาใกล้หมด (filter: ภายใน N วัน)
3. ค้างชำระ (overdue invoices)
4. รายได้รายเดือน (per project / building / ownership)
5. Bookings
6. Payments
7. Maintenance cost
8. Move-out + คืนประกัน
9. **Owner statement** (รายเดือน per owner — รวมรายได้ ค่าเช่า, transfers ที่โอนแล้ว/ยัง)

ใช้ `xlsx` library + Sarabun font ไม่ได้ใน Excel แต่ใช้ default font

### Deliverable
- Dashboard มีตัวเลขครบ
- Calendar แสดง events
- Notification bell + realtime
- Reports export Excel ได้ครบ

---

## Phase 9 — PDF Generation + Polish + PWA

**Goal:** เอกสาร PDF + ทำเป็น PWA

### งาน

#### PDF
1. ติดตั้ง `@react-pdf/renderer` + register font Sarabun
2. สร้าง template `<ContractPDF contract={...}>` — สัญญาเช่าเต็มใบ
3. `<InvoicePDF invoice={...}>` — ใบแจ้งหนี้
4. `<ReceiptPDF payment={...}>` — ใบเสร็จรับเงินชั่วคราว
5. `<MoveOutPDF move_out={...}>` — เอกสารย้ายออก
6. ทุก PDF: มี logo บริษัท + ฟอนต์ Sarabun + พ.ศ. + ตราบริษัท
7. ปุ่ม "Generate PDF" ที่หน้าที่เกี่ยวข้อง → download + save URL ไป documents

#### Polish
1. Global search (header) — ค้นห้อง / tenant / contract / invoice
2. Activity log viewer (สำหรับ super_admin/executive/head_staff/accounting)
   - filter by table, actor, date range
3. ทุก list page รองรับ advanced filter + pagination
4. Mobile camera scan: input `<input type="file" accept="image/*" capture="environment">` สำหรับ slip / id card / รูปซ่อม
5. Drag & drop upload ใน document upload components

#### PWA
1. ติดตั้ง `vite-plugin-pwa`
2. manifest: ชื่อ "Condo Rental", icon, theme color
3. Service worker cache: static assets only (ไม่ cache API calls)
4. Add to home screen prompt

### Deliverable
- PDF ครบ 4 แบบ + Sarabun font
- PWA install ได้
- Global search ทำงาน

---

## ✅ Verification Checklist (รันหลังจบทุก phase)

```bash
# Build
npm run build

# Smoke test ที่ต้องผ่าน
- [ ] login → ออก → login ใหม่
- [ ] super_admin สร้าง user ใหม่ + user เปลี่ยนรหัส
- [ ] staff สร้าง room + tenant + booking + contract
- [ ] executive อนุมัติ contract → initial invoice เกิดอัตโนมัติ
- [ ] accounting อนุมัติ payment → invoice = paid
- [ ] staff กดเข้าพัก → ห้อง occupied + prorated invoice (ถ้าไม่ใช่วันที่ 1)
- [ ] รัน `select generate_invoices_for_next_month();` ใน SQL Editor → ออก monthly invoice
- [ ] staff สร้าง move-out → accounting อนุมัติ → settlement เกิด, ห้องว่าง
- [ ] staff โอนคืน → accounting ยืนยัน → settlement completed
- [ ] notification bell แสดงทุก event
- [ ] export Excel report
- [ ] PDF สัญญา + invoice ใช้ Sarabun
- [ ] PWA install ได้
```

---

## 📌 Tips สำหรับ Claude Code

- **อ่าน SPEC.md ก่อนทุก phase**
- **ห้ามแก้ schema/RLS** โดยไม่ได้รับคำสั่ง — มีเหตุผลทั้งหมดแล้ว
- **id_card ห้ามเก็บ plain text** ใน table — เรียก RPC `set_tenant_id_card`
- **ห้าม generate number เอง** — ให้ trigger จัดการ
- **ห้าม insert audit_log เอง** — trigger จัดการอัตโนมัติ
- **partial payment ห้าม** — invoice 1 ใบจ่ายเต็มเท่านั้น (constraint ใน function)
- **ทุก money field ใช้ `NUMERIC(12,2)` เสมอ** — frontend cast string → number ตอนส่ง
- **Date ใน DB เป็น ค.ศ. เสมอ** — แปลง พ.ศ. ที่ display layer เท่านั้น
- ถ้า context หาย: `กลับไปดู docs/SPEC.md แล้วทำ Phase X ต่อ`
