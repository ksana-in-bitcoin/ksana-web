/** Build fingerprint: the commit hash is injected by vite.config.ts (see src/build.d.ts); the repository URL links the commit hash to the source */
export const REPO_URL = 'https://github.com/ksana-in-bitcoin/ksana-web';
export const BUILD_COMMIT: string = typeof __KSANA_COMMIT__ === 'string' ? __KSANA_COMMIT__ : '';
export const commitUrl = (commit: string) => `${REPO_URL}/commit/${commit}`;
