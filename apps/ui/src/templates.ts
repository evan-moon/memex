import { useEffect, useState } from 'react';
import { api } from './api.ts';

// The sections each kind of note is written in. They come from the server
// because that is where the same list decides whether a save is accepted — a
// second copy here would be right until the day it was not.
export const useTemplates = () => {
  const [templates, setTemplates] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch(() => setTemplates({}));
  }, []);

  return templates;
};
