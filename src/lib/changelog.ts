/**
 * App version + changelog — surfaced in Settings → Version and the update toast.
 *
 * `APP_VERSION` mirrors package.json (injected at build as `__APP_VERSION__`),
 * so it's the single source of truth shown in the sidebar footer too.
 *
 * The changelog CONTENT lives in changelogData.ts (pure data, no build-time
 * globals) so vite.config.ts can embed it into the `version.json` used by the
 * update check. To cut a release: bump `version` in package.json, then prepend
 * an entry there.
 */

export const APP_VERSION: string = __APP_VERSION__

export { CHANGELOG } from './changelogData'
export type { ChangeKind, Release, ReleaseNote } from './changelogData'
