import { Loader2 } from 'lucide-react'

export default function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-blue-600 ${className}`} />
}

export function PageSpinner() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  )
}
