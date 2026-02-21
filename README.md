# Snake Arena (Multiplayer)

Real-time multiplayer Snake for up to 6 players. Host a room, share the code, and compete for food on a 25×25 board.

## Features

- **Up to 6 players** in a single room on a 25×25 grid
- **Room codes** — host generates a 4-character code, others join by entering it
- **Real-time gameplay** via WebSockets, ticking every 120ms
- **Mobile support** — swipe gestures on iOS and Android, keyboard on desktop
- **Internet play** — expose over the internet in minutes using Cloudflare Tunnel
- **Session statistics** — tracks total food eaten and win count per player across rounds within a session
- **Automatic host migration** — if the host disconnects, the next player in the room becomes host
- **Food fairness fix** — if two snakes collide head-on at a food cell, neither gets the point and the food stays in place
- **Collision detection** — head-on collisions and wall collisions kill snakes; a snake running into another snake's body also dies

## Game Rules

- Each player controls a snake using arrow keys, WASD, or swipe gestures on mobile
- Eating food grows your snake and adds 1 to your score
- Hitting a wall, another snake's body, or colliding head-on with another snake kills you
- The last snake alive wins the round. If all remaining snakes die simultaneously, no winner is declared
- The host can start and restart rounds at any time

## Session Statistics

After each completed round, cumulative stats are shown in the side panel:
- **Food** — total food eaten across all rounds in the session
- **W** — number of rounds won in the session

Stats reset if all players leave the room (the room is destroyed).

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

## Run (local machine — development)
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

## Run over the Internet (Cloudflare Tunnel)

This mode builds the frontend and serves everything from a single port, then Cloudflare
creates a secure public URL anyone in the world can open — no port forwarding or cloud
account required.

### 1. Install cloudflared

**macOS:**
```bash
brew install cloudflared
```

**Windows** (run in PowerShell as Administrator):
```powershell
winget install Cloudflare.cloudflared
```

Or download the installer directly from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### 2. Build the frontend
```bash
npm run build
```

### 3. Start the unified server
```bash
npm start
```
This serves both the built frontend and the WebSocket on port `8080`.

### 4. Open the Cloudflare Tunnel (in a second terminal)
```bash
cloudflared tunnel --url http://localhost:8080
```

Cloudflare will print a public URL like:
```
https://some-random-words.trycloudflare.com
```

### 5. Share and play
Send that URL to anyone. They open it in their browser — desktop or mobile — and connect
to your game directly. The URL works as long as both the server and the tunnel are running.

> **Note:** The URL changes every time you restart `cloudflared`. To get a permanent fixed
> URL, create a free Cloudflare account and set up a named tunnel with your own domain.

## Controls
- **Move (desktop):** Arrow keys or WASD
- **Move (mobile):** Swipe in any direction on the game board
- **Start / Restart:** Host only (button in the side panel)

## Troubleshooting
- **LAN:** If a friend can't connect, ensure both devices are on the same Wi‑Fi/LAN and allow ports `5173` and `8080` through your firewall.
- **Cloudflare:** If the tunnel URL isn't loading, make sure `npm start` is running first before starting `cloudflared`.
- **Mobile:** If swipe controls aren't responding, try swiping from the center of the game board rather than the edges of the screen.

## Configuration

### Change the server port
The server defaults to port `8080`. Override with an environment variable:
```bash
SNAKE_WS_PORT=9000 npm start
```

### Adjust game speed
The tick rate is set to `120ms` in `server/index.js` (`TICK_MS`). Lower values make the game faster.

### Adjust board size or player limit
`ROWS`, `COLS`, and `MAX_PLAYERS` are constants at the top of `server/index.js`. Changing `MAX_PLAYERS` beyond 6 will also require adding spawn points in `server/engine.js`.
