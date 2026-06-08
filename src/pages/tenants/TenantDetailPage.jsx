import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight, Save, Plus, Trash2, Car, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Badge from '../../components/ui/Badge'
import IdCardField from '../../components/tenants/IdCardField'
import DocumentUpload from '../../components/shared/DocumentUpload'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'

const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const INV_TYPE_LABEL = {
  contract_initial: 'ค่าประกัน+ล่วงหน้า',
  monthly_rent:     'ค่าเช่า',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินมัดจำจอง',
}
function invDesc(inv) {
  if (!inv) return ''
  const base = INV_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type ?? ''
  if (inv.billing_period) {
    const [y, m] = inv.billing_period.split('-')
    return `${base} ${MONTHS_SHORT[parseInt(m) - 1]} ${parseInt(y) + 543}`
  }
  return base
}

const TABS = [
  { id: 'info',      label: 'ข้อมูล' },
  { id: 'docs',      label: 'เอกสาร' },
  { id: 'contracts', label: 'ประวัติการเช่า' },
  { id: 'payments',  label: 'ประวัติการชำระ' },
  { id: 'moveouts',  label: 'ประวัติการย้ายออก' },
]

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', line_id: '',
  birth_date: '',
  address_house_no: '', address_road: '', address_subdistrict: '', address_district: '', address_province: '',
  address: '', emergency_contact_name: '', emergency_contact_phone: '',
  note: '',
}

