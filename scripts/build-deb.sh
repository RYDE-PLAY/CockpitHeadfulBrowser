#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=${VERSION:-0.1.0}
if ! dpkg --validate-version "$version" >/dev/null 2>&1; then
    echo "error: invalid Debian package version: $version" >&2
    exit 1
fi
output_dir=${OUTPUT_DIR:-"$project_dir"}
package_name=cockpit-browser
artifact="$output_dir/${package_name}_${version}_all.deb"

for asset in index.js index.css; do
    if [ ! -f "$project_dir/dist/$asset" ] && [ ! -f "$project_dir/dist/$asset.gz" ]; then
        echo "error: required built asset is missing: dist/$asset (or .gz)" >&2
        exit 1
    fi
done

for required in dist/index.html dist/manifest.json \
    backend/session.py backend/cockpit-browser.service packaging/debian/control \
    packaging/debian/postinst packaging/debian/prerm LICENSE docs/INSTALL.zh-CN.md; do
    if [ ! -e "$project_dir/$required" ]; then
        echo "error: required prebuilt/package input is missing: $required" >&2
        exit 1
    fi
done

if [ ! -d "$project_dir/dist" ]; then
    echo "error: dist exists but is not a directory" >&2
    exit 1
fi

mkdir -p "$output_dir"
stage=$(mktemp -d "${TMPDIR:-/tmp}/cockpit-browser-deb.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM

mkdir -p "$stage/DEBIAN" \
    "$stage/usr/share/cockpit/cockpit-browser" \
    "$stage/usr/libexec/cockpit-browser" \
    "$stage/usr/lib/systemd/user" \
    "$stage/usr/share/doc/cockpit-browser"

cp -a "$project_dir/dist/." "$stage/usr/share/cockpit/cockpit-browser/"
cp "$project_dir/backend/session.py" "$stage/usr/libexec/cockpit-browser/session.py"
cp "$project_dir/backend/cockpit-browser.service" "$stage/usr/lib/systemd/user/cockpit-browser.service"
sed "s/^Version: .*/Version: $version/" "$project_dir/packaging/debian/control" > "$stage/DEBIAN/control"
cp "$project_dir/packaging/debian/postinst" "$stage/DEBIAN/postinst"
cp "$project_dir/packaging/debian/prerm" "$stage/DEBIAN/prerm"
cp "$project_dir/LICENSE" "$stage/usr/share/doc/cockpit-browser/copyright"
cp "$project_dir/docs/INSTALL.zh-CN.md" "$stage/usr/share/doc/cockpit-browser/INSTALL.zh-CN.md"

chmod 0755 "$stage/DEBIAN/postinst" "$stage/DEBIAN/prerm" "$stage/usr/libexec/cockpit-browser/session.py"
chmod 0644 "$stage/usr/lib/systemd/user/cockpit-browser.service"

dpkg-deb --build --root-owner-group "$stage" "$artifact" >/dev/null
echo "$artifact"
