export default function KoHome() {
  return (
    <>
      <main className="page">

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="hero">
          <span className="logo">memex</span>
          <h1 className="hero-headline">
            Claude가 당신을<br />더 잘 알게 하세요.
          </h1>
          <p className="hero-hook">당신의 세컨드 브레인, Claude의 장기 기억.</p>
          <p className="hero-sub">
            memex는 Claude에게 대화를 넘나드는 영구 메모리를 제공합니다, 인사이트를
            자동으로 저장하고, 필요할 때 의미적으로 찾아냅니다.
            모든 데이터는 내 컴퓨터에만 저장됩니다. 클라우드도, API 키도 필요 없습니다.
          </p>
          <div className="hero-actions">
            <code className="install">npm install -g @evan-moon/memex</code>
            <a
              href="https://github.com/evan-moon/memex"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-ext-link"
            >
              GitHub에서 보기 →
            </a>
          </div>

          {/* ── Claude Desktop mockup ─────────────────────────── */}
          <div className="claude-ui" style={{ marginTop: "2.5rem" }}>
            <div className="claude-chrome">
              <span className="claude-dot" style={{ background: "#ff5f57" }} />
              <span className="claude-dot" style={{ background: "#ffbd2e" }} />
              <span className="claude-dot" style={{ background: "#28ca41" }} />
              <span className="claude-chrome-title">Claude</span>
            </div>

            <div className="claude-body">

              {/* Exchange 1, Search */}
              <div className="claude-user-row" style={{ animation: "card-in 0.3s ease 0.1s both" }}>
                <div className="claude-user-bubble">
                  새 API 인증 방식 어떻게 결정했었지? 기억이 안 나네.
                </div>
              </div>

              <div className="claude-tool-indicator" style={{ animation: "card-in 0.3s ease 0.4s both" }}>
                <span className="claude-tool-dot" />
                memex · search_notes · &ldquo;인증 방식 API 결정&rdquo; ›
              </div>

              <div className="claude-artifact" style={{ animation: "card-in 0.35s ease 0.6s both" }}>
                <div className="artifact-header">
                  <span className="artifact-title">검색 결과</span>
                  <span className="artifact-count">3개 노트 발견</span>
                </div>

                <div className="note-card" style={{ animation: "card-in 0.3s ease 0.75s both" }}>
                  <div className="note-title">인증 아키텍처, JWT 결정</div>
                  <div className="note-meta">
                    <span className="note-date">4월 14일</span>
                    <div className="note-tags">
                      <span className="note-tag">#인증</span>
                      <span className="note-tag">#백엔드</span>
                      <span className="note-tag">#아키텍처</span>
                    </div>
                  </div>
                  <div className="note-snippet">
                    세션 기반 인증 대신 JWT + 리프레시 토큰 방식 선택. 이유: 수평 확장 계획에
                    스테이트리스 설계가 적합. 리프레시 토큰 7일 로테이션, httpOnly 쿠키 저장...
                  </div>
                </div>

                <div className="note-card" style={{ animation: "card-in 0.3s ease 0.9s both" }}>
                  <div className="note-title">1on1 준호, API 보안 리뷰</div>
                  <div className="note-meta">
                    <span className="note-date">3월 28일</span>
                    <div className="note-tags">
                      <span className="note-tag">#미팅</span>
                      <span className="note-tag">#인증</span>
                      <span className="note-tag">#사람</span>
                    </div>
                  </div>
                  <div className="note-snippet">
                    준호가 지적: 인증 모듈을 결제 로직과 분리할 것. DB 테이블을 공유하지 않는
                    별도의 바운디드 컨텍스트로 처리하기로 합의...
                  </div>
                </div>

                <div className="note-card" style={{ animation: "card-in 0.3s ease 1.05s both" }}>
                  <div className="note-title">보안 감사 결과, Q1</div>
                  <div className="note-meta">
                    <span className="note-date">3월 10일</span>
                    <div className="note-tags">
                      <span className="note-tag">#보안</span>
                      <span className="note-tag">#인증</span>
                    </div>
                  </div>
                  <div className="note-snippet">
                    치명적 이슈 없음. /auth/token 엔드포인트에 레이트 리밋 추가 권고.
                    토큰 만료 15분이 보안 모범 사례 최솟값으로 지적됨...
                  </div>
                </div>
              </div>

              <div className="claude-ai-row" style={{ animation: "card-in 0.3s ease 1.2s both" }}>
                <div className="claude-avatar">C</div>
                <p className="claude-ai-text">
                  4월 14일 노트 기준으로: 세션 기반 인증 대신 <strong style={{ color: "#ededed" }}>JWT + 리프레시 토큰</strong>을
                  선택했습니다. 수평 확장 계획에 스테이트리스 토큰이 적합하다는 이유였습니다.
                  준호도 인증과 결제 로직 분리를 강조했고, 테이블을 공유하지 않는 별도 컨텍스트로 합의했습니다.
                </p>
              </div>

              <div className="claude-thread-divider" />

              {/* Exchange 2, Save */}
              <div className="claude-user-row" style={{ animation: "card-in 0.3s ease 1.5s both" }}>
                <div className="claude-user-bubble">
                  좋아. 이것도 저장해줘: 레거시 PHP 인증 모듈은 Q3까지 완전히 제거하기로 결정했어.
                </div>
              </div>

              <div className="claude-tool-indicator" style={{ animation: "card-in 0.3s ease 1.75s both" }}>
                <span className="claude-tool-dot save" />
                memex · save_note ›
              </div>

              <div className="claude-artifact" style={{ animation: "card-in 0.3s ease 1.9s both" }}>
                <div className="note-saved">
                  <span className="note-saved-icon">✓</span>
                  <div className="note-saved-body">
                    <span className="note-saved-title">레거시 PHP 인증, 제거 결정</span>
                    <div className="note-saved-meta">
                      <span className="note-saved-label">저장됨 · 5월 3일</span>
                      <div className="note-tags">
                        <span className="note-tag">#인증</span>
                        <span className="note-tag">#결정</span>
                        <span className="note-tag">#로드맵</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="claude-ai-row" style={{ animation: "card-in 0.3s ease 2.05s both" }}>
                <div className="claude-avatar">C</div>
                <p className="claude-ai-text">
                  세컨드 브레인에 저장했습니다. 인증 마이그레이션 작업이나 Q3 로드맵 이야기가
                  나올 때 자동으로 꺼내드릴게요.
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────── */}
        <section className="section">
          <p className="section-label">기능</p>
          <div className="features">
            <div className="feature">
              <div className="feature-icon">~/</div>
              <div>
                <div className="feature-title">로컬 우선, 완전 프라이빗</div>
                <div className="feature-desc">
                  모든 노트는 Markdown 파일로 vault에 저장되고 <code>~/.memex/memex.db</code>의
                  로컬 SQLite 데이터베이스에 인덱싱됩니다. 데이터는 절대 외부로 나가지 않습니다.
                  Obsidian과 즉시 호환됩니다.
                </div>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">∿</div>
              <div>
                <div className="feature-title">다국어 시맨틱 검색</div>
                <div className="feature-desc">
                  키워드가 아닌 의미로 노트를 찾습니다. 완전 오프라인으로 동작하는
                  다국어 임베딩 기반, API 키가 필요 없습니다.
                  한국어, 영어, 혼용 모두 자유롭게 검색 가능합니다.
                </div>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">⬡</div>
              <div>
                <div className="feature-title">Claude용 MCP 서버</div>
                <div className="feature-desc">
                  Claude Desktop과 Claude Code의 MCP 서버로 동작합니다. Claude가
                  답하기 전 자동으로 노트를 검색하고, 대화가 끝나면 인사이트를
                  능동적으로 저장합니다, 별도 설정 없이.
                </div>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">$_</div>
              <div>
                <div className="feature-title">독립 CLI</div>
                <div className="feature-desc">
                  터미널에서 노트를 추가, 검색, 태그, 탐색할 수 있습니다. <code>--from</code> /
                  <code>--to</code>로 날짜 범위 필터링. 기존 Obsidian vault 등 외부
                  디렉터리를 인덱싱할 수 있습니다.
                </div>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">⇆</div>
              <div>
                <div className="feature-title">백링크</div>
                <div className="feature-desc">
                  <code>[[제목]]</code> 문법으로 노트를 연결합니다. <code>get_note</code>가
                  어떤 노트들이 이 노트를 참조하는지 자동으로 찾아줍니다, 수동 연결 없이도
                  사고의 그래프가 만들어집니다.
                </div>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">∑</div>
              <div>
                <div className="feature-title">데일리 다이제스트</div>
                <div className="feature-desc">
                  <code>memex digest</code>로 최근 N일간 저장된 내용을 폴더별로 요약합니다.
                  이번 주 Claude가 무엇을 캡처했는지 빠르게 확인하는 방법입니다.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section className="section">
          <p className="section-label">2분이면 시작할 수 있습니다</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div>
                <div className="step-title">설치</div>
                <div className="step-desc">
                  CLI를 전역으로 설치합니다. 첫 실행 시 임베딩 모델(~450MB)이
                  <code style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.82em", background: "var(--code-bg)", padding: "0.1em 0.3em", borderRadius: "4px" }}>~/.memex/models/</code>에 한 번만 다운로드됩니다.
                </div>
                <span className="step-code">npm install -g @evan-moon/memex</span>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div>
                <div className="step-title">Claude에 연결</div>
                <div className="step-desc">
                  memex를 MCP 서버로 등록합니다. Claude Code와 Claude Desktop 모두 지원합니다.
                </div>
                <span className="step-code">memex mcp install</span>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <div className="step-title">Claude가 기억합니다</div>
                <div className="step-desc">
                  이제 Claude는 질문에 답하기 전 노트를 검색하고, 대화가 끝나면 중요한
                  컨텍스트를 자동으로 저장합니다, 따로 요청하지 않아도.
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
              <span className="term-dot" style={{ background: "#ff5f57" }} />
              <span className="term-dot" style={{ background: "#ffbd2e" }} />
              <span className="term-dot" style={{ background: "#28ca41" }} />
              <span className="term-title">zsh</span>
            </div>
            <div className="term-body">
              <div className="term-line">
                <span className="term-prompt">$</span>
                <span className="term-cmd">memex search &quot;react 성능 최적화&quot;</span>
              </div>
              <div className="term-line">
                <span className="term-out">3개 노트 발견</span>
              </div>
              <div className="term-blank" />
              <div className="term-result">
                <span className="tr-title">React 서버 컴포넌트, 노트</span>
                <span className="tr-date">4월 29일</span>
                <span className="tr-tags">#react #perf #nextjs</span>
              </div>
              <div className="term-result">
                <span className="tr-title">메모이제이션: 쓰면 안 되는 경우</span>
                <span className="tr-date">4월 15일</span>
                <span className="tr-tags">#react #hooks</span>
              </div>
              <div className="term-result">
                <span className="tr-title">Core Web Vitals 심층 분석</span>
                <span className="tr-date">3월 22일</span>
                <span className="tr-tags">#perf #web</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── CLI commands ──────────────────────────────────────── */}
        <section className="section">
          <p className="section-label">명령어</p>
          <div className="commands">
            <div className="command-row">
              <span className="cmd">memex add</span>
              <span className="cmd-desc">인터랙티브하게 노트 추가</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex search &lt;query&gt;</span>
              <span className="cmd-desc">시맨틱 검색, <code>--from</code>, <code>--to</code>, <code>--tag</code> 지원</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex digest</span>
              <span className="cmd-desc">최근 N일간 저장된 노트 요약</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex list</span>
              <span className="cmd-desc">최근 노트 목록 탐색</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex show &lt;id&gt;</span>
              <span className="cmd-desc">노트 전체 내용 보기</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex edit &lt;id&gt;</span>
              <span className="cmd-desc">에디터에서 노트 편집</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex related &lt;id&gt;</span>
              <span className="cmd-desc">의미적으로 연관된 노트 찾기</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex tags</span>
              <span className="cmd-desc">태그 목록과 노트 수 확인</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex source add &lt;path&gt;</span>
              <span className="cmd-desc">외부 디렉터리 인덱싱 (예: Obsidian vault)</span>
            </div>
            <div className="command-row">
              <span className="cmd">memex mcp install</span>
              <span className="cmd-desc">Claude Code에 등록</span>
            </div>
          </div>
        </section>

        {/* ── Privacy ───────────────────────────────────────────── */}
        <section className="section">
          <p className="section-label">프라이버시</p>
          <div className="privacy">
            <p>
              memex는 자신의 노트를 다른 사람의 서버에 저장하고 싶지 않은 개발자를 위해
              만들어졌습니다. 모든 데이터는 로컬에만 저장됩니다, 노트는 vault의
              <code style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.82em", background: "var(--code-bg)", padding: "0.1em 0.3em", borderRadius: "4px" }}>.md</code> 파일로,
              임베딩은 로컬 SQLite 데이터베이스에. 임베딩 모델은
              <code style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.82em", background: "var(--code-bg)", padding: "0.1em 0.3em", borderRadius: "4px" }}>@huggingface/transformers</code>를
              사용해 완전 오프라인으로 동작합니다.
            </p>
            <p>
              텔레메트리, 계정, API 키가 필요 없습니다. 모델 다운로드 후 인터넷 연결 없이 동작합니다.
            </p>
          </div>
          <a
            href="https://github.com/evan-moon/memex"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link"
          >
            GitHub에서 소스 보기
            <span className="cta-arrow">↗</span>
          </a>
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="footer">
          <span>MIT 라이선스</span>
          <a href="https://github.com/evan-moon/memex" target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
          <a href="https://www.npmjs.com/package/@evan-moon/memex" target="_blank" rel="noopener noreferrer">
            npm ↗
          </a>
        </footer>

      </main>
    </>
  );
}
