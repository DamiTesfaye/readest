import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));

import ImportMenu from '@/app/library/components/ImportMenu';

const renderMenu = (menuClassName?: string) =>
  render(
    <ImportMenu
      menuClassName={menuClassName}
      onImportBooksFromFiles={vi.fn()}
      onOpenCatalogManager={vi.fn()}
    />,
  );

const menuOf = (container: HTMLElement) =>
  container.querySelector('.dropdown-content') as HTMLElement;

afterEach(cleanup);

describe('ImportMenu', () => {
  it('floats above the layout by default so the header row keeps its height', () => {
    const { container } = renderMenu();
    expect(menuOf(container).className).not.toContain('!relative');
  });

  it('accepts a menuClassName so centered dropdowns can opt into inline positioning', () => {
    const { container } = renderMenu('!relative');
    expect(menuOf(container).className).toContain('!relative');
  });
});
