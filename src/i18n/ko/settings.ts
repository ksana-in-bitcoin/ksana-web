import type { Messages } from '..';

/** Wallet settings page (pages/wallet/Settings.tsx) */
const settings: Messages['settings'] = {
  title: '설정',
  lead: '이 설정은 이 브라우저에만 저장됩니다.',
  appearance: '모양',
  hideHint: '잔액과 금액을 ••••로 표시합니다. 공개된 곳에서 지갑을 열 때 유용합니다.',
  wallet: {
    connected: '연결됨',
    demo: '데모 계정(브라우저 내 시뮬레이터)',
    none: '아직 연결된 지갑이 없습니다.',
    disconnected: '지갑 연결을 끊었습니다',
  },
  about: {
    title: '정보',
    build: '빌드',
    unknownBuild: '알 수 없음: git 체크아웃에서 빌드되지 않음',
    chain: '체인',
    repo: '소스 코드',
    verifyHint: '이 페이지를 검증하려면 같은 커밋에서 다시 빌드해 산출물의 sha256을 비교하세요. 절차는 README.md의 「Verify this page」(이 페이지 검증) 절에 있습니다.',
  },
};

export default settings;
