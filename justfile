default:
    @just --list

setup:
    pnpm install --frozen-lockfile

build: setup
    pnpm exec tsc -b
    pnpm -r test
    pnpm exec eslint packages
    pnpm exec prettier --check .
