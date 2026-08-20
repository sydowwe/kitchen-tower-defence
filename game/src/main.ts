import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { i18n } from '@/i18n.ts'
import { router } from '@/router.ts'
import { registerIcons } from '@/ui/icons.ts'
import App from '@/ui/App.vue'

/**
 * The whole bootstrap, in one file and in the order that works.
 *
 * There is no framework install layer here, deliberately: this repo shares conventions with the
 * AntiProcrastinationApp but not its shell. No component library (the board is a canvas, the HUD is
 * a hand-written CSS overlay), and no HTTP client at this layer -- axios lives inside
 * `data/adapters/http/` and is reached only through a port, so nothing is registered for it here.
 */
const app = createApp(App)

// Pinia first: it holds the metagame/session/settings state that the router guard and the HUD both
// read, so it has to exist before the first navigation resolves. It never holds the world -- see
// CLAUDE.md, "What goes in a store".
app.use(createPinia())

// Before the router, whose very first rendered view can already translate a label.
app.use(i18n)

app.use(router)

registerIcons()
app.component('FontAwesomeIcon', FontAwesomeIcon)

// TODO(step 1, item 5): construct the world and start the fixed-timestep loop here, before the
// mount, so the first painted frame already has a simulation behind it.

// Mounting behind `router.isReady()` means the first paint is the resolved route rather than a
// blank frame followed by a redirect -- it matters most for `#/editor`, whose component is a
// dynamic import.
void router.isReady().then(() => app.mount('#app'))
