import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ParallelReadPrompt from '@/app/reader/components/library/ParallelReadPrompt';

const book = {
  hash: 'h1',
  format: 'EPUB',
  title: 'Moby-Dick',
  author: 'Herman Melville',
  createdAt: 0,
  updatedAt: 0,
} as Book;

afterEach(cleanup);

describe('ParallelReadPrompt', () => {
  it('shows the book being opened', () => {
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={vi.fn()}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Moby-Dick')).toBeTruthy();
  });

  it('reports each choice', () => {
    const onReadParallel = vi.fn();
    const onReadSingle = vi.fn();
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={onReadParallel}
        onReadSingle={onReadSingle}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Read in parallel' }));
    expect(onReadParallel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Read on its own' }));
    expect(onReadSingle).toHaveBeenCalledTimes(1);
  });

  it('disables parallel and explains why when it is unavailable', () => {
    const onReadParallel = vi.fn();
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel={false}
        onReadParallel={onReadParallel}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
    fireEvent.click(parallel);
    expect(onReadParallel).not.toHaveBeenCalled();
    expect(screen.getByText("Parallel read isn't available for PDF or CBZ books.")).toBeTruthy();
  });

  it('omits the explanation when parallel is available', () => {
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={vi.fn()}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Parallel read isn't available for PDF or CBZ books.")).toBeNull();
  });

  it('cancels when the backdrop is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={vi.fn()}
        onReadSingle={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(container.querySelector('.absolute.inset-0')!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
