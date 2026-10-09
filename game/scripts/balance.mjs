/**
 * `npm run balance`: Vite's dev server used as a module runner, never as a server. It brings the
 * project's own config -- the `@` alias, the JSON map imports -- with `import.meta.env.DEV` true, so
 * content is zod-validated at boot exactly as under `npm run dev`. All the work is in
 * `src/dev/harness/cli.ts`.
 */

import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
	root: fileURLToPath(new URL('..', import.meta.url)),
	// No watcher and no HMR: without them the process idles after the run instead of exiting. No
	// WebSocket either, or `--jobs`' children race for its one port.
	server: { middlewareMode: true, hmr: false, ws: false, watch: null },
	appType: 'custom',
	logLevel: 'error',
})

try {
	const cli = await server.ssrLoadModule('/src/dev/harness/cli.ts')
	// The launcher's own path, which `--jobs` forks once per shard.
	process.exitCode = await cli.main(process.argv.slice(2), { launcher: fileURLToPath(import.meta.url) })
} catch (error) {
	console.error(error)
	process.exitCode = 1
} finally {
	// Always, or a throw prints its stack and never gives the prompt back.
	await server.close()
}
