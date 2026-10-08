import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cdp } from 'vitest/browser';
import useShortcuts from '@/hooks/useShortcuts';

interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

const CTRL = 2;

const Harness = ({
  actions,
  inMap,
}: {
  actions: Parameters<typeof useShortcuts>[0];
  inMap: boolean;
}) => {
  useShortcuts(actions, [actions]);
  return (
    <div data-mindmap-root={inMap ? '' : undefined} tabIndex={0} data-testid='target'>
      map
    </div>
  );
};

const press = async (key: string, code: string, vk: number, modifiers = 0) => {
  const session = cdp() as unknown as CdpSession;
  await session.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    modifiers,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    modifiers,
  });
};

const pressWindowKeys = async () => {
  await press('F11', 'F11', 122);
  await press('q', 'KeyQ', 81, CTRL);
  await press('w', 'KeyW', 87, CTRL);
};

const renderWith = (inMap: boolean) => {
  const actions = {
    onToggleFullscreen: vi.fn(),
    onQuitApp: vi.fn(),
    onCloseWindow: vi.fn(),
    onGoRight: vi.fn(),
  };
  render(<Harness inMap={inMap} actions={actions} />);
  screen.getByTestId('target').focus();
  return actions;
};

const windowCalls = (actions: ReturnType<typeof renderWith>) => ({
  fullscreen: actions.onToggleFullscreen.mock.calls.length,
  quit: actions.onQuitApp.mock.calls.length,
  close: actions.onCloseWindow.mock.calls.length,
});

afterEach(cleanup);

describe('reader shortcuts with focus in the mind map, real Chromium keys', () => {
  it('handles the Window shortcuts outside the map', async () => {
    const actions = renderWith(false);
    await pressWindowKeys();
    expect(windowCalls(actions)).toEqual({ fullscreen: 1, quit: 1, close: 1 });
  });

  it('keeps reader keys out of the map but lets the Window shortcuts through', async () => {
    const actions = renderWith(true);
    await press('ArrowRight', 'ArrowRight', 39);
    expect(actions.onGoRight).not.toHaveBeenCalled();
    await pressWindowKeys();
    expect(windowCalls(actions)).toEqual({ fullscreen: 1, quit: 1, close: 1 });
  });
});
