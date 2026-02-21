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

// Auto-detect WebSocket URL so the same build works in all environments:
//   - Vite dev server (port 5173): WS server is separate on port 8080
//   - Unified production server or Cloudflare Tunnel: same host as the page,
//     switching ws → wss automatically when the page is served over HTTPS
function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host =
    window.location.port === "5173"
      ? `${window.location.hostname}:8080` // dev: separate WS server
      : window.location.host;              // production / tunnel: same host
  return `${proto}//${host}`;
}

export default function App() {
  const wsRef = useRef(null);
  const boardRef = useRef(null);
  const touchStartRef = useRef(null);
  const [connection, setConnection] = useState("connecting");
  const [me, setMe] = useState({ id: null, name: "" });
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
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

  // Keyboard controls (desktop)
  useEffect(() => {
    const handleKey = (event) => {
      // Don't intercept keys while the user is typing in an input field
      if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;

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

  // Touch / swipe controls (mobile) — scoped to the board element only so the
  // side panel can still be scrolled normally. { passive: false } is required
  // on all three events so preventDefault() actually works in modern browsers.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return; // ignore multi-touch / pinch
      e.preventDefault();
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    // Must preventDefault here too — otherwise pull-to-refresh and browser
    // back-swipe gestures can fire mid-swipe on both iOS and Android.
    const onTouchMove = (e) => {
      e.preventDefault();
    };

    const onTouchEnd = (e) => {
      if (!touchStartRef.current || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return; // too short — ignore tap noise

      // Pick the dominant axis to avoid diagonal ambiguity
      const dir =
        absDx > absDy
          ? dx > 0
            ? "RIGHT"
            : "LEFT"
          : dy > 0
          ? "DOWN"
          : "UP";

      send({ type: "input", dir });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [room?.code]); // re-attach only when the player joins/leaves a room

  // Show "Swipe to move" hint on the first game start if this is a touch device
  useEffect(() => {
    if (
      room?.status === "running" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0)
    ) {
      setShowSwipeHint(true);
    }
  }, [room?.status]);

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
            <div className="status">Online multiplayer for up to 6 players.</div>
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
          <div className="board-wrapper">
            <div
              ref={boardRef}
              className="board"
              style={{ gridTemplateColumns: `repeat(${game?.cols || 25}, 1fr)` }}
            >
              {boardCells}
            </div>
            {showSwipeHint && (
              <div
                className="swipe-hint"
                onAnimationEnd={() => setShowSwipeHint(false)}
              >
                Swipe to move
              </div>
            )}
          </div>
          <div className="panel">
            <div className="status" aria-live="polite">
              {statusLabel || "Swipe or use WASD / arrows"}
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

      <footer className="footer">
        <div>Swipe or use WASD / arrows to move • Host can restart with R</div>
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
