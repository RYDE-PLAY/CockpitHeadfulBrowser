#!/bin/sh
# Local developer session: never bind this unauthenticated instance publicly.
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_data="$project_dir/.dev-data"
test_config="$project_dir/.dev-config"
test_port=9099
test_ws=/usr/lib/cockpit/cockpit-ws
test -x "$test_ws" || { echo 'Install cockpit-ws first.' >&2; exit 1; }
test -f "$project_dir/dist/manifest.json" || { echo 'Build the frontend first.' >&2; exit 1; }
mkdir -p "$test_data/cockpit" "$test_config/cockpit"
ln -sfn "$project_dir/dist" "$test_data/cockpit/cockpit-browser"
cat > "$test_config/cockpit/cockpit.conf" <<'CONF'
[WebService]
Origins=http://127.0.0.1:9099 ws://127.0.0.1:9099
AllowUnencrypted=true
CONF
echo "Development instance: http://127.0.0.1:$test_port/cockpit/@localhost/cockpit-browser/index.html"
export XDG_DATA_HOME="$test_data"
export XDG_CONFIG_DIRS="$test_config"
exec "$test_ws" --address=127.0.0.1 --port="$test_port" --local-session=/usr/bin/cockpit-bridge
