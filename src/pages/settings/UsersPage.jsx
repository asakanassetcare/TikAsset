import { useEffect, useState } from 'react'
import { UserPlus, Pencil, Copy, Check, Ban, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import RequireRole from '../../components/auth/RequireRole'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { formatThaiDate } from '../../lib/date'

const ROLE_OPTIONS = [
  { value: 'executive',   label: 'ผู้บริหาร (Executive)' },
  { value: 'accounting',  label: 'บัญชี (Accounting)' },
  { value: 'head_staff',  label: 'Manager' },
  { value: 'staff',       label: 'พนักงาน (Staff)' },
  { value: 'service',     label: 'ช่างซ่อม (Service)' },
]

const ROLE_BADGE = {
  super_admin: { label: 'Super Admin', cls: 'bg-purple-100 text-purple-700' },
  executive:   { label: 'ผู้บริหาร',    cls: 'bg-blue-100 text-blue-700' },
  accounting:  { label: 'บัญชี',        cls: 'bg-green-100 text-green-700' },
  head_staff:  { label: 'Manager',      cls: 'bg-amber-100 text-amber-700' },
  staff:       { label: 'พนักงาน',      cls: 'bg-gray-100 text-gray-600' },
  service:     { label: 'ช่างซ่อม',     cls: 'bg-orange-100 text-orange-700' },
}

function RoleBadge({ role }) {
  const r = ROLE_BADGE[role] ?? { label: role, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${r.cls}`}>
      {r.label}
    </span>
  )
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {active ? 'ใช้งาน' : 'ปิดใช้งาน'}
    </span>
  )
}

export default function UsersPage() {
  return (
    <RequireRole roles={['super_admin', 'head_staff']} fallback={
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">ไม่มีสิทธิ์เข้าถึง��น้านี้</div>
    }>
      <UsersContent />
    </RequireRole>
  )
}

function UsersContent() {
  const { session, role } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', phone: '', role: 'staff' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [copied, setCopied] = useState(false)

  // Edit modal
  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role: 'staff' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [statusTarget, setStatusTarget] = useState(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')
  const isSuperAdmin = role === 'super_admin'
  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => ['head_staff', 'staff', 'service'].includes(option.value))

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
    setLoading(false)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError('')
    if (!roleOptions.some((option) => option.value === inviteForm.role)) {
      setInviteError('ไม่มีสิทธิ์กำหนดสิทธิ์นี้')
      return
    }
    setInviting(true)

    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: inviteForm,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    setInviting(false)
    if (error || data?.error) {
      setInviteError(data?.error ?? error.message)
      return
    }

    setTempPassword(data.temporary_password)
    fetchUsers()
  }

  function copyPassword() {
    navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openEdit(user) {
    if (!canEditUser(user)) return
    setEditUser(user)
    setEditForm({ full_name: user.full_name, phone: user.phone ?? '', role: user.role })
    setEditError('')
  }

  function canEditUser(user) {
    if (isSuperAdmin) return user.role !== 'super_admin'
    return ['head_staff', 'staff', 'service'].includes(user.role)
  }

  function canToggleUser(user) {
    if (user.id === session.user.id) return false
    return canEditUser(user)
  }

  function openStatusModal(user) {
    if (!canToggleUser(user)) return
    setStatusTarget(user)
    setStatusReason('')
    setStatusError('')
  }

  async function handleToggleStatus() {
    if (!statusTarget) return
    const nextActive = statusTarget.is_active === false
    if (!nextActive && !statusReason.trim()) {
      setStatusError('กรุณากรอกเหตุผลการปิดใช้งาน')
      return
    }

    setStatusSaving(true)
    const { error } = await supabase.rpc('set_user_active', {
      p_user_id: statusTarget.id,
      p_is_active: nextActive,
      p_reason: nextActive ? null : statusReason.trim(),
    })
    setStatusSaving(false)
    if (error) { setStatusError(error.message); return }
    setStatusTarget(null)
    fetchUsers()
  }

  async function handleEdit(e) {
    e.preventDefault()
    setEditError('')
    if (!roleOptions.some((option) => option.value === editForm.role)) {
      setEditError('ไม่มีสิทธิ์กำหนดสิทธิ์นี้')
      return
    }
    setSaving(true)

    const { error } = await supabase.rpc('update_user_profile', {
      p_user_id: editUser.id,
      p_full_name: editForm.full_name,
      p_phone: editForm.phone || null,
      p_role: editForm.role,
    })

    setSaving(false)
    if (error) { setEditError(error.message); return }
    setEditUser(null)
    fetchUsers()
  }

  function resetInvite() {
    setInviteForm({ email: '', full_name: '', phone: '', role: 'staff' })
    setInviteError('')
    setTempPassword('')
    setCopied(false)
    setInviteOpen(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ผู้ใช้งาน &amp; สิทธิ์</h1>
          <p className="mt-1 text-sm text-gray-500">จัดการบัญชีผู้ใช้และกำหนดสิทธิ์</p>
        </div>
        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
          เพิ่มผู้ใช้งาน
        </Button>
      </div>

      <Card padding={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">อีเมล</th>
              <th className="px-4 py-3">เบอร์โทร</th>
              <th className="px-4 py-3">สิทธิ์</th>
              <th className="px-4 py-3">วันที่สร้าง</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">ยังไม่มีผู้ใช้งาน</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500">{u.phone ?? '-'}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-gray-400">{formatThaiDate(u.created_at)}</td>
                  <td className="px-4 py-3"><StatusBadge active={u.is_active !== false} /></td>
                  <td className="px-4 py-3">
                    {canEditUser(u) && (
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canToggleUser(u) && (
                      <button
                        onClick={() => openStatusModal(u)}
                        className={`ml-1 rounded-lg p-1.5 transition-colors ${u.is_active === false ? 'text-green-600 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'}`}
                        title={u.is_active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      >
                        {u.is_active === false ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={resetInvite}
        title="เพิ่มผู้ใช้งานใหม่"
        size="sm"
        footer={
          tempPassword ? (
            <Button onClick={resetInvite}>ปิด</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={resetInvite}>ยกเลิก</Button>
              <Button form="invite-form" type="submit" loading={inviting}>สร้างบัญชี</Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">สร้างบัญชีสำเร็จ</p>
              <p className="mt-1 text-sm text-gray-500">รหัสผ่านชั่วคราว — แจ้งให้ผู้ใช้เปลี่ยนทันที</p>
            </div>
            <div className="flex w-full items-center gap-2 rounded-xl bg-gray-50 px-4 py-3">
              <span className="flex-1 font-mono text-sm font-semibold tracking-wider text-gray-900">
                {tempPassword}
              </span>
              <button
                onClick={copyPassword}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <form id="invite-form" onSubmit={handleInvite} className="flex flex-col gap-4">
            <Input
              label="อีเมล"
              type="email"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="user@example.com"
            />
            <Input
              label="ชื่อ-นามสกุล"
              required
              value={inviteForm.full_name}
              onChange={(e) => setInviteForm((p) => ({ ...p, full_name: e.target.value }))}
              placeholder="สมชาย ใจดี"
            />
            <Input
              label="เบอร์โทรศัพท์"
              phone
              value={inviteForm.phone}
              onChange={(e) => setInviteForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="0810000000"
            />
            <Select
              label="สิทธิ์"
              required
              options={roleOptions}
              value={inviteForm.role}
              onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
            />
            {inviteError && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{inviteError}</div>
            )}
          </form>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="แก้ไขผู้ใช้งาน"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>ยกเลิก</Button>
            <Button form="edit-form" type="submit" loading={saving}>บันทึก</Button>
          </>
        }
      >
        <form id="edit-form" onSubmit={handleEdit} className="flex flex-col gap-4">
          <Input
            label="ชื่อ-นามสกุล"
            required
            value={editForm.full_name}
            onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
          />
          <Input
            label="เบอร์โทรศัพท์"
            phone
            value={editForm.phone}
            onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <Select
            label="สิทธิ์"
            required
            options={roleOptions}
            value={editForm.role}
            onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
          />
          {editError && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{editError}</div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.is_active === false ? 'เปิดใช้งานผู้ใช้' : 'ปิดใช้งานผู้ใช้'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>ยกเลิก</Button>
            <Button
              variant={statusTarget?.is_active === false ? 'default' : 'danger'}
              loading={statusSaving}
              onClick={handleToggleStatus}
            >
              {statusTarget?.is_active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
            <p className="font-medium text-gray-900">{statusTarget?.full_name}</p>
            <p className="text-xs text-gray-500">{statusTarget?.email}</p>
          </div>
          {statusTarget?.is_active !== false && (
            <Textarea
              label="เหตุผลการปิดใช้งาน"
              rows={3}
              required
              value={statusReason}
              onChange={(e) => { setStatusReason(e.target.value); setStatusError('') }}
              placeholder="เช่น ลาออก / ย้ายหน้าที่ / ระงับชั่วคราว"
            />
          )}
          {statusError && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{statusError}</div>
          )}
        </div>
      </Modal>
    </div>
  )
}
