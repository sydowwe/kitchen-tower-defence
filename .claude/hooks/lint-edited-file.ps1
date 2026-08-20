# Lints a single file just written by Claude Code, and feeds any problems straight back.
#
# The architecture in this repo is enforced by eslint.config.js -- core/ purity, the one-way
# dependency graph, the library lanes. Those rules only fire when someone runs `npm run lint`, which
# in practice is at the end of a session, several files after the drift started. This hook moves that
# feedback to the moment the file is written.
#
# Reads the PostToolUse payload on stdin. Silent when the file is clean, out of scope, or anything
# goes wrong -- a lint hook must never be able to stop a session.

$ErrorActionPreference = 'Stop'

$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }

try { $payload = $raw | ConvertFrom-Json } catch { exit 0 }

$file = $payload.tool_input.file_path
if (-not $file) { $file = $payload.tool_response.filePath }
if (-not $file) { exit 0 }

# Only game/src sources. Docs, steps/, config and tests outside src/ are not what these rules guard.
if ($file -notmatch '(?i)[\\/]game[\\/]src[\\/].+\.(ts|vue)$') { exit 0 }

$gameDir = $file -replace '(?i)^(.*[\\/]game)[\\/]src[\\/].*$', '$1'
if (-not (Test-Path (Join-Path $gameDir 'eslint.config.js'))) { exit 0 }

# The local binary directly, not npx: npx costs a second of resolution per call, and `npx --no-install`
# fails outright here.
$eslint = Join-Path $gameDir 'node_modules\.bin\eslint.cmd'
if (-not (Test-Path $eslint)) { exit 0 }

Push-Location $gameDir
try {
	$output = & $eslint --format stylish $file 2>&1 | Out-String
	$code = $LASTEXITCODE
} catch {
	exit 0
} finally {
	Pop-Location
}

if ($code -eq 0) { exit 0 }

# Non-zero means real findings. Hand them back as context rather than blocking: the session decides
# whether to fix now or whether the rule is telling it the design drifted.
$context = "eslint reported problems in the file just written. Fix them now -- a rule in " +
"game/eslint.config.js is usually telling you the layering or determinism design drifted, not that " +
"the code needs an eslint-disable.`n`n$output"

@{
	hookSpecificOutput = @{
		hookEventName     = 'PostToolUse'
		additionalContext = $context
	}
} | ConvertTo-Json -Depth 5 -Compress | Write-Output

exit 0
