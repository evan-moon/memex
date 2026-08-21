import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { Strings } from './i18n.ts';

// A render error unmounts the whole tree and leaves a blank page, which is the
// least debuggable failure a screen can have. Show what threw instead.
export class ErrorBoundary extends Component<
  { children: ReactNode; t: Strings },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    const { t } = this.props;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--negative)' }}>
          {t.crash.title}
        </h1>
        <pre className="mt-4 overflow-auto rounded-card border border-line bg-surface p-4 text-xs">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button
          type="button"
          className="mt-4 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface"
          onClick={() => this.setState({ error: null })}
        >
          {t.common.retry}
        </button>
      </div>
    );
  }
}
