# Releasing `@dmallory42/pi-read-url`

GitHub is the source of truth. npm is the distribution channel.

## Release workflow

From a clean `main` branch:

```bash
npm test
npm run typecheck
npm version patch
git push
git push --tags
npm publish --access public
```

Use one of:

- `npm version patch` for fixes
- `npm version minor` for backward-compatible features
- `npm version major` for breaking changes

## What `npm version` does

It automatically:

- updates `package.json`
- updates `package-lock.json`
- creates a git commit
- creates a git tag like `v0.1.1`

## Recommended release policy

- publish only from `main`
- keep `main` green (`npm test` + `npm run typecheck`)
- push commit and tag before publishing to npm
- keep GitHub tag and npm version aligned

## Example

```bash
npm version patch
git push
git push --tags
npm publish --access public
```

If the package version becomes `0.1.1`, the git tag should be `v0.1.1` and the npm package version should also be `0.1.1`.
