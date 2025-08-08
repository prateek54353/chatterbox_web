### ChatterBOX — React + TypeScript + Vite AI Chat UI

Beautiful, fast chat interface powered by Pollinations AI endpoints. Includes Markdown rendering, streaming responses, basic image generation, and a clean Tailwind UI.

![Build](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/ci.yml?branch=main)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tech](https://img.shields.io/badge/React-19-61dafb?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript) ![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8?logo=tailwindcss)

---

### Key Features

- Conversational UI with smooth streaming responses
- Markdown support with GFM and automatic code copy buttons
- Local conversation persistence in the browser
- Image generation helper via Pollinations image endpoint
- Clean, responsive Tailwind layout with dark theme
- Zero backend to start; works with public endpoints via fetch

### Tech Stack

- React 19, TypeScript 5, Vite 7
- Tailwind CSS 4
- ESLint 9 with React Hooks and React Refresh rules

### Getting Started

Prerequisites:
- Node.js 18+ (LTS recommended)
- npm (bundled with Node)

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Configuration

Environment variables (optional):
- `VITE_LOGO`: Custom logo path or URL for the sidebar
- `VITE_REFERRER`: Referrer string appended to Pollinations requests

Create a `.env.local` file for local-only overrides:

```env
VITE_LOGO=/chatterbox_logo.png
VITE_REFERRER=chatterbox_web_local
```

### Usage

1) Start the dev server and open the app in the browser.
2) Type messages and press Enter to chat with ChatterBOX.
3) Use “Generate Image” to create an image via the Pollinations endpoint.
4) Conversations are saved in your browser’s local storage.

### Project Scripts

- `npm run dev`: Start Vite dev server
- `npm run build`: Type-check and build for production
- `npm run preview`: Preview the production build
- `npm run lint`: Lint the codebase

### Contributing

Contributions are welcome! Please:
- Fork the repo and create a feature branch
- Keep edits small and focused
- Run `npm run lint` and `npm run build` before opening a PR
- Add screenshots or short clips for UI changes when helpful

### License

This project is licensed under the MIT License. See the `LICENSE` file for details.

### Badges

Update the placeholder `OWNER/REPO` in the build badge URL after pushing to GitHub. You can also add more badges from `shields.io` for coverage, bundle size, etc.

### Acknowledgements

- Built with Vite and React
- Markdown rendering via `react-markdown` with `remark-gfm` and `remark-breaks