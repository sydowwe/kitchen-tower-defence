import { en } from '@/ui/locales/en.ts'

/**
 * Every locale the app ships. Adding Slovak is: write `sk.ts` against the `Messages` type, import
 * it, add one line here. The type makes a missing key a compile error rather than a raw key
 * rendered on screen.
 */
export const messages = { en }

export type Locale = keyof typeof messages

export const DEFAULT_LOCALE: Locale = 'en'
