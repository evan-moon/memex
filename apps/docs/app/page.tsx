import { NOTIFY_ENDPOINT } from '../lib/notify';
import { latestDesktopRelease } from '../lib/release';
import GetTheApp, { type GetTheAppCopy } from './_components/GetTheApp';

const GET_THE_APP: GetTheAppCopy = {
  download: 'Download for Mac',
  requirement: 'Apple silicon · macOS 13+',
  windowsHeading: 'memex runs on Mac today.',
  windowsBody: 'Leave your email and you will hear from us the day the Windows build lands.',
  emailPlaceholder: 'you@example.com',
  notify: 'Notify me',
  notifying: 'Sending…',
  notified: 'You are on the list. We will write once, when it ships.',
  notifyFailed: 'That did not go through. Try again in a moment.',
  watchReleases: 'Watch releases on GitHub →',
};

export default async function Home() {
  const release = await latestDesktopRelease();
  const version = release?.version ?? null;

  return (
    <main className="page">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="hero">
        <span className="logo">memex</span>
        <h1 className="hero-headline">
          Make Claude smarter
          <br />
          about you.
        </h1>
        <p className="hero-hook">Your second brain, Claude&apos;s long-term memory.</p>
        <p className="hero-sub">
          memex gives Claude persistent memory across conversations, saving insights automatically
          and surfacing them semantically when you need them. All data stays on your machine. No
          cloud, no API keys.
        </p>
        <div className="hero-actions">
          <GetTheApp copy={GET_THE_APP} version={version} notifyEndpoint={NOTIFY_ENDPOINT} />
          <a
            href="https://github.com/evan-moon/memex"
            target="_blank"
            rel="noopener noreferrer"
            className="hero-ext-link"
          >
            View on GitHub →
          </a>
        </div>

        {/* ── Claude Desktop mockup ─────────────────────────── */}
        <div className="claude-ui" style={{ marginTop: '2.5rem' }}>
          <div className="claude-chrome">
            <span className="claude-dot" style={{ background: '#ff5f57' }} />
            <span className="claude-dot" style={{ background: '#ffbd2e' }} />
            <span className="claude-dot" style={{ background: '#28ca41' }} />
            <span className="claude-chrome-title">Claude</span>
          </div>

          <div className="claude-body">
            {/* Exchange 1, Search */}
            <div className="claude-user-row" style={{ animation: 'card-in 0.3s ease 0.1s both' }}>
              <div className="claude-user-bubble">
                What did we decide about the auth approach for the new API? I can&apos;t remember.
              </div>
            </div>

            <div
              className="claude-tool-indicator"
              style={{ animation: 'card-in 0.3s ease 0.4s both' }}
            >
              <span className="claude-tool-dot" />
              memex · search_notes · &ldquo;auth approach API decision&rdquo; ›
            </div>

            <div className="claude-artifact" style={{ animation: 'card-in 0.35s ease 0.6s both' }}>
              <div className="artifact-header">
                <span className="artifact-title">Search results</span>
                <span className="artifact-count">3 notes found</span>
              </div>

              <div className="note-card" style={{ animation: 'card-in 0.3s ease 0.75s both' }}>
                <div className="note-title">Auth Architecture, JWT Decision</div>
                <div className="note-meta">
                  <span className="note-date">Apr 14</span>
                  <div className="note-tags">
                    <span className="note-tag">#auth</span>
                    <span className="note-tag">#backend</span>
                    <span className="note-tag">#architecture</span>
                  </div>
                </div>
                <div className="note-snippet">
                  Chose JWT + refresh tokens over session-based auth. Rationale: stateless design
                  fits horizontal scaling plan. Refresh token rotation every 7d, stored in httpOnly
                  cookie...
                </div>
              </div>

              <div className="note-card" style={{ animation: 'card-in 0.3s ease 0.9s both' }}>
                <div className="note-title">1-on-1 Tom, API Security Review</div>
                <div className="note-meta">
                  <span className="note-date">Mar 28</span>
                  <div className="note-tags">
                    <span className="note-tag">#meeting</span>
                    <span className="note-tag">#auth</span>
                    <span className="note-tag">#people</span>
                  </div>
                </div>
                <div className="note-snippet">
                  Tom flagged: keep auth module decoupled from payment logic. Agreed to treat them
                  as separate bounded contexts with no shared DB tables...
                </div>
              </div>

              <div className="note-card" style={{ animation: 'card-in 0.3s ease 1.05s both' }}>
                <div className="note-title">Security Audit Findings, Q1</div>
                <div className="note-meta">
                  <span className="note-date">Mar 10</span>
                  <div className="note-tags">
                    <span className="note-tag">#security</span>
                    <span className="note-tag">#auth</span>
                  </div>
                </div>
                <div className="note-snippet">
                  No critical findings. Recommend adding rate limiting on /auth/token endpoint.
                  Token expiry of 15min flagged as best practice minimum...
                </div>
              </div>
            </div>

            <div className="claude-ai-row" style={{ animation: 'card-in 0.3s ease 1.2s both' }}>
              <div className="claude-avatar">C</div>
              <p className="claude-ai-text">
                Based on your notes from April 14th: you chose{' '}
                <strong style={{ color: '#ededed' }}>JWT + refresh tokens</strong> over
                session-based auth. The reasoning was that stateless tokens fit your horizontal
                scaling plan. Tom also emphasized keeping auth decoupled from payment logic,
                separate bounded contexts, no shared tables.
              </p>
            </div>

            <div className="claude-thread-divider" />

            {/* Exchange 2, Save */}
            <div className="claude-user-row" style={{ animation: 'card-in 0.3s ease 1.5s both' }}>
              <div className="claude-user-bubble">
                Good. Also save this: we&apos;ve decided to drop the legacy PHP auth module entirely
                by Q3.
              </div>
            </div>

            <div
              className="claude-tool-indicator"
              style={{ animation: 'card-in 0.3s ease 1.75s both' }}
            >
              <span className="claude-tool-dot save" />
              memex · save_note ›
            </div>

            <div className="claude-artifact" style={{ animation: 'card-in 0.3s ease 1.9s both' }}>
              <div className="note-saved">
                <span className="note-saved-icon">✓</span>
                <div className="note-saved-body">
                  <span className="note-saved-title">Legacy PHP Auth, Deprecation Decision</span>
                  <div className="note-saved-meta">
                    <span className="note-saved-label">saved · May 3</span>
                    <div className="note-tags">
                      <span className="note-tag">#auth</span>
                      <span className="note-tag">#decision</span>
                      <span className="note-tag">#roadmap</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="claude-ai-row" style={{ animation: 'card-in 0.3s ease 2.05s both' }}>
              <div className="claude-avatar">C</div>
              <p className="claude-ai-text">
                Saved to your second brain. I&apos;ll surface this whenever you&apos;re working on
                the auth migration or discussing Q3 roadmap items.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="section">
        <p className="section-label">Features</p>
        <div className="features">
          <div className="feature">
            <div className="feature-icon">~/</div>
            <div>
              <div className="feature-title">Local-first, always private</div>
              <div className="feature-desc">
                All notes are stored as Markdown files in your vault and indexed in a local SQLite
                database at <code>~/.memex/memex.db</code>. Nothing ever leaves your machine.
                Obsidian-compatible out of the box.
              </div>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">∿</div>
            <div>
              <div className="feature-title">Semantic search across languages</div>
              <div className="feature-desc">
                Finds notes by meaning, not just keywords. Powered by multilingual embeddings
                running fully offline, no API key needed. Search in English, Korean, or mix both
                freely.
              </div>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">⬡</div>
            <div>
              <div className="feature-title">MCP server for Claude</div>
              <div className="feature-desc">
                Works as an MCP server for Claude Desktop and Claude Code. Claude searches your
                notes before answering and saves insights proactively at the end of conversations,
                no extra setup needed.
              </div>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">$_</div>
            <div>
              <div className="feature-title">Standalone CLI</div>
              <div className="feature-desc">
                Add, search, tag, and browse notes from the terminal. Filter by date range with{' '}
                <code>--from</code> / <code>--to</code>. Index external directories like existing
                Obsidian vaults.
              </div>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">⇆</div>
            <div>
              <div className="feature-title">Backlinks</div>
              <div className="feature-desc">
                Link notes with <code>[[Title]]</code> syntax. <code>get_note</code> automatically
                surfaces which other notes reference it, building a graph of connected thinking
                without any manual wiring.
              </div>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">∑</div>
            <div>
              <div className="feature-title">Daily digest</div>
              <div className="feature-desc">
                <code>memex digest</code> prints a summary of everything saved in the last N days,
                grouped by folder. A quick way to review what Claude captured this week.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="section">
        <p className="section-label">Get started in 2 minutes</p>
        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <div>
              <div className="step-title">Install the app</div>
              <div className="step-desc">
                Download it, drag it to Applications, open it. On first run, the embedding model
                (~450MB) is downloaded once to{' '}
                <code
                  style={{
                    fontFamily: 'var(--font-geist-mono)',
                    fontSize: '0.82em',
                    background: 'var(--code-bg)',
                    padding: '0.1em 0.3em',
                    borderRadius: '4px',
                  }}
                >
                  ~/.memex/models/
                </code>
                .
              </div>
              <a className="step-code step-code-link" href="/download/mac">
                Download for Mac ↓
              </a>
            </div>
          </div>
          <div className="step">
            <div className="step-num">2</div>
            <div>
              <div className="step-title">Connect to Claude</div>
              <div className="step-desc">
                The app registers memex as an MCP server for you. Works with both Claude Code and
                Claude Desktop. Prefer the terminal? Install the CLI with{' '}
                <code className="step-inline">npm i -g @evan-moon/memex</code> and run{' '}
                <code className="step-inline">memex mcp install</code>.
              </div>
            </div>
          </div>
          <div className="step">
            <div className="step-num">3</div>
            <div>
              <div className="step-title">Claude remembers</div>
              <div className="step-desc">
                Claude now searches your notes before answering questions and saves important
                context at the end of conversations, automatically, without being asked.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLI reference ─────────────────────────────────────── */}
      <section className="section">
        <p className="section-label">CLI</p>
        <div className="terminal">
          <div className="term-bar">
            <span className="term-dot" style={{ background: '#ff5f57' }} />
            <span className="term-dot" style={{ background: '#ffbd2e' }} />
            <span className="term-dot" style={{ background: '#28ca41' }} />
            <span className="term-title">zsh</span>
          </div>
          <div className="term-body">
            <div className="term-line">
              <span className="term-prompt">$</span>
              <span className="term-cmd">memex search &quot;react performance tips&quot;</span>
            </div>
            <div className="term-line">
              <span className="term-out">Found 3 notes</span>
            </div>
            <div className="term-blank" />
            <div className="term-result">
              <span className="tr-title">React Server Components, notes</span>
              <span className="tr-date">Apr 29</span>
              <span className="tr-tags">#react #perf #nextjs</span>
            </div>
            <div className="term-result">
              <span className="tr-title">Memoization: when NOT to use it</span>
              <span className="tr-date">Apr 15</span>
              <span className="tr-tags">#react #hooks</span>
            </div>
            <div className="term-result">
              <span className="tr-title">Core Web Vitals deep dive</span>
              <span className="tr-date">Mar 22</span>
              <span className="tr-tags">#perf #web</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLI commands ──────────────────────────────────────── */}
      <section className="section">
        <p className="section-label">Commands</p>
        <div className="commands">
          <div className="command-row">
            <span className="cmd">memex add</span>
            <span className="cmd-desc">Add a note interactively</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex search &lt;query&gt;</span>
            <span className="cmd-desc">
              Semantic search, supports <code>--from</code>, <code>--to</code>, <code>--tag</code>
            </span>
          </div>
          <div className="command-row">
            <span className="cmd">memex digest</span>
            <span className="cmd-desc">Summary of notes saved in the last N days</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex list</span>
            <span className="cmd-desc">Browse recent notes</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex show &lt;id&gt;</span>
            <span className="cmd-desc">View full note content</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex edit &lt;id&gt;</span>
            <span className="cmd-desc">Edit a note in your editor</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex related &lt;id&gt;</span>
            <span className="cmd-desc">Find semantically related notes</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex tags</span>
            <span className="cmd-desc">List all tags with note counts</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex source add &lt;path&gt;</span>
            <span className="cmd-desc">Index an external directory (e.g. Obsidian vault)</span>
          </div>
          <div className="command-row">
            <span className="cmd">memex mcp install</span>
            <span className="cmd-desc">Register with Claude Code</span>
          </div>
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────── */}
      <section className="section">
        <p className="section-label">Privacy</p>
        <div className="privacy">
          <p>
            memex is designed for developers who don&apos;t want their notes in someone else&apos;s
            database. All data is stored locally, notes as{' '}
            <code
              style={{
                fontFamily: 'var(--font-geist-mono)',
                fontSize: '0.82em',
                background: 'var(--code-bg)',
                padding: '0.1em 0.3em',
                borderRadius: '4px',
              }}
            >
              .md
            </code>{' '}
            files in your vault, embeddings in a local SQLite database. The embedding model runs
            entirely offline using{' '}
            <code
              style={{
                fontFamily: 'var(--font-geist-mono)',
                fontSize: '0.82em',
                background: 'var(--code-bg)',
                padding: '0.1em 0.3em',
                borderRadius: '4px',
              }}
            >
              @huggingface/transformers
            </code>
            .
          </p>
          <p>
            No telemetry, no accounts, no API keys required. Works without an internet connection
            once the model is downloaded.
          </p>
        </div>
        <a
          href="https://github.com/evan-moon/memex"
          target="_blank"
          rel="noopener noreferrer"
          className="cta-link"
        >
          View source on GitHub
          <span className="cta-arrow">↗</span>
        </a>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="footer">
        <span>MIT License</span>
        <a href="https://github.com/evan-moon/memex" target="_blank" rel="noopener noreferrer">
          GitHub ↗
        </a>
        <a
          href="https://www.npmjs.com/package/@evan-moon/memex"
          target="_blank"
          rel="noopener noreferrer"
        >
          npm ↗
        </a>
      </footer>
    </main>
  );
}
