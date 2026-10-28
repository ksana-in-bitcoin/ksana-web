import type { Messages } from '..';

const blocks: Messages['blocks'] = {
  eyebrow: 'Ksana',
  title: '블록',

  tip: (h: string) => `최신 블록 #${h}`,
  avgInterval: (d: string, n: number) => `평균 블록 간격 ${d}(최근 ${n}개 블록)`,
  empty: (n: number) => `빈 블록 ${n.toLocaleString('en-US')}개`,
  emptyOfLoaded: (n: number, loaded: number) => `빈 블록 ${n.toLocaleString('en-US')}개(불러온 블록 ${loaded.toLocaleString('en-US')}개 중)`,
  side: (n: number, pct: string) => `병렬 블록 ${n.toLocaleString('en-US')}개(${pct}%)`,
  sideOfLoaded: (n: number, loaded: number) => `병렬 블록 ${n.toLocaleString('en-US')}개(불러온 블록 ${loaded.toLocaleString('en-US')}개에 병합됨)`,
  sideHint: '같은 높이의 병렬 블록은 다음 체인 블록에 병합되며, 폐기되지 않습니다.',

  jump: '높이로 이동',
  view: '블록 보기',
  main: '체인 블록',
  sideTab: '병렬 블록',
  hideEmpty: '빈 블록 숨기기',
  fetching: (n: number) => `노드에서 이전 블록 ${n.toLocaleString('en-US')}개를 가져오는 중…`,
  noSide: '아직 병렬 블록 없음',
  noBlocks: '블록 없음',

  pagination: '페이지 이동',
  newer: '더 최근',
  older: '더 이전',
  page: (p: number, total: number) => `${p} / ${total} 페이지`,
};

export default blocks;
