import { useState, useEffect } from 'react'
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react'
import { subscribeToasts, type Toast } from '../services/notify'

const ICONS = {
  success: CheckCircle2,
  info:    Info,
  warning: AlertTriangle,
  error:   XCircle,
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(t => {
        const Icon = ICONS[t.variant]
        return (
          <div key={t.id} className={`toast toast-${t.variant}`}>
            <Icon size={14} className="shrink-0 mt-0.5" />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
