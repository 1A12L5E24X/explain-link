# Explain — Obsidian plugin

Select a word, sentence or paragraph, right-click → **Explain**. The plugin asks an
AI model (any model on [OpenRouter](https://openrouter.ai)) to explain it, saves the
explanation as a note in a folder you choose, and turns your selection into a link to
that note. Hover the link (Page Preview) to read the explanation without leaving the page.

## Features

- **Right-click → Explain** on any selection, plus an `Explain selection` command you can bind to a hotkey.
- **Any OpenRouter model**: searchable model picker in settings (loaded from OpenRouter's model list).
- **Context-aware**: the surrounding text and note title are sent along, so "bank" in a finance note and in a river note get different explanations.
- **Linked back**: a single-line selection becomes `[[Explanations/term|term]]`. A multi-line paragraph keeps its text and gets a small `(explained)` link appended.
- **No duplicate spending**: explaining the same text again links to the existing note (toggleable).
- **Regenerate**: open an explanation note and run `Explain: Regenerate this explanation` (also the way to retry after an error).
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

## Notes

- Your API key is stored in plain text in `.obsidian/plugins/explain/data.json`. Don't commit that file if you sync your vault to a public git repo.
- The selected text and up to *Context size* characters around it are sent to OpenRouter and the model provider you chose.
