import { viaRemote } from '@/data/adapters/mockRemote/remote.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'
import type { AuthProvider } from '@/data/ports/index.ts'

/** The "fake sign-in": the anonymous provider, slow and sometimes unreachable. */
export function createRemoteAuthProvider(inner: AuthProvider, control: MockControl): AuthProvider {
	return {
		currentUser() {
			return viaRemote(control, () => inner.currentUser())
		},
		signIn() {
			return viaRemote(control, () => inner.signIn())
		},
		signOut() {
			return viaRemote(control, () => inner.signOut())
		},
		onChange(fn) {
			return inner.onChange(fn)
		},
	}
}
