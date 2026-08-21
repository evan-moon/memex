import { useSyncExternalStore } from 'react';
import type { ApiFailure, NoteStatus } from './api.ts';

export type Locale = 'en' | 'ko';

const KEY = 'memex-locale';

const en = {
  switchLanguage: '한국어',
  app: {
    menu: 'Menu',
    overview: 'Overview',
    searchPlaceholder: 'Search  (⌘K)',
    theme: 'Theme',
    language: 'Language',
  },
  common: {
    loading: '…',
    none: 'None',
    retry: 'Try again',
    notes: (n: number) => `${n} notes`,
    staleBreakdown: (changed: number, review: number) =>
      `${changed} already changed · ${review} to review`,
  },
  time: {
    unknown: '—',
    today: 'today',
    daysAgo: (n: number) => `${n}d ago`,
    monthsAgo: (n: number) => `${n}mo ago`,
    yearsAgo: (n: number) => `${n.toFixed(1)}y ago`,
  },
  status: (status: NoteStatus) =>
    status.kind === 'amended'
      ? `Superseded by #${status.by.id} “${status.by.title}”`
      : status.kind === 'piled-up'
        ? `${status.count} newer notes have piled up since — check whether this still holds`
        : 'Recent record',
  error: (failure: ApiFailure) => {
    const messages: Record<string, string> = {
      'not-found': 'That note does not exist.',
      'draft-state-only': 'Only a state note can get an update draft.',
      'draft-no-evidence': 'There is nothing newer to reconcile this against.',
      'draft-no-claude': 'Could not find the claude CLI. Drafting needs Claude Code on your PATH.',
      'empty-body': 'The body is empty.',
      unreachable: 'Cannot reach memex — is `memex ui` still running?',
    };
    return messages[failure.code] ?? failure.detail ?? 'Something went wrong.';
  },
  thisWeek: {
    title: (days: number) => `Last ${days} days`,
    window: (days: number) => `${days}d`,
    arrived: 'What came in',
    arrivedNone: 'Nothing came in',
    spread: (notes: number, folders: number) => `${notes} notes across ${folders} folders`,
    connection: 'Today’s connection',
    connectionNone: 'Nothing far apart came close enough today',
    apart: (days: number) => `${days} days apart`,
  },
  sidebar: {
    state: 'What I believe now',
    agentShare: (n: number) => `${n} of them an agent's`,
    rule: 'Guidance',
    topics: 'Topics',
    more: (n: number) => `${n} more`,
    recordsElsewhere: (n: number) =>
      `${n} records live in the topics above — reach one by searching, not by scrolling.`,
  },
  chores: {
    title: 'Waiting on you',
    allClear: 'Nothing is waiting — the vault is tidy.',
    hypotheses: 'Hypotheses whose sources moved',
    undeclared: 'Judgements that do not say what they stand on',
    undeclaredHint: (n: number) => `${n} link to something that could be a source`,
    staleNotes: 'Notes that may no longer hold',
    staleNotesHint: (n: number) => `${n} newer notes behind it`,
    deadLinks: 'Links that open nothing',
    deadLinksHint: (notes: number) => `across ${notes} notes`,
    tagMerges: 'Tags that might be one tag',
    looseTags: 'Tags used once',
    looseTagsHint: (all: number) => `${all} counting the ones outside the vault`,
    openTags: 'Open the tag list →',
  },
  overview: {
    title: 'Overview',
    subtitle: 'What is waiting, and what came in',
    notes: 'Notes',
    passages: (n: number) => `${n} passages`,
    links: 'Links',
    linkBreakdown: (wiki: number, amends: number) => `${wiki} wiki · ${amends} corrections`,
    topics: 'Topics',
    topicsHint: 'Tags used 20 or more times',
    mayNotHold: 'Notes that may no longer hold',
    tidyTitle: 'Merge these tags?',
    tidyCount: (pairs: number, notes: number) =>
      `${pairs} pairs differing only in spelling · ${notes} notes`,
    tidyWhy: 'One subject split under two names — searching one will not find the other.',
    tidyHow: 'To clean this up, run',
    activityTitle: 'How often you write',
    activityRange: (written: number, active: number) =>
      `Last 90 days · ${written} saved · active on ${active} days`,
    saved: 'saved',
    stalenessTitle: 'How much of each topic is old news',
    stalenessHint:
      'The line is weekly activity over the past year — every tag shares one axis, so a flat right edge means the subject went quiet',
    stalenessShare: (pct: number) => `${pct}% old news`,
  },
  topics: {
    title: 'Topics',
    subtitle: (n: number) =>
      `${n} · most stale first · the line is weekly activity over the past year`,
    dormant: 'dormant',
    stillHolds: 'Still holds',
    oldNews: 'Old news',
  },
  topic: {
    subtitle: (count: number, last: string) => `${count} notes · last ${last}`,
    dormantSuffix: ' · dormant',
    stillHolds: (n: number) => `Still holds ${n}`,
    oldNews: (n: number) => `Old news ${n}`,
    outdatedEmpty: 'Nothing has gone out of date yet',
    arcFallback: 'A thread not yet tied together',
    companions: 'Where this subject gets entangled',
    companionsHint: 'Tags that share notes with this one — where the story is scattered',
    sameThing: '· likely the same word',
    overlap: (pct: number) => `· ${pct}% overlap`,
    all: (n: number) => `All ${n}`,
  },
  note: {
    openInObsidian: 'Open in Obsidian ↗',
    agent: 'agent',
    correctedBy: (n: number) => `⚠ Corrected by ${n} later ${n === 1 ? 'note' : 'notes'}`,
    newest: (title: string) => `Newest: ${title}`,
    corrects: 'What this note corrects',
    emptyBody: 'This note has no body — only a title and tags.',
    backlinks: (n: number) => `Notes referencing this one ${n}`,
    related: 'Semantically close notes',
    deadLink: 'No note with this title yet',
  },
  tags: {
    title: 'Tags that might be one tag',
    spellingTitle: 'Only the spelling differs',
    spellingHint: 'Same tag written two ways — searching one misses the other.',
    overlapTitle: 'Always seen together',
    overlapHint:
      'These sit on almost exactly the same notes. That is not proof they mean the same thing — two DAWs used in the same year look like this too. You decide.',
    merge: 'Merge',
    merging: 'Merging…',
    swap: 'Keep the other name instead',
    affects: (notes: number) => `${notes} notes`,
    overlapping: (pct: number, notes: number) => `${pct}% shared · ${notes} notes`,
    merged: (notes: number, files: number) => `Rewrote ${notes} notes (${files} files).`,
    unwritten: (n: number) => `${n} carried no tags in the file, so a reindex will undo them`,
    skipped: (n: number) => `${n} left alone outside the vault`,
    screenTitle: 'Tags',
    summary: (all: number, editable: number) => `${all} tags · ${editable} memex can rewrite`,
    onceHint: (n: number) => `${n} are used by a single note`,
    onlyOnce: 'Used once',
    filter: 'Filter tags',
    rename: 'Rename',
    renameHint: 'Enter to apply · a name that already exists merges into it',
    remove: 'Remove',
    confirmRemove: (notes: number) => `Take it off ${notes} notes?`,
    outside: 'Outside the vault',
    outsideHint: "This tag only appears in an indexed source, which is not memex's to rewrite.",
    partly: (mine: number, all: number) => `${mine} of ${all} inside the vault`,
    nothing: 'No tag matches that',
    showMore: (n: number) => `${n} more`,
  },
  edit: {
    start: 'Edit',
    correct: 'This is no longer true',
    title: 'Title',
    layer: 'Layer',
    tags: 'Tags',
    tagsHint: 'comma separated',
    body: 'Body',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    becomingPast: 'A past note cannot be edited again — corrections become new notes.',
    correctionTitle: 'Write the correction',
    correctionWhy:
      'A record of what happened cannot be rewritten, so a correction is a new note pointing back at this one.',
    createCorrection: 'Save the correction',
    missingTitle: 'Write the note this points at',
    missingWhy: 'Nothing in the vault opens under this name, in memex or in Obsidian.',
    createNote: 'Save the note',
    deadLinks: (n: number) => `Points at ${n} ${n === 1 ? 'note' : 'notes'} nobody wrote`,
    deadLinksWhy: 'Each is either a note still to write, or a name that never meant one.',
    write: 'Write it',
    landsIn: (folder: string) => `Lands in ${folder}, beside the note it corrects.`,
    vaultRoot: 'the vault root',
  },
  hypothesis: {
    onNote: 'Read out of this note',
    onNoteHint: 'A hypothesis built from this note among others. Not a record — a reading.',
    onTopic: 'Read out of these records',
    stale: 'a source has moved since',
    heading: 'Hypothesis',
    builtFrom: 'Built from',
    confidence: (value: number) => `confidence ${Math.round(value * 100)}%`,
    by: (model: string) => `synthesised by ${model}`,
    changed: 'changed since',
    missing: 'gone',
    holds: 'Every source still reads as it did.',
    shaken: 'Some of what this was read out of has moved.',
    keep: 'It still holds',
    archive: 'Discard it',
    promote: 'Make it a note',
    promoteHint:
      'Becomes a judgement you own, declaring the same records — searchable, and yours rather than the model’s.',
    bundle: 'What the model was given',
    showBundle: 'Show it',
    hideBundle: 'Hide it',
    gone: 'This hypothesis has been discarded.',
    redraft: 'Get a rewritten draft',
    redrafting: 'Drafting…',
    redraftHint: 'Claude reads the sources as they stand now and rewrites this — 1–2 minutes',
    proposed: 'What the sources now support',
    save: 'Take this draft',
    discardDraft: 'Keep the old one',
  },
  evidence: {
    title: 'What this judgement stands on',
    holds: 'Every source still reads as it did.',
    amended: (by: string) => `corrected by “${by}”`,
    changed: 'rewritten since it was declared',
    missing: 'no longer in the vault',
    accounted: 'I have read these',
    undeclared: 'This note does not say what it was built from',
    undeclaredWhy:
      'Until it does, memex can only guess which notes might have made it out of date.',
    offer: 'Declare the notes it links to as its sources?',
    declare: 'Declare these',
    edit: 'Change sources',
    remove: 'Remove',
    done: 'Done',
  },
  search: {
    title: 'Search',
    summary: (query: string, n: number) => `${query} · ${n} results`,
    filters: 'Filters',
    anyLayer: 'Any layer',
    anyAuthor: 'Anyone',
    mine: 'My memory',
    agents: 'Agent notes',
    anyFolder: 'Any folder',
    anyTag: 'Any tag',
    from: 'From',
    to: 'To',
    clear: 'Clear',
    more: 'Show more',
    collapsed: (label: string, hidden: number) => `${label} · ${hidden} more from the same series`,
    ask: (query: string) => `Search everything for “${query}”`,
    recent: 'Recently opened',
    noTitleMatch: 'No title matches — press Enter to search the text',
  },
  stale: {
    header: (n: number) => `⚠ ${n} related notes have piled up since you last touched this`,
    noChangeTitle: 'Nothing to change',
    noChangeFallback: 'It read the newer notes and found nothing that contradicts this one.',
    noChangeHint: 'Press “Still true” to clear the warning.',
    unexplained: 'It did not say why it changed things — read the diff before trusting it.',
    whyTitle: 'Why it changed',
    noteRef: (id: number) => `Note #${id}`,
    save: 'Save',
    stillTrue: 'Still true',
    redraft: 'Draft again',
    discard: 'Discard',
    took: (seconds: number) => `took ${seconds}s`,
    drafting: 'Drafting…',
    draftCta: 'Get an updated draft',
    draftingHint: 'Claude is reading the related notes — 1–2 minutes',
    idleHint: 'Takes 1–2 minutes',
    unchangedLines: (n: number) => `⋯ ${n} lines unchanged`,
  },
  spark: { title: 'Weekly activity' },
  crash: { title: 'This screen failed to render' },
};

