#!/usr/bin/env sh
# Launch the interactive TUI. Prefers an installed command, then a built
# checkout, then the TypeScript source when dependencies are installed.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if command -v discord-messages-exporter-tui >/dev/null 2>&1; then
    exec discord-messages-exporter-tui "$@"
fi

if [ -f "$here/dist/src/tui.js" ]; then
    exec node "$here/dist/src/tui.js" "$@"
fi

if [ -x "$here/node_modules/.bin/tsx" ] && [ -f "$here/src/tui.ts" ]; then
    cd "$here"
    exec "$here/node_modules/.bin/tsx" src/tui.ts "$@"
fi

echo "discord-messages-exporter is not built. Run: npm install && npm run build" >&2
exit 1
