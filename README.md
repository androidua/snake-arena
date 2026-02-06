# Snake Arena (Multiplayer)

Real-time multiplayer Snake for up to 4 players. Host a room, share the code, and compete for food.

## Requirements
- Node.js 18+
- npm

## Setup
```bash
cd "/Users/dmytrobondarenko/Documents/New project"
npm install
```

## Run (local machine)
Open two terminals.

Terminal A (WebSocket server):
```bash
cd "/Users/dmytrobondarenko/Documents/New project"
npm run server
```

Terminal B (Vite dev server):
```bash
cd "/Users/dmytrobondarenko/Documents/New project"
npm run dev
```

Open the app:
```
http://localhost:5173
```

## Run (LAN multiplayer)
1. Start the WS server (terminal A):
```bash
cd "/Users/dmytrobondarenko/Documents/New project"
npm run server
```

2. Start Vite and allow LAN access (terminal B):
```bash
cd "/Users/dmytrobondarenko/Documents/New project"
npm run dev -- --host
```

3. Find your LAN IP (macOS):
```bash
ipconfig getifaddr en0
```

4. Your friend opens:
```
http://<YOUR_LAN_IP>:5173
```

5. Host creates a room code in the UI and shares it. Friends join with that code.

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
