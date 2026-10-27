# Explain — Obsidian plugin

Select a word, sentence or paragraph, right-click → **Explain**. The plugin asks an
AI model (any model on [OpenRouter](https://openrouter.ai)) to explain it, saves the
explanation as a note in a folder you choose, and turns your selection into a link to
that note. Hover the link (Page Preview) to read the explanation without leaving the page.

## Features

- **Right-click → Explain** on any selection, plus an `Explain selected text` command you can bind to a hotkey.
- **Any OpenRouter model**: searchable model picker in settings (loaded from OpenRouter's model list).
- **Context-aware**: the surrounding text and note title are sent along, so "bank" in a finance note and in a river note get different explanations.
- **Linked back**: a single-line selection becomes `[[Explanations/term|term]]`. A multi-line paragraph keeps its text and gets a small `(explained)` link appended.
- **No duplicate spending**: explaining the same text again links to the existing note (toggleable).
- **Regenerate**: open an explanation note and run `Explain: Regenerate explanation in current note` (also the way to retry after an error).
- Each note stores `explain-source`, `explain-from` (link to the source note), `explain-model` and `created` in frontmatter, so you can query them with Dataview/Bases.
- Editable system prompt and prompt template (`{{text}}`, `{{context}}`, `{{title}}`, `{{kind}}`).
- Works on desktop and mobile (uses Obsidian's `requestUrl`, no CORS issues).

## Install (manual)

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json` and `styles.css` into
`<your vault>/.obsidian/plugins/explain/`, then enable **Explain** under
Settings → Community plugins. Open the plugin settings and paste your OpenRouter API key
(<https://openrouter.ai/keys>).

For development, `npm run dev` rebuilds on every change.

## Disclosures

- **Network use:** when you run Explain, the selected text, the current note's title and up to
  *Context size* characters of surrounding text are sent to [OpenRouter](https://openrouter.ai)
  and from there to the model provider you picked. The plugin also fetches OpenRouter's public
  model list for the model picker. Nothing is sent anywhere else, and there is no telemetry.
- **Account required:** you need an OpenRouter account and API key. Most models are paid per
  token and billed by OpenRouter; some models are free.
- **API key storage:** your key is stored in plain text in `.obsidian/plugins/explain/data.json`.
  Don't commit that file if you sync your vault to a public git repo.

## Releasing

1. `npm version patch` (or `minor` / `major`) updates `package.json`, `manifest.json` and
   `versions.json` and creates a matching git tag (no `v` prefix).
2. `git push --follow-tags`. The Release workflow builds the plugin and creates a draft
   GitHub release with `main.js`, `manifest.json` and `styles.css`.
3. Publish the draft release on GitHub.

## License

[MIT](LICENSE)
