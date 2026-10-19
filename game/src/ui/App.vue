<template>
	<RouterView />
	<SettingsPanel
		v-if="panelOpen"
		@close="hidePanel"
	/>
</template>

<script setup lang="ts">
	import { onMounted, watch } from 'vue'
	import { RouterView } from 'vue-router'
	import { applySettings } from '@/ui/applySettings.ts'
	import SettingsPanel from '@/ui/components/SettingsPanel.vue'
	import { useSettingsPanel } from '@/ui/settingsPanel.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/**
	 * The page. Two things live here because they are the page's rather than any one screen's: the
	 * settings panel, opened over whichever route is showing, and the one watch that applies the
	 * settings (step 23D, decision 7). Every store write replaces the record, so a shallow watch sees it.
	 */

	const { open: panelOpen, hide: hidePanel } = useSettingsPanel()
	const settings = useSettingsStore()

	watch(() => settings.settings, applySettings, { immediate: true })

	onMounted(() => {
		// A reload straight onto the Kitchen or the counter still gets the stored palette.
		void settings.ensureLoaded()
	})
</script>

<style>
	/* The 2am kitchen palette from DECISIONS.md section 2: deep blues, warm pools of lamp light, cold
	   blue for anything coming for the food. The chrome (--kd-panel*, --kd-text*) is deliberately
	   quieter than the board: lower contrast, so the board is the brightest thing on screen. */
	:root {
		--kd-night: #0d111d;
		--kd-night-soft: #181d30;
		--kd-lamp: #f5c66b;
		--kd-text: #cfcedc;
		--kd-text-dim: #7b809a;

		/* The HUD's own roles, added in step 8B. Named by what they are *for*, exactly as
		   render/palette.ts is, because step 23 retunes both sides at once and a variable called
		   `--kd-amber` would have to be renamed to be retuned. No hard whites anywhere: the board is
		   the brightest thing on screen (DECISIONS.md section 1). */
		--kd-panel: rgba(16, 20, 33, 0.82);
		--kd-panel-edge: rgba(245, 198, 107, 0.11);
		--kd-panel-raise: rgba(32, 38, 62, 0.9);
		/* Anything the player owns or earns: towers, crumbs, money. */
		--kd-owned: #f5c66b;
		--kd-owned-dim: rgba(245, 198, 107, 0.35);
		/* Anything coming for the food. Cold, so it never reads as yours. */
		--kd-threat: #7fa6d8;
		/* Losing something. Warm, but nothing like the lamp. */
		--kd-danger: #d97b62;
		/* What the type matrix did to a hit: the enemy tooltip's copy of render/palette.ts's three
		   DAMAGE_NUMBER colours. The tooltip is how the board's colours get learned, so the two must match. */
		--kd-hit-weak: #9a978c;
		--kd-hit-neutral: #ffe9a8;
		--kd-hit-strong: #ff9d4f;
		/* The light edge around a tower or enemy sprite: render/palette.ts's `SPRITE_HALO`, for the
		   HUD's copies of the same sprites. Change one and change the other. */
		--kd-sprite-halo: rgba(246, 228, 196, 0.8);
		--kd-radius: 0.5rem;

		/* The Kitchen between nights: the same room in daylight (step 20D). Its own roles rather than
		   the night's retuned, because both screens exist at once and step 23 retunes them apart. */
		--kd-day-sky: #dbe9f2;
		--kd-day-wall: #efe6d6;
		--kd-day-tile: #e4d8c3;
		--kd-day-counter: #b98f63;
		--kd-day-counter-top: #d6b58c;
		--kd-day-floor: #a88a6c;
		--kd-day-frame: #8a6e52;
		/* Text on a bright room: warm dark, never black. */
		--kd-day-ink: #3b3129;
		--kd-day-ink-dim: #7a6c5f;
		--kd-day-card: #fbf7f0;
		--kd-day-card-edge: #dccdb7;
		/* The money and anything bought: the lamp's amber, darkened to read on paper. */
		--kd-day-owned: #a8741c;
		--kd-day-owned-soft: #f5e2bd;
		--kd-day-danger: #b0513a;
	}

	/* The colour-blind variant: the CSS half of render/palette.ts's `setPaletteVariant`. Only the
	   roles that lean on red against green are overridden -- the HUD's "losing something" is the
	   board's `RANGE_INVALID` family, so it follows it to vermillion, against `--kd-threat`'s blue.
	   `ui/applySettings.ts` sets `document.documentElement.dataset.palette`. */
	:root[data-palette='colourblind'] {
		--kd-danger: #e6762a;
		--kd-day-danger: #b8560f;
	}

	* {
		box-sizing: border-box;
	}

	html,
	body,
	#app {
		height: 100%;
		margin: 0;
	}

	body {
		background: var(--kd-night);
		color: var(--kd-text);
		font-family: 'Segoe UI', system-ui, sans-serif;
		overflow: hidden;
	}
</style>
