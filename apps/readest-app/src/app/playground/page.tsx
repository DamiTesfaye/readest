'use client';

import React, { useMemo, useState } from 'react';
import type { ComponentStatus, DemoEntry } from './types';
import { allDemos } from './registry';
import coupledData from './coupled-components.json';

type Coupled = {
  name: string;
  names: string[];
  path: string;
  dir: string;
  status: string;
  coupling: string[];
};
const coupled = coupledData as Coupled[];

// ---------------------------------------------------------------------------
// Per-card error boundary: a single broken demo must not blank the whole page.
// ---------------------------------------------------------------------------
class DemoBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div className='text-error flex flex-col items-center gap-1 text-center text-xs'>
          <span className='font-medium'>⚠ failed to render in isolation</span>
          <span className='opacity-70'>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_STYLES: Record<ComponentStatus, { label: string; cls: string }> = {
  used: { label: 'used', cls: 'bg-success/15 text-success border-success/30' },
  stale: { label: 'STALE', cls: 'bg-error/15 text-error border-error/30' },
  framework: { label: 'page/route', cls: 'bg-info/15 text-info border-info/30' },
  'test-only': { label: 'test-only', cls: 'bg-warning/15 text-warning border-warning/30' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status as ComponentStatus] ?? STATUS_STYLES.used;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function DemoCard({ demo }: { demo: DemoEntry }) {
  return (
    <div className='border-base-300 bg-base-100 flex flex-col overflow-hidden rounded-lg border shadow-sm'>
      <div className='border-base-300 bg-base-200/40 flex items-center justify-between gap-2 border-b px-3 py-2'>
        <span className='truncate text-sm font-semibold'>{demo.name}</span>
        <StatusBadge status={demo.status} />
      </div>
      <div className='text-base-content/40 truncate px-3 pt-1 font-mono text-[10px]'>
        {demo.sourcePath}
      </div>
      <div
        className='border-base-300/60 flex min-h-[110px] flex-1 items-center justify-center border-t border-dashed p-5'
        style={{
          backgroundImage:
            'repeating-conic-gradient(rgba(127,127,127,0.06) 0% 25%, transparent 0% 50%)',
          backgroundSize: '16px 16px',
        }}
      >
        <DemoBoundary name={demo.name}>{demo.node}</DemoBoundary>
      </div>
      {demo.notes ? (
        <div className='border-base-300 text-base-content/60 border-t px-3 py-1.5 text-xs italic'>
          {demo.notes}
        </div>
      ) : null}
    </div>
  );
}

function CoupledCard({ c }: { c: Coupled }) {
  return (
    <div className='border-base-300 bg-base-100/60 flex flex-col gap-1 rounded-md border border-dashed p-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='truncate text-sm font-medium'>{c.name}</span>
        <StatusBadge status={c.status} />
      </div>
      <div className='text-base-content/40 truncate font-mono text-[10px]'>{c.path}</div>
      {c.coupling.length > 0 ? (
        <div className='mt-0.5 flex flex-wrap gap-1'>
          {c.coupling.map((k) => (
            <span
              key={k}
              className='bg-base-300/50 text-base-content/70 rounded px-1.5 py-0.5 text-[10px]'
            >
              needs: {k}
            </span>
          ))}
        </div>
      ) : (
        <div className='text-base-content/40 text-[10px]'>
          framework entry — rendered by the router
        </div>
      )}
    </div>
  );
}

function PlaygroundInner() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'renderable' | 'coupled'>('renderable');
  const [onlyStale, setOnlyStale] = useState(false);

  const q = query.trim().toLowerCase();

  const demos = useMemo(() => {
    let list = allDemos;
    if (onlyStale) list = list.filter((d) => d.status === 'stale');
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q) || d.sourcePath.includes(q));
    return list;
  }, [q, onlyStale]);

  const coupledGroups = useMemo(() => {
    let list = coupled;
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.path.includes(q));
    const byDir: Record<string, Coupled[]> = {};
    for (const c of list) (byDir[c.dir] ||= []).push(c);
    return Object.entries(byDir).sort((a, b) => a[0].localeCompare(b[0]));
  }, [q]);

  const staleCount = allDemos.filter((d) => d.status === 'stale').length;

  return (
    <div className='bg-base-200 text-base-content min-h-screen'>
      {/* Header */}
      <header className='border-base-300 bg-base-100/95 sticky top-0 z-10 border-b backdrop-blur'>
        <div className='mx-auto max-w-7xl px-6 py-4'>
          <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
            <h1 className='text-xl font-bold'>Component Playground</h1>
            <span className='text-base-content/50 text-xs'>
              readest-app · dev tool · see <code>docs/component-inventory.md</code>
            </span>
          </div>
          <div className='text-base-content/60 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
            <span>
              <b className='text-base-content'>264</b> components total
            </span>
            <span>
              <b className='text-success'>{allDemos.length}</b> rendered live
            </span>
            <span>
              <b className='text-error'>{staleCount}</b> stale (shown)
            </span>
            <span>
              <b className='text-base-content'>{coupled.length}</b> context-coupled / pages
            </span>
          </div>

          {/* Controls */}
          <div className='mt-3 flex flex-wrap items-center gap-3'>
            <input
              type='text'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search by name or path…'
              className='border-base-300 bg-base-200 focus:border-primary w-64 rounded-md border px-3 py-1.5 text-sm outline-none'
            />
            <div className='border-base-300 inline-flex overflow-hidden rounded-md border text-sm'>
              <button
                type='button'
                onClick={() => setTab('renderable')}
                className={
                  tab === 'renderable'
                    ? 'bg-primary text-primary-content px-3 py-1.5'
                    : 'px-3 py-1.5'
                }
              >
                Live ({allDemos.length})
              </button>
              <button
                type='button'
                onClick={() => setTab('coupled')}
                className={
                  tab === 'coupled' ? 'bg-primary text-primary-content px-3 py-1.5' : 'px-3 py-1.5'
                }
              >
                Coupled ({coupled.length})
              </button>
            </div>
            {tab === 'renderable' ? (
              <label className='flex cursor-pointer items-center gap-1.5 text-sm'>
                <input
                  type='checkbox'
                  checked={onlyStale}
                  onChange={(e) => setOnlyStale(e.target.checked)}
                />
                stale only
              </label>
            ) : null}
          </div>
        </div>
      </header>

      <main className='mx-auto max-w-7xl px-6 py-6'>
        {tab === 'renderable' ? (
          <>
            <p className='text-base-content/60 mb-4 text-sm'>
              Live components rendered with mock data. Each card is isolated — a component that
              can&apos;t render standalone shows an inline error instead of breaking the page.
            </p>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {demos.map((d) => (
                <DemoCard key={d.sourcePath + d.name} demo={d} />
              ))}
            </div>
            {demos.length === 0 ? (
              <div className='text-base-content/50 py-12 text-center'>No components match.</div>
            ) : null}
          </>
        ) : (
          <>
            <p className='text-base-content/60 mb-4 text-sm'>
              These components depend on app runtime context (Zustand stores, the Tauri env, router,
              data hooks) or are Next.js pages/routes, so they aren&apos;t rendered standalone. The
              inventory still tracks their usage status.
            </p>
            <div className='flex flex-col gap-6'>
              {coupledGroups.map(([dir, items]) => (
                <section key={dir}>
                  <h2 className='text-base-content/70 mb-2 font-mono text-xs font-semibold'>
                    {dir} <span className='opacity-50'>({items.length})</span>
                  </h2>
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
                    {items.map((c) => (
                      <CoupledCard key={c.path} c={c} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function PlaygroundPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className='flex min-h-screen items-center justify-center p-8 text-center text-sm opacity-70'>
        The component playground is only available in development.
      </div>
    );
  }
  return <PlaygroundInner />;
}
