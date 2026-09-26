import { useState, useCallback, useEffect } from 'react';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;

const DURATION: Record<Toast['type'], number> = {
  success: 3000,
  info: 3500,
  error: 5000,
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DURATION[type]);
  }, []);

  return { toasts, addToast, dismissToast };
}

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss?: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss?: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => setVisible(false), DURATION[toast.type] - 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [toast.type]);

  const bg = toast.type === 'success' ? 'rgba(16,122,70,0.95)' : toast.type === 'error' ? 'rgba(185,35,35,0.95)' : 'rgba(37,80,160,0.95)';
  const icon = toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ';

  return (
    <div style={{
      background: bg,
      color: '#fff',
      padding: '10px 12px 10px 14px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transform: visible ? 'translateX(0)' : 'translateX(120%)',
      opacity: visible ? 1 : 0,
      transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      pointerEvents: 'auto',
      minWidth: '200px',
      maxWidth: '400px',
      border: '1px solid rgba(255,255,255,0.15)',
    }}>
      <span style={{ fontWeight: 700, fontSize: '14px' }}>{icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      {onDismiss && (
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
