# Contributing

Issues and pull requests are welcome in English, Italian or Spanish. Describe the problem, expected behavior, application version and sanitized logs. Never include credentials or personal media.

Run the Docker test command in README before proposing a change. Safety regressions need integration tests: path handling, restore behavior, destination checks and rsync arguments are especially important. Keep `--delete`, destructive restore targets and Docker socket access out of this application.

Translations live in `public/i18n.js`; application diagnostic translations are in `lib/i18n.mjs`. Keep catalogue keys and placeholders identical in all languages. Technical rsync output is intentionally preserved.
