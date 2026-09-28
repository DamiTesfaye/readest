import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContextPill, { RecordMenu } from '@/app/reader/components/mindmap/ContextPill';
import FogLayer from '@/app/reader/components/mindmap/FogLayer';
import RecordView from '@/app/reader/components/mindmap/RecordView';
import { ChapterStartsContext } from '@/app/reader/components/mindmap/chapterStarts';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';

const anchor = { cfi: 'epubcfi(/6/4)', section: 2, progress: 0.2 };

const anchoredController = () => {
  const controller = createCanvasController({
    store: createMapStore([
      { ...createNodeRecord({ id: 'q', index: 'a1', x: 0, y: 200, label: 'Quote' }), anchor },
    ]),
    camera: { x: 0, y: 0, z: 1 },
  });
  controller.selection.set(['q']);
  return controller;
};

afterEach(cleanup);

describe('FogLayer', () => {
  it('shows a cluster per group with the number of nodes still hidden', () => {
    render(
      <FogLayer clusters={[{ key: '', count: 3, x: 32, y: 48, w: 256, h: 64 }]} redacted={[]} />,
    );
    const cluster = screen.getByTestId('mm-fog-cluster');
    expect(cluster.textContent).toBe('Keep reading to reveal 3 more nodes');
    expect(cluster.style.left).toBe('32px');
    expect(cluster.style.top).toBe('48px');
    expect(cluster.style.width).toBe('256px');
    expect(cluster.className).toContain('pointer-events-none');
  });

  it('keeps each fogged record box with a redacted chapter label', () => {
    render(
      <FogLayer
        clusters={[]}
        redacted={[
          { id: 'a', chapter: 7, x: 0, y: 0, w: 160, h: 64 },
          { id: 'b', chapter: null, x: 200, y: 0, w: 120, h: 40 },
        ]}
      />,
    );
    const fogged = screen.getAllByTestId('mm-fog-record');
    expect(fogged.map((element) => element.textContent)).toEqual(['Ch. 7+', 'Later']);
    expect(fogged[1]!.style.height).toBe('40px');
  });
});

describe('Jump to book availability', () => {
  it('disables the pill action when the anchor no longer resolves', () => {
    const onJumpToBook = vi.fn();
    render(
      <ContextPill
        controller={anchoredController()}
        onJumpToBook={onJumpToBook}
        canJumpToBook={() => false}
      />,
    );
    const jump = screen.getByRole('button', { name: 'Jump to book' }) as HTMLButtonElement;
    expect(jump.disabled).toBe(true);
    fireEvent.click(jump);
    expect(onJumpToBook).not.toHaveBeenCalled();
  });

  it('keeps the pill action enabled while the anchor resolves', () => {
    const onJumpToBook = vi.fn();
    render(
      <ContextPill
        controller={anchoredController()}
        onJumpToBook={onJumpToBook}
        canJumpToBook={() => true}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Jump to book' }));
    expect(onJumpToBook).toHaveBeenCalledWith(anchor);
  });

  it('marks the menu item disabled and ignores it', () => {
    const onJumpToBook = vi.fn();
    const onClose = vi.fn();
    render(
      <RecordMenu
        controller={anchoredController()}
        at={{ x: 0, y: 0 }}
        onClose={onClose}
        onJumpToBook={onJumpToBook}
        canJumpToBook={() => false}
      />,
    );
    const item = screen.getByRole('menuitem', { name: 'Jump to book' });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(onJumpToBook).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('quote captions', () => {
  const quote = {
    ...createNodeRecord({ id: 'q', index: 'a1', label: 'It is a truth', kind: 'quote' }),
    anchor: { cfi: 'epubcfi(/6/12!/4/2/1:0)', section: 5, progress: 0.3 },
  };

  const caption = (starts: readonly number[]) => {
    render(
      <ChapterStartsContext.Provider value={starts}>
        <RecordView
          record={quote}
          mapStyle='sticker'
          ariaLabel='Quote'
          pop={false}
          register={() => () => undefined}
        />
      </ChapterStartsContext.Provider>,
    );
    return screen.getByTestId('mm-record-q').textContent;
  };

  it('numbers the chapter from the TOC, not the spine section', () => {
    expect(caption([0, 0.2, 0.5])).toContain('Ch. 2 · your highlight');
  });

  it('drops the chapter number when no chapter starts before the highlight', () => {
    expect(caption([0.5])).toContain('Your highlight');
  });
});