const ko: typeof en = {
  switchLanguage: 'English',
  app: {
    menu: '메뉴',
    overview: '개요',
    searchPlaceholder: '검색  (⌘K)',
    theme: '테마',
    language: '언어',
  },
  common: {
    loading: '…',
    none: '없음',
    retry: '다시 시도',
    notes: (n) => `${n}개`,
    staleBreakdown: (changed, review) => `이미 바뀜 ${changed} · 다시 볼 것 ${review}`,
  },
  time: {
    unknown: '—',
    today: '오늘',
    daysAgo: (n) => `${n}일 전`,
    monthsAgo: (n) => `${n}개월 전`,
    yearsAgo: (n) => `${n.toFixed(1)}년 전`,
  },
  status: (status) =>
    status.kind === 'amended'
      ? `#${status.by.id} "${status.by.title}" 에서 이야기가 바뀌었어`
      : status.kind === 'piled-up'
        ? `이 뒤로 관련 기록이 ${status.count}개 쌓였어 — 아직 맞는 얘긴지 확인해봐`
        : '최근 기록',
  error: (failure) => {
    const messages: Record<string, string> = {
      'not-found': '없는 노트야.',
      'draft-state-only': 'state 노트만 갱신 초안을 만들 수 있어.',
      'draft-no-evidence': '갱신할 근거 노트가 없어.',
      'draft-no-claude':
        'claude CLI를 찾을 수 없어. 초안을 만들려면 Claude Code가 PATH에 있어야 해.',
      'empty-body': '본문이 비었어.',
      unreachable: 'memex에 연결할 수 없어 — `memex ui`가 아직 켜져 있어?',
    };
    return messages[failure.code] ?? failure.detail ?? '뭔가 잘못됐어.';
  },
  thisWeek: {
    title: (days) => `지난 ${days}일`,
    window: (days) => `${days}일`,
    arrived: '새로 들어온 것',
    arrivedNone: '들어온 게 없어',
    spread: (notes, folders) => `${folders}개 폴더에 ${notes}개`,
    connection: '오늘의 연결',
    connectionNone: '오늘은 멀리 있는 것끼리 닿은 게 없어',
    apart: (days) => `${days}일 차이`,
  },
  sidebar: {
    state: '지금 믿는 것',
    agentShare: (n) => `그중 ${n}개는 에이전트 것`,
    rule: '지침',
    topics: '주제',
    more: (n) => `${n}개 더 보기`,
    recordsElsewhere: (n) => `기록 ${n}개는 위 주제 안에 있어 — 훑지 말고 검색으로 가.`,
  },
  chores: {
    title: '손볼 것',
    allClear: '기다리는 게 없어 — 볼트가 깔끔해.',
    hypotheses: '근거가 움직인 가설',
    undeclared: '무엇에서 나왔는지 말하지 않는 판단',
    undeclaredHint: (n) => `${n}개는 근거가 될 만한 링크를 갖고 있어`,
    staleNotes: '낡았을 수 있는 노트',
    staleNotesHint: (n) => `뒤로 ${n}개 쌓임`,
    deadLinks: '아무것도 안 열리는 링크',
    deadLinksHint: (notes) => `노트 ${notes}개에 걸쳐`,
    tagMerges: '같은 태그일지도 모르는 것',
    looseTags: '한 번만 쓴 태그',
    looseTagsHint: (all) => `볼트 밖까지 세면 ${all}개`,
    openTags: '태그 목록 열기 →',
  },
  overview: {
    title: '개요',
    subtitle: '무엇이 기다리고 있고, 무엇이 들어왔나',
    notes: '노트',
    passages: (n) => `${n} 패시지`,
    links: '연결',
    linkBreakdown: (wiki, amends) => `위키 ${wiki} · 정정 ${amends}`,
    topics: '주제',
    topicsHint: '20회 이상 쓰인 태그',
    mayNotHold: '더 이상 맞지 않을 수 있는 노트',
    tidyTitle: '이 태그들, 하나로 합칠까?',
    tidyCount: (pairs, notes) => `철자만 다른 ${pairs}쌍 · 노트 ${notes}개`,
    tidyWhy: '같은 주제가 두 이름으로 갈려 있어서, 한쪽으로 검색하면 다른 쪽이 안 걸려.',
    tidyHow: '정리하려면',
    activityTitle: '쓰는 빈도',
    activityRange: (written, active) => `최근 90일 · ${written}개 저장 · ${active}일 활동`,
    saved: '저장',
    stalenessTitle: '주제별로 얼마나 지난 이야기인가',
    stalenessHint:
      '선은 최근 1년 주간 활동 — 모든 태그가 같은 축이라 오른쪽이 평평하면 손을 뗀 지 오래됐다는 뜻',
    stalenessShare: (pct) => `${pct}% 지난 얘기`,
  },
  topics: {
    title: '주제',
    subtitle: (n) => `${n}개 · 낡은 정보가 많은 순 · 선은 최근 1년 주간 활동`,
    dormant: '잠듦',
    stillHolds: '아직 맞는 얘기',
    oldNews: '지난 얘기',
  },
  topic: {
    subtitle: (count, last) => `${count}개 · 마지막 ${last}`,
    dormantSuffix: ' · 잠듦',
    stillHolds: (n) => `아직 맞는 이야기 ${n}`,
    oldNews: (n) => `지난 이야기 ${n}`,
    outdatedEmpty: '아직 바뀐 이야기가 없어',
    arcFallback: '아직 엮이지 않은 흐름',
    companions: '이 주제가 붙어 다니는 곳',
    companionsHint: '같은 노트에 함께 달린 주제 — 이 이야기가 어디로 흩어져 있는지',
    sameThing: '· 같은 말 같아',
    overlap: (pct) => `· ${pct}% 겹침`,
    all: (n) => `전체 ${n}`,
  },
  note: {
    openInObsidian: 'Obsidian에서 열기 ↗',
    agent: '에이전트',
    correctedBy: (n) => `⚠ 이후 ${n}개 노트에서 정정됐어`,
    newest: (title) => `최신: ${title}`,
    corrects: '이 노트가 정정하는 것',
    emptyBody: '본문이 없는 노트야 — 제목과 태그만 있어.',
    backlinks: (n) => `이 노트를 참조하는 노트 ${n}`,
    related: '의미상 가까운 노트',
    deadLink: '아직 없는 노트',
  },
  tags: {
    title: '같은 태그일지도 모르는 것들',
    spellingTitle: '표기만 다른 것',
    spellingHint: '같은 태그를 두 가지로 써서, 한쪽으로 검색하면 다른 쪽이 안 걸려.',
    overlapTitle: '늘 같이 다니는 것',
    overlapHint:
      '거의 같은 노트들에 함께 붙어 있어. 같은 뜻이라는 증거는 아니야 — 같은 해에 쓴 DAW 두 개도 이렇게 보여. 판단은 네가 해.',
    merge: '합치기',
    merging: '합치는 중…',
    swap: '반대 이름을 남기기',
    affects: (notes) => `노트 ${notes}개`,
    overlapping: (pct, notes) => `${pct}% 겹침 · 노트 ${notes}개`,
    merged: (notes, files) => `노트 ${notes}개 고쳤어 (파일 ${files}개).`,
    unwritten: (n) => `${n}개는 파일에 tags가 없어서 다시 index하면 되돌아가`,
    skipped: (n) => `볼트 밖 ${n}개는 건드리지 않았어`,
    screenTitle: '태그',
    summary: (all, editable) => `${all}개 · 그중 ${editable}개를 memex가 고칠 수 있어`,
    onceHint: (n) => `${n}개는 노트 하나에만 붙어 있어`,
    onlyOnce: '한 번만 쓰인 것',
    filter: '태그 거르기',
    rename: '이름 바꾸기',
    renameHint: 'Enter로 적용 · 이미 있는 이름을 쓰면 그쪽으로 합쳐져',
    remove: '지우기',
    confirmRemove: (notes) => `노트 ${notes}개에서 뗄까?`,
    outside: '볼트 밖',
    outsideHint: '색인된 외부 소스에만 있는 태그라 memex가 고칠 수 없어.',
    partly: (mine, all) => `${all}개 중 ${mine}개가 볼트 안`,
    nothing: '해당하는 태그가 없어',
    showMore: (n) => `${n}개 더 보기`,
  },
  edit: {
    start: '편집',
    correct: '이건 이제 틀렸어',
    title: '제목',
    layer: '레이어',
    tags: '태그',
    tagsHint: '쉼표로 구분',
    body: '본문',
    save: '저장',
    saving: '저장 중…',
    cancel: '취소',
    becomingPast: 'past가 되면 다시 편집할 수 없어 — 이후 수정은 정정 노트로 해야 해.',
    correctionTitle: '정정 노트 쓰기',
    correctionWhy: '일어난 일의 기록은 고쳐 쓸 수 없어서, 정정은 이 노트를 가리키는 새 노트가 돼.',
    createCorrection: '정정 노트 저장',
    missingTitle: '가리키는 노트 쓰기',
    missingWhy: '이 이름으로 열리는 노트가 볼트에 없어 — memex에서도, Obsidian에서도.',
    createNote: '노트 저장',
    deadLinks: (n) => `아직 없는 노트 ${n}개를 가리켜`,
    deadLinksWhy: '아직 안 쓴 노트거나, 애초에 노트를 뜻한 적 없는 이름이야.',
    write: '쓰기',
    landsIn: (folder) => `${folder} 에 저장돼 — 정정하는 노트 옆에.`,
    vaultRoot: '볼트 최상위',
  },
  hypothesis: {
    onNote: '이 노트에서 읽어낸 것',
    onNoteHint: '이 노트를 포함한 기록들에서 뽑은 가설이야. 기록이 아니라 읽어낸 것.',
    onTopic: '이 기록들에서 읽어낸 것',
    stale: '근거가 그 뒤로 움직였어',
    heading: '가설',
    builtFrom: '무엇에서 나왔나',
    confidence: (value) => `확신 ${Math.round(value * 100)}%`,
    by: (model) => `${model}이 합성`,
    changed: '그 뒤로 바뀜',
    missing: '사라짐',
    holds: '근거가 전부 그때 그대로야.',
    shaken: '읽어낸 근거 중 일부가 움직였어.',
    keep: '아직 맞아',
    archive: '버리기',
    promote: '노트로 만들기',
    promoteHint:
      '같은 기록을 근거로 선언한 네 판단이 돼 — 검색에 나오고, 모델 것이 아니라 네 것이 되고.',
    bundle: '모델이 받은 것',
    showBundle: '보기',
    hideBundle: '접기',
    gone: '버린 가설이야.',
    redraft: '고쳐 쓴 초안 받기',
    redrafting: '초안 쓰는 중…',
    redraftHint: 'Claude가 지금 상태의 근거를 다시 읽고 이 가설을 고쳐 써 — 1~2분',
    proposed: '근거를 다시 읽으니 이렇게 나왔어',
    save: '이 초안으로 바꾸기',
    discardDraft: '원래 것 두기',
  },
  evidence: {
    title: '이 판단이 딛고 선 기록',
    holds: '근거가 전부 그때 그대로야.',
    amended: (by) => `「${by}」에서 정정됨`,
    changed: '선언한 뒤로 내용이 바뀜',
    missing: '볼트에서 사라짐',
    accounted: '이 근거들 읽었어',
    undeclared: '이 노트는 무엇에서 나왔는지 말하지 않아',
    undeclaredWhy: '말하기 전까지 memex는 무엇이 이걸 낡게 했는지 추측만 할 수 있어.',
    offer: '이 노트가 링크한 것들을 근거로 삼을까?',
    declare: '근거로 선언',
    edit: '근거 바꾸기',
    remove: '빼기',
    done: '완료',
  },
  search: {
    title: '검색',
    summary: (query, n) => `${query} · ${n}건`,
    filters: '필터',
    anyLayer: '레이어 전체',
    anyAuthor: '누구 것이든',
    mine: '내 기억',
    agents: '에이전트 메모',
    anyFolder: '폴더 전체',
    anyTag: '태그 전체',
    from: '시작',
    to: '끝',
    clear: '지우기',
    more: '더 보기',
    collapsed: (label, hidden) => `${label} · 같은 시리즈 ${hidden}건 접힘`,
    ask: (query) => `“${query}” 전체 검색`,
    recent: '최근 본 것',
    noTitleMatch: '제목에 없어 — Enter로 본문까지 찾아',
  },
  stale: {
    header: (n) => `⚠ 이 노트를 마지막으로 손본 뒤 관련 노트 ${n}개가 쌓였어`,
    noChangeTitle: '고칠 게 없대',
    noChangeFallback: '새 노트들을 읽어봤지만 이 노트가 말하는 것과 어긋나는 게 없어.',
    noChangeHint: '경고를 끄려면 「이건 아직 맞아」를 눌러.',
    unexplained: '바꾼 이유를 안 적었어 — 근거를 확인할 수 없으니 diff를 직접 읽고 판단해줘.',
    whyTitle: '왜 이렇게 바꿨는지',
    noteRef: (id) => `노트 #${id}`,
    save: '저장',
    stillTrue: '이건 아직 맞아',
    redraft: '다시 뽑기',
    discard: '버리기',
    took: (seconds) => `${seconds}초 걸림`,
    drafting: '초안 쓰는 중…',
    draftCta: '갱신본 초안 받기',
    draftingHint: 'Claude가 관련 노트를 읽는 중 — 1~2분 걸려',
    idleHint: '1~2분 걸려',
    unchangedLines: (n) => `⋯ ${n}줄 그대로`,
  },
  spark: { title: '주간 활동' },
  crash: { title: '이 화면을 그리다 실패했어' },
};

export type Strings = typeof en;

export const dictionaries: Record<Locale, Strings> = { en, ko };

const isLocale = (value: string | null): value is Locale => value === 'en' || value === 'ko';

const storedLocale = (): Locale | null => {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(KEY);
  return isLocale(value) ? value : null;
};

const preferredLocale = (): Locale =>
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ko')
    ? 'ko'
    : 'en';

const detect = (): Locale => storedLocale() ?? preferredLocale();

const createLocaleStore = () => {
  const state = { locale: detect() };
  const listeners = new Set<() => void>();

  return {
    get: () => state.locale,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (locale: Locale) => {
      state.locale = locale;
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, locale);
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
};

const store = createLocaleStore();

export const setLocale = store.set;

export const useLocale = () => {
  const locale = useSyncExternalStore(store.subscribe, store.get, store.get);
  return {
    locale,
    t: dictionaries[locale],
    toggle: () => store.set(locale === 'ko' ? 'en' : 'ko'),
  };
};

export const useT = () => dictionaries[useSyncExternalStore(store.subscribe, store.get, store.get)];
