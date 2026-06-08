import { useSearchParams } from 'react-router-dom'
import BookingsPage from './bookings/BookingsPage'
import ContractsPage from './contracts/ContractsPage'
import InvoicesPage from './invoices/InvoicesPage'
import OwnerTransfersPage from './owner-transfers/OwnerTransfersPage'
import MoveOutsPage from './move-outs/MoveOutsPage'
import VehiclesPage from './vehicles/VehiclesPage'

const TABS = [
  { key: 'bookings',        label: 'การจอง',     Page: BookingsPage },
  { key: 'contracts',       label: 'สัญญา',      Page: ContractsPage },
  { key: 'invoices',        label: 'ใบแจ้งหนี้', Page: InvoicesPage },
  { key: 'owner-transfers', label: 'โอนเจ้าของ', Page: OwnerTransfersPage },
  { key: 'move-outs',       label: 'ย้ายออก',    Page: MoveOutsPage },
  { key: 'vehicles',        label: 'รถยนต์',      Page: VehiclesPage },
]

export default function ManagePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeKey = searchParams.get('tab') ?? 'bookings'
  const active    = TABS.find(t => t.key === activeKey) ?? TABS[0]
  const { Page }  = active

  return (
    <div>
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-0.5 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSearchParams({ tab: tab.key })}
              className={`
                whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${activeKey === tab.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* key forces full remount on tab switch so each page gets its own state */}
      <Page key={activeKey} />
    </div>
  )
}
