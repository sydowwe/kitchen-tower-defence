import { library } from '@fortawesome/fontawesome-svg-core'
import {
	faAnglesLeft,
	faAnglesRight,
	faArrowUp,
	faBan,
	faCheck,
	faCoins,
	faCrosshairs,
	faBolt,
	faDumbbell,
	faFeather,
	faFire,
	faFlask,
	faForward,
	faGear,
	faHandFist,
	faLock,
	faPause,
	faPlay,
	faShuffle,
	faSnowflake,
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
		faCheck,
		faTrash,
		faCoins,
		faTriangleExclamation,
		faXmark,
		// The six targeting modes, one each, for the cycling control in `hud/TargetingControl.vue`.
		// FontAwesome and not emoji: they are HUD chrome, and DECISIONS.md section 2 reserves emoji
		// for things standing on the board (step 12C, decision 4).
		faAnglesRight,
		faAnglesLeft,
		faDumbbell,
		faFeather,
		faCrosshairs,
		faShuffle,
		// The five damage types, for the enemy tooltip's matrix rows in `hud/EnemyTooltip.vue` (step 16B).
		faHandFist,
		faFire,
		faSnowflake,
		faFlask,
		faBolt,
	)
}
