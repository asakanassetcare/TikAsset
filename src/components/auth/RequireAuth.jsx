import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { PageSpinner } from '../ui/Spinner'

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  return children
}
