let playhtml = null;

const BOARD_SIZE = 8;
const FILES = "abcdefgh";
const GAME_KEY = "ottv2-game-state-v6";
const PRESENCE_KEY = "ottv2-presence-v6";

const params = new URLSearchParams(window.location.search);
let roomCode = (params.get("room") || "").trim().toUpperCase();

if (!/^[A-Z0-9-]{4,20}$/.test(roomCode)) {
  roomCode =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 6).toUpperCase() ||
    Math.random().toString(36).slice(2, 8).toUpperCase();

  params.set("room", roomCode);
  history.replaceState(
    null,
    "",
    `${location.pathname}?${params.toString()}${location.hash}`
  );
}

const ROOM_ID = `ottv2-${roomCode.toLowerCase()}`;

const TYPES = {
  rock: { emoji: "✊", label: "Đấm", short: "Đ" },
  paper: { emoji: "✋", label: "Lá", short: "L" },
  scissors: { emoji: "✌️", label: "Kéo", short: "K" },
};

const BEATS = {
  rock: "scissors",
  scissors: "paper",
  paper: "rock",
};

const PLAYER_META = {
  p1: { name: "Player 1 · Xanh", short: "Xanh", target: "h8" },
  p2: { name: "Player 2 · Đỏ", short: "Đỏ", target: "a1" },
};

const els = {
  board: document.querySelector("#board"),
  statusText: document.querySelector("#statusText"),
  turnBadge: document.querySelector("#turnBadge"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),
  roomText: document.querySelector("#roomText"),
  p1Seat: document.querySelector("#p1Seat"),
  p2Seat: document.querySelector("#p2Seat"),
  p1Count: document.querySelector("#p1Count"),
  p2Count: document.querySelector("#p2Count"),
  myRole: document.querySelector("#myRole"),
  joinP1Btn: document.querySelector("#joinP1Btn"),
  joinP2Btn: document.querySelector("#joinP2Btn"),
  leaveSeatBtn: document.querySelector("#leaveSeatBtn"),
  copyRoomBtn: document.querySelector("#copyRoomBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  toast: document.querySelector("#toast"),
  winnerModal: document.querySelector("#winnerModal"),
  winnerTitle: document.querySelector("#winnerTitle"),
  winnerReason: document.querySelector("#winnerReason"),
  winnerIcon: document.querySelector("#winnerIcon"),
  modalResetBtn: document.querySelector("#modalResetBtn"),
};

let gameStore = null;
let gameState = null;
let myId = null;
let myRole = "spectator";
let selected = null;
let legalTargets = new Map();
let toastTimer = null;
let registerTimer = null;
let onlineIds = new Set();
let connected = false;
let optedOut = false;

function createInitialBoard() {
  const board = Array.from(
    { length: BOARD_SIZE },
    () => Array(BOARD_SIZE).fill(null)
  );

  const p1Setup = [
    { r: 1, c: 0, type: "rock" },
    { r: 0, c: 1, type: "paper" },
    { r: 1, c: 1, type: "scissors" },
    { r: 0, c: 2, type: "rock" },
    { r: 1, c: 2, type: "paper" },
    { r: 2, c: 0, type: "scissors" },
    { r: 2, c: 1, type: "rock" },
    { r: 2, c: 2, type: "paper" },
  ];

  for (const piece of p1Setup) {
    board[piece.r][piece.c] = {
      owner: "p1",
      type: piece.type,
    };

    const mirroredR = 7 - piece.c;
    const mirroredC = 7 - piece.r;

    board[mirroredR][mirroredC] = {
      owner: "p2",
      type: piece.type,
    };
  }

  return board;
}

function createInitialState(lobby = null, seats = null) {
  return {
    board: createInitialBoard(),
    turn: "p1",
    winner: null,
    winReason: null,
    moveNumber: 0,
    lastMove: null,

    lobby: lobby || {
      firstPlayer: null,
      secondPlayer: null,
      firstChoice: null,
    },

    seats: seats || {
      p1: null,
      p2: null,
    },
  };
}

function ensureStateShape(state) {
  if (!state.lobby) {
    state.lobby = {
      firstPlayer: null,
      secondPlayer: null,
      firstChoice: null,
    };
  }

  if (!state.seats) {
    state.seats = {
      p1: null,
      p2: null,
    };
  }

  if (
    !Array.isArray(state.board) ||
    state.board.length !== BOARD_SIZE
  ) {
    state.board = createInitialBoard();
  }

  if (
    state.turn !== "p1" &&
    state.turn !== "p2"
  ) {
    state.turn = "p1";
  }
}

function coordName(r, c) {
  return `${FILES[c]}${r + 1}`;
}

function keyOf(r, c) {
  return `${r},${c}`;
}

function insideBoard(r, c) {
  return (
    r >= 0 &&
    r < BOARD_SIZE &&
    c >= 0 &&
    c < BOARD_SIZE
  );
}

function otherSide(side) {
  return side === "p1" ? "p2" : "p1";
}

function validSide(side) {
  return side === "p1" || side === "p2";
}

function canCapture(attacker, defender) {
  return Boolean(
    attacker &&
      defender &&
      attacker.owner !== defender.owner &&
      BEATS[attacker.type] === defender.type
  );
}

function getLegalTargets(board, fromR, fromC) {
  const piece = board[fromR]?.[fromC];
  const result = new Map();

  if (!piece) return result;

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;

      const r = fromR + dr;
      const c = fromC + dc;

      if (!insideBoard(r, c)) continue;

      const target = board[r][c];

      if (!target) {
        result.set(
          keyOf(r, c),
          "move"
        );
        continue;
      }

      if (
        target.owner === piece.owner
      ) {
        continue;
      }

      if (
        target.type === piece.type
      ) {
        continue;
      }

      if (
        canCapture(piece, target)
      ) {
        result.set(
          keyOf(r, c),
          "capture"
        );
      }
    }
  }

  return result;
}

