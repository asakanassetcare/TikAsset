export const SLIP_REFERENCE_LABEL = 'เลขอ้างอิง (4หลักสุดท้าย)'
export const SLIP_REFERENCE_PLACEHOLDER = 'เช่น 1234'

export function normalizeSlipReference(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4)
}
