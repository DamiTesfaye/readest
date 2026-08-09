import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { forwardBackdropClickToToolbar } from '@/utils/popover';

describe('forwardBackdropClickToToolbar', () => {
  let tocButton: HTMLButtonElement;
  let tocIcon: HTMLImageElement;
  let libraryButton: HTMLButtonElement;
  let contentButton: HTMLButtonElement;
  let portalWrapper: HTMLDivElement;
  let backdrop: HTMLDivElement;

  const makeEvent = () =>
    ({
      clientX: 100,
      clientY: 20,
      currentTarget: backdrop,
    }) as unknown as React.MouseEvent<HTMLElement>;

  const stubStack = (stack: Element[]) => {
    document.elementsFromPoint = vi.fn().mockReturnValue(stack);
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="header-bar">
        <button id="toc"><img id="toc-icon" alt="" /></button>
        <button id="library"></button>
      </div>
      <main id="content"><button id="content-btn"></button></main>
      <div id="portal">
        <div id="backdrop"></div>
      </div>
    `;
    tocButton = document.getElementById('toc') as HTMLButtonElement;
    tocIcon = document.getElementById('toc-icon') as HTMLImageElement;
    libraryButton = document.getElementById('library') as HTMLButtonElement;
    contentButton = document.getElementById('content-btn') as HTMLButtonElement;
    portalWrapper = document.getElementById('portal') as HTMLDivElement;
    backdrop = document.getElementById('backdrop') as HTMLDivElement;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('forwards the click to a toolbar button under the backdrop', () => {
    const onClick = vi.fn();
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, tocIcon, tocButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent(), libraryButton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not forward when the underlying button is the excluded anchor', () => {
    const onClick = vi.fn();
    libraryButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, libraryButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent(), libraryButton);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not forward clicks landing outside the header bar', () => {
    const onClick = vi.fn();
    contentButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, contentButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not forward to disabled toolbar buttons', () => {
    const onClick = vi.fn();
    tocButton.disabled = true;
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, tocButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores the backdrop and its full-screen ancestors when hit-testing', () => {
    const onClick = vi.fn();
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, document.body, document.documentElement]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });
});
