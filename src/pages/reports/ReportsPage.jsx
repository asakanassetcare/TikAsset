import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { formatThaiDate } from '../../lib/date'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
function saveXlsx(rows, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

function N(v) { return Number(v) || 0 }

// ──────────────────────────────────────────────────
// Report definitions
// ──────────────────────────────────────────────────
const reports = [
  { id: 'rooms',       label: 'ห้องว่าง / มีผู้เช่า',        desc: 'รายชื่อทุกห้องพร้อมสถานะ ประเภท และราคาเช่า' },
  { id: 'expiring',    label: 'สัญญาใกล้หมด',                desc: 'กรองตามจำนวนวันที่เหลือ',       hasInput: 'days' },
  { id: 'overdue',     label: 'ค้างชำระ',                     desc: 'ใบแจ้งหนี้ที่เกินกำหนดทั้งหมด' },
  { id: 'income',      label: 'รายได้รายเดือน',               desc: 'รายได้จากการชำระในเดือนที่เลือก', hasInput: 'period' },
  { id: 'bookings',    label: 'รายการจอง',                     desc: 'ทุกรายการจองทั้งหมด' },
  { id: 'payments',    label: 'การชำระเงิน',                   desc: 'รายการชำระ (filter เดือน)',      hasInput: 'period' },
  { id: 'maintenance', label: 'ค่าใช้จ่ายการซ่อม',            desc: 'งานซ่อมพร้อมค่าใช้จ่าย' },
  { id: 'moveouts',    label: 'ย้ายออก + คืนประกัน',          desc: 'รายการย้ายออกทั้งหมด' },
  { id: 'owner_stmt',  label: 'Owner Statement รายเดือน',     desc: 'สรุปรายได้ต่อเจ้าของห้อง',      hasInput: 'period' },
]

// ──────────────────────────────────────────────────
// Export functions
// ──────────────────────────────────────────────────
async function exportRooms() {
  const { data } = await supabase.from('rooms').select(`
    room_number, floor, ownership, status, is_rentable,
    base_rent, base_deposit,
    buildings(name, projects(name)),
    room_types(name),
    owners(full_name)
  `).order('room_number')
  saveXlsx((data ?? []).map(r => ({
    'โครงการ':          r.buildings?.projects?.name ?? '',
    'อาคาร':            r.buildings?.name ?? '',
    'ห้อง':             r.room_number,
    'ชั้น':             r.floor ?? '',
    'ประเภท':           r.room_types?.name ?? '',
    'สถานะ':            r.status,
    'เปิดเช่า':         r.is_rentable ? 'ใช่' : 'ไม่',
    'กรรมสิทธิ์':       r.ownership,
    'เจ้าของ':          r.owners?.full_name ?? '',
    'ค่าเช่า (฿)':      N(r.base_rent),
    'เงินประกัน (฿)':   N(r.base_deposit),
  })), 'Rooms', 'rooms.xlsx')
}

async function exportExpiring(days) {
  const inN = new Date(Date.now() + Number(days || 30) * 86400_000).toISOString().slice(0, 10)
  const { data } = await supabase.from('contracts').select(`
    contract_number, contract_start_date, contract_end_date, monthly_rent,
    rooms(room_number, buildings(name)),
    tenants(full_name, phone),
    profiles!assigned_staff_id(full_name)
  `).eq('status', 'active').lte('contract_end_date', inN).order('contract_end_date')
  saveXlsx((data ?? []).map(c => ({
    'เลขสัญญา':        c.contract_number,
    'อาคาร':           c.rooms?.buildings?.name ?? '',
    'ห้อง':            c.rooms?.room_number ?? '',
    'ผู้เช่า':         c.tenants?.full_name ?? '',
    'โทรศัพท์':        c.tenants?.phone ?? '',
    'วันเริ่ม':        formatThaiDate(c.contract_start_date),
    'วันครบ':          formatThaiDate(c.contract_end_date),
    'ค่าเช่า/เดือน (฿)': N(c.monthly_rent),
    'Staff':           c.profiles?.full_name ?? '',
  })), 'Expiring', 'contracts_expiring.xlsx')
}

async function exportOverdue() {
  const { data } = await supabase.from('invoices').select(`
    invoice_number, invoice_type, billing_period, total_amount, due_date,
    rooms(room_number, buildings(name)),
    tenants(full_name, phone)
  `).eq('status', 'overdue').order('due_date')
  saveXlsx((data ?? []).map(inv => ({
    'เลขใบแจ้งหนี้':   inv.invoice_number,
    'ประเภท':           inv.invoice_type,
    'รอบบิล':           inv.billing_period ?? '',
    'อาคาร':            inv.rooms?.buildings?.name ?? '',
    'ห้อง':             inv.rooms?.room_number ?? '',
    'ผู้เช่า':          inv.tenants?.full_name ?? '',
    'โทรศัพท์':         inv.tenants?.phone ?? '',
    'ยอด (฿)':          N(inv.total_amount),
    'ครบกำหนด':         formatThaiDate(inv.due_date),
  })), 'Overdue', 'overdue_invoices.xlsx')
}

async function exportIncome(period) {
  const [y, m] = period.split('-')
  const start  = `${y}-${m}-01`
  const end    = new Date(Number(y), Number(m), 1).toISOString().slice(0, 10)
  const { data } = await supabase.from('payments').select(`
    amount, paid_date, bank_reference,
    invoices(invoice_number, invoice_type, billing_period,
      rooms(room_number, ownership, buildings(name, projects(name))),
      tenants(full_name)
    )
  `).eq('status', 'approved').gte('paid_date', start).lt('paid_date', end).order('paid_date')
  saveXlsx((data ?? []).map(p => ({
    'โครงการ':          p.invoices?.rooms?.buildings?.projects?.name ?? '',
    'อาคาร':            p.invoices?.rooms?.buildings?.name ?? '',
    'ห้อง':             p.invoices?.rooms?.room_number ?? '',
    'กรรมสิทธิ์':       p.invoices?.rooms?.ownership ?? '',
    'ผู้เช่า':          p.invoices?.tenants?.full_name ?? '',
    'เลขใบแจ้งหนี้':    p.invoices?.invoice_number ?? '',
    'ประเภท':           p.invoices?.invoice_type ?? '',
    'รอบบิล':           p.invoices?.billing_period ?? '',
    'ยอด (฿)':          N(p.amount),
    'วันชำระ':          formatThaiDate(p.paid_date),
    'เลขอ้างอิง':       p.bank_reference ?? '',
  })), 'Income', `income_${period}.xlsx`)
}

async function exportBookings() {
  const { data } = await supabase.from('bookings').select(`
    booking_number, deposit_amount, status, created_at,
    rooms(room_number, buildings(name)),
    tenants(full_name, phone)
  `).order('created_at', { ascending: false })
  saveXlsx((data ?? []).map(b => ({
    'เลขจอง':           b.booking_number,
    'อาคาร':            b.rooms?.buildings?.name ?? '',
    'ห้อง':             b.rooms?.room_number ?? '',
    'ผู้เช่า':          b.tenants?.full_name ?? '',
    'โทรศัพท์':         b.tenants?.phone ?? '',
    'เงินจอง (฿)':      N(b.deposit_amount),
    'สถานะ':            b.status,
    'วันสร้าง':         formatThaiDate(b.created_at),
  })), 'Bookings', 'bookings.xlsx')
}

async function exportPayments(period) {
  let q = supabase.from('payments').select(`
    amount, paid_date, bank_reference, status, created_at,
    invoices(invoice_number, rooms(room_number, buildings(name)), tenants(full_name)),
    profiles!recorded_by(full_name)
  `).order('created_at', { ascending: false })
  if (period) {
    const [y, m] = period.split('-')
    q = q.gte('paid_date', `${y}-${m}-01`).lt('paid_date', new Date(Number(y), Number(m), 1).toISOString().slice(0, 10))
  }
  const { data } = await q
  saveXlsx((data ?? []).map(p => ({
    'อาคาร':            p.invoices?.rooms?.buildings?.name ?? '',
    'ห้อง':             p.invoices?.rooms?.room_number ?? '',
    'ผู้เช่า':          p.invoices?.tenants?.full_name ?? '',
    'เลขใบแจ้งหนี้':    p.invoices?.invoice_number ?? '',
    'ยอด (฿)':          N(p.amount),
    'วันชำระ':          formatThaiDate(p.paid_date),
    'เลขอ้างอิง':       p.bank_reference ?? '',
    'สถานะ':            p.status,
    'บันทึกโดย':        p.profiles?.full_name ?? '',
  })), 'Payments', period ? `payments_${period}.xlsx` : 'payments_all.xlsx')
}

async function exportMaintenance() {
  const { data } = await supabase.from('maintenance_requests').select(`
    maintenance_number, title, status, cost, vendor_name,
    reported_at, completed_at,
    buildings(name), rooms(room_number),
    profiles!reported_by(full_name)
  `).order('created_at', { ascending: false })
  saveXlsx((data ?? []).map(m => ({
    'เลข':              m.maintenance_number,
    'หัวข้อ':           m.title,
    'อาคาร':            m.buildings?.name ?? '',
    'ห้อง':             m.rooms?.room_number ?? '',
    'สถานะ':            m.status,
    'แจ้งโดย':          m.profiles?.full_name ?? '',
    'วันแจ้ง':          formatThaiDate(m.reported_at),
    'วันเสร็จ':         m.completed_at ? formatThaiDate(m.completed_at) : '',
    'ค่าใช้จ่าย (฿)':   m.cost != null ? N(m.cost) : '',
    'ช่าง':             m.vendor_name ?? '',
  })), 'Maintenance', 'maintenance.xlsx')
}

async function exportMoveOuts() {
  const { data } = await supabase.from('move_outs').select(`
    move_out_number, move_out_date, status, is_early_termination,
    deposit_amount, repair_cost, penalty_cost, other_deduction, refund_amount, additional_charge,
    tenants(full_name, phone),
    rooms(room_number, buildings(name)),
    contracts(contract_number)
  `).order('created_at', { ascending: false })
  saveXlsx((data ?? []).map(mo => ({
    'เลข':              mo.move_out_number,
    'สัญญา':            mo.contracts?.contract_number ?? '',
    'อาคาร':            mo.rooms?.buildings?.name ?? '',
    'ห้อง':             mo.rooms?.room_number ?? '',
    'ผู้เช่า':          mo.tenants?.full_name ?? '',
    'โทรศัพท์':         mo.tenants?.phone ?? '',
    'วันย้ายออก':       formatThaiDate(mo.move_out_date),
    'ก่อนกำหนด':        mo.is_early_termination ? 'ใช่' : 'ไม่',
    'เงินประกัน (฿)':   N(mo.deposit_amount),
    'ค่าซ่อม (฿)':      N(mo.repair_cost),
    'ค่าปรับ (฿)':      N(mo.penalty_cost),
    'หักอื่นๆ (฿)':     N(mo.other_deduction),
    'คืน (฿)':          N(mo.refund_amount),
    'เรียกเก็บ (฿)':    N(mo.additional_charge),
    'สถานะ':            mo.status,
  })), 'MoveOuts', 'move_outs.xlsx')
}

async function exportOwnerStatement(period) {
  const [y, m] = period.split('-')
  const { data } = await supabase.from('owner_transfers').select(`
    transfer_number, period, rent_collected, transfer_amount, status,
    owners(full_name, bank_name, bank_account_number),
    rooms(room_number, buildings(name))
  `).eq('period', `${y}-${m}`).order('created_at')
  saveXlsx((data ?? []).map(ot => ({
    'เลข':              ot.transfer_number,
    'งวด':              ot.period,
    'เจ้าของ':          ot.owners?.full_name ?? '',
    'ธนาคาร':           ot.owners?.bank_name ?? '',
    'เลขบัญชี':         ot.owners?.bank_account_number ?? '',
    'อาคาร':            ot.rooms?.buildings?.name ?? '',
    'ห้อง':             ot.rooms?.room_number ?? '',
    'ค่าเช่ารับ (฿)':   N(ot.rent_collected),
    'ยอดโอน (฿)':       N(ot.transfer_amount),
    'สถานะ':            ot.status,
  })), 'OwnerStmt', `owner_statement_${y}-${m}.xlsx`)
}

// ──────────────────────────────────────────────────
// Map id → export function
// ──────────────────────────────────────────────────
const exportFns = {
  rooms:       (days, period) => exportRooms(),
  expiring:    (days, period) => exportExpiring(days),
  overdue:     (days, period) => exportOverdue(),
  income:      (days, period) => exportIncome(period),
  bookings:    (days, period) => exportBookings(),
  payments:    (days, period) => exportPayments(period),
  maintenance: (days, period) => exportMaintenance(),
  moveouts:    (days, period) => exportMoveOuts(),
  owner_stmt:  (days, period) => exportOwnerStatement(period),
}

// ──────────────────────────────────────────────────
// Page UI
// ──────────────────────────────────────────────────
export default function ReportsPage() {
  const [loadingId, setLoadingId] = useState(null)
  const [inputs,    setInputs]    = useState({})
  const thisMonth = new Date().toISOString().slice(0, 7)

  async function handleExport(reportId) {
    setLoadingId(reportId)
    try {
      const days   = inputs[reportId + '_days']   || '30'
      const period = inputs[reportId + '_period'] || thisMonth
      await exportFns[reportId](days, period)
    } catch (err) {
      alert('Export ผิดพลาด: ' + err.message)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">รายงาน</h1>
        <p className="mt-1 text-sm text-gray-500">Export ข้อมูลเป็น Excel (.xlsx)</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
        {reports.map(r => (
          <div key={r.id} className="rounded-xl border border-gray-100 bg-white px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">{r.label}</p>
            <p className="mt-0.5 text-xs text-gray-400">{r.desc}</p>

            {r.hasInput === 'days' && (
              <div className="mt-3">
                <Input
                  label="ภายใน (วัน)"
                  type="number" min={1} max={365}
                  value={inputs[r.id + '_days'] ?? '30'}
                  onChange={e => setInputs(p => ({ ...p, [r.id + '_days']: e.target.value }))}
                />
              </div>
            )}
            {r.hasInput === 'period' && (
              <div className="mt-3">
                <Input
                  label="เดือน (YYYY-MM)"
                  type="month"
                  value={inputs[r.id + '_period'] ?? thisMonth}
                  onChange={e => setInputs(p => ({ ...p, [r.id + '_period']: e.target.value }))}
                />
              </div>
            )}

            <div className="mt-4">
              <Button
                size="sm"
                icon={loadingId === r.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />
                }
                loading={loadingId === r.id}
                onClick={() => handleExport(r.id)}
              >
                Export Excel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
