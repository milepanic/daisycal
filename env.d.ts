/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same-origin base path of the CalDAV server, e.g. `/dav`. */
  readonly VITE_DAV_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
