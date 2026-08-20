// Minimal ambient types for `archiver` (no @types/archiver published).
// L10 export step only uses: on('data'|'error'|'end'), append(buffer, {name}), finalize().
declare module 'archiver' {
  import type { Readable } from 'node:stream';

  interface ArchiverStream extends Readable {
    append(source: Buffer, opts?: { name?: string }): this;
    finalize(): void;
  }

  function archiver(format: string, options?: Record<string, unknown>): ArchiverStream;
  export default archiver;
}
