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
          border: '1px solid #444',
          borderRadius: 6,
          color: '#888',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: '5px 7px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        ⚙
      </button>
    </div>
  );
}
