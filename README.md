# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run build:sample`    | PREVIEW only: build with the placeholder samples (`NOTES_SAMPLE=1 STORY_CHAPTERS_SAMPLE=1`) |
| `npm run assert:no-sample`| Check that `./dist/` holds no preview sample     |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying, and the preview samples

Production is `npm run build` then `npx wrangler deploy` (the preview worker:
`npx wrangler deploy --env preview`). Two flags print placeholder content on a
PREVIEW build so the owner can see a design before he writes it: `NOTES_SAMPLE=1`
(a sample note) and `STORY_CHAPTERS_SAMPLE=1` (Miami's story in three
placeholder chapters). `npm run build:sample` sets both. A sample build stamps
`<html data-story-sample>` / `data-notes-sample`, and wrangler runs
`scripts/assert-no-sample.mjs` before every deploy (`build.command` in
`wrangler.jsonc`): production refuses such a `dist/`, the preview worker takes
it. After a sample preview, run `npm run build` again before deploying to
production.

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
