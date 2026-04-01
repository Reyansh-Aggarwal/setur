# Setur

> **Launch your workflow presets on boot.** A lightweight Windows desktop utility that starts your day the right way—just select a preset, watch everything launch, and get to work.

<div align="center">

![Setur Demo](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows)
![Status](https://img.shields.io/badge/Status-Active-47B881?style=for-the-badge)
![Tauri](https://img.shields.io/badge/Tauri-v2-FFC535?style=for-the-badge&logo=tauri)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

[Features](#features) • [Installation](#installation) • [Building](#building) • [Development](#development) • [Contributing](#contributing)

</div>

---

## What is Setur?

Setur is a **boot-time workflow launcher** for Windows. Instead of manually opening scattered apps and tabs every morning, define **presets**—curated collections of applications and URLs—and launch them all with a single click.

When your computer boots, Setur presents a minimal popup. Select a preset (e.g., "Development", "Design", "Meetings"), and:
- All associated apps launch automatically
- All URLs open in your default browser
- The app closes silently
- You're ready to work

No more context switching. No more forgetting what you opened yesterday.

---

## Features

✨ **Lightweight & Fast**
- Built with Tauri for minimal memory footprint (~30 MB)
- Launches in milliseconds
- Zero impact on boot time

🎯 **Smart Preset Creation**
- Scan installed applications automatically
- AI-assisted suggestions (powered by Claude/Gemini)
- Define custom app and URL combinations
- Save and organize unlimited presets

⚡ **Boot Integration**
- Auto-launch on Windows startup (via registry)
- One-click preset selection from boot popup
- "Skip" option to defer launching
- "Same as Yesterday" quick-repeat

🛠️ **Minimal UI**
- Native-feeling boot prompt (as minimal as possible)
- Full-featured preset builder for configuration
- Tray icon management

📦 **Portable & Local**
- All presets stored locally (no cloud required)
- No external dependencies
- Windows-only (initially)

---

## Quick Start

### Installation

1. **Download** the latest release from [Releases](https://github.com/yourusername/setur/releases)
2. **Run** `Setur-Setup.exe` and follow the installer
3. **Reboot** your machine
4. **Create presets** via the tray menu → "Manage Presets"

### Your First Preset

1. Open **Setur** from the system tray
2. Click **New Preset** and give it a name (e.g., "Morning Dev")
3. Setur scans your installed apps and suggests relevant ones based on your preset name
4. Confirm, add URLs (optional), and save
5. Next boot, select your preset from the popup

That's it. You're done.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│         Windows Boot Event                          │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│    Setur Launches (Registry Entry)                 │
│    • Minimal boot popup appears                     │
│    • Shows all your presets                         │
└──────────────┬──────────────────────────────────────┘
               │
        ┌──────┴────────┬─────────────┐
        │               │             │
        ▼               ▼             ▼
    [Preset A]    [Preset B]    [Skip]
        │               │
        ▼               ▼
    ┌─────────────────────────────┐
    │ Launch all preset apps      │
    │ & open all preset URLs      │
    └──────────────┬──────────────┘
                   │
                   ▼
         [Setur closes silently]
         [You start working]
```

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Desktop** | [Tauri v2](https://tauri.app/) | Lightweight cross-platform framework |
| **Backend** | Rust | Type-safe, fast, memory-efficient |
| **Frontend** | React 18 + TypeScript | Component-driven UI |
| **Styling** | Tailwind CSS | Utility-first design |
| **Build** | Vite | Lightning-fast bundling |
| **Rendering** | Windows WebView2 | Native Windows integration |
| **Storage** | Local JSON | No external databases |

---

## Architecture

### Project Structure

```
setur/
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── main.rs          # App entry point, window lifecycle
│   │   ├── commands.rs      # Tauri commands (RPC interface)
│   │   ├── preset.rs        # Preset CRUD logic
│   │   ├── launcher.rs      # App/URL launching
│   │   └── scanner.rs       # System app scanning
│   └── Cargo.toml           # Rust dependencies
│
└── src/                      # React frontend
    ├── components/
    │   ├── BootPrompt.tsx    # Minimal boot popup UI
    │   ├── PresetBuilder.tsx # Full preset editor
    │   └── PresetList.tsx    # Preset manager
    ├── hooks/
    │   └── usePresets.ts     # Preset API client
    ├── types/
    │   └── preset.ts         # TypeScript interfaces
    ├── App.tsx               # Main component
    └── main.tsx              # React entry point
```

### Key Flows

**Boot Flow:**
1. Windows triggers registry entry → Setur launches
2. Tauri creates "boot" window (minimal, always-on-top)
3. React renders preset buttons
4. User selects preset (or Skip)
5. Rust `launcher` module executes all apps & URLs
6. Window closes

**Preset Management Flow:**
1. User opens tray menu → "Manage Presets"
2. Tauri creates "manager" window (full UI)
3. React renders `PresetBuilder`
4. On preset name entry, frontend calls Claude/Gemini API
5. AI suggests relevant apps + user's installed apps appear as checklist
6. User confirms, adds URLs, saves
7. Rust writes preset to local JSON file

---

## Configuration

### Presets File

Presets are stored in `AppData\Roaming\com.reyansh.setur\presets.json`:

```json
{
  "presets": [
    {
      "id": "dev-morning",
      "name": "Dev Morning",
      "apps": [
        "C:\\Program Files\\Microsoft VS Code\\Code.exe",
        "C:\\Program Files\\Git\\git-bash.exe"
      ],
      "urls": [
        "https://github.com/dashboard",
        "https://mail.google.com"
      ],
      "createdAt": "2025-03-31T10:00:00Z"
    }
  ]
}
```

### Autostart Configuration

Setur registers itself in Windows:
- **Registry Key:** `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
- **Entry:** `Setur` → `C:\Program Files\Setur\Setur.exe`

Disable autostart from the tray menu if needed.

---

## Building

### Prerequisites

- **Rust 1.70+** ([Install](https://rustup.rs/))
- **Node.js 18+** ([Install](https://nodejs.org/))
- **Windows 10/11** (WebView2 required; included in modern Windows)

### Build Steps

```bash
# Clone the repo
git clone https://github.com/yourusername/setur.git
cd setur

# Install Node dependencies
npm install

# Build the desktop app (development mode)
npm run tauri dev

# Build the desktop app (production)
npm run tauri build
```

The output `.msi` installer will be in `src-tauri/target/release/bundle/msi/`.

---

## Development

### Running in Dev Mode

```bash
npm run tauri dev
```

This launches Setur with hot-reload for React changes. Rust changes require a restart.

### Debugging

**Frontend:**
- Open DevTools: `Ctrl+Shift+I` (in dev mode)
- Inspect React components and console

**Rust Backend:**
- Set `RUST_LOG=debug` environment variable
- Logs appear in console and `%APPDATA%\Setur\setur.log`

### Testing

```bash
# Run Rust unit tests
cd src-tauri && cargo test

# Test preset parsing
cargo test preset

# Test launcher (requires Windows)
cargo test launcher
```

---

## Known Issues & Limitations

- **Windows Only:** Currently targets Windows 10/11 exclusively
- **WebView2:** Requires Windows WebView2 runtime (auto-installed on modern Windows)
- **Admin Rights:** Not required, but some protected apps may not launch without elevation
- **App Detection:** Uses `.lnk` files and Program Files; portable/non-standard installs may not be detected

---

## License

MIT License.

---

## Troubleshooting

### Setur doesn't auto-launch on boot

- **Check:** Is the registry entry present? (`regedit` → `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`)
- **Fix:** Re-run the installer or re-enable autostart in Setur's tray menu

### Apps not launching from preset

- **Check:** Are the app paths correct? (View in preset manager)
- **Fix:** Delete the preset and recreate it; re-scan apps

### WebView2 errors

- **Check:** Is Windows WebView2 runtime installed? ([Download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/))
- **Fix:** Install WebView2 runtime, then restart Setur

---

## Acknowledgments

Built with ❤️ using [Tauri](https://tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/).

Preset AI suggestions powered by [Gemini](https://gemini.google.com/).

---

<div align="center">

**Made by [Reyansh Aggarwal](https://github.com/reyansh-aggarwal)**
[📧 Email](mailto:reyanshagg09@gmail.com)

</div>