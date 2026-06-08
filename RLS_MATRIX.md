# RLS Permission Matrix

## Roles
- `super_admin` — ทำได้ทุกอย่าง
- `executive` — ผู้บริหาร อนุมัติสัญญา
- `accounting` — บัญชี
- `head_staff` — หัวหน้า staff
- `staff` — staff ทั่วไป

## Convention
- ✅ = full access (CRUD)
- 📖 = read only
- ➕ = insert
- ✏️ = update
- ❌ = ไม่มีสิทธิ์
- ⚙️ = approve/reject specific actions

## Master Matrix

| Table | super_admin | executive | accounting | head_staff | staff |
|---|---|---|---|---|---|
| profiles | ✅ | 📖 | 📖 | 📖 | 📖 (own update) |
| settings | ✅ | 📖 | 📖 | 📖 | 📖 |
| projects | ✅ | 📖 | 📖 | ✅ | ✅ |
| buildings | ✅ | 📖 | 📖 | ✅ | ✅ |
| room_types | ✅ | 📖 | 📖 | ✅ | ✅ |
| owners | ✅ | 📖 | 📖 | ✅ | ✅ |
| rooms | ✅ | 📖 | 📖 | ✅ | ✅ |
| tenants | ✅ | 📖 | 📖 | ✅ | ✅ |
| bookings | ✅ | 📖 | 📖 | ✅ | ✅ |
| contracts | ✅ | ⚙️ approve/reject | 📖 | ✅ + reassign | ✅ (own create) |
| contract_versions | ✅ | 📖 | 📖 | ✅ | ✅ |
| contract_checklists | ✅ | 📖 | 📖 | ✅ | ✅ |
| contract_addons | ✅ | 📖 | 📖 | ✅ | ✅ |
| invoices | ✅ | 📖 | ✅ | ✅ | ✅ |
| invoice_items | ✅ | 📖 | ✅ | ✅ | ✅ |
| payments | ✅ | 📖 | ⚙️ approve | ➕ | ➕ |
| owner_transfers | ✅ | 📖 | ➕ + ⚙️ confirm | ✏️ pay step | ✏️ pay step |
| move_outs | ✅ | 📖 | ⚙️ approve | ➕✏️ | ➕✏️ |
| settlements | ✅ | 📖 | ⚙️ confirm | ✏️ pay step | ✏️ pay step |
| maintenance_requests | ✅ | 📖 | 📖 | ✅ | ✅ |
| documents | ✅ | 📖 | ✅ | ✅ | ✅ |
| notifications | ✅ | 📖 own | 📖 own | 📖 own | 📖 own |
| activity_logs | ✅ | 📖 | 📖 | 📖 | ❌ |

## Specific Workflows

### Contract Approval Flow
- staff CREATE (status=`pending_approve`, assigned_staff_id=self)
- head_staff CAN reassign `assigned_staff_id`
- executive UPDATE status to `approved` or `rejected`
- accounting cannot edit contract status (only sees)

### Payment Flow
- staff/accounting INSERT payment record (status=`pending_approve`)
- accounting UPDATE status → `approved` / `rejected`
- staff cannot approve own payments

### Owner Transfer Flow (2-step approval)
- accounting INSERT (status=`pending_staff`)
- staff UPDATE → `transferred_by_staff` + slip
- accounting UPDATE → `confirmed`

### Move-out Flow
- staff INSERT (status=`pending_accounting`)
- accounting UPDATE → `approved` (triggers room=available, contract=expired/terminated, settlement created)
- staff UPDATE settlement → `paid_by_staff` + slip
- accounting UPDATE settlement → `completed`

### Activity Log
- 🚫 No direct writes — auto via SECURITY DEFINER trigger only
- All roles except staff can READ
