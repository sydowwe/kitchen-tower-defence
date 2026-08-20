import { library } from '@fortawesome/fontawesome-svg-core'
import {
	faArrowUp,
	faBan,
	faCoins,
	faForward,
	faGear,
	faLock,
	faPause,
	faPlay,
	faTrash,
	faTriangleExclamation,
	faVolumeHigh,
	faVolumeXmark,
	faXmark,
} from '@fortawesome/free-solid-svg-icons'

/**
 * The only file allowed to import from an icon package -- ESLint enforces it.
 *
 * Icons are registered one by one, never `library.add(fas)`: that pulls the entire solid set into
 * the bundle and defeats tree-shaking, which on a static itch.io build is load time the player
 * feels. Entities on the board are emoji; FontAwesome is for HUD chrome only.
 */
export function registerIcons(): void {
	library.add(
		faPlay,
		faPause,
		faForward,
		faGear,
		faVolumeHigh,
		faVolumeXmark,
		faLock,
		faBan,
		faArrowUp,
		faTrash,
		faCoins,
		faTriangleExclamation,
		faXmark,
	)
}
