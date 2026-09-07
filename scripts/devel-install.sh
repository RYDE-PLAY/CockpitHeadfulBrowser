#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
package_name=cockpit-browser
cockpit_dir=${COCKPIT_DEVEL_DIR:-"${XDG_DATA_HOME:-$HOME/.local/share}/cockpit"}
link="$cockpit_dir/$package_name"

if [ ! -d "$project_dir/dist" ]; then
    echo "error: dist/ is missing; build the frontend first" >&2
    exit 1
fi

mkdir -p "$cockpit_dir"
if [ -e "$link" ] || [ -L "$link" ]; then
    if [ ! -L "$link" ] || [ "$(readlink -- "$link")" != "$project_dir/dist" ]; then
        echo "error: refusing to replace existing non-matching path: $link" >&2
        exit 1
    fi
else
    ln -s "$project_dir/dist" "$link"
fi

echo "Linked $link -> $project_dir/dist"
echo "This installs the frontend only; use scripts/build-deb.sh for the full runtime package."