function countPieces(board, owner) {
  let total = 0;

  for (const row of board) {
    for (const piece of row) {
      if (
        piece?.owner === owner
      ) {
        total += 1;
      }
    }
  }

  return total;
}

function determineWinnerAfterMove(
  board,
  mover,
  toR,
  toC
) {
  if (
    mover === "p1" &&
    toR === 7 &&
    toC === 7
  ) {
    return {
      winner: "p1",
      reason:
        "Xanh đã đưa một quân tới ô đích h8.",
    };
  }

  if (
    mover === "p2" &&
    toR === 0 &&
    toC === 0
  ) {
    return {
      winner: "p2",
      reason:
        "Đỏ đã đưa một quân tới ô đích a1.",
    };
  }

  const opponent =
    otherSide(mover);

  if (
    countPieces(
      board,
      opponent
    ) === 0
  ) {
    return {
      winner: mover,
      reason:
        `${PLAYER_META[mover].short} đã ăn hết toàn bộ quân của đối phương.`,
    };
  }

  return null;
}

function deriveMyRole(
  state = gameState
) {
  if (
    !state ||
    !myId
  ) {
    return "spectator";
  }

  if (
    state.seats?.p1 === myId
  ) {
    return "p1";
  }

  if (
    state.seats?.p2 === myId
  ) {
    return "p2";
  }

  return "spectator";
}

function lobbyPosition(
  state = gameState
) {
  if (
    !state ||
    !myId
  ) {
    return "spectator";
  }

  if (
    state.lobby?.firstPlayer ===
    myId
  ) {
    return "first";
  }

  if (
    state.lobby?.secondPlayer ===
    myId
  ) {
    return "second";
  }

  return "spectator";
}

function bothPlayersReady(
  state = gameState
) {
  return Boolean(
    state?.seats?.p1 &&
      state?.seats?.p2
  );
}

