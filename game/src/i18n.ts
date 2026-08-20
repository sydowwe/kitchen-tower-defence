import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, messages } from '@/ui/locales/index.ts'

export const i18n = createI18n({
	legacy: false,
	locale: DEFAULT_LOCALE,
	fallbackLocale: DEFAULT_LOCALE,
	messages,
})

/**
 * Translator for code that is not a component -- adapters mapping an HTTP error to a message, a
 * store building a notification. Components use `useI18n()` instead, which stays reactive to a
 * locale change without this indirection.
 */
export function t(key: string, named?: Record<string, unknown>): string {
	return named === undefined ? i18n.global.t(key) : i18n.global.t(key, named)
}
