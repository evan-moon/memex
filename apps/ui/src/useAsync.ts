import { useEffect, useState } from 'react';
import { type ApiFailure, toFailure } from './api.ts';

export const useAsync = <T>(load: () => Promise<T>, key: string) => {
  const [state, setState] = useState<{ data: T | null; failure: ApiFailure | null }>({
    data: null,
    failure: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: key identifies the request
  useEffect(() => {
    let alive = true;
    setState({ data: null, failure: null });
    load()
      .then((data) => alive && setState({ data, failure: null }))
      .catch((error: unknown) => alive && setState({ data: null, failure: toFailure(error) }));
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
};