function shortId(id) {
  if (!id) return "";

  if (id.length <= 12) {
    return id;
  }

  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function setToast(
  message,
  timeout = 2800
) {
  els.toast.textContent = message;

  clearTimeout(
    toastTimer
  );

  if (timeout > 0) {
    toastTimer =
      setTimeout(() => {
        els.toast.textContent =
          "";
      }, timeout);
  }
}

function buildTileAriaLabel(
  r,
  c,
  piece
) {
  const base =
    `Ô ${coordName(r, c)}`;

  if (!piece) {
    return base;
  }

  return (
    `${base}, ` +
    `${PLAYER_META[piece.owner].short}, ` +
    `${TYPES[piece.type].label}`
  );
}

function renderBoard() {
  if (!gameState) return;

  els.board.replaceChildren();

  const fragment =
    document.createDocumentFragment();

  for (
    let displayR = 7;
    displayR >= 0;
    displayR -= 1
  ) {
    for (
      let c = 0;
      c < BOARD_SIZE;
      c += 1
    ) {
      const piece =
        gameState.board[
          displayR
        ][c];

      const tile =
        document.createElement(
          "button"
        );

      const tileKey =
        keyOf(
          displayR,
          c
        );

      const moveKind =
        legalTargets.get(
          tileKey
        );

      const isSelected =
        selected?.r ===
          displayR &&
        selected?.c === c;

      const isTarget =
        (
          displayR === 0 &&
          c === 0
        ) ||
        (
          displayR === 7 &&
          c === 7
        );

      tile.type =
        "button";

      tile.className =
        `tile ${
          (
            displayR + c
          ) %
            2 ===
          0
            ? "dark"
            : "light"
        }`;

      tile.dataset.r =
        String(displayR);

      tile.dataset.c =
        String(c);

      tile.dataset.coord =
        coordName(
          displayR,
          c
        );

      tile.setAttribute(
        "role",
        "gridcell"
      );

      tile.setAttribute(
        "aria-label",
        buildTileAriaLabel(
          displayR,
          c,
          piece
        )
      );

      if (isTarget) {
        tile.classList.add(
          "target-tile"
        );
      }

      if (isSelected) {
        tile.classList.add(
          "selected"
        );
      }

      if (
        moveKind ===
        "move"
      ) {
        tile.classList.add(
          "valid-move"
        );
      }

      if (
        moveKind ===
        "capture"
      ) {
        tile.classList.add(
          "valid-capture"
        );
      }

      const canSelect =
        connected &&
        bothPlayersReady() &&
        !gameState.winner &&
        piece?.owner ===
          myRole &&
        gameState.turn ===
          myRole;

      if (
        canSelect ||
        moveKind
      ) {
        tile.classList.add(
          "can-select"
        );
      }

      const coord =
        document.createElement(
          "span"
        );

      coord.className =
        "coord";

      coord.textContent =
        coordName(
          displayR,
          c
        );

      tile.append(
        coord
      );

      if (piece) {
        const pieceEl =
          document.createElement(
            "span"
          );

        pieceEl.className =
          `piece ${piece.owner}`;

        pieceEl.title =
          `${PLAYER_META[piece.owner].short} · ${TYPES[piece.type].label}`;

        pieceEl.innerHTML = `
          <span aria-hidden="true">${TYPES[piece.type].emoji}</span>
          <span class="piece-label" aria-hidden="true">${TYPES[piece.type].short}</span>
        `;

        tile.append(
          pieceEl
        );
      }

      fragment.append(
        tile
      );
    }
  }

  els.board.append(
    fragment
  );
}

function renderSeatLabel(
  player,
  labelEl
) {
  const holder =
    gameState?.seats?.[
      player
    ] ?? null;

  if (!connected) {
    labelEl.textContent =
      "Đang kết nối phòng…";
    return;
  }

  if (
    holder === myId
  ) {
    labelEl.textContent =
      "Bạn đã chọn phe này.";
    return;
  }

  if (holder) {
    labelEl.textContent =
      `Đã có người chơi · ${shortId(holder)}`;
    return;
  }

  const position =
    lobbyPosition();

  const firstChoice =
    gameState?.lobby
      ?.firstChoice ??
    null;

  if (
    position === "first" &&
    !firstChoice
  ) {
    labelEl.textContent =
      "Bạn có thể chọn phe này.";
    return;
  }

  if (
    position === "second" &&
    !firstChoice
  ) {
    labelEl.textContent =
      "Chờ người vào trước chọn phe…";
    return;
  }

  if (
    position === "second" &&
    firstChoice
  ) {
    const remaining =
      otherSide(
        firstChoice
      );

    labelEl.textContent =
      player === remaining
        ? "Đây là phe còn lại dành cho bạn."
        : "Phe này đã được người vào trước chọn.";

    return;
  }

  labelEl.textContent =
    "Ghế đang trống.";
}

function renderLobbyButtons() {
  const position =
    lobbyPosition();

  const role =
    deriveMyRole();

  const firstChoice =
    gameState?.lobby
      ?.firstChoice ??
    null;

  els.joinP1Btn.disabled =
    true;

  els.joinP2Btn.disabled =
    true;

  els.joinP1Btn.textContent =
    "Chọn phe Xanh";

  els.joinP2Btn.textContent =
    "Chọn phe Đỏ";

  if (
    !connected ||
    optedOut ||
    !gameState
  ) {
    return;
  }

  if (role === "p1") {
    els.joinP1Btn.textContent =
      "✓ Bạn là phe Xanh";

    els.joinP2Btn.textContent =
      gameState.seats?.p2
        ? "Phe Đỏ đã có người"
        : "Chọn phe Đỏ";

    return;
  }

  if (role === "p2") {
    els.joinP2Btn.textContent =
      "✓ Bạn là phe Đỏ";

    els.joinP1Btn.textContent =
      gameState.seats?.p1
        ? "Phe Xanh đã có người"
        : "Chọn phe Xanh";

    return;
  }

  if (
    position === "first"
  ) {
    if (!firstChoice) {
      els.joinP1Btn.disabled =
        false;

      els.joinP2Btn.disabled =
        false;
    }

    return;
  }

  if (
    position === "second"
  ) {
    if (!firstChoice) {
      els.joinP1Btn.textContent =
        "Chờ người vào trước";

      els.joinP2Btn.textContent =
        "Chờ người vào trước";

      return;
    }

    const remaining =
      otherSide(
        firstChoice
      );

    if (
      remaining === "p1"
    ) {
      els.joinP1Btn.disabled =
        false;

      els.joinP1Btn.textContent =
        "Chọn phe Xanh";

      els.joinP2Btn.textContent =
        "Phe Đỏ đã có người";
    } else {
      els.joinP2Btn.disabled =
        false;

      els.joinP2Btn.textContent =
        "Chọn phe Đỏ";

      els.joinP1Btn.textContent =
        "Phe Xanh đã có người";
    }
  }
}

function renderWinnerModal() {
  if (
    !gameState?.winner
  ) {
    els.winnerModal.hidden =
      true;
    return;
  }

  const winner =
    gameState.winner;

  els.winnerModal.hidden =
    false;

  els.winnerTitle.textContent =
    `${PLAYER_META[winner].name} chiến thắng!`;

  els.winnerReason.textContent =
    gameState.winReason ||
    "Ván đấu đã kết thúc.";

  els.winnerIcon.textContent =
    winner === "p1"
      ? "🔵🏆"
      : "🔴🏆";
}

function renderStatus() {
  if (!gameState) return;

  myRole =
    deriveMyRole();

  const position =
    lobbyPosition();

  els.p1Count.textContent =
    String(
      countPieces(
        gameState.board,
        "p1"
      )
    );

  els.p2Count.textContent =
    String(
      countPieces(
        gameState.board,
        "p2"
      )
    );

  renderSeatLabel(
    "p1",
    els.p1Seat
  );

  renderSeatLabel(
    "p2",
    els.p2Seat
  );

  renderLobbyButtons();

  if (!connected) {
    els.statusText.textContent =
      "Đang kết nối phòng multiplayer…";

    els.turnBadge.className =
      "turn-badge";

    els.turnBadge.textContent =
      "—";

    els.myRole.textContent =
      "Đang xác định…";

    els.leaveSeatBtn.disabled =
      true;

    els.resetBtn.disabled =
      true;

    els.modalResetBtn.disabled =
      true;

    renderWinnerModal();
    return;
  }

  if (optedOut) {
    els.statusText.textContent =
      "Bạn đã nhường ghế. Tải lại trang nếu muốn tham gia lại.";

    els.turnBadge.className =
      "turn-badge";

    els.turnBadge.textContent =
      "KHÁN GIẢ";

    els.myRole.textContent =
      "Khán giả";

    els.leaveSeatBtn.disabled =
      true;

    els.resetBtn.disabled =
      true;

    els.modalResetBtn.disabled =
      true;

    renderWinnerModal();
    return;
  }

  if (
    gameState.winner
  ) {
    els.statusText.textContent =
      `${PLAYER_META[gameState.winner].name} đã thắng!`;

    els.turnBadge.className =
      `turn-badge ${gameState.winner}`;

    els.turnBadge.textContent =
      "KẾT THÚC";
  } else if (
    !bothPlayersReady()
  ) {
    els.turnBadge.className =
      "turn-badge";

    els.turnBadge.textContent =
      "CHỌN PHE";

    if (
      position === "first"
    ) {
      if (
        !gameState.lobby
          .firstChoice
      ) {
        els.statusText.textContent =
          "Bạn vào phòng đầu tiên — hãy chọn Xanh hoặc Đỏ.";
      } else {
        const remaining =
          otherSide(
            gameState.lobby
              .firstChoice
          );

        els.statusText.textContent =
          `Bạn đã chọn ${PLAYER_META[gameState.lobby.firstChoice].short}. Đang chờ người thứ hai chọn ${PLAYER_META[remaining].short}.`;
      }
    } else if (
      position === "second"
    ) {
      if (
        !gameState.lobby
          .firstChoice
      ) {
        els.statusText.textContent =
          "Bạn vào phòng thứ hai — chờ người vào trước chọn phe.";
      } else {
        const remaining =
          otherSide(
            gameState.lobby
              .firstChoice
          );

        els.statusText.textContent =
          `Người vào trước đã chọn ${PLAYER_META[gameState.lobby.firstChoice].short}. Bạn chỉ được chọn ${PLAYER_META[remaining].short}.`;
      }
    } else {
      els.statusText.textContent =
        "Phòng đã có hai vị trí người chơi. Bạn đang xem.";
    }
  } else {
    els.turnBadge.className =
      `turn-badge ${gameState.turn}`;

    els.turnBadge.textContent =
      `Lượt ${PLAYER_META[gameState.turn].short}`;

    if (
      myRole ===
      "spectator"
    ) {
      els.statusText.textContent =
        `Đang tới lượt ${PLAYER_META[gameState.turn].short} · Bạn đang xem.`;
    } else if (
      gameState.turn ===
      myRole
    ) {
      els.statusText.textContent =
        "Tới lượt bạn — chọn một quân để di chuyển.";
    } else {
      els.statusText.textContent =
        `Đang chờ ${PLAYER_META[gameState.turn].short} đi quân.`;
    }
  }

  if (
    myRole === "p1" ||
    myRole === "p2"
  ) {
    els.myRole.textContent =
      PLAYER_META[
        myRole
      ].name;
  } else if (
    position === "first"
  ) {
    els.myRole.textContent =
      "Người vào đầu tiên";
  } else if (
    position === "second"
  ) {
    els.myRole.textContent =
      "Người vào thứ hai";
  } else {
    els.myRole.textContent =
      "Khán giả";
  }

  const canLeave =
    position === "first" ||
    position === "second" ||
    myRole !==
      "spectator";

  els.leaveSeatBtn.disabled =
    !canLeave;

  els.resetBtn.disabled =
    myRole ===
    "spectator";

  els.modalResetBtn.disabled =
    myRole ===
    "spectator";

  renderWinnerModal();
}

function renderAll() {
  if (!gameState) return;

  myRole =
    deriveMyRole();

  if (selected) {
    const piece =
      gameState.board[
        selected.r
      ]?.[
        selected.c
      ];

    if (
      !bothPlayersReady() ||
      !piece ||
      piece.owner !==
        myRole ||
      gameState.turn !==
        myRole ||
      gameState.winner
    ) {
      selected = null;
      legalTargets.clear();
    } else {
      legalTargets =
        getLegalTargets(
          gameState.board,
          selected.r,
          selected.c
        );
    }
  }

  renderStatus();
  renderBoard();
}

function scheduleLobbyRegistration(
  delay = 120
) {
  clearTimeout(
    registerTimer
  );

  if (
    !connected ||
    !gameStore ||
    !myId ||
    optedOut
  ) {
    return;
  }

  registerTimer =
    setTimeout(
      registerForLobby,
      delay
    );
}

function registerForLobby() {
  if (
    !connected ||
    !gameStore ||
    !gameState ||
    !myId ||
    optedOut
  ) {
    return;
  }

  const currentPosition =
    lobbyPosition();

  if (
    currentPosition !==
    "spectator"
  ) {
    return;
  }

  gameStore.setData(
    (draft) => {
      ensureStateShape(
        draft
      );

      if (
        draft.lobby
          .firstPlayer ===
          myId ||
        draft.lobby
          .secondPlayer ===
          myId
      ) {
        return;
      }

      if (
        !draft.lobby
          .firstPlayer
      ) {
        draft.lobby.firstPlayer =
          myId;
        return;
      }

      if (
        !draft.lobby
          .secondPlayer
      ) {
        draft.lobby.secondPlayer =
          myId;
      }
    }
  );
}

function chooseSide(side) {
  if (
    !connected ||
    !gameStore ||
    !gameState ||
    !myId ||
    optedOut
  ) {
    return;
  }

  if (!validSide(side)) {
    return;
  }

  const position =
    lobbyPosition();

  if (
    position ===
    "spectator"
  ) {
    setToast(
      "Phòng đã có hai người chơi."
    );
    return;
  }

  gameStore.setData(
    (draft) => {
      ensureStateShape(
        draft
      );

      const first =
        draft.lobby
          .firstPlayer;

      const second =
        draft.lobby
          .secondPlayer;

      const firstChoice =
        draft.lobby
          .firstChoice;

      if (
        first === myId
      ) {
        if (
          firstChoice &&
          draft.seats?.[
            firstChoice
          ] === myId
        ) {
          return;
        }

        if (firstChoice) {
          return;
        }

        if (
          draft.seats.p1 ||
          draft.seats.p2
        ) {
          return;
        }

        draft.lobby.firstChoice =
          side;

        draft.seats[
          side
        ] = myId;

        return;
      }

      if (
        second === myId
      ) {
        if (
          !firstChoice
        ) {
          return;
        }

        const remaining =
          otherSide(
            firstChoice
          );

        if (
          side !==
          remaining
        ) {
          return;
        }

        if (
          draft.seats[
            remaining
          ] &&
          draft.seats[
            remaining
          ] !== myId
        ) {
          return;
        }

        draft.seats[
          remaining
        ] = myId;
      }
    }
  );
}

function handleBoardClick(
  event
) {
  const tile =
    event.target.closest(
      ".tile"
    );

  if (
    !tile ||
    !gameState ||
    !gameStore ||
    !connected
  ) {
    return;
  }

  if (
    !bothPlayersReady()
  ) {
    setToast(
      "Cần đủ hai người chọn phe trước khi bắt đầu."
    );
    return;
  }

  const r =
    Number(
      tile.dataset.r
    );

  const c =
    Number(
      tile.dataset.c
    );

  const clickedPiece =
    gameState.board[
      r
    ][c];

  const targetKind =
    legalTargets.get(
      keyOf(r, c)
    );

  if (
    gameState.winner
  ) {
    setToast(
      "Ván đấu đã kết thúc. Hãy bấm Chơi lại."
    );
    return;
  }

  if (
    myRole ===
    "spectator"
  ) {
    setToast(
      "Bạn đang là khán giả."
    );
    return;
  }

  if (
    gameState.turn !==
    myRole
  ) {
    setToast(
      `Chưa tới lượt bạn. Hiện là lượt ${PLAYER_META[gameState.turn].short}.`
    );
    return;
  }

  if (
    selected &&
    targetKind
  ) {
    commitMove(
      selected.r,
      selected.c,
      r,
      c,
      targetKind
    );
    return;
  }

  if (
    clickedPiece?.owner ===
    myRole
  ) {
    selected = {
      r,
      c,
    };

    legalTargets =
      getLegalTargets(
        gameState.board,
        r,
        c
      );

    renderBoard();
    return;
  }

  selected = null;
  legalTargets.clear();

  renderBoard();
}

function commitMove(
  fromR,
  fromC,
  toR,
  toC,
  targetKind
) {
  if (
    !gameStore ||
    !gameState ||
    !myId
  ) {
    return;
  }

  const livePiece =
    gameState.board[
      fromR
    ]?.[
      fromC
    ];

  const liveLegal =
    getLegalTargets(
      gameState.board,
      fromR,
      fromC
    );

  if (
    gameState.winner ||
    !bothPlayersReady() ||
    gameState.turn !==
      myRole ||
    livePiece?.owner !==
      myRole ||
    !liveLegal.has(
      keyOf(toR, toC)
    )
  ) {
    selected = null;
    legalTargets.clear();
    renderAll();
    return;
  }

  const movingPiece = {
    ...livePiece,
  };

  const capturedPiece =
    gameState.board[
      toR
    ][toC]
      ? {
          ...gameState
            .board[toR][
            toC
          ],
        }
      : null;

  gameStore.setData(
    (draft) => {
      ensureStateShape(
        draft
      );

      if (
        draft.winner ||
        draft.turn !==
          myRole ||
        draft.seats?.[
          myRole
        ] !== myId ||
        !draft.seats?.p1 ||
        !draft.seats?.p2
      ) {
        return;
      }

      const draftPiece =
        draft.board[
          fromR
        ]?.[
          fromC
        ];

      if (
        !draftPiece ||
        draftPiece.owner !==
          myRole
      ) {
        return;
      }

      const currentLegal =
        getLegalTargets(
          draft.board,
          fromR,
          fromC
        );

      if (
        !currentLegal.has(
          keyOf(
            toR,
            toC
          )
        )
      ) {
        return;
      }

      const captured =
        draft.board[
          toR
        ][toC];

      const type =
        draftPiece.type;

      draft.board[
        fromR
      ].splice(
        fromC,
        1,
        null
      );

      draft.board[
        toR
      ].splice(
        toC,
        1,
        {
          owner:
            myRole,
          type,
        }
      );

      draft.moveNumber =
        (
          draft.moveNumber ??
          0
        ) + 1;

      draft.lastMove = {
        by: myRole,
        from: coordName(
          fromR,
          fromC
        ),
        to: coordName(
          toR,
          toC
        ),
        piece: type,
        capture: captured
          ? captured.type
          : null,
        at: Date.now(),
      };

      const result =
        determineWinnerAfterMove(
          draft.board,
          myRole,
          toR,
          toC
        );

      if (result) {
        draft.winner =
          result.winner;

        draft.winReason =
          result.reason;
      } else {
        draft.turn =
          otherSide(
            myRole
          );
      }
    }
  );

  selected = null;
  legalTargets.clear();

  if (
    targetKind ===
      "capture" &&
    capturedPiece
  ) {
    setToast(
      `${TYPES[movingPiece.type].label} ${TYPES[movingPiece.type].emoji} ăn ${TYPES[capturedPiece.type].label} ${TYPES[capturedPiece.type].emoji}.`
    );
  }
}

function leaveSeat() {
  if (
    !gameStore ||
    !gameState ||
    !myId
  ) {
    return;
  }

  const position =
    lobbyPosition();

  const role =
    deriveMyRole();

  if (
    position ===
      "spectator" &&
    role ===
      "spectator"
  ) {
    return;
  }

  optedOut = true;

  selected = null;
  legalTargets.clear();

  gameStore.setData(
    (draft) => {
      ensureStateShape(
        draft
      );

      const wasFirst =
        draft.lobby
          .firstPlayer ===
        myId;

      const wasSecond =
        draft.lobby
          .secondPlayer ===
        myId;

      if (wasFirst) {
        const promoted =
          draft.lobby
            .secondPlayer ||
          null;

        draft.lobby.firstPlayer =
          promoted;

        draft.lobby.secondPlayer =
          null;

        draft.lobby.firstChoice =
          null;

        draft.seats.p1 =
          null;

        draft.seats.p2 =
          null;

        draft.board =
          createInitialBoard();

        draft.turn =
          "p1";

        draft.winner =
          null;

        draft.winReason =
          null;

        draft.moveNumber =
          0;

        draft.lastMove =
          null;

        return;
      }

      if (wasSecond) {
        draft.lobby.secondPlayer =
          null;

        if (
          draft.seats.p1 ===
          myId
        ) {
          draft.seats.p1 =
            null;
        }

        if (
          draft.seats.p2 ===
          myId
        ) {
          draft.seats.p2 =
            null;
        }
      }
    }
  );

  setToast(
    "Bạn đã nhường ghế. Tải lại trang nếu muốn tham gia lại."
  );

  renderAll();
}

function resetGame() {
  if (
    !gameStore ||
    !gameState ||
    myRole ===
      "spectator"
  ) {
    setToast(
      "Chỉ người đang chơi mới có thể chơi lại."
    );
    return;
  }

  gameStore.setData(
    (draft) => {
      ensureStateShape(
        draft
      );

      draft.board =
        createInitialBoard();

      draft.turn =
        "p1";

      draft.winner =
        null;

      draft.winReason =
        null;

      draft.moveNumber =
        0;

      draft.lastMove =
        null;
    }
  );

  selected = null;
  legalTargets.clear();

  setToast(
    "Đã tạo lại bàn cờ. Xanh đi trước."
  );
}

async function copyRoomLink() {
  try {
    await navigator.clipboard.writeText(
      window.location.href
    );

    setToast(
      "Đã sao chép link phòng."
    );
  } catch {
    setToast(
      "Không sao chép tự động được. Hãy copy URL trên thanh địa chỉ."
    );
  }
}

function refreshPresence() {
  if (
    !playhtml?.presence
  ) {
    return;
  }

  const ids =
    new Set();

  const presences =
    playhtml.presence.getPresences();

  for (
    const presence of
    presences.values()
  ) {
    const id =
      presence
        .playerIdentity
        ?.publicKey;

    if (id) {
      ids.add(id);
    }
  }

  onlineIds = ids;

  renderStatus();
}

function withTimeout(
  promise,
  ms,
  message
) {
  return Promise.race([
    promise,

    new Promise(
      (
        _,
        reject
      ) => {
        setTimeout(
          () =>
            reject(
              new Error(
                message
              )
            ),
          ms
        );
      }
    ),
  ]);
}

async function loadPlayHTML() {
  const sources = [
    "https://unpkg.com/playhtml",
    "https://cdn.jsdelivr.net/npm/playhtml/+esm",
  ];

  let lastError =
    null;

  for (
    const source of
    sources
  ) {
    try {
      const mod =
        await withTimeout(
          import(source),
          10000,
          `Quá thời gian tải PlayHTML từ ${source}`
        );

      if (
        mod?.playhtml
      ) {
        return mod.playhtml;
      }
    } catch (error) {
      console.warn(
        "Không tải được PlayHTML từ",
        source,
        error
      );

      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Không tải được thư viện PlayHTML."
    )
  );
}

async function start() {
  gameState =
    createInitialState();

  els.roomText.textContent =
    `Phòng: ${roomCode}`;

  els.connectionText.textContent =
    "Đang kết nối…";

  els.connectionDot.classList.remove(
    "online"
  );

  renderAll();

  try {
    playhtml =
      await loadPlayHTML();

    playhtml.init({
      room: ROOM_ID,
    });

    await withTimeout(
      playhtml.ready,
      15000,
      "Kết nối PlayHTML quá 15 giây. Hãy tải lại trang hoặc kiểm tra mạng."
    );

    myId =
      playhtml.presence
        .getMyIdentity()
        .publicKey;

    playhtml.presence.setMyPresence(
      PRESENCE_KEY,
      {
        userId: myId,
        room: roomCode,
      }
    );

    playhtml.presence.onPresenceChange(
      PRESENCE_KEY,
      () => {
        refreshPresence();
        scheduleLobbyRegistration(
          150
        );
      }
    );

    gameStore =
      playhtml.createPageData(
        GAME_KEY,
        createInitialState()
      );

    gameState =
      gameStore.getData();

    gameStore.onUpdate(
      (nextState) => {
        gameState =
          nextState;

        myRole =
          deriveMyRole(
            nextState
          );

        renderAll();

        scheduleLobbyRegistration(
          100
        );
      }
    );

    connected =
      true;

    els.connectionDot.classList.add(
      "online"
    );

    els.connectionText.textContent =
      "Đã kết nối realtime";

    els.roomText.textContent =
      `Phòng: ${roomCode}`;

    refreshPresence();
    renderAll();

    scheduleLobbyRegistration(
      50
    );
  } catch (error) {
    console.error(
      "Không thể kết nối PlayHTML:",
      error
    );

    connected =
      false;

    els.connectionDot.classList.remove(
      "online"
    );

    els.connectionText.textContent =
      "Mất kết nối realtime";

    els.statusText.textContent =
      "Không kết nối được multiplayer. Hãy Ctrl + F5 rồi thử lại.";

    setToast(
      error?.message ||
        String(error),
      0
    );

    renderAll();
  }
}

els.board.addEventListener(
  "click",
  handleBoardClick
);

els.joinP1Btn.addEventListener(
  "click",
  () => chooseSide("p1")
);

els.joinP2Btn.addEventListener(
  "click",
  () => chooseSide("p2")
);

els.leaveSeatBtn.addEventListener(
  "click",
  leaveSeat
);

els.copyRoomBtn.addEventListener(
  "click",
  copyRoomLink
);

els.resetBtn.addEventListener(
  "click",
  resetGame
);

els.modalResetBtn.addEventListener(
  "click",
  resetGame
);

start();