interface Props {
  visible: boolean;
  progress: number;  // 0–1
  message: string;
}

export default function LoadingOverlay({ visible, progress, message }: Props) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: '#fff',
        gap: 16,
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600 }}>Parsing save file…</p>
      <div
        style={{
          width: 320,
          height: 8,
          background: '#333',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            background: '#f59e0b',
            transition: 'width 0.15s ease',
          }}
        />
      </div>
      {message && <p style={{ fontSize: 13, color: '#aaa' }}>{message}</p>}
    </div>
  );
}
