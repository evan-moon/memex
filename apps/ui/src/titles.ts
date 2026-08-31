import { useEffect, useRef } from 'react';
import { api } from './api.ts';

// Read once per editor and handed to completion as a getter: the list is only
// wanted the moment someone types `[[`, and fetching it then would arrive after
// the menu had already decided it had nothing to show.
export const useVaultTitles = () => {
  const titles = useRef<string[]>([]);

  useEffect(() => {
    api
      .titles()
      .then((rows) => {
        titles.current = rows.map((row) => row.title);
      })
      .catch(() => {});
  }, []);

  return () => titles.current;
};
