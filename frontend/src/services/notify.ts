/**
 * Singleton notification service — no React state, no deps.
 * Components subscribe via subscribeToasts(); anything can call notify().
 */

export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
}

type Listener = (toasts: Toast[]) => void

let _toasts: Toast[] = []
let _listeners: Listener[] = []

function emit() {
  const snapshot = [..._toasts]
  _listeners.forEach((l) => l(snapshot))
}

export function notify(variant: ToastVariant, message: string, durationMs = 4000) {
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`
  _toasts = [..._toasts, { id, variant, message }]
  emit()
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id)
    emit()
  }, durationMs)
}

export function subscribeToasts(listener: Listener): () => void {
  _listeners = [..._listeners, listener]
  listener([..._toasts])
  return () => {
    _listeners = _listeners.filter((l) => l !== listener)
  }
}
