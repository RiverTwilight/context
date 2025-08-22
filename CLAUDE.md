# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Context" that finds related Hacker News comments and stories for the current browser tab. It uses Preact for the UI and TypeScript for type safety.

## Development Commands

- `pnpm install` - Install dependencies
- `pnpm run dev` - Build extension in watch mode for development
- `pnpm run build` - Build production version of extension
- `pnpm run type-check` - Run TypeScript type checking

## Architecture

### Entry Points
- **popup.tsx** (`src/popup.tsx:1`) - Main UI component rendered in extension popup
- **content.ts** (`src/content.ts:1`) - Content script that provides URL access to popup

### Core Service
- **HNSearchService** (`src/services/hnApi.ts:46`) - Handles all Hacker News API interactions via Algolia search
  - Searches for stories and comments by URL (exact or domain matching)
  - Supports filtering by type (all/story/comment), URL match type, and sorting
  - Implements pagination for loading more results

### Build System
- Uses Vite with Preact preset
- Custom plugins copy manifest.json and icons to dist folder during build
- Outputs to `dist/` folder which can be loaded as unpacked extension

### Extension Structure
- Manifest v3 Chrome extension
- Popup UI shows stories with their comments in hierarchical view
- Content script provides current tab URL to popup
- Uses Tailwind CSS with custom Apple-style design system

### Key Features
- Real-time search of HN content related to current tab
- Filtering by content type, URL matching, and sorting preferences
- Pagination support for loading more comments
- Click-to-open functionality for HN stories and comments
