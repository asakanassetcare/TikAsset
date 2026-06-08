export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  EXECUTIVE: 'executive',
  ACCOUNTING: 'accounting',
  HEAD_STAFF: 'head_staff',
  STAFF: 'staff',
  SERVICE: 'service',
}

const ROLE_RANK = {
  super_admin: 5,
  executive: 4,
  accounting: 3,
  head_staff: 2,
  staff: 1,
  service: 0,
}

export function hasRole(userRole, requiredRoles) {
  if (!userRole || !requiredRoles?.length) return false
  return requiredRoles.includes(userRole)
}

export function isAtLeast(userRole, minRole) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
}

export function canApproveContract(role) {
  return hasRole(role, [ROLES.EXECUTIVE, ROLES.SUPER_ADMIN])
}

export function canApprovePayment(role) {
  return hasRole(role, [ROLES.ACCOUNTING, ROLES.SUPER_ADMIN])
}

export function canManageUsers(role) {
  return hasRole(role, [ROLES.SUPER_ADMIN, ROLES.HEAD_STAFF])
}

export function canManageSettings(role) {
  return hasRole(role, [ROLES.SUPER_ADMIN, ROLES.HEAD_STAFF])
}

export function canAssignStaff(role) {
  return hasRole(role, [ROLES.HEAD_STAFF, ROLES.SUPER_ADMIN])
}

export function canAproveMoveOut(role) {
  return hasRole(role, [ROLES.ACCOUNTING, ROLES.SUPER_ADMIN])
}

export function canManageOwnerTransfer(role) {
  return hasRole(role, [ROLES.ACCOUNTING, ROLES.SUPER_ADMIN])
}
