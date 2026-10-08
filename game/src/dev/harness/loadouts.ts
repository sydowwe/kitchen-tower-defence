import type { LoadoutPolicy } from '@/dev/harness/types.ts'

/**
 * Whatever the loadout screen would have preselected: `tonightsLoadout`. In night mode that is the
 * oldest unlocked towers that fit, because a progress built for one night stores no "last night"; in
 * campaign mode it is last night's plus tonight's unlock. So `default` is not the same player in the
 * two modes.
 */
export const defaultLoadout: LoadoutPolicy = {
	name: 'default',
	choose() {
		return null
	},
}
