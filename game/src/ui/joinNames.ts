/**
 * `a, b and c`: the house pattern for a list of names read as a sentence -- the night summary's food,
 * the wake card's towers, the top bar's last loss.
 *
 * The separator and the word for "and" are catalogue entries (`night.listSeparator`, `general.and`),
 * handed in already translated, so this stays a plain function with no `vue-i18n` in it.
 */
export function joinNames(names: readonly string[], separator: string, and: string): string {
	if (names.length <= 1) {
		return names[0] ?? ''
	}

	const head = names.slice(0, -1).join(separator)

	return `${head} ${and} ${names[names.length - 1] ?? ''}`
}
