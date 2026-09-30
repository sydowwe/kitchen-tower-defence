import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import GameView from '@/ui/views/GameView.vue'
import KitchenView from '@/ui/views/KitchenView.vue'
import TitleView from '@/ui/views/TitleView.vue'

/**
 * Hash history, not web history: the build is deployed as static files to itch.io / GitHub Pages,
 * where there is no server to rewrite unknown paths back to index.html.
 *
 * **No guard.** Each view calls the progress store's `ensureLoaded()` and draws its own loading and
 * error states: a guard has nowhere to put an error, and mock mode fails one call in twenty.
 */
const routes: RouteRecordRaw[] = [
	{ path: '/', name: 'title', component: TitleView },
	{ path: '/kitchen', name: 'kitchen', component: KitchenView },
	{ path: '/night', name: 'night', component: GameView },

	// The map editor (step 4) is dev-only. Registering it inside an `import.meta.env.DEV` branch
	// with a dynamic import means Rollup folds the branch away in a production build and the
	// editor chunk is never emitted -- the guard is what keeps dev code out of the shipped bundle.
	...(import.meta.env.DEV
		? ([
				{
					path: '/editor',
					name: 'editor',
					component: () => import('@/dev/editor/EditorView.vue'),
				},
			] satisfies RouteRecordRaw[])
		: []),

	{ path: '/:pathMatch(.*)*', redirect: { name: 'title' } },
]

export const router = createRouter({
	history: createWebHashHistory(),
	routes,
})
