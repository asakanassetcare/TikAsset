import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function RequireNonService({ children }) {
  const { role } = useAuth()

  if (role === 'service') return <Navigate to="/maintenance" replace />

  return children
}
