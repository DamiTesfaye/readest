import { useEffect, useState } from 'react';
import { installFetch } from '@/services/ampleread';

let enabled: Promise<boolean> | null = null;

export const marginsPublicEnabled = (): Promise<boolean> =>
  (enabled ??= installFetch('/v1/bootstrap')
    .then((res) => res.json())
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
