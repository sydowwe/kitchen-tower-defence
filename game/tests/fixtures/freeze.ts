/** Freezes every object and array reachable from `value`, so a write anywhere throws. */
export function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		for (const child of Object.values(value)) {
			deepFreeze(child)
		}
		Object.freeze(value)
	}
	return value
}
