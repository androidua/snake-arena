import { WebSocketServer } from "ws";
import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createGameState,
  setSnakeDirection,
  stepGame,
} from "./engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || process.env.SNAKE_WS_PORT || 8080);
const TICK_MS = 120;
const ROWS = 25;
const COLS = 25;
const MAX_PLAYERS = 6;

const COLORS = ["#2a2a2a", "#3d5a80", "#8d5a3a", "#5a7d3a", "#6b4c8a", "#c0785a"];

// ---------------------------------------------------------------------------
// Static file server (production / Cloudflare mode)
// Built frontend lives in dist/ after `npm run build`.
// In dev mode dist/ won't exist — Vite serves the frontend on port 5173 instead.
// ---------------------------------------------------------------------------
const DIST = join(__dirname, "../dist");
const HAS_DIST = existsSync(DIST);

const MIME = {
  ".html":  "text/html; charset=utf-8",
  ".js":    "application/javascript",
  ".mjs":   "application/javascript",
  ".css":   "text/css",
  ".ico":   "image/x-icon",
  ".png":   "image/png",
  ".svg":   "image/svg+xml",
  ".json":  "application/json",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
};

function handleHttpRequest(req, res) {
  if (!HAS_DIST) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Snake WS server is running. Run 'npm run build' and restart for production mode.");
    return;
  }

  const urlPath = req.url.split("?")[0];
  const filePath = join(DIST, urlPath === "/" ? "index.html" : urlPath);

  // Guard against path traversal (e.g. /../etc/passwd)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    // Unknown path — serve index.html so React Router (or a future one) can handle it
    try {
      const html = readFileSync(join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("Server error");
    }
  }
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const rooms = new Map();
let nextClientId = 1;

// ---------------------------------------------------------------------------
// HTTP + WebSocket server — both bound to the same port so a single
// Cloudflare Tunnel URL covers the frontend and the WebSocket.
// ---------------------------------------------------------------------------
const httpServer = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const clientId = `p${nextClientId++}`;
  ws.send(JSON.stringify({ type: "welcome", id: clientId }));

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      return;
    }

    handleMessage(ws, clientId, message);
  });

  ws.on("close", () => {
    handleDisconnect(clientId);
  });
});

function handleMessage(ws, clientId, message) {
  switch (message.type) {
    case "host":
      handleHost(ws, clientId, message.name);
      break;
    case "join":
      handleJoin(ws, clientId, message.code, message.name);
      break;
    case "start":
      handleStart(clientId);
      break;
    case "restart":
      handleRestart(clientId);
      break;
    case "input":
      handleInput(clientId, message.dir);
      break;
    default:
      ws.send(JSON.stringify({ type: "error", message: "Unknown message type." }));
  }
}

function handleHost(ws, clientId, name = "Player") {
  const code = generateRoomCode();
  const player = {
    id: clientId,
    name: name.slice(0, 16),
    ws,
    color: COLORS[0],
  };
  const room = {
    code,
    hostId: clientId,
    players: new Map([[clientId, player]]),
    game: null,
    interval: null,
    status: "lobby",
    stats: new Map([[clientId, { totalFood: 0, wins: 0 }]]),
  };
  rooms.set(code, room);
  sendRoomUpdate(room);
}

function handleJoin(ws, clientId, code, name = "Player") {
  const room = rooms.get(String(code).toUpperCase());
  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
    return;
  }
  if (room.players.size >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
    return;
  }
  if (room.status !== "lobby") {
    ws.send(JSON.stringify({ type: "error", message: "Game already started." }));
    return;
  }

  const color = COLORS[room.players.size % COLORS.length];
  room.players.set(clientId, { id: clientId, name: name.slice(0, 16), ws, color });
  if (!room.stats.has(clientId)) {
    room.stats.set(clientId, { totalFood: 0, wins: 0 });
  }
  sendRoomUpdate(room);
}

function handleStart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  startGame(room);
}

function handleRestart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  startGame(room);
}

function handleInput(clientId, dir) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "running") return;
  room.game = setSnakeDirection(room.game, clientId, dir);
}

function handleDisconnect(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room) return;

  room.players.delete(clientId);
  room.stats.delete(clientId);

  if (room.players.size === 0) {
    stopGame(room);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === clientId) {
    room.hostId = room.players.keys().next().value;
  }

  if (room.game?.snakes?.has(clientId)) {
    const snake = room.game.snakes.get(clientId);
    room.game.snakes.set(clientId, { ...snake, alive: false });
  }

  sendRoomUpdate(room);
  if (room.status === "running") {
    broadcastState(room);
  }
}

function startGame(room) {
  stopGame(room);
  room.status = "running";
  room.game = createGameState({
    rows: ROWS,
    cols: COLS,
    players: Array.from(room.players.values()),
    rng: Math.random,
  });
  broadcastState(room);
  room.interval = setInterval(() => {
    room.game = stepGame(room.game, Math.random);
    broadcastState(room);
    if (room.game.status !== "running") {
      accumulateStats(room);
      room.status = room.game.status;
      stopGame(room);
      sendRoomUpdate(room);
    }
  }, TICK_MS);
  sendRoomUpdate(room);
}

function stopGame(room) {
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
}

function broadcastState(room) {
  const payload = {
    type: "state",
    state: serializeGame(room.game),
  };
  broadcast(room, payload);
}

function sendRoomUpdate(room) {
  const payload = {
    type: "room",
    room: {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      players: Array.from(room.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
      })),
      stats: Object.fromEntries(room.stats),
    },
  };
  broadcast(room, payload);
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  room.players.forEach((player) => {
    if (player.ws.readyState === player.ws.OPEN) {
      player.ws.send(message);
    }
  });
}

function serializeGame(game) {
  if (!game) return null;
  return {
    rows: game.rows,
    cols: game.cols,
    food: game.food,
    status: game.status,
    winnerId: game.winnerId,
    snakes: Array.from(game.snakes.values()).map((snake) => ({
      id: snake.id,
      name: snake.name,
      color: snake.color,
      alive: snake.alive,
      score: snake.score,
      body: snake.body,
    })),
  };
}

function accumulateStats(room) {
  if (!room.game) return;
  room.game.snakes.forEach((snake) => {
    const stat = room.stats.get(snake.id);
    if (stat) {
      stat.totalFood += snake.score;
    }
  });
  if (room.game.winnerId) {
    const winnerStat = room.stats.get(room.game.winnerId);
    if (winnerStat) winnerStat.wins += 1;
  }
}

function findRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join("");
  } while (rooms.has(code));
  return code;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`Snake server → http://localhost:${PORT}`);
  if (HAS_DIST) {
    console.log("Mode: production (serving frontend from dist/)");
    console.log("To expose over the internet: cloudflared tunnel --url http://localhost:" + PORT);
  } else {
    console.log("Mode: dev (no dist/ found — run 'npm run dev' for the frontend)");
  }
});
