/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Which adapters `data/index.ts` builds. Unset means 'local'. */
	readonly VITE_DATA_MODE?: 'local' | 'mock' | 'http'
	/** The mock remote's failure rate, 0 to 1. Unset means 0.05. */
	readonly VITE_MOCK_FAILURE_RATE?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
