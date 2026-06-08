import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, FileText, Receipt, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import ReceiptPDF from '../../components/pdf/ReceiptPDF'
import BookingReceiptPDF from '../../components/pdf/BookingReceiptPDF'

const TABS = [
  { key: 'contracts', label: 'สัญญา' },
  { key: 'invoices',  label: 'ใบแจ้งหนี้' },
  { key: 'receipts',  label: 'ใบเสร็จรับเงิน' },
]

const TYPE_LABEL = {
  contract_initial: 'ประกัน+ล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

const RECEIPT_FILTERS = [
  { value: '',                  label: 'ทั้งหมด' },
  { value: 'monthly_rent',     label: 'ค่าเช่ารายเดือน' },
  { value: 'contract_initial', label: 'ประกัน+ล่วงหน้า' },
  { value: 'booking_deposit',  label: 'เงินจอง' },
  { value: 'addon',            label: 'ค่าบริการเสริม' },
  { value: 'final_settlement', label: 'เคลียร์ Move-out' },
  { value: 'other',            label: 'อื่นๆ' },
]

export default function DocumentsPage() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [tab,            setTab]            = useState('contracts')
  const [search,         setSearch]         = useState('')
  const [searchScope,    setSearchScope]    = useState('all')
  const [receiptType,    setReceiptType]    = useState('')
  const [contracts,      setContracts]      = useState([])
  const [invoices,       setInvoices]       = useState([])
  const [pmtReceipts,    setPmtReceipts]    = useState([])   // approved payments
  const [miscReceipts,   setMiscReceipts]   = useState([])   // old receipts table
  const [bkgReceipts,    setBkgReceipts]    = useState([])   // paid bookings
  const [loading,        setLoading]        = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [
      { data: cData },
      { data: iData },
      { data: pmtData },
      { data: miscData },
      { data: bkgData },
    ] = await Promise.all([
      supabase.from('contracts').select(`
        id, contract_number, status, contract_start_date, contract_end_date, monthly_rent, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).order('created_at', { ascending: false }).limit(500),

      supabase.from('invoices').select(`
        id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).order('created_at', { ascending: false }).limit(500),

      // Source 1: approved invoice payments
      supabase.from('payments').select(`
        id, amount, paid_date, bank_name, bank_reference, note, approved_at,
        penalty_amount, penalty_days,
        invoices(
          id, invoice_number, invoice_type, billing_period, total_amount,
          rooms(room_number, buildings(name)),
          tenants(full_name, phone),
          contracts(contract_number)
        ),
        recorder:profiles!recorded_by(full_name)
      `).eq('status', 'approved').order('approved_at', { ascending: false }).limit(500),

      // Source 2: miscellaneous receipts (repairs etc.)
      supabase.from('receipts').select(`
        id, receipt_number, amount, description, payer_name, issued_at,
        issuer:profiles!issued_by(full_name)
      `).order('issued_at', { ascending: false }).limit(500),

      // Source 3: paid booking deposits
      supabase.from('bookings').select(`
        id, booking_number, deposit_amount, paid_date, bank_name, bank_reference, payment_recorded_at,
        rooms(room_number, buildings(name)),
        tenants(full_name, phone),
        recorder:profiles!payment_recorded_by(full_name)
      `).not('paid_date', 'is', null).order('payment_recorded_at', { ascending: false }).limit(500),
    ])

    setContracts(cData ?? [])
    setInvoices(iData ?? [])
    setPmtReceipts(pmtData ?? [])
    setMiscReceipts(miscData ?? [])
    setBkgReceipts(bkgData ?? [])
    setLoading(false)
  }

  // Merge all receipt sources into a uniform list
  const allReceipts = useMemo(() => {
    const items = [
      ...pmtReceipts.map(r => ({
        _id:      r.id,
        _source:  'payment',
        _type:    r.invoices?.invoice_type ?? 'other',
        _date:    r.paid_date,
        _sort:    r.approved_at ?? r.paid_date,
        _number:  `RCV-${r.invoices?.invoice_number ?? ''}`,
        _label:   TYPE_LABEL[r.invoices?.invoice_type] ?? 'อื่นๆ',
        _tenant:  r.invoices?.tenants?.full_name,
        _building:r.invoices?.rooms?.buildings?.name,
        _room:    r.invoices?.rooms?.room_number,
        _period:  r.invoices?.billing_period,
        _amount:  Number(r.amount),
        _by:      r.recorder?.full_name,
        _raw:     r,
      })),
      ...miscReceipts.map(r => ({
        _id:      r.id,
        _source:  'misc',
        _type:    'other',
        _date:    r.issued_at,
        _sort:    r.issued_at,
        _number:  r.receipt_number,
        _label:   r.description ?? 'อื่นๆ',
        _tenant:  r.payer_name,
        _building:null,
        _room:    null,
        _period:  null,
        _amount:  Number(r.amount),
        _by:      r.issuer?.full_name,
        _raw:     r,
      })),
      ...bkgReceipts.map(r => ({
        _id:      r.id,
        _source:  'booking',
        _type:    'booking_deposit',
        _date:    r.paid_date,
        _sort:    r.payment_recorded_at ?? r.paid_date,
        _number:  r.booking_number,
        _label:   'เงินจอง',
        _tenant:  r.tenants?.full_name,
        _building:r.rooms?.buildings?.name,
        _room:    r.rooms?.room_number,
        _period:  null,
        _amount:  Number(r.deposit_amount),
        _by:      r.recorder?.full_name,
        _raw:     r,
      })),
    ]
    return items.sort((a, b) => new Date(b._sort) - new Date(a._sort))
  }, [pmtReceipts, miscReceipts, bkgReceipts])

  const q = search.toLowerCase().trim()

  function matchScope(fields) {
    if (!q) return true
    const { number, tenant, room, building, label } = fields
    if (searchScope === 'room')   return room?.toLowerCase().includes(q)
    if (searchScope === 'tenant') return tenant?.toLowerCase().includes(q)
    if (searchScope === 'number') return number?.toLowerCase().includes(q)
    return (
      number?.toLowerCase().includes(q) ||
      tenant?.toLowerCase().includes(q) ||
      room?.toLowerCase().includes(q) ||
      building?.toLowerCase().includes(q) ||
      label?.toLowerCase().includes(q)
    )
  }

  const filteredContracts = contracts.filter(c =>
    matchScope({ number: c.contract_number, tenant: c.tenants?.full_name, room: c.rooms?.room_number, building: c.rooms?.buildings?.name })
  )

  const filteredInvoices = invoices.filter(inv =>
    matchScope({ number: inv.invoice_number, tenant: inv.tenants?.full_name, room: inv.rooms?.room_number, building: inv.rooms?.buildings?.name })
  )

  const filteredReceipts = allReceipts.filter(r => {
    const matchType = !receiptType || r._type === receiptType
    const matchQ = matchScope({ number: r._number, tenant: r._tenant, room: r._room, building: r._building, label: r._label })
    return matchType && matchQ
  })

  const showCount = (list) => `${list.length} รายการ`

  if (loading) return <PageSpinner />

  const company = settings?.company ?? {}

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">เอกสาร</h1>
        <p className="mt-1 text-sm text-gray-500">ค้นหาสัญญา ใบแจ้งหนี้ และใบเสร็จรับเงิน</p>
      </div>

      {/* Search */}
      <div className="mb-5 flex items-center gap-2 max-w-xl">
        <select
          value={searchScope}
          onChange={e => setSearchScope(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
        >
          <option value="all">ทั้งหมด</option>
          <option value="room">ห้อง</option>
          <option value="tenant">ผู้เช่า</option>
          <option value="number">เลขที่</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={
              searchScope === 'room'   ? 'เลขห้อง เช่น 202' :
              searchScope === 'tenant' ? 'ชื่อผู้เช่า' :
              searchScope === 'number' ? 'เลขเอกสาร' :
              'ค้นหาชื่อผู้เช่า เลขเอกสาร ห้อง...'
            }
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Receipt type filter */}
      {tab === 'receipts' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {RECEIPT_FILTERS.map(f => (
            <button key={f.value} onClick={() => setReceiptType(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                receiptType === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Contracts */}
      {tab === 'contracts' && (
        <>
          <p className="mb-3 text-sm text-gray-400">{showCount(filteredContracts)}</p>
          {filteredContracts.length === 0 ? (
            <EmptyState icon={FileText} title="ไม่พบสัญญา" />
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {filteredContracts.map((c, i) => (
                <div key={c.id}
                  onClick={() => navigate(`/contracts/${c.id}`)}
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.contract_number}</p>
                    <p className="text-xs text-gray-500">
                      {c.rooms?.buildings?.name} · ห้อง {c.rooms?.room_number} · {c.tenants?.full_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(c.contract_start_date)} – {formatThaiDate(c.contract_end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); window.open(`/contracts/${c.id}/print`, '_blank') }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      title="พิมพ์สัญญา"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <Badge variant={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invoices */}
      {tab === 'invoices' && (
        <>
          <p className="mb-3 text-sm text-gray-400">{showCount(filteredInvoices)}</p>
          {filteredInvoices.length === 0 ? (
            <EmptyState icon={Receipt} title="ไม่พบใบแจ้งหนี้" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredInvoices.map(inv => (
                <div key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 cursor-pointer hover:shadow-md transition-all"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">
                      {inv.rooms?.buildings?.name} · ห้อง {inv.rooms?.room_number} · {inv.tenants?.full_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
                      {inv.billing_period ? ` · ${inv.billing_period}` : ''}
                      {' · ครบ '}{formatThaiDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                    <Badge variant={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Receipts */}
      {tab === 'receipts' && (
        <>
          <p className="mb-3 text-sm text-gray-400">{showCount(filteredReceipts)}</p>
          {filteredReceipts.length === 0 ? (
            <EmptyState icon={Receipt} title="ไม่พบใบเสร็จรับเงิน" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredReceipts.map(r => {
                const href =
                  r._source === 'payment' && r._raw.invoices?.id ? `/invoices/${r._raw.invoices.id}` :
                  r._source === 'booking' ? `/bookings/${r._id}` :
                  null
                return (
                <div key={`${r._source}-${r._id}`}
                  onClick={href ? () => navigate(href) : undefined}
                  className={`flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 transition-all ${href ? 'cursor-pointer hover:shadow-md' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{r._number}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{r._label}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {[r._building && `${r._building}`, r._room && `ห้อง ${r._room}`, r._tenant].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(r._date)}
                      {r._period ? ` · ${r._period}` : ''}
                      {r._by ? ` · โดย ${r._by}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-green-700">
                      ฿{r._amount.toLocaleString('th-TH')}
                    </span>
                    {r._source === 'payment' && r._raw.invoices && (
                      <div onClick={e => e.stopPropagation()}>
                        <PdfDownloadButton
                          document={<ReceiptPDF payment={r._raw} invoice={r._raw.invoices} company={company} />}
                          filename={`receipt_${r._raw.invoices.invoice_number}.pdf`}
                          label="PDF"
                          size="sm"
                        />
                      </div>
                    )}
                    {r._source === 'booking' && (
                      <div onClick={e => e.stopPropagation()}>
                        <PdfDownloadButton
                          document={<BookingReceiptPDF booking={r._raw} company={company} />}
                          filename={`booking_receipt_${r._raw.booking_number}.pdf`}
                          label="PDF"
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </>
      )}
    </div>
  )
}
