import type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
import type { AuthProvider, User } from '@/data/ports/index.ts'

/** Not user-scoped: it is what produces the user. */
export const ANONYMOUS_ID_KEY = 'kd:auth:anonymousId'

/**
 * One anonymous user per device, `local-<uuid>`, for as long as the key lives. `signOut` does nothing
 * in v1: a new anonymous id would orphan every save made under the old one.
 */
export function createAnonymousAuthProvider(storage: KeyValueStorage): AuthProvider {
	const listeners = new Set<(user: User | null) => void>()

	function stored(): User | null {
		const id = storage.getItem(ANONYMOUS_ID_KEY)
		return id === null || id === '' ? null : { id, isAnonymous: true }
	}

	async function currentUser(): Promise<User | null> {
		return stored()
	}

	async function signIn(): Promise<User> {
		const existing = stored()
		if (existing !== null) {
			return existing
		}
		const user: User = { id: `local-${crypto.randomUUID()}`, isAnonymous: true }
		storage.setItem(ANONYMOUS_ID_KEY, user.id)
		for (const listener of listeners) {
			listener(user)
		}
		return user
	}

	async function signOut(): Promise<void> {}

	function onChange(fn: (user: User | null) => void): () => void {
		listeners.add(fn)
		return function unsubscribe() {
			listeners.delete(fn)
		}
	}

	return { currentUser, signIn, signOut, onChange }
}
