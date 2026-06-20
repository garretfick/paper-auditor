default:
    @just --list

setup:
    pnpm install --frozen-lockfile

build: setup
    pnpm exec tsc -b
    pnpm -r test
    pnpm exec eslint packages
    pnpm exec prettier --check .
    just check-workflows

# Lint .github/workflows/*.yaml against the GitHub Actions schema and
# shellcheck-style issues. Uses the actionlint docker image pinned to SHA
# (falls back to a local actionlint binary if one is on PATH).
# Note: actionlint validates individual workflow files; it does not catch
# cross-workflow permission inheritance bugs between reusable callers and
# callees. Those still surface only at dispatch time.
check-workflows:
    #!/usr/bin/env bash
    set -euo pipefail
    if command -v actionlint > /dev/null 2>&1; then
        actionlint -color
    else
        docker run --rm -v "$PWD:/repo" --workdir /repo \
            rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 \
            -color
    fi

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
