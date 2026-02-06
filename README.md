# Snake Arena (Multiplayer)

Real-time multiplayer Snake for up to 4 players. Host a room, share the code, and compete for food.

## Prerequisites
If you do not already have dependencies installed, do this first.

### macOS
1. Install Node.js (LTS) from https://nodejs.org
2. Install Git (if not already present):
   - Open Terminal and run `git --version`
   - If prompted, install the Xcode Command Line Tools

### Windows
1. Install Node.js (LTS) from https://nodejs.org (includes npm)
2. Install Git for Windows from https://git-scm.com/download/win

## Setup (all platforms)
```bash
git clone https://github.com/androidua/snake-arena.git
cd snake-arena
npm install
```

## Run (local machine)
Open two terminals in the project folder.

Terminal A (WebSocket server):
```bash
npm run server
```

Terminal B (Vite dev server):
```bash
npm run dev
```

Open the app:
```
http://localhost:5173
```

## Run (LAN multiplayer)
1. Start the WS server (terminal A):
```bash
npm run server
```

2. Start Vite and allow LAN access (terminal B):
```bash
npm run dev -- --host
```

3. Find your LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Windows (PowerShell): `ipconfig | findstr /i "IPv4"`

4. Your friend opens:
```
http://<YOUR_LAN_IP>:5173
```

5. Host creates a room code in the UI and shares it. Friends join with that code.

## Troubleshooting
- If your friend can’t connect, ensure both devices are on the same Wi‑Fi/LAN.
- Allow access through your firewall for ports `5173` (Vite) and `8080` (WebSocket server).

## Controls
- Move: Arrow keys or WASD
- Host only: Start / Restart (button)

## Notes
- WebSocket server runs on port `8080` by default.
- You can change it by setting `SNAKE_WS_PORT` when running the server.

Example:
```bash
SNAKE_WS_PORT=9000 npm run server
```

If you change the WS port, update the client constant in `src/App.jsx`.
