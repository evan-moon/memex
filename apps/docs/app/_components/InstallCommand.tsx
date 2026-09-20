'use client';

import { useState } from 'react';
import { track } from '../../lib/analytics';

export type InstallCommandCopy = {
  command: string;
  requirement: string;
  copy: string;
  copied: string;
};

type Props = {
  copy: InstallCommandCopy;
};

export default function InstallCommand({ copy }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const written = await navigator.clipboard
      .writeText(copy.command)
      .then(() => true)
      .catch(() => false);

    setCopied(written);
    track({ name: 'cta_click', cta: 'install_cli', surface: 'hero' });
    if (written) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="get-app">
      <button className="install" type="button" onClick={onCopy}>
        <code>{copy.command}</code>
        <span className="install-hint">{copied ? copy.copied : copy.copy}</span>
      </button>
      <span className="download-meta">{copy.requirement}</span>
    </div>
  );
}
