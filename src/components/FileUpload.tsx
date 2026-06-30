import { useRef, useState } from 'react';

interface Props {
  onFileSelected: (file: File) => void;
}

export default function FileUpload({ onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.sav')) onFileSelected(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  }

  return (
    <button
      type="button"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      title="Upload .sav file"
      style={{
        background: 'none',
        border: 'none',
        color: dragging ? '#FA9549' : '#666',
        cursor: 'pointer',
        padding: '0 4px',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.15s',
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
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <input
        ref={inputRef}
        type="file"
        accept=".sav"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </button>
  );
}
