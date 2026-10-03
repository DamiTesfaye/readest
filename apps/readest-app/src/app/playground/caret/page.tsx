'use client';

import { useRef, useState } from 'react';

import { useCaretLookX } from '@/hooks/useCaretLookX';

const SAMPLE_LTR = 'the quick brown fox jumps over the lazy dog';
const SAMPLE_RTL = 'الثعلب البني السريع يقفز فوق الكلب الكسول';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix }: NumberFieldProps) {
  return (
    <label className='flex items-center justify-between gap-3 text-xs'>
      <span className='text-base-content/70 whitespace-nowrap'>{label}</span>
      <span className='flex items-center gap-2'>
        <input
          type='range'
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className='range range-xs w-32'
        />
        <span className='w-14 text-right tabular-nums'>
          {value}
          {suffix}
        </span>
      </span>
    </label>
  );
}

export default function CaretHarnessPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [aspectWidth, setAspectWidth] = useState(675);
  const [aspectHeight, setAspectHeight] = useState(445);
  const [insetX, setInsetX] = useState(13);
  const [insetTop, setInsetTop] = useState(39);
  const [fieldHeight, setFieldHeight] = useState(28);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [rtl, setRtl] = useState(false);

  const { lookX, isTyping } = useCaretLookX(inputRef);
  const input = inputRef.current;
  const markerPercent = ((lookX + 1) / 2) * 100;

  return (
    <div className='bg-base-200 text-base-content min-h-screen p-6'>
      <header className='mx-auto mb-6 max-w-5xl'>
        <h1 className='text-base font-semibold'>Caret → lookX harness</h1>
        <p className='text-base-content/50 text-xs'>
          Mounts the real useCaretLookX hook. No Rive file involved — this measures the input only.
        </p>
      </header>

      <main className='mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem]'>
        <section className='flex flex-col gap-6'>
          <div className='bg-base-100 rounded-lg p-6'>
            <div
              className='border-base-300 relative mx-auto w-full max-w-md border border-dashed'
              style={{ aspectRatio: `${aspectWidth}/${aspectHeight}` }}
            >
              <div
                className='bg-base-200 absolute flex items-center rounded-full'
                style={{
                  left: `${insetX}%`,
                  right: `${insetX}%`,
                  top: `${insetTop}%`,
                  height: `${fieldHeight}%`,
                }}
              >
                <input
                  ref={inputRef}
                  type='text'
                  dir={rtl ? 'rtl' : 'ltr'}
                  spellCheck={false}
                  placeholder='type here'
                  className='w-full bg-transparent px-4 font-sans font-light focus:outline-none'
                  style={{ fontSize: `${fontSize}px`, letterSpacing: `${letterSpacing}px` }}
                />
              </div>
            </div>
          </div>

          <div className='bg-base-100 flex flex-col gap-4 rounded-lg p-6'>
            <div className='flex items-baseline justify-between'>
              <span className='text-sm font-medium'>lookX</span>
              <span className='font-mono text-2xl tabular-nums'>{lookX.toFixed(3)}</span>
            </div>

            <div className='relative h-8'>
              <div className='bg-base-300 absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full' />
              <div className='bg-base-content/30 absolute left-1/2 top-0 h-full w-px' />
              <div
                className='bg-primary absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-75'
                style={{ left: `${markerPercent}%` }}
              />
            </div>
            <div className='text-base-content/40 flex justify-between text-xs'>
              <span>-1</span>
              <span>0</span>
              <span>+1</span>
            </div>

            <dl className='grid grid-cols-2 gap-x-6 gap-y-1 text-xs'>
              <dt className='text-base-content/60'>isTyping</dt>
              <dd className='text-right font-mono'>{String(isTyping)}</dd>
              <dt className='text-base-content/60'>selectionStart</dt>
              <dd className='text-right font-mono'>{input?.selectionStart ?? '—'}</dd>
              <dt className='text-base-content/60'>scrollLeft</dt>
              <dd className='text-right font-mono'>{input ? Math.round(input.scrollLeft) : '—'}</dd>
              <dt className='text-base-content/60'>clientWidth</dt>
              <dd className='text-right font-mono'>{input?.clientWidth ?? '—'}</dd>
            </dl>
          </div>
        </section>

        <aside className='bg-base-100 flex flex-col gap-3 rounded-lg p-5'>
          <h2 className='text-sm font-medium'>Geometry</h2>
          <NumberField
            label='Artboard W'
            value={aspectWidth}
            onChange={setAspectWidth}
            min={100}
            max={1200}
            step={5}
          />
          <NumberField
            label='Artboard H'
            value={aspectHeight}
            onChange={setAspectHeight}
            min={100}
            max={1200}
            step={5}
          />
          <NumberField
            label='Inset X'
            value={insetX}
            onChange={setInsetX}
            min={0}
            max={40}
            suffix='%'
          />
          <NumberField
            label='Top'
            value={insetTop}
            onChange={setInsetTop}
            min={0}
            max={90}
            suffix='%'
          />
          <NumberField
            label='Field H'
            value={fieldHeight}
            onChange={setFieldHeight}
            min={5}
            max={100}
            suffix='%'
          />

          <h2 className='mt-2 text-sm font-medium'>Text</h2>
          <NumberField
            label='Font size'
            value={fontSize}
            onChange={setFontSize}
            min={8}
            max={32}
            suffix='px'
          />
          <NumberField
            label='Tracking'
            value={letterSpacing}
            onChange={setLetterSpacing}
            min={-2}
            max={8}
            step={0.5}
            suffix='px'
          />
          <label className='flex items-center justify-between text-xs'>
            <span className='text-base-content/70'>RTL</span>
            <input
              type='checkbox'
              className='toggle toggle-sm'
              checked={rtl}
              onChange={(e) => setRtl(e.target.checked)}
            />
          </label>

          <h2 className='mt-2 text-sm font-medium'>Fill</h2>
          <div className='flex flex-wrap gap-2'>
            {[
              { label: 'short', text: 'hello' },
              { label: 'overflow', text: `${SAMPLE_LTR} ${SAMPLE_LTR}` },
              { label: 'arabic', text: SAMPLE_RTL },
            ].map(({ label, text }) => (
              <button
                key={label}
                className='btn btn-xs'
                onClick={() => {
                  const field = inputRef.current;
                  if (!field) return;
                  field.focus();
                  field.value = text;
                  field.setSelectionRange(text.length, text.length);
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
