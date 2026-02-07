import { useEffect, useMemo, useRef, useState } from "react";

const KEY_TO_DIR = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  w: "UP",
  s: "DOWN",
  a: "LEFT",
  d: "RIGHT",
};

const WS_PORT = 8080;

export default function App() {
  const wsRef = useRef(null);
  const [connection, setConnection] = useState("connecting");
  const [me, setMe] = useState({ id: null, name: "" });
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:${WS_PORT}`);
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnection("open"));
    ws.addEventListener("close", () => setConnection("closed"));
    ws.addEventListener("error", () => setConnection("error"));

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "welcome") {
        setMe((prev) => ({ ...prev, id: message.id }));
        return;
      }
      if (message.type === "room") {
        setRoom(message.room);
        return;
      }
      if (message.type === "state") {
        setGame(message.state);
        return;
      }
      if (message.type === "error") {
        setError(message.message);
      }
    });

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      const dir = KEY_TO_DIR[event.key];
      if (dir) {
        event.preventDefault();
        send({ type: "input", dir });
        return;
      }
      if ((event.key === "r" || event.key === "R") && isHost(room, me.id)) {
        send({ type: "restart" });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [room, me.id]);

  const send = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const handleHost = () => {
    setError("");
    send({ type: "host", name: nameInput || "Player" });
  };

  const handleJoin = () => {
    setError("");
    send({ type: "join", code: codeInput.trim().toUpperCase(), name: nameInput || "Player" });
  };

  const handleStart = () => send({ type: "start" });
  const handleRestart = () => send({ type: "restart" });

  const snakeCells = useMemo(() => {
    const map = new Map();
    if (!game?.snakes) return map;
    game.snakes.forEach((snake) => {
      snake.body.forEach((segment, index) => {
        const key = keyOf(segment);
        map.set(key, {
          color: snake.color,
          head: index === 0,
          alive: snake.alive,
        });
      });
    });
    return map;
  }, [game]);

  const boardCells = useMemo(() => {
    if (!game) return [];
    const cells = [];
    for (let y = 0; y < game.rows; y += 1) {
      for (let x = 0; x < game.cols; x += 1) {
        const key = `${x},${y}`;
        const snakeCell = snakeCells.get(key);
        let style = undefined;
        let className = "cell";
        if (snakeCell) {
          className += " snake";
          if (snakeCell.head) className += " head";
          if (!snakeCell.alive) className += " dead";
          style = { background: snakeCell.color };
        }
        if (game.food && key === keyOf(game.food)) className += " food";
        cells.push(<div key={key} className={className} style={style} />);
      }
    }
    return cells;
  }, [game, snakeCells]);

  const statusLabel = useMemo(() => {
    if (!room) return "";
    if (room.status === "lobby") return "Waiting for players";
    if (game?.status === "gameover") return "Game Over";
    if (game?.status === "win") return "Board Full";
    return "";
  }, [room, game]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Snake Arena</div>
        <div className="score">{room ? `Room ${room.code}` : ""}</div>
      </header>

      {!room && (
        <main className="lobby">
          <div className="panel">
            <div className="status">Online multiplayer for up to 4 players.</div>
            <label className="field">
              <span>Name</span>
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Player"
              />
            </label>
            <label className="field">
              <span>Room Code</span>
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                placeholder="AB12"
                maxLength={4}
              />
            </label>
            <div className="actions">
              <button type="button" onClick={handleHost} disabled={connection !== "open"}>
                Host Room
              </button>
              <button type="button" onClick={handleJoin} disabled={connection !== "open"}>
                Join Room
              </button>
            </div>
            <div className="status">
              {connection === "open" ? "Connected" : `Connection: ${connection}`}
            </div>
            {error && <div className="error">{error}</div>}
          </div>
        </main>
      )}

      {room && (
        <main className="stage">
          <div className="board" style={{ gridTemplateColumns: `repeat(${game?.cols || 20}, 1fr)` }}>
            {boardCells}
          </div>
          <div className="panel">
            <div className="status" aria-live="polite">
              {statusLabel || "Use arrow keys or WASD"}
            </div>
            <div className="players">
              {room.players.map((player) => {
                const snake = game?.snakes?.find((entry) => entry.id === player.id);
                return (
                  <div key={player.id} className="player">
                    <span className="swatch" style={{ background: player.color }} />
                    <span>{player.name}</span>
                    <span>{snake?.score ?? 0}</span>
                    {!snake?.alive && room.status !== "lobby" ? <span>✕</span> : null}
                    {room.hostId === player.id ? <span>★</span> : null}
                  </div>
                );
              })}
            </div>
            {hasStats(room) && (
              <div className="session-stats">
                <div className="session-label">Session</div>
                {room.players.map((player) => {
                  const stat = room.stats?.[player.id];
                  if (!stat) return null;
                  return (
                    <div key={player.id} className="stat-row">
                      <span className="swatch" style={{ background: player.color }} />
                      <span>{player.name}</span>
                      <span>{stat.totalFood} food</span>
                      <span>{stat.wins}W</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="actions">
              {isHost(room, me.id) && room.status === "lobby" && (
                <button type="button" onClick={handleStart}>
                  Start Game
                </button>
              )}
              {isHost(room, me.id) && room.status !== "lobby" && (
                <button type="button" onClick={handleRestart}>
                  Restart
                </button>
              )}
            </div>
            <div className="status">Room code: {room.code}</div>
          </div>
        </main>
      )}

      {room && (
        <section className="controls" aria-label="On-screen controls">
          <div className="controls-row">
            <button type="button" onClick={() => send({ type: "input", dir: "UP" })}>
              Up
            </button>
          </div>
          <div className="controls-row">
            <button type="button" onClick={() => send({ type: "input", dir: "LEFT" })}>
              Left
            </button>
            <button type="button" onClick={() => send({ type: "input", dir: "DOWN" })}>
              Down
            </button>
            <button type="button" onClick={() => send({ type: "input", dir: "RIGHT" })}>
              Right
            </button>
          </div>
        </section>
      )}

      <footer className="footer">
        <div>WASD / Arrows to move • Host can restart with R</div>
      </footer>
    </div>
  );
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function isHost(room, id) {
  return room?.hostId === id;
}

function hasStats(room) {
  if (!room?.stats) return false;
  return Object.values(room.stats).some((s) => s.totalFood > 0 || s.wins > 0);
}