export default function TenantDetailPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNew = tenantId === 'new'

  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return ['info','docs','contracts','payments','moveouts'].includes(t) ? t : 'info'
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [idCard,      setIdCard]      = useState('')
  const [isForeigner, setIsForeigner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [moveOuts, setMoveOuts] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [vehicles,     setVehicles]    = useState([])
  const [vPlate,       setVPlate]      = useState('')
  const [vNote,        setVNote]       = useState('')
  const [vAdding,      setVAdding]     = useState(false)
  const [vShowForm,    setVShowForm]   = useState(false)

  useEffect(() => {
    if (!isNew) { fetchTenant(); fetchVehicles() }
  }, [tenantId])

  useEffect(() => {
    if (tab === 'contracts' && contracts.length === 0) fetchContracts()
    if (tab === 'payments'  && payments.length  === 0) fetchPayments()
    if (tab === 'moveouts'  && moveOuts.length  === 0) fetchMoveOuts()
  }, [tab])

  async function fetchTenant() {
    const { data } = await supabase
      .from('tenants')
      .select('id, full_name, phone, email, line_id, line_user_id, birth_date, address_house_no, address_road, address_subdistrict, address_district, address_province, address, emergency_contact_name, emergency_contact_phone, vehicle_plate, note, id_card_last4, id_card_encrypted, is_foreigner')
      .eq('id', tenantId)
      .single()
    if (!data) { navigate('/tenants'); return }
    setTenant(data)
    setIsForeigner(data.is_foreigner ?? false)
    setForm({
      full_name: data.full_name, phone: data.phone, email: data.email ?? '',
      line_id: data.line_id ?? '', birth_date: data.birth_date ?? '',
      address_house_no: data.address_house_no ?? '', address_road: data.address_road ?? '',
      address_subdistrict: data.address_subdistrict ?? '', address_district: data.address_district ?? '',
      address_province: data.address_province ?? '', address: data.address ?? '',
      emergency_contact_name: data.emergency_contact_name ?? '',
      emergency_contact_phone: data.emergency_contact_phone ?? '',
      note: data.note ?? '',
    })
    setLoading(false)
  }

  async function fetchContracts() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('contracts')
      .select('id, contract_number, status, contract_start_date, contract_end_date, rooms(room_number, buildings(name))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setContracts(data ?? [])
    setHistoryLoading(false)
  }

  async function fetchPayments() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('payments')
      .select('id, amount, status, paid_date, invoices!inner(invoice_number, invoice_type, billing_period, tenant_id)')
      .eq('invoices.tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50)
    setPayments(data ?? [])
    setHistoryLoading(false)
  }

  async function fetchMoveOuts() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('move_outs')
      .select('id, move_out_date, status, refund_amount, contracts(contract_number, rooms(room_number))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setMoveOuts(data ?? [])
    setHistoryLoading(false)
  }

  async function fetchVehicles() {
    const { data } = await supabase.from('tenant_vehicles')
      .select('id, plate_number, note, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at')
    setVehicles(data ?? [])
  }

  async function handleAddVehicle(e) {
    e.preventDefault()
    if (!vPlate.trim()) return
    setVAdding(true)
    const { error } = await supabase.from('tenant_vehicles').insert({
      tenant_id:    tenantId,
      plate_number: vPlate.trim(),
      note:         vNote.trim() || null,
    })
    setVAdding(false)
    if (error) { alert(error.message); return }
    setVPlate(''); setVNote(''); setVShowForm(false)
    fetchVehicles()
  }

  async function handleDeleteVehicle(id) {
    if (!confirm('ลบทะเบียนนี้?')) return
    await supabase.from('tenant_vehicles').delete().eq('id', id)
    fetchVehicles()
  }

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setSaved(false) }

  function parseRpcError(msg = '') {
    if (msg.includes('เลขบัตรประชาชนนี้มีในระบบแล้ว')) return 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
    if (msg.includes('เลขบัตรประชาชนต้องมี 13 หลัก'))  return 'เลขบัตรประชาชนต้องมี 13 หลัก'
    if (msg.includes('กรุณากรอกเลขบัตรประชาชน'))       return 'กรุณากรอกเลขบัตรประชาชน'
    if (msg.includes('unique') || msg.includes('duplicate')) return 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
    return msg
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return }
    if (!form.phone.trim())     { setError('กรุณากรอกเบอร์โทร'); return }
    if (!form.birth_date)       { setError('กรุณากรอกวันเกิด'); return }
    if (isNew && !idCard.trim()) { setError(isForeigner ? 'กรุณากรอกเลขหนังสือเดินทาง' : 'กรุณากรอกเลขบัตรประชาชน (ใช้เป็นตัวระบุหลัก)'); return }
    if (!form.address_house_no.trim())    { setError('กรุณากรอกบ้านเลขที่'); return }
    if (!form.address_road.trim())        { setError('กรุณากรอกถนน'); return }
    if (!form.address_subdistrict.trim()) { setError('กรุณากรอกแขวง/ตำบล'); return }
    if (!form.address_district.trim())    { setError('กรุณากรอกเขต/อำเภอ'); return }
    if (!form.address_province.trim())    { setError('กรุณากรอกจังหวัด'); return }
    if (!form.emergency_contact_name.trim())  { setError('กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน'); return }
    if (!form.emergency_contact_phone.trim()) { setError('กรุณากรอกเบอร์โทรผู้ติดต่อฉุกเฉิน'); return }
    setError('')
    setSaving(true)

    const extraFields = {
      birth_date:         form.birth_date         || null,
      address_house_no:   form.address_house_no.trim()   || null,
      address_road:       form.address_road.trim()       || null,
      address_subdistrict:form.address_subdistrict.trim()|| null,
      address_district:   form.address_district.trim()   || null,
      address_province:   form.address_province.trim()   || null,
    }
    const payload = {
      full_name: form.full_name.trim(), phone: form.phone.trim(),
      email: form.email.trim() || null, line_id: form.line_id.trim() || null,
      address: form.address.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      note: form.note.trim() || null,
      is_foreigner: isForeigner,
      ...extraFields,
    }

    if (isNew) {
      // Atomic RPC: duplicate check + insert + encrypt in one transaction
      const { data: newId, error: rpcErr } = await supabase.rpc('create_tenant', {
        p_full_name:               payload.full_name,
        p_phone:                   payload.phone,
        p_id_card:                 idCard.trim(),
        p_is_foreigner:            isForeigner,
        p_email:                   payload.email,
        p_line_id:                 payload.line_id,
        p_address:                 payload.address,
        p_emergency_contact_name:  payload.emergency_contact_name,
        p_emergency_contact_phone: payload.emergency_contact_phone,
        p_vehicle_plate:           null,
        p_note:                    payload.note,
      })
      if (rpcErr) { setSaving(false); setError(parseRpcError(rpcErr.message)); return }
      // Update extra fields not supported by RPC
      if (Object.values(extraFields).some(v => v !== null)) {
        await supabase.from('tenants').update(extraFields).eq('id', newId)
      }
      setSaving(false)
      navigate(`/tenants/${newId}`, { replace: true })
    } else {
      const { error: updateErr } = await supabase.from('tenants').update(payload).eq('id', tenantId)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }
      if (idCard.trim()) {
        const { error: idErr } = await supabase.rpc('set_tenant_id_card', { p_tenant_id: tenantId, p_id_card: idCard.trim() })
        if (idErr) { setSaving(false); setError(parseRpcError(idErr.message)); return }
      }
      setSaving(false)
      setIdCard('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      fetchTenant()
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/tenants" className="hover:text-blue-600">ผู้เช่า</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{isNew ? 'เพิ่มผู้เช่าใหม่' : tenant?.full_name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{isNew ? 'เพิ่มผู้เช่า' : tenant?.full_name}</h1>
        {!isNew && tenant?.phone && <p className="mt-1 text-sm text-gray-500">{tenant.phone}</p>}
        {!isNew && (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            tenant?.line_user_id ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'
          }`}>
            {tenant?.line_user_id
              ? <><Check className="h-3 w-3" /> LINE เชื่อมต่อแล้ว</>
              : <><X className="h-3 w-3" /> ยังไม่เชื่อม LINE</>
            }
          </div>
        )}
      </div>

      {/* Tabs */}
      {!isNew && (
        <div className="mb-6 flex gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Info */}
      {(tab === 'info' || isNew) && (
        <Card className="max-w-2xl">
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <Input label="ชื่อ-นามสกุล" required value={form.full_name} onChange={e => set('full_name', e.target.value)} wrapperClass="col-span-2" />
            <Input label="เบอร์โทร" required phone value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0810000000" />
            <Input label="อีเมล" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Line ID" value={form.line_id} onChange={e => set('line_id', e.target.value)} placeholder="@lineid" />
            <Input label="วันเกิด" required type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />

            <div className="col-span-2">
              <IdCardField
                tenantId={isNew ? null : tenantId}
                hasEncrypted={!!tenant?.id_card_encrypted}
                last4={tenant?.id_card_last4}
                isForeigner={isForeigner}
                onForeignerChange={v => { setIsForeigner(v); setIdCard('') }}
                onChange={val => setIdCard(val)}
                required={isNew}
              />
            </div>

            <div className="col-span-2">
              <p className="mb-2 text-sm font-medium text-gray-700">ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="บ้านเลขที่" required value={form.address_house_no} onChange={e => set('address_house_no', e.target.value)} />
                <Input label="ถนน" required value={form.address_road} onChange={e => set('address_road', e.target.value)} />
                <Input label="แขวง/ตำบล" required value={form.address_subdistrict} onChange={e => set('address_subdistrict', e.target.value)} />
                <Input label="เขต/อำเภอ" required value={form.address_district} onChange={e => set('address_district', e.target.value)} />
                <Input label="จังหวัด" required value={form.address_province} onChange={e => set('address_province', e.target.value)} />
              </div>
            </div>

            <Textarea label="ที่อยู่อื่น (ถ้ามี)" rows={2} value={form.address} onChange={e => set('address', e.target.value)} wrapperClass="col-span-2" />

            <div className="col-span-2">
              <p className="mb-3 text-sm font-medium text-gray-700">ผู้ติดต่อฉุกเฉิน <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="ชื่อ" required value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} />
                <Input label="เบอร์โทร" required phone value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} />
              </div>
            </div>

            <Textarea label="หมายเหตุ" rows={2} value={form.note} onChange={e => set('note', e.target.value)} wrapperClass="col-span-2" />

            {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}

            <div className="col-span-2 flex items-center gap-3 border-t border-gray-100 pt-4">
              <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>บันทึก</Button>
              {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
            </div>
          </form>
        </Card>
      )}

      {/* Vehicle management (info tab, existing tenants only) */}
      {(tab === 'info' && !isNew) && (
        <Card className="max-w-2xl mt-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Car className="h-4 w-4 text-gray-400" /> ทะเบียนรถ ({vehicles.length})
            </h2>
            <button type="button"
              onClick={() => { setVShowForm(v => !v); setVPlate(''); setVNote('') }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> เพิ่มทะเบียน
            </button>
          </div>

          {vShowForm && (
            <form onSubmit={handleAddVehicle} className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex gap-2">
                <input type="text" value={vPlate} onChange={e => setVPlate(e.target.value)}
                  placeholder="ทะเบียน *" required
                  className="h-8 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" value={vNote} onChange={e => setVNote(e.target.value)}
                  placeholder="หมายเหตุ (เช่น รถยนต์คันที่ 2)"
                  className="h-8 w-44 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={vAdding}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {vAdding ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setVShowForm(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          {vehicles.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีทะเบียนรถ</p>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map(v => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-800">{v.plate_number}</p>
                    {v.note && <p className="text-xs text-gray-400">{v.note}</p>}
                  </div>
                  <button type="button" onClick={() => handleDeleteVehicle(v.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab: Documents */}
      {tab === 'docs' && (
        <Card className="max-w-2xl">
          <DocumentUpload
            refTable="tenants"
            refId={tenantId}
            bucket="tenant-docs"
            allowedTypes={['id_card_front', 'id_card_back', 'vehicle_registration', 'other']}
          />
        </Card>
      )}

      {/* Tab: Contracts */}
      {tab === 'contracts' && (
        <div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการเช่า</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {contracts.map((c, i) => (
                <div key={c.id} className={`flex items-center justify-between px-4 py-3.5 ${i < contracts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.contract_number}</p>
                    <p className="text-xs text-gray-400">
                      {c.rooms?.buildings?.name} · {c.rooms?.room_number}
                      {' · '}{formatThaiDate(c.contract_start_date)} – {formatThaiDate(c.contract_end_date)}
                    </p>
                  </div>
                  <Badge variant={c.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Payments */}
      {tab === 'payments' && (
        <div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการชำระ</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {payments.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between px-4 py-3.5 ${i < payments.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invDesc(p.invoices)}</p>
                    <p className="text-xs text-gray-400">{p.invoices?.invoice_number} · {formatThaiDate(p.paid_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(p.amount).toLocaleString('th-TH')}</span>
                    <Badge variant={p.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Move-outs */}
      {tab === 'moveouts' && (
        <div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : moveOuts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการย้ายออก</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {moveOuts.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between px-4 py-3.5 ${i < moveOuts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.contracts?.rooms?.room_number}</p>
                    <p className="text-xs text-gray-400">ย้ายออก {formatThaiDate(m.move_out_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.refund_amount != null && (
                      <span className="text-sm text-gray-700">คืน ฿{Number(m.refund_amount).toLocaleString('th-TH')}</span>
                    )}
                    <Badge variant={m.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
