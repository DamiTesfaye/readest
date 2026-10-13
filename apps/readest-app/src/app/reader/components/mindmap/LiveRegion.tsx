import React from 'react';

const LiveRegion: React.FC<{ message: string }> = ({ message }) => (
  <div
    data-testid='mm-live-region'
    className='sr-only'
    role='status'
    aria-live='polite'
    aria-atomic='true'
  >
    {message}
  </div>
);

export default LiveRegion;
