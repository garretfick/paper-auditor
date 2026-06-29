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

# Commit the staged version bump under <name>/<email> and create the
# annotated v<num> tag. Annotated tags (-a -m) are required so
# `git push --follow-tags` ships them alongside the commit; lightweight
# tags are silently dropped.
# Run only after `just version <num>` has updated the package.json files.
commit-version name email num:
    git -c user.name="{{name}}" -c user.email="{{email}}" \
        commit -am "Release v{{num}}"
    git -c user.name="{{name}}" -c user.email="{{email}}" \
        tag -a "v{{num}}" -m "v{{num}}"

# Bundle the CLI + runtime deps into <artifact-name>, with <version> baked in.
# Extension drives format: .tar.gz uses gzip + Unix shim, .zip uses zip + cmd shim.
# Both formats produced via bsdtar (built into modern macOS, Linux, and Windows 10+).
package version artifact-name: setup
    #!/usr/bin/env bash
    set -euo pipefail
    staging=dist/package
    rm -rf "$staging"
    mkdir -p "$staging"
    pnpm exec esbuild packages/cli/src/main.ts \
        --bundle --platform=node --format=esm \
        --banner:js="import { createRequire as __pa_createRequire } from 'node:module'; const require = __pa_createRequire(import.meta.url);" \
        --define:__PAPER_AUDITOR_VERSION__='"{{version}}"' \
        --outfile="$staging/paper-auditor.mjs"
    case '{{artifact-name}}' in
        *.tar.gz)
            cp packages/cli/shims/paper-auditor "$staging/paper-auditor"
            chmod +x "$staging/paper-auditor"
            tar -czf '{{artifact-name}}' -C "$staging" paper-auditor.mjs paper-auditor
            ;;
        *.zip)
            cp packages/cli/shims/paper-auditor.cmd "$staging/paper-auditor.cmd"
            tar -a -cf '{{artifact-name}}' -C "$staging" paper-auditor.mjs paper-auditor.cmd
            ;;
        *)
            echo "Unsupported artifact extension: {{artifact-name}} (expected .tar.gz or .zip)" >&2
            exit 1
            ;;
    esac
