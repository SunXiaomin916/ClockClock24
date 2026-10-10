# ClockClock 24 · Kinetic Desktop

[简体中文](README.zh-CN.md) · English

An independent offline clock with 24 faces, 48 hands, 14 materials and 12 choreographies, inspired by Humans since 1982. This is not an official product or firmware.

Download Windows x64, macOS Apple Silicon, macOS Intel, Wallpaper Engine and source ZIP packages from [GitHub Releases](https://github.com/SunXiaomin916/ClockClock24/releases/latest). Each package includes Chinese quick-start instructions and comes with a SHA-256 checksum and file manifest. Windows: extract the entire folder and run `ClockClock24.exe`.

![ClockClock 24 preview](preview.jpg)

Choose the platform ZIP from the release assets. GitHub's **Code → Download ZIP** downloads source code, not a ready-to-run desktop app. Local builds write packages to `release/`; binaries are distributed through Releases and are not tracked in Git.

**The macOS packages are cross-packaged, unsigned, not notarized, and not tested on a Mac.** On macOS 13+, use the included installation command to copy the app into `~/Applications` and apply a local ad-hoc signature. This does not replace Apple notarization or real-device testing.

Desktop apps provide a tray/menu-bar entry, wallpaper toggle, pause switch and opt-in launch-at-login. Startup is off by default. Wallpaper covers the primary display. Wallpaper Engine manages its own startup and screensaver integration.

Double-click `index.html` for browser preview, or run `npm start` and open `http://127.0.0.1:8765/?dev=1`. `npm test` runs the core tests without dependencies.

Desktop development requires Node.js 22.12+, `npm ci`, and Python 3 for ZIP creation. Windows packaging uses the built-in .NET Framework C# compiler. Set `CC24_PYTHON` to a Python executable if necessary.

```text
npm run build:windows
npm run desktop
npm run build:macos
npm run build:wallpaper
npm run build
```

On Windows, macOS cross-packaging requires permission to create symbolic links. Public Mac distribution requires signing, notarization and testing on a Mac.

See [the Chinese guide](README.zh-CN.md), [build instructions](docs/构建说明.zh-CN.md), and [historical implementation notes](docs/开发与历史验证.zh-CN.md).
