import React, { useRef, useEffect } from 'react';
import { IconCopy, IconX, IconCheck } from './Icons';

interface ConsoleBoxProps {
  // New API
  title?: string;
  content?: string;
  success?: boolean | null;
  onClear?: () => void;
  // Legacy API
  logs?: string;
  isError?: boolean;
}

export const ConsoleBox: React.FC<ConsoleBoxProps> = ({
  title,
  content,
  success,
  onClear,
  logs,
  isError = false,
}) => {
  const text = content ?? logs ?? '';
  const hasError = success === false || (success === undefined && isError);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text]);

  if (!text) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="console-box-wrapper" style={{ position: 'relative', marginTop: '8px' }}>
      {title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '8px 8px 0 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: hasError ? '#ff6b6b' : success ? '#4ade80' : 'var(--text-muted)' }}>
            {hasError ? (
              <IconX size={12} color="#ff6b6b" />
            ) : success ? (
              <IconCheck size={12} color="#4ade80" />
            ) : (
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            )}
            {title}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: '10px',
                color: 'var(--text-muted)',
              }}
              title="Copy"
            >
              <IconCopy size={11} /> copy
            </button>
            {onClear && (
              <button
                onClick={onClear}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                }}
                title="Dismiss"
              >
                <IconX size={11} />
              </button>
            )}
          </div>
        </div>
      )}
      {!title && (
        <button
          onClick={handleCopy}
          className="btn btn-icon btn-copy-console"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '6px',
            background: 'rgba(255, 255, 255, 0.07)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          title="Copy Logs"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
      <pre
        ref={preRef}
        className={`console-output ${hasError ? 'error' : ''}`}
        style={{
          paddingRight: title ? '12px' : '42px',
          margin: 0,
          borderRadius: title ? '0 0 8px 8px' : '8px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        {text}
      </pre>
    </div>
  );
};
