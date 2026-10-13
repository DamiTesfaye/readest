import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));

import { ElementView } from '@/app/reader/components/margins/ElementView';
import type { Element } from '@/services/margins/payload';

const play = (shapes: object[]) =>
  ({
    id: 'p1',
    kind: 'play',
    frame: { x: 0.5, y: 0.6, w: 0.8, r: 0 },
    contract: 'displace',
    alt: 'A sun pushes the words aside',
    shapes,
    poses: [],
  }) as unknown as Element;

describe('ElementView play', () => {
  afterEach(cleanup);

  it('shows a badge named by alt and a Play button', () => {
    const onPlay = vi.fn();
    render(
      <ElementView
        element={play([{ id: 's1', type: 'circle', r: 3, pad: 0.4 }])}
        selected={false}
        editable={false}
        onPlay={onPlay}
      />,
    );
    expect(screen.getByRole('group', { name: 'A sun pushes the words aside' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('asks for a newer AmpleRead for unknown shape types', () => {
    render(
      <ElementView
        element={play([{ id: 'a', type: 'asset', asset: 'ast_1' }])}
        selected={false}
        editable={false}
      />,
    );
    expect(screen.getByText('This part needs a newer AmpleRead')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
