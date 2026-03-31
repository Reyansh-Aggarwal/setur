# Project: Setur

## Project Context
A Tauri (Rust + React/Vite/TypeScript/Tailwind) Windows desktop app.
Launches on boot, shows a preset selection popup, then launches apps/URLs.
Key crates: serde, serde_json, walkdir, winreg, lnk, tauri-plugin-shell
Frontend: React + Vite + TypeScript + Tailwind + WebView2
Use Tauri v2 APIs — import from @tauri-apps/api/core, NOT @tauri-apps/api/tauri
My Rust skill level: beginner — explain ownership/borrowing when relevant.

## Tech Stack
- **Frontend:** React (TypeScript)
- **Runtime/Framework:** Tauri (Rust backend)
- **Styling:** TailwindCSS
- **Build Tool:** Vite

## Architectural Guidelines
- **Tauri Integration:** Ensure tight integration between the Rust backend and React frontend. Commands defined in `src-tauri/src/lib.rs` or `main.rs` should be properly invoked from the frontend using `@tauri-apps/api`.
- **State Management:** Prioritize React hooks and context for frontend state.
- **Safety:** Always validate data passed between the frontend and backend boundaries.

## Development Workflow
- **Running the App:** Use `npm run tauri dev` to start the development environment.
- **Build:** Use `npm run tauri build` for production builds.
- **Linting:** Maintain TypeScript and Rust code quality using `npm run lint` and `cargo clippy`.

## File Structure Conventions
- `src/`: React frontend source code.
- `src/components`: React components.
- `src/pages`: React pages.
- `src/assets`: Static assets.
- `src-tauri/`: Rust backend source code.
- `src-tauri/capabilities/`: Security and permission configurations.
