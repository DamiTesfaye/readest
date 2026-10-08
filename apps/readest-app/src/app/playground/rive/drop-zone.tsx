'use client';

import { useRef, useState } from 'react';
import type { LoadedRiveFile } from './file-utils';
import { validateRiveFile } from './file-utils';

interface DropZoneProps {
  onLoad: (file: LoadedRiveFile) => void;
  /** Compact variant for the toolbar once a file is already open. */
  compact?: boolean;
}

export function DropZone({ onLoad, compact = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(file: File) {
    setError(null);
    const nameError = validateRiveFile(file.name);
    if (nameError) {
      setError(nameError);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const bytesError = validateRiveFile(file.name, buffer);
      if (bytesError) {
        setError(bytesError);
        return;
      }
      onLoad({ name: file.name, size: file.size, buffer });
    } catch {
      setError(`Could not read "${file.name}".`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void ingest(file);
  }

  if (compact) {
    return (
      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => inputRef.current?.click()}
          className='border-base-300 hover:bg-base-200 eink-bordered rounded-md border px-3 py-1.5 text-sm'
        >
          Open another…
        </button>
        {error && <span className='text-error text-xs'>{error}</span>}
        <input
          ref={inputRef}
          type='file'
          accept='.riv'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ingest(file);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`eink-bordered flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-100'
      }`}
    >
      <div className='text-5xl opacity-30'>🎞️</div>
      <div className='space-y-1'>
        <p className='text-base-content text-lg font-medium'>Drop a .riv file to view it</p>
        <p className='text-base-content/60 text-sm'>or pick one from your machine</p>
      </div>
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        className='btn-primary eink-bordered rounded-md px-4 py-2 text-sm font-medium'
      >
        Choose .riv file
      </button>
      {error && <p className='text-error text-sm'>{error}</p>}
      <input
        ref={inputRef}
        type='file'
        accept='.riv'
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void ingest(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
