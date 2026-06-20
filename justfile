default:
    @just --list

setup:
    pnpm install --frozen-lockfile

build: setup
    pnpm exec tsc -b
    pnpm -r test
    pnpm exec eslint packages
    pnpm exec prettier --check .

# Print the next minor version computed from the latest v* git tag.
# Bumps minor, resets patch to 0. If no v* tag exists, treats the
# baseline as v0.0.0 (so the first run prints 0.1.0).
get-next-version:
    #!/usr/bin/env bash
    set -euo pipefail
    last_tag=$(git describe --tags --abbrev=0 --match='v*' 2>/dev/null || echo 'v0.0.0')
    last_version="${last_tag#v}"
    major=$(echo "$last_version" | sed -E 's/^([0-9]+)\..*/\1/')
    minor=$(echo "$last_version" | sed -E 's/^[0-9]+\.([0-9]+)\..*/\1/')
    next_minor=$((minor + 1))
    echo "${major}.${next_minor}.0"

# Write <num> into the version field of every package.json in the workspace
# (root + each packages/*).
version num:
    #!/usr/bin/env bash
    set -euo pipefail
    for pkg in package.json packages/*/package.json; do
        node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); p.version=process.argv[2]; fs.writeFileSync(process.argv[1], JSON.stringify(p, null, 2) + "\n");' "$pkg" "{{num}}"
    done

# Commit the staged version bump under <name>/<email> and create the v<num> tag.
# Run only after `just version <num>` has updated the package.json files.
commit-version name email num:
    git -c user.name="{{name}}" -c user.email="{{email}}" \
        commit -am "Release v{{num}}"
    git tag "v{{num}}"
