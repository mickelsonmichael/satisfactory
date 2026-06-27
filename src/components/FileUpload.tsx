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
    // Reset so the same file can be re-uploaded
    e.target.value = '';
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#f59e0b' : '#555'}`,
        borderRadius: 6,
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 13,
        color: dragging ? '#f59e0b' : '#ccc',
        textAlign: 'center',
        transition: 'border-color 0.15s, color 0.15s',
        userSelect: 'none',
      }}
    >
      Upload .sav file
      <input
        ref={inputRef}
        type="file"
        accept=".sav"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}
