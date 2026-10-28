// The tests and the recording script run in Node.js; declare only the few interfaces used instead of pulling in @types/node for them
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function readFileSync(path: string | URL): Uint8Array;
  export function writeFileSync(path: string | URL, data: string): void;
  export function existsSync(path: string | URL): boolean;
  export function readdirSync(path: string | URL): string[];
}

// vite.config.ts asks the local git for the commit hash at build time (build fingerprint, see ../../build.d.ts)
declare module 'node:child_process' {
  export function execSync(command: string, options?: { stdio?: ('ignore' | 'pipe' | 'inherit')[] }): { toString(): string };
}

declare const process: {
  env: Record<string, string | undefined>;
  // A test listens for the rejections no one handles
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};
