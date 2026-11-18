# Youtube live chat anticensor

### This project aims to hold youtube live creators accountable while preventing censorship by keeping a log of messages deleted by their moderation teams.

## Building

```sh
node scripts/build.mjs chrome    # Chrome, Edge, Brave, Opera -> dist/chrome/
node scripts/build.mjs firefox   # Firefox 140+               -> dist/firefox/
```

GitHub Actions builds both on every push and PR and uploads the zips as workflow artifacts. Pushing a `v*` tag (e.g. `v0.2.0`) sets the manifest version from the tag and attaches the zips to a GitHub release.
