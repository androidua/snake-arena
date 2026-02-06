import { WebSocketServer } from "ws";
import {
  createGameState,
  setSnakeDirection,
  stepGame,
} from "./engine.js";

const PORT = Number(process.env.SNAKE_WS_PORT || 8080);
const TICK_MS = 120;
const ROWS = 20;
const COLS = 20;
const MAX_PLAYERS = 4;

const COLORS = ["#2a2a2a", "#3d5a80", "#8d5a3a", "#5a7d3a"];

const rooms = new Map();
let nextClientId = 1;

const wss = new WebSocketServer({ port: PORT });

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

console.log(`Snake WS server running on ws://localhost:${PORT}`);
