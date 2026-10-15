import { useEffect, useState } from 'react';
import { callJson } from './api';

let enabled: Promise<boolean> | null = null;

// Signed in, bootstrap answers for the account (internal testers); a tester
// who signs in mid-run sees public Margins after the next app start.
export const marginsPublicEnabled = (): Promise<boolean> =>
  (enabled ??= callJson<{ features?: { marginsPublic?: unknown } }>('/v1/bootstrap', {}, true)
    .then((body) => body?.features?.marginsPublic === true)
    .catch(() => false));

export const useMarginsPublic = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void marginsPublicEnabled().then((value) => live && setOn(value));
    return () => {
      live = false;
    };
  }, []);
  return on;
};
