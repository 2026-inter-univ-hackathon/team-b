#!/bin/sh
set -eu
# Only copy into the build product. Never generate a credential file in source control.
output="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/odpt-config.js"
mkdir -p "$(dirname "$output")"
if [ -f "${SRCROOT}/../js/config.js" ]; then
    cp "${SRCROOT}/../js/config.js" "$output"
else
    printf '%s\n' 'window.APP_CONFIG = {};' > "$output"
    echo 'warning: ODPT config is absent; last-train search is limited to public Toei data.'
fi
