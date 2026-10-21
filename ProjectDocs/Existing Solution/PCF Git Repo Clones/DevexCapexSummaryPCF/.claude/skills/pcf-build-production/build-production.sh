#!/usr/bin/env bash
# =============================================================================
# pcf-build-production
# -----------------------------------------------------------------------------
# 1. Increment the CONTROL version (ControlManifest.Input.xml) patch by 1.
# 2. Increment the SOLUTION version (src/Other/Solution.xml) patch by 1.
# 3. Build the solution in Release (production PCF + packaged solution .zip)
#    via msbuild.
#
# The control renders live Dataverse data only (the old sample-data fallback was
# removed from the source), so there is no dummy-data flag to toggle here.
# Version bumps persist regardless of build outcome (rerun to bump again).
# =============================================================================
set -uo pipefail

# Repo root = three levels up from .claude/skills/pcf-build-production/
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST="$ROOT/TableConnectedToDataversePCF/ControlManifest.Input.xml"
SOLUTION_XML="$ROOT/DevexCapex_POC/src/Other/Solution.xml"
CDSPROJ="$ROOT/DevexCapex_POC/DevexCapex_POC.cdsproj"

for f in "$MANIFEST" "$SOLUTION_XML" "$CDSPROJ"; do
    [ -f "$f" ] || { echo "ERROR: required file not found: $f"; exit 1; }
done

bump_patch() { # "x.y.z" -> "x.y.(z+1)"
    local major minor patch
    IFS='.' read -r major minor patch <<< "$1"
    echo "${major}.${minor}.$((patch + 1))"
}

# --- 1. Control version ------------------------------------------------------
CTRL_VER="$(grep -oE 'constructor="DevexCapexSummaryPCF" version="[0-9]+\.[0-9]+\.[0-9]+"' "$MANIFEST" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
[ -n "$CTRL_VER" ] || { echo "ERROR: could not read control version"; exit 1; }
CTRL_NEW="$(bump_patch "$CTRL_VER")"
sed -i "s/\(constructor=\"DevexCapexSummaryPCF\" version=\)\"$CTRL_VER\"/\1\"$CTRL_NEW\"/" "$MANIFEST"
echo ">> Control version:  $CTRL_VER -> $CTRL_NEW"

# --- 2. Solution version (first <Version> only) ------------------------------
SOL_VER="$(grep -oE '<Version>[0-9]+\.[0-9]+\.[0-9]+</Version>' "$SOLUTION_XML" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$SOL_VER" ] || { echo "ERROR: could not read solution version"; exit 1; }
SOL_NEW="$(bump_patch "$SOL_VER")"
sed -i "0,/<Version>$SOL_VER<\/Version>/s//<Version>$SOL_NEW<\/Version>/" "$SOLUTION_XML"
echo ">> Solution version: $SOL_VER -> $SOL_NEW"

# --- 3. Locate msbuild and build Release -------------------------------------
MSBUILD="$(command -v msbuild || true)"
if [ -z "$MSBUILD" ]; then
    VSWHERE="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    if [ -x "$VSWHERE" ]; then
        MSBUILD="$("$VSWHERE" -latest -requires Microsoft.Component.MSBuild -find 'MSBuild/**/Bin/MSBuild.exe' 2>/dev/null | head -1)"
    fi
fi
if [ -z "$MSBUILD" ]; then
    echo "ERROR: msbuild not found on PATH or via vswhere."
    echo "       Open a 'Developer Command Prompt for VS' or add MSBuild to PATH, then rerun."
    exit 1
fi

echo ">> Building (Release) with: $MSBUILD"
# '-' switches (not '/') avoid Git Bash path mangling. Restore + Release config.
"$MSBUILD" "$CDSPROJ" -t:build -restore -p:configuration=Release
BUILD_RC=$?

if [ "$BUILD_RC" -eq 0 ]; then
    echo ">> BUILD SUCCEEDED. Solution .zip is under DevexCapex_POC/bin/Release/"
else
    echo ">> BUILD FAILED (exit $BUILD_RC). Versions were still bumped."
fi
exit "$BUILD_RC"
