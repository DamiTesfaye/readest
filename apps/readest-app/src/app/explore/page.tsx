'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import { getExplore, refresh } from '@/services/ampleread';
import type { ExploreResponse } from '@/services/ampleread';
import ShelfRow from './components/ShelfRow';

export default function ExplorePage() {
  const _ = useTranslation();
  const [explore, setExplore] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadExplore = useCallback(async () => {
    setError(null);
    try {
      const response = await getExplore();
      setExplore(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load Explore'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExplore();
  }, [loadExplore]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh('explore');
      await loadExplore();
    } finally {
      setRefreshing(false);
    }
  }, [loadExplore]);

  return (
    <div className='explore-page bg-base-100 min-h-screen'>
      <div className='flex items-center justify-between px-4 py-6'>
        <h1 className='text-xl font-bold'>{_('Explore')}</h1>
        <button
          type='button'
          className='btn btn-sm btn-ghost'
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {_('Refresh')}
        </button>
      </div>

      {loading && (
        <div className='flex items-center justify-center py-12'>
          <span className='loading loading-spinner loading-lg' />
        </div>
      )}

      {!loading && error && (
        <div className='px-4 py-12 text-center'>
          <p className='text-error mb-4'>{error.message}</p>
          <button type='button' className='btn btn-primary btn-sm' onClick={loadExplore}>
            {_('Retry')}
          </button>
        </div>
      )}

      {!loading && !error && explore && (
        <div className='explore-shelves'>
          {explore.shelves.map((shelf) => (
            <ShelfRow key={shelf.id} shelf={shelf} />
          ))}
        </div>
      )}
    </div>
  );
}
