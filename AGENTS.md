# AGENTS.md

## Project Overview

Ebook reader web app. Users drag-and-drop `.epub` files, which are persisted in IndexedDB. Inbox-style layout with a book list sidebar and reader pane.

## Tech Stack

- **Framework**: React Router v7 (framework mode) with TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (Base UI, not Radix)
- **Epub Rendering**: epubjs
- **Storage**: idb-keyval (IndexedDB) — use separate databases for separate stores (idb-keyval limitation: one object store per database)
- **Fonts**: Google Fonts + self-hosted Geist/Geist Mono (woff2 variable fonts in `public/fonts/`)
- **Linting**: oxlint (no eslint)
- **Formatting**: oxfmt
- **Package Manager**: pnpm

## Key Architecture Decisions

### Epub iframe isolation

epubjs renders content inside an iframe. The iframe is a separate document that does NOT inherit:

- Parent page CSS (including Tailwind dark mode classes)
- Parent page font imports (Google Fonts `<link>` tags)

To style epub content, inject directly into the iframe via `rendition.hooks.content.register()`:

- Inject `<link>` tags for Google Fonts
- Inject `<style>` tags with `@font-face` declarations for self-hosted fonts
- Inject `<style>` tags with typography CSS (`font-family`, `font-size`, `line-height`) using `!important`
- Use `rendition.themes.register()` / `rendition.themes.select()` for dark/light color theming

Do NOT use `rendition.themes.override()` for typography — it is unreliable and gets reset by `themes.select()`.

### Settings persistence

All reader settings (theme, layout mode, font, size, line height) are stored in localStorage via a shared `useSettings()` hook in `app/lib/settings.ts`.

Reading positions (CFI strings) are stored per-book in IndexedDB using a separate database from the book data.

### Client-side only

All epub parsing, IndexedDB access, and rendering must happen client-side. Use `clientLoader` (not `loader`) in React Router routes. epubjs and IndexedDB APIs are not available during SSR.

## Coding Conventions

- Use pnpm for all package management
- Use conventional commits (e.g., `feat:`, `fix:`)
- No emoji in commit messages
- shadcn components use Base UI (not Radix) — check component APIs accordingly (e.g., `DropdownMenuLabel` must be inside `DropdownMenuGroup`)
- When adding shadcn components: `pnpx shadcn@latest add <component>`
- Prefer self-hosted fonts over CDN when font files are available locally