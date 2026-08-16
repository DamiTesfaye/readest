'use client';

import React, { useEffect, useState } from 'react';
import { MdAdd, MdDelete, MdClose, MdPalette, MdTune } from 'react-icons/md';
import { themes, type Palette } from '@/styles/themes';
import BoxedList from '@/components/settings/primitives/BoxedList';
import SettingsRow from '@/components/settings/primitives/SettingsRow';
import SettingsSwitchRow from '@/components/settings/primitives/SettingsSwitchRow';
import SettingsSelect from '@/components/settings/primitives/SettingsSelect';
import NavigationRow from '@/components/settings/primitives/NavigationRow';
import Tips from '@/components/settings/primitives/Tips';

// ---------------------------------------------------------------------------
// Per-block error boundary so one broken demo (e.g. a primitive that needs a
// provider) shows a message instead of blanking the page. Mirrors the pattern
// in playground/page.tsx.
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
        <div className='text-error flex flex-col gap-1 p-4 text-xs'>
          <span className='font-medium'>⚠ {this.props.name} failed to render in isolation</span>
          <span className='opacity-70'>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className='flex flex-col gap-4'>
      <div>
        <h2 className='text-base-content text-lg font-semibold tracking-tight'>{title}</h2>
        <p className='text-base-content/65 text-sm leading-relaxed'>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 1. Theme palettes — static swatches from the generated hex palettes in
//    themes.ts (independent of the active theme).
// ---------------------------------------------------------------------------
const PALETTE_KEYS: (keyof Palette)[] = [
  'base-100',
  'base-200',
  'base-300',
  'primary',
  'secondary',
  'accent',
];

