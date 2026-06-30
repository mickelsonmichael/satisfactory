// Spinner ring shared by the map overlay and the page-level loader.
function Spinner() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '3px solid rgba(250,149,73,0.18)',
        borderTopColor: '#FA9549',
        animation: 'sf-spin 0.75s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

// Full-screen overlay shown while the save file is being parsed on the map view.
interface OverlayProps {
  visible: boolean;
  message: string;
}

export default function LoadingOverlay({ visible, message }: OverlayProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Spinner />
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: 0.2 }}>
          Parsing save file…
        </p>
        {message && (
          <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>{message}</p>
        )}
      </div>
    </div>
  );
}

// Inline loader for the Stats / Recipes page views.
interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message }: PageLoaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        height: '50vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Spinner />
      {message && (
        <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{message}</p>
      )}
    </div>
  );
}
