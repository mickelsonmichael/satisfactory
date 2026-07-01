import { type ActiveView, useSave } from '../context/SaveContext';
import FileUpload from './FileUpload';

export const TOP_NAV_HEIGHT = 48;

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const VIEWS: { id: ActiveView; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'stats', label: 'Stats' },
  { id: 'recipes', label: 'Recipes' },
];

function NavButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `No ${title.toLowerCase()}` : title}
      style={{
        background: 'none',
        border: 'none',
        color: disabled ? '#3a3a3a' : '#666',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 14,
        lineHeight: 1,
        padding: '0 4px',
      }}
    >
      {label}
    </button>
  );
}

export default function TopNav({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    currentSave,
    uploadedFile,
    setUploadedFile,
    result,
    canGoNewer,
    canGoOlder,
    goNewer,
    goOlder,
    goNewest,
    goOldest,
    activeView,
    setActiveView,
  } = useSave();

  const dateLabel = uploadedFile
    ? `📁 ${uploadedFile.name}`
    : currentSave
      ? DATE_FMT.format(currentSave.timestamp * 1000)
      : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: TOP_NAV_HEIGHT,
        zIndex: 1002,
        background: 'rgba(15,15,20,0.92)',
        borderBottom: '1px solid #333',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        color: '#ddd',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        userSelect: 'none',
      }}
    >
      {/* View switcher — flush tab-link style */}
      <div style={{ display: 'flex', alignSelf: 'stretch' }}>
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            style={{
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeView === id ? '#FA9549' : 'transparent'}`,
              color: activeView === id ? '#FA9549' : '#777',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeView === id ? 600 : 400,
              padding: '0 14px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: '#333' }} />

      <span
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          whiteSpace: 'nowrap',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 220,
        }}
      >
        {result?.sessionName || 'Satisfactory Map'}
      </span>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <NavButton label="◀◀" title="Oldest save" disabled={!canGoOlder} onClick={goOldest} />
        <NavButton label="◀" title="Older save" disabled={!canGoOlder} onClick={goOlder} />
        <span
          style={{
            fontSize: 12,
            color: '#bbb',
            whiteSpace: 'nowrap',
            minWidth: 150,
            textAlign: 'center',
          }}
          title={uploadedFile?.name}
        >
          {dateLabel ?? '—'}
        </span>
        <NavButton label="▶" title="Newer save" disabled={!canGoNewer} onClick={goNewer} />
        <NavButton label="▶▶" title="Newest save" disabled={!canGoNewer} onClick={goNewest} />
      </div>

      <div style={{ flex: 1 }} />

      <FileUpload onFileSelected={setUploadedFile} />

      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          background: 'none',
          border: 'none',
          color: '#666',
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
