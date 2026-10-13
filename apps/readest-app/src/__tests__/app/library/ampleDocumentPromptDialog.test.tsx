import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string>) =>
    options ? key.replace(/{{(\w+)}}/g, (_m, name) => options[name] ?? '') : key,
}));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AmpleDocumentPromptDialog from '@/app/library/components/AmpleDocumentPromptDialog';

afterEach(cleanup);

describe('AmpleDocumentPromptDialog', () => {
  it('names the single file format in the continue action', () => {
    render(<AmpleDocumentPromptDialog open extension='pdf' isBatch={false} onChoose={vi.fn()} />);
    expect(screen.getByText('Turbocharge your Experience')).toBeTruthy();
    expect(screen.getByText('Enhance this file for a better experience')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue as .pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open as .amp' })).toBeTruthy();
  });

  it('drops the format from the continue action for a multi-file batch', () => {
    render(<AmpleDocumentPromptDialog open extension={null} isBatch onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue as original files' })).toBeTruthy();
  });

  it('reports the chosen action', () => {
    const onChoose = vi.fn();
    render(<AmpleDocumentPromptDialog open extension='epub' isBatch={false} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open as .amp' }));
    expect(onChoose).toHaveBeenCalledWith('amp');
    fireEvent.click(screen.getByRole('button', { name: 'Continue as .epub' }));
    expect(onChoose).toHaveBeenCalledWith('continue');
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <AmpleDocumentPromptDialog open={false} extension='pdf' isBatch={false} onChoose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