function PaletteStrip({ palette }: { palette: Palette }) {
  return (
    <div className='border-base-200 flex overflow-hidden rounded-md border'>
      {PALETTE_KEYS.map((key) => (
        <div
          key={key}
          className='h-7 flex-1'
          style={{ backgroundColor: palette[key] }}
          title={`${key}: ${palette[key]}`}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  name,
  label,
  light,
  dark,
}: {
  name: string;
  label: string;
  light: Palette;
  dark: Palette;
}) {
  return (
    <div className='border-base-200 bg-base-100 eink-bordered flex flex-col gap-2 rounded-lg border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-base-content text-sm font-medium'>{label}</span>
        <span className='text-base-content/45 font-mono text-[10px]'>{name}</span>
      </div>
      <div className='flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <span className='text-base-content/45 w-9 text-[10px] uppercase'>light</span>
          <div className='min-w-0 flex-1'>
            <PaletteStrip palette={light} />
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-base-content/45 w-9 text-[10px] uppercase'>dark</span>
          <div className='min-w-0 flex-1'>
            <PaletteStrip palette={dark} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Token ramp — live swatches using semantic classes (reflect active theme).
// ---------------------------------------------------------------------------
function Swatch({ cls, content, label }: { cls: string; content: string; label: string }) {
  return (
    <div
      className={`border-base-300/40 flex h-16 flex-col justify-end rounded-md border p-2 ${cls} ${content}`}
    >
      <span className='text-[11px] font-medium'>{label}</span>
    </div>
  );
}

const BASE_RAMP = [
  { cls: 'bg-base-100', content: 'text-base-content', label: 'base-100' },
  { cls: 'bg-base-200', content: 'text-base-content', label: 'base-200' },
  { cls: 'bg-base-300', content: 'text-base-content', label: 'base-300' },
  { cls: 'bg-neutral', content: 'text-neutral-content', label: 'neutral' },
];
const BRAND_RAMP = [
  { cls: 'bg-primary', content: 'text-primary-content', label: 'primary' },
  { cls: 'bg-secondary', content: 'text-secondary-content', label: 'secondary' },
  { cls: 'bg-accent', content: 'text-accent-content', label: 'accent' },
];
const STATUS_RAMP = [
  { cls: 'bg-info', content: 'text-info-content', label: 'info' },
  { cls: 'bg-success', content: 'text-success-content', label: 'success' },
  { cls: 'bg-warning', content: 'text-warning-content', label: 'warning' },
  { cls: 'bg-error', content: 'text-error-content', label: 'error' },
];

// ---------------------------------------------------------------------------
// 5. Action vocabulary (DESIGN.md §4).
// ---------------------------------------------------------------------------
function ActionDemo({
  archetype,
  code,
  children,
}: {
  archetype: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className='border-base-200 bg-base-100 eink-bordered flex items-center justify-between gap-4 rounded-lg border p-3'>
      <div className='flex flex-col'>
        <span className='text-base-content text-sm font-medium'>{archetype}</span>
        <span className='text-base-content/45 font-mono text-[11px]'>{code}</span>
      </div>
      <div className='flex items-center gap-2'>{children}</div>
    </div>
  );
}

const THEME_MODES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function DesignSystemPage() {
  const [eink, setEink] = useState(false);
  const [themeName, setThemeName] = useState<string>('');
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  // Demo state for live primitives.
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [sel, setSel] = useState('contain');

  // Toggle the global e-ink attribute, restoring the original on unmount so we
  // don't leak the playground's state into the rest of the app.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-eink');
    html.setAttribute('data-eink', eink ? 'true' : 'false');
    return () => {
      if (prev === null) html.removeAttribute('data-eink');
      else html.setAttribute('data-eink', prev);
    };
  }, [eink]);

  // Live-preview a theme by setting DaisyUI's data-theme (e.g. "sepia-dark"),
  // restoring the original on unmount.
  useEffect(() => {
    if (!themeName) return;
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', `${themeName}-${mode}`);
    return () => {
      if (prev === null) html.removeAttribute('data-theme');
      else html.setAttribute('data-theme', prev);
    };
  }, [themeName, mode]);

  const themeOptions = [
    { value: '', label: 'App default (no override)' },
    ...themes.map((t) => ({ value: t.name, label: t.label })),
  ];

  return (
    <div className='bg-base-200 text-base-content min-h-screen'>
      <header className='border-base-300 bg-base-100 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3'>
        <div>
          <h1 className='text-base font-semibold'>Design system</h1>
          <p className='text-base-content/50 text-xs'>
            readest · Tailwind + DaisyUI, codified in DESIGN.md
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <label className='flex items-center gap-2 text-sm'>
            <MdPalette className='h-4 w-4 opacity-60' />
            <select
              className='select select-sm select-bordered eink-bordered'
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
            >
              {themeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <select
              className='select select-sm select-bordered eink-bordered'
              value={mode}
              onChange={(e) => setMode(e.target.value as 'light' | 'dark')}
            >
              {THEME_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex cursor-pointer items-center gap-2 text-sm'>
            <span>E-ink</span>
            <input
              type='checkbox'
              className='toggle toggle-sm'
              checked={eink}
              onChange={() => setEink((v) => !v)}
            />
          </label>
        </div>
      </header>

      <main className='mx-auto flex max-w-5xl flex-col gap-12 px-6 py-8'>
        <Section
          title='Themes'
          subtitle={`${themes.length} built-in themes, each generated from a {bg, fg, primary} seed into a full light + dark palette (src/styles/themes.ts). Pick one in the header to live-preview.`}
        >
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {themes.map((t) => (
              <ThemeCard
                key={t.name}
                name={t.name}
                label={t.label}
                light={t.colors.light}
                dark={t.colors.dark}
              />
            ))}
          </div>
        </Section>

        <Section
          title='Color tokens'
          subtitle='Semantic DaisyUI tokens — never hardcoded hex (DESIGN.md §10.7). These swatches reflect the active theme above.'
        >
          <div className='flex flex-col gap-4'>
            <div>
              <p className='text-base-content/50 mb-1.5 text-xs font-medium uppercase tracking-wide'>
                Surfaces · two-step depth
              </p>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                {BASE_RAMP.map((s) => (
                  <Swatch key={s.label} {...s} />
                ))}
              </div>
            </div>
            <div>
              <p className='text-base-content/50 mb-1.5 text-xs font-medium uppercase tracking-wide'>
                Brand · color is earned
              </p>
              <div className='grid grid-cols-3 gap-2'>
                {BRAND_RAMP.map((s) => (
                  <Swatch key={s.label} {...s} />
                ))}
              </div>
            </div>
            <div>
              <p className='text-base-content/50 mb-1.5 text-xs font-medium uppercase tracking-wide'>
                Status
              </p>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                {STATUS_RAMP.map((s) => (
                  <Swatch key={s.label} {...s} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title='Typography'
          subtitle='Inter Variable (woff2, weights 100–900). Tailwind default scale; headings use tracking-tight.'
        >
          <div className='border-base-200 bg-base-100 eink-bordered flex flex-col gap-3 rounded-lg border p-5'>
            <p className='text-2xl font-semibold tracking-tight'>The quick brown fox jumps</p>
            <p className='text-lg font-semibold tracking-tight'>Panel header · text-lg semibold</p>
            <p className='text-sm'>Body · text-sm — the canonical settings size</p>
            <p className='text-base-content/65 text-sm leading-relaxed'>
              Description · text-sm base-content/65
            </p>
            <div className='border-base-200 mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3'>
              {[300, 400, 500, 600, 700].map((w) => (
                <span key={w} style={{ fontWeight: w }} className='text-base'>
                  Inter {w}
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title='Action vocabulary'
          subtitle='Button archetypes (DESIGN.md §4). Pick one intent per surface; never raw btn.'
        >
          <div className='flex flex-col gap-2'>
            <ActionDemo archetype='Accent CTA' code='btn btn-primary'>
              <button type='button' className='btn btn-primary btn-sm eink-bordered'>
                Save
              </button>
            </ActionDemo>
            <ActionDemo archetype='Suggested' code='btn btn-neutral'>
              <button type='button' className='btn btn-neutral btn-sm'>
                Continue
              </button>
            </ActionDemo>
            <ActionDemo archetype='Flat (default secondary)' code='btn btn-ghost'>
              <button type='button' className='btn btn-ghost btn-sm'>
                Cancel
              </button>
            </ActionDemo>
            <ActionDemo archetype='Pill / circular ghost' code='btn btn-ghost btn-circle'>
              <button type='button' className='btn btn-ghost btn-circle btn-sm' aria-label='Close'>
                <MdClose className='h-4 w-4' />
              </button>
            </ActionDemo>
            <ActionDemo archetype='Destructive' code='icon-only, error'>
              <button
                type='button'
                className='btn btn-ghost btn-circle btn-sm text-error'
                aria-label='Delete'
              >
                <MdDelete className='h-4 w-4' />
              </button>
            </ActionDemo>
            <ActionDemo archetype='ListExtension · + add row' code='border + chip inverts on hover'>
              <button
                type='button'
                className='border-base-200 bg-base-100 hover:border-base-300 hover:bg-base-200/60 group eink-bordered flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors'
              >
                <span className='bg-base-200 group-hover:bg-base-content group-hover:text-base-100 flex h-5 w-5 items-center justify-center rounded-full transition-colors'>
                  <MdAdd className='h-3.5 w-3.5' />
                </span>
                Add source
              </button>
            </ActionDemo>
          </div>
        </Section>

        <Section
          title='Surface hierarchy'
          subtitle='Window → View → Card. Each tier steps the surface (DESIGN.md §3).'
        >
          <div className='bg-base-200 rounded-lg p-4'>
            <span className='text-base-content/50 text-xs'>Window · bg-base-200</span>
            <div className='bg-base-100/60 mt-2 rounded-lg p-4'>
              <span className='text-base-content/50 text-xs'>View · bg-base-100/60</span>
              <div className='border-base-200 bg-base-100 eink-bordered mt-2 rounded-lg border p-4'>
                <span className='text-base-content/50 text-xs'>Card · bg-base-100 + border</span>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title='Settings primitives'
          subtitle='The boxed-list chassis (DESIGN.md §5), rendered live with mock props.'
        >
          <DemoBoundary name='BoxedList'>
            <div className='flex flex-col gap-4'>
              <BoxedList
                title='Appearance'
                description='Boxed list with switch, select, and plain rows.'
              >
                <SettingsSwitchRow
                  label='Bionic reading'
                  description='Bold the first half of each word'
                  checked={sw1}
                  onChange={() => setSw1((v) => !v)}
                />
                <SettingsSwitchRow
                  label='Sepia tint'
                  checked={sw2}
                  onChange={() => setSw2((v) => !v)}
                />
                <SettingsRow label='Default fit' description='How fixed-layout pages scale'>
                  <SettingsSelect
                    value={sel}
                    onChange={(e) => setSel(e.target.value)}
                    options={[
                      { value: 'contain', label: 'Contain' },
                      { value: 'cover', label: 'Cover' },
                      { value: 'fill', label: 'Fill' },
                    ]}
                    ariaLabel='Default fit'
                  />
                </SettingsRow>
              </BoxedList>

              <BoxedList title='Integrations'>
                <NavigationRow
                  icon={MdTune}
                  title='Sync server'
                  status='Connected as reader@host'
                  onClick={() => {}}
                />
                <NavigationRow
                  icon={MdPalette}
                  title='Custom theme'
                  status='Tap to configure'
                  onClick={() => {}}
                />
              </BoxedList>

              <Tips>
                <li>Primitives live in src/components/settings/primitives/.</li>
                <li>Toggle E-ink in the header to see the 1px-border / no-shadow adaptation.</li>
              </Tips>
            </div>
          </DemoBoundary>
        </Section>
      </main>
    </div>
  );
}
