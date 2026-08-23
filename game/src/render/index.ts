export { createRenderer, LOGICAL_WIDTH, LOGICAL_HEIGHT, type Renderer } from '@/render/renderer.ts'
export {
	getGlyph,
	blitGlyph,
	preload,
	clearGlyphCache,
	glyphCacheSize,
	type GlyphRequest,
} from '@/render/glyphCache.ts'
export {
	drawTerrain,
	drawTrack,
	drawEntities,
	drawFridge,
	drawEffects,
	pushEvents,
	resetEffects,
	preloadEnemyGlyphs,
	preloadFoodGlyphs,
} from '@/render/layers/index.ts'
