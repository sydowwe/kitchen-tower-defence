import { computed, ref } from 'vue'
import { dataLayer } from '@/data/index.ts'
import { createTracker } from '@/ui/composables/tracked.ts'
import type { ComputedRef, Ref } from 'vue'
import type { User } from '@/data/index.ts'

export type { User } from '@/data/index.ts'

const tracker = createTracker()
const user = ref<User | null>(null)
let resolving: Promise<User> | null = null

/** The signed-in user, signing in anonymously on first need. Concurrent callers share one request. */
function ensureUser(): Promise<User> {
	if (user.value !== null) {
		return Promise.resolve(user.value)
	}
	resolving ??= tracker
		.run(async function resolveUser() {
			const auth = dataLayer().auth
			return (await auth.currentUser()) ?? (await auth.signIn())
		})
		.then(
			function signedIn(found) {
				user.value = found
				return found
			},
			function failed(cause: unknown) {
				resolving = null
				throw cause
			},
		)
	return resolving
}

async function signIn(): Promise<User> {
	const found = await tracker.run(() => dataLayer().auth.signIn())
	user.value = found
	return found
}

async function signOut(): Promise<void> {
	await tracker.run(() => dataLayer().auth.signOut())
}

export interface UseAuth {
	user: Readonly<Ref<User | null>>
	isAuthenticated: ComputedRef<boolean>
	isAnonymous: ComputedRef<boolean>
	loading: Readonly<Ref<boolean>>
	error: Readonly<Ref<Error | null>>
	ensureUser(): Promise<User>
	signIn(): Promise<User>
	signOut(): Promise<void>
}

const isAuthenticated = computed(() => user.value !== null)
const isAnonymous = computed(() => user.value?.isAnonymous ?? true)

export function useAuth(): UseAuth {
	return {
		user,
		isAuthenticated,
		isAnonymous,
		loading: tracker.loading,
		error: tracker.error,
		ensureUser,
		signIn,
		signOut,
	}
}
