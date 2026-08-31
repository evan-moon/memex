'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { track } from '../../lib/analytics';
import { onWindows } from '../../lib/platform';

export type GetTheAppCopy = {
  download: string;
  requirement: string;
  windowsHeading: string;
  windowsBody: string;
  emailPlaceholder: string;
  notify: string;
  notifying: string;
  notified: string;
  notifyFailed: string;
  watchReleases: string;
};

type Props = {
  copy: GetTheAppCopy;
  version: string | null;
  notifyEndpoint: string | null;
};

type Notify = 'idle' | 'sending' | 'sent' | 'failed';

export default function GetTheApp({ copy, version, notifyEndpoint }: Props) {
  // The static HTML offers the download, which is right for everyone the app
  // runs on and for anyone reading without JavaScript. Windows is the one
  // answer that has to wait for the browser to say who is asking.
  const [windows, setWindows] = useState(false);
  const [notify, setNotify] = useState<Notify>('idle');

  useEffect(() => {
    setWindows(onWindows(navigator.userAgent));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!notifyEndpoint) return;

    const email = new FormData(event.currentTarget).get('email');
    setNotify('sending');

    const delivered = await fetch(notifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, platform: 'windows' }),
    })
      .then((response) => response.ok)
      .catch(() => false);

    setNotify(delivered ? 'sent' : 'failed');
    track({
      name: 'form_submit',
      form: 'windows_notify',
      result: delivered ? 'success' : 'failed',
    });
  };

  if (!windows) {
    return (
      <div className="get-app">
        <a
          className="download"
          href="/download/mac"
          onClick={() => track({ name: 'cta_click', cta: 'download_mac', surface: 'hero' })}
        >
          {copy.download}
        </a>
        <span className="download-meta">
          {version ? `v${version} · ${copy.requirement}` : copy.requirement}
        </span>
      </div>
    );
  }

  return (
    <div className="notify">
      <p className="notify-heading">{copy.windowsHeading}</p>
      <p className="notify-body">{copy.windowsBody}</p>
      {notify === 'sent' ? (
        <p className="notify-done">{copy.notified}</p>
      ) : notifyEndpoint ? (
        <form className="notify-form" onSubmit={submit}>
          <input
            className="notify-input"
            type="email"
            name="email"
            required
            placeholder={copy.emailPlaceholder}
            disabled={notify === 'sending'}
          />
          <button className="notify-submit" type="submit" disabled={notify === 'sending'}>
            {notify === 'sending' ? copy.notifying : copy.notify}
          </button>
        </form>
      ) : (
        <a
          className="notify-fallback"
          href="https://github.com/evan-moon/memex/releases"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track({ name: 'cta_click', cta: 'watch_releases', surface: 'hero' })}
        >
          {copy.watchReleases}
        </a>
      )}
      {notify === 'failed' && <p className="notify-error">{copy.notifyFailed}</p>}
    </div>
  );
}
