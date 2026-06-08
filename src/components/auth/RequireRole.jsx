import { useAuth } from '../../hooks/useAuth'
import { hasRole } from '../../lib/permissions'

export default function RequireRole({ roles, fallback = null, children }) {
  const { role } = useAuth()

  if (!hasRole(role, roles)) return fallback

  return children
}
