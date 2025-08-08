/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REFERRER?: string
  readonly VITE_LOGO?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {}
