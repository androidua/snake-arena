export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export function createInitialState({ rows, cols, rng }) {
  const startX = Math.floor(cols / 2) - 1;
  const startY = Math.floor(rows / 2);
  const snake = [
    { x: startX + 2, y: startY },
    { x: startX + 1, y: startY },
    { x: startX, y: startY },
  ];

  const food = spawnFood(snake, rows, cols, rng);

  return {
    rows,
    cols,
    snake,
    direction: DIRECTIONS.RIGHT,
    pendingDirection: null,
    food,
    score: 0,
    growth: 0,
    status: "running", // running | paused | gameover | win
  };
}

export function setPendingDirection(state, nextDir) {
  if (!nextDir) return state;
  if (isOpposite(state.direction, nextDir)) return state;
  return { ...state, pendingDirection: nextDir };
}

export function step(state, rng) {
  if (state.status !== "running") return state;

  const nextDirection = state.pendingDirection && !isOpposite(state.direction, state.pendingDirection)
    ? state.pendingDirection
    : state.direction;

  const head = state.snake[0];
  const nextHead = { x: head.x + nextDirection.x, y: head.y + nextDirection.y };

  const willEat = state.food && nextHead.x === state.food.x && nextHead.y === state.food.y;
  const willGrow = willEat || state.growth > 0;
  const collisionBody = willGrow ? state.snake : state.snake.slice(0, -1);

  if (hitsWall(nextHead, state.rows, state.cols) || hitsSelf(nextHead, collisionBody)) {
    return {
      ...state,
      direction: nextDirection,
      pendingDirection: null,
      status: "gameover",
    };
  }

  let snake = [nextHead, ...state.snake];
  let growth = state.growth;
  let score = state.score;
  let food = state.food;

  if (willEat) {
    growth += 1;
    score += 1;
    food = spawnFood(snake, state.rows, state.cols, rng);
  }

  if (growth > 0) {
    growth -= 1;
  } else {
    snake = snake.slice(0, -1);
  }

  const status = food ? "running" : "win";

  return {
    ...state,
    snake,
    direction: nextDirection,
    pendingDirection: null,
    food,
    score,
    growth,
    status,
  };
}

export function togglePause(state) {
  if (state.status === "running") return { ...state, status: "paused" };
  if (state.status === "paused") return { ...state, status: "running" };
  return state;
}

export function resetState(state, rng) {
  return createInitialState({ rows: state.rows, cols: state.cols, rng });
}

export function spawnFood(snake, rows, cols, rng) {
  const occupied = new Set(snake.map((segment) => keyOf(segment)));
  const emptyCells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) emptyCells.push({ x, y });
    }
  }

  if (emptyCells.length === 0) return null;
  const index = Math.floor(rng() * emptyCells.length);
  return emptyCells[index];
}

export function hitsWall(position, rows, cols) {
  return position.x < 0 || position.y < 0 || position.x >= cols || position.y >= rows;
}

export function hitsSelf(position, snake) {
  return snake.some((segment) => segment.x === position.x && segment.y === position.y);
}

export function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

export function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}
