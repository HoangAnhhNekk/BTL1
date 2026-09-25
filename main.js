import { playhtml } from "https://unpkg.com/playhtml";

const BOARD_SIZE = 8;
const FILES = "abcdefgh";

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
let onlineIds = new Set();
let toastTimer = null;

/**
 * Board coordinates:
 * - board[r][c]
 * - r = 0 is rank 1, r = 7 is rank 8
 * - c = 0 is file a, c = 7 is file h
 *
 * Reflection across the anti-diagonal h1-a8:
 * [r, c] -> [7 - c, 7 - r]
 */
function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  // 8 quân P1 ở nửa dưới/trái. Không đặt quân ngay trên ô đích a1/h8.
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
    board[piece.r][piece.c] = { owner: "p1", type: piece.type };

    const mirroredR = 7 - piece.c;
    const mirroredC = 7 - piece.r;
    board[mirroredR][mirroredC] = { owner: "p2", type: piece.type };
  }

  return board;
}

function createInitialState(seats = { p1: null, p2: null }) {
  return {
    board: createInitialBoard(),
    turn: "p1",
    winner: null,
    winReason: null,
    seats: { p1: seats.p1 ?? null, p2: seats.p2 ?? null },
    moveNumber: 0,
    lastMove: null,
  };
}

function coordName(r, c) {
  return `${FILES[c]}${r + 1}`;
}

function keyOf(r, c) {
  return `${r},${c}`;
}

function insideBoard(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
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
        result.set(keyOf(r, c), "move");
        continue;
      }

      if (target.owner === piece.owner) continue;
      if (canCapture(piece, target)) {
        result.set(keyOf(r, c), "capture");
      }
    }
  }

  return result;
}

function countPieces(board, owner) {
  let total = 0;
  for (const row of board) {
    for (const piece of row) {
      if (piece?.owner === owner) total += 1;
    }
  }
  return total;
}

function determineWinnerAfterMove(board, mover, toR, toC) {
  if (mover === "p1" && toR === 7 && toC === 7) {
    return { winner: "p1", reason: "Xanh đã đưa một quân tới ô đích h8." };
  }

  if (mover === "p2" && toR === 0 && toC === 0) {
    return { winner: "p2", reason: "Đỏ đã đưa một quân tới ô đích a1." };
  }

  const opponent = mover === "p1" ? "p2" : "p1";
  if (countPieces(board, opponent) === 0) {
    return {
      winner: mover,
      reason: `${PLAYER_META[mover].short} đã ăn hết toàn bộ quân của đối phương.`,
    };
  }

  return null;
}

function deriveMyRole(state = gameState) {
  if (!state || !myId) return "spectator";
  if (state.seats?.p1 === myId) return "p1";
  if (state.seats?.p2 === myId) return "p2";
  return "spectator";
}

function shortId(id) {
  if (!id) return "Trống";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function isSeatAvailable(player) {
  const holder = gameState?.seats?.[player];
  return !holder || holder === myId || !onlineIds.has(holder);
}

function setToast(message, timeout = 2600) {
  els.toast.textContent = message;
  clearTimeout(toastTimer);
  if (timeout > 0) {
    toastTimer = setTimeout(() => {
      els.toast.textContent = "";
    }, timeout);
  }
}

function renderBoard() {
  if (!gameState) return;

  els.board.replaceChildren();
  const fragment = document.createDocumentFragment();

  // Hiển thị rank 8 ở trên cùng, rank 1 ở dưới cùng.
  for (let displayR = 7; displayR >= 0; displayR -= 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const piece = gameState.board[displayR][c];
      const tile = document.createElement("button");
      const tileKey = keyOf(displayR, c);
      const moveKind = legalTargets.get(tileKey);
      const isSelected = selected?.r === displayR && selected?.c === c;
      const isTarget =
        (displayR === 0 && c === 0) ||
        (displayR === 7 && c === 7);

      tile.type = "button";
      tile.className = `tile ${(displayR + c) % 2 === 0 ? "dark" : "light"}`;
      tile.dataset.r = String(displayR);
      tile.dataset.c = String(c);
      tile.dataset.coord = coordName(displayR, c);
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", buildTileAriaLabel(displayR, c, piece));

      if (isTarget) tile.classList.add("target-tile");
      if (isSelected) tile.classList.add("selected");
      if (moveKind === "move") tile.classList.add("valid-move");
      if (moveKind === "capture") tile.classList.add("valid-capture");

      const canSelect =
        !gameState.winner &&
        piece?.owner === myRole &&
        gameState.turn === myRole;
      if (canSelect || moveKind) tile.classList.add("can-select");

      const coord = document.createElement("span");
      coord.className = "coord";
      coord.textContent = coordName(displayR, c);
      tile.append(coord);

      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece ${piece.owner}`;
        pieceEl.title = `${PLAYER_META[piece.owner].short} · ${TYPES[piece.type].label}`;
        pieceEl.innerHTML = `
          <span aria-hidden="true">${TYPES[piece.type].emoji}</span>
          <span class="piece-label" aria-hidden="true">${TYPES[piece.type].short}</span>
        `;
        tile.append(pieceEl);
      }

      fragment.append(tile);
    }
  }

  els.board.append(fragment);
}

function buildTileAriaLabel(r, c, piece) {
  const base = `Ô ${coordName(r, c)}`;
  if (!piece) return base;
  return `${base}, ${PLAYER_META[piece.owner].short}, ${TYPES[piece.type].label}`;
}

function renderStatus() {
  if (!gameState) return;

  myRole = deriveMyRole();

  const p1Total = countPieces(gameState.board, "p1");
  const p2Total = countPieces(gameState.board, "p2");
  els.p1Count.textContent = String(p1Total);
  els.p2Count.textContent = String(p2Total);

  els.turnBadge.className = `turn-badge ${gameState.turn}`;
  els.turnBadge.textContent = `Lượt ${PLAYER_META[gameState.turn].short}`;

  if (gameState.winner) {
    els.statusText.textContent = `${PLAYER_META[gameState.winner].name} đã thắng!`;
  } else if (myRole === "spectator") {
    els.statusText.textContent = `Đang tới lượt ${PLAYER_META[gameState.turn].short} · Bạn đang xem.`;
  } else if (gameState.turn === myRole) {
    els.statusText.textContent = "Tới lượt bạn — chọn một quân để di chuyển.";
  } else {
    els.statusText.textContent = `Đang chờ ${PLAYER_META[gameState.turn].short} đi quân.`;
  }

  els.myRole.textContent =
    myRole === "spectator" ? "Khán giả" : PLAYER_META[myRole].name;

  renderSeatStatus("p1", els.p1Seat, els.joinP1Btn);
  renderSeatStatus("p2", els.p2Seat, els.joinP2Btn);

  els.leaveSeatBtn.disabled = myRole === "spectator";
  els.resetBtn.disabled = myRole === "spectator";
  els.modalResetBtn.disabled = myRole === "spectator";

  renderWinnerModal();
}

function renderSeatStatus(player, labelEl, buttonEl) {
  const holder = gameState?.seats?.[player] ?? null;
  const isMine = holder === myId;
  const isOnline = holder ? onlineIds.has(holder) : false;

  if (!holder) {
    labelEl.textContent = "Ghế đang trống.";
  } else if (isMine) {
    labelEl.textContent = `Bạn đang giữ ghế này · ${shortId(holder)}`;
  } else if (isOnline) {
    labelEl.textContent = `Đã có người chơi · ${shortId(holder)}`;
  } else {
    labelEl.textContent = `Người giữ ghế đã rời phòng · có thể tiếp quản.`;
  }

  buttonEl.disabled = isMine || (!isSeatAvailable(player) && !isMine);
  buttonEl.textContent = isMine
    ? "Bạn đang ở phe này"
    : holder && !isOnline
      ? `Tiếp quản phe ${PLAYER_META[player].short}`
      : `Chọn phe ${PLAYER_META[player].short}`;
}

function renderWinnerModal() {
  if (!gameState?.winner) {
    els.winnerModal.hidden = true;
    return;
  }

  const winner = gameState.winner;
  els.winnerModal.hidden = false;
  els.winnerTitle.textContent = `${PLAYER_META[winner].name} chiến thắng!`;
  els.winnerReason.textContent = gameState.winReason || "Ván đấu đã kết thúc.";
  els.winnerIcon.textContent = winner === "p1" ? "🔵🏆" : "🔴🏆";
}

function renderAll() {
  if (!gameState) return;

  // Nếu state remote thay đổi khiến quân đang chọn không còn hợp lệ, bỏ chọn.
  if (selected) {
    const piece = gameState.board[selected.r]?.[selected.c];
    if (!piece || piece.owner !== myRole || gameState.turn !== myRole || gameState.winner) {
      selected = null;
      legalTargets.clear();
    } else {
      legalTargets = getLegalTargets(gameState.board, selected.r, selected.c);
    }
  }

  renderStatus();
  renderBoard();
}

function handleBoardClick(event) {
  const tile = event.target.closest(".tile");
  if (!tile || !gameState || !gameStore) return;

  const r = Number(tile.dataset.r);
  const c = Number(tile.dataset.c);
  const clickedPiece = gameState.board[r][c];
  const targetKind = legalTargets.get(keyOf(r, c));

  if (gameState.winner) {
    setToast("Ván đấu đã kết thúc. Hãy bấm Chơi lại.");
    return;
  }

  if (myRole === "spectator") {
    setToast("Bạn đang là khán giả. Hãy chọn một phe còn trống.");
    return;
  }

  if (gameState.turn !== myRole) {
    setToast(`Chưa tới lượt bạn. Hiện là lượt ${PLAYER_META[gameState.turn].short}.`);
    return;
  }

  // Đang chọn một quân và click vào ô hợp lệ => thực hiện nước đi.
  if (selected && targetKind) {
    commitMove(selected.r, selected.c, r, c, targetKind);
    return;
  }

  // Click quân của mình => chọn/chuyển lựa chọn.
  if (clickedPiece?.owner === myRole) {
    selected = { r, c };
    legalTargets = getLegalTargets(gameState.board, r, c);
    renderBoard();
    return;
  }

  // Click chỗ khác => bỏ chọn.
  selected = null;
  legalTargets.clear();
  renderBoard();
}

function commitMove(fromR, fromC, toR, toC, targetKind) {
  if (!gameStore || !gameState) return;

  // Kiểm tra lại ngay trước khi gửi update để tránh thao tác từ state UI cũ.
  const livePiece = gameState.board[fromR]?.[fromC];
  const liveLegal = getLegalTargets(gameState.board, fromR, fromC);
  if (
    gameState.winner ||
    gameState.turn !== myRole ||
    livePiece?.owner !== myRole ||
    !liveLegal.has(keyOf(toR, toC))
  ) {
    selected = null;
    legalTargets.clear();
    setToast("Nước đi không còn hợp lệ vì trạng thái phòng vừa thay đổi.");
    renderAll();
    return;
  }

  const movingPiece = { ...livePiece };
  const capturedPiece = gameState.board[toR][toC]
    ? { ...gameState.board[toR][toC] }
    : null;

  gameStore.setData((draft) => {
    // Xác nhận lần nữa bằng draft mới nhất do playhtml cung cấp.
    const draftPiece = draft.board?.[fromR]?.[fromC];
    if (
      draft.winner ||
      draft.turn !== myRole ||
      draft.seats?.[myRole] !== myId ||
      !draftPiece ||
      draftPiece.owner !== myRole
    ) {
      return;
    }

    const currentLegal = getLegalTargets(draft.board, fromR, fromC);
    if (!currentLegal.has(keyOf(toR, toC))) return;

    const nextBoard = cloneBoard(draft.board);
    const captured = nextBoard[toR][toC];
    nextBoard[toR][toC] = { ...nextBoard[fromR][fromC] };
    nextBoard[fromR][fromC] = null;

    draft.board = nextBoard;
    draft.moveNumber = (draft.moveNumber ?? 0) + 1;
    draft.lastMove = {
      by: myRole,
      from: coordName(fromR, fromC),
      to: coordName(toR, toC),
      piece: movingPiece.type,
      capture: captured ? captured.type : null,
      at: Date.now(),
    };

    const result = determineWinnerAfterMove(nextBoard, myRole, toR, toC);
    if (result) {
      draft.winner = result.winner;
      draft.winReason = result.reason;
    } else {
      draft.turn = myRole === "p1" ? "p2" : "p1";
    }
  });

  selected = null;
  legalTargets.clear();

  if (targetKind === "capture" && capturedPiece) {
    setToast(
      `${TYPES[movingPiece.type].label} ${TYPES[movingPiece.type].emoji} ăn ${TYPES[capturedPiece.type].label} ${TYPES[capturedPiece.type].emoji}.`
    );
  }
}

function claimSeat(player, { quiet = false } = {}) {
  if (!gameStore || !gameState || !myId) return;

  const holder = gameState.seats?.[player];
  const other = player === "p1" ? "p2" : "p1";

  if (gameState.seats?.[other] === myId) {
    gameStore.setData((draft) => {
      if (draft.seats?.[other] === myId) draft.seats[other] = null;
      if (!draft.seats) draft.seats = { p1: null, p2: null };
      draft.seats[player] = myId;
    });
    return;
  }

  if (holder && holder !== myId && onlineIds.has(holder)) {
    if (!quiet) setToast(`Phe ${PLAYER_META[player].short} đang có người chơi.`);
    return;
  }

  gameStore.setData((draft) => {
    if (!draft.seats) draft.seats = { p1: null, p2: null };
    const currentHolder = draft.seats[player];

    // Chỉ nhận ghế nếu trống, là ghế của mình, hoặc chủ cũ đang offline theo snapshot presence.
    if (!currentHolder || currentHolder === myId || !onlineIds.has(currentHolder)) {
      draft.seats[player] = myId;
    }
  });

  if (!quiet) setToast(`Đã chọn phe ${PLAYER_META[player].short}.`);
}

function leaveSeat() {
  if (!gameStore || myRole === "spectator") return;
  const leaving = myRole;

  gameStore.setData((draft) => {
    if (draft.seats?.[leaving] === myId) draft.seats[leaving] = null;
  });

  selected = null;
  legalTargets.clear();
  setToast("Bạn đã nhường ghế cho người khác.");
}

function resetGame() {
  if (!gameStore || !gameState) return;
  if (myRole === "spectator") {
    setToast("Chỉ người đang giữ ghế mới có thể chơi lại.");
    return;
  }

  const seats = { ...gameState.seats };
  gameStore.setData(createInitialState(seats));
  selected = null;
  legalTargets.clear();
  setToast("Đã tạo lại bàn cờ. Xanh đi trước.");
}

function refreshPresence() {
  if (!playhtml.presence) return;
  const presences = playhtml.presence.getPresences();
  const ids = new Set();

  for (const presence of presences.values()) {
    const id = presence.playerIdentity?.publicKey;
    if (id) ids.add(id);
  }

  onlineIds = ids;
  if (gameState) renderStatus();
}

function autoAssignSeat() {
  if (!gameState || !myId) return;
  if (deriveMyRole(gameState) !== "spectator") return;

  // Đúng yêu cầu: người đầu tiên vào phòng lấy P1; người kế tiếp lấy P2.
  // Không tự cướp ghế offline để tránh giành ghế khi người chơi đang refresh;
  // trường hợp ghế cũ bị treo có nút "Tiếp quản" thủ công.
  if (!gameState.seats?.p1) {
    claimSeat("p1", { quiet: true });
  } else if (!gameState.seats?.p2) {
    claimSeat("p2", { quiet: true });
  }
}

async function copyRoomLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setToast("Đã sao chép link phòng. Gửi link này cho người chơi thứ hai.");
  } catch {
    setToast("Không sao chép tự động được. Hãy copy URL trên thanh địa chỉ.");
  }
}

async function init() {
  try {
    // Theo docs PlayHTML: cùng URL/path/query => cùng room nếu không override room.
    playhtml.init();
    await playhtml.ready;

    const identity = playhtml.presence.getMyIdentity();
    myId = identity.publicKey;

    // Presence chỉ dùng để biết người giữ ghế có đang online hay không.
    playhtml.presence.setMyPresence("ottv2", { userId: myId });
    playhtml.presence.onPresenceChange("ottv2", refreshPresence);
    refreshPresence();

    // Shared persistent store của toàn bộ ván đấu.
    gameStore = playhtml.createPageData("ottv2-game-state-v1", createInitialState());
    gameState = gameStore.getData();

    gameStore.onUpdate((nextState) => {
      gameState = nextState;
      myRole = deriveMyRole(nextState);
      renderAll();
    });

    els.connectionDot.classList.add("online");
    els.connectionText.textContent = "Đã kết nối realtime";
    els.roomText.textContent = `Phòng: ${playhtml.roomId || window.location.pathname}`;

    myRole = deriveMyRole(gameState);
    renderAll();
    autoAssignSeat();
  } catch (error) {
    console.error(error);
    els.connectionText.textContent = "Không kết nối được";
    els.statusText.textContent = "PlayHTML chưa kết nối. Kiểm tra Internet và mở trang qua HTTP/HTTPS.";
    setToast(String(error?.message || error), 0);
  }
}

els.board.addEventListener("click", handleBoardClick);
els.joinP1Btn.addEventListener("click", () => claimSeat("p1"));
els.joinP2Btn.addEventListener("click", () => claimSeat("p2"));
els.leaveSeatBtn.addEventListener("click", leaveSeat);
els.copyRoomBtn.addEventListener("click", copyRoomLink);
els.resetBtn.addEventListener("click", resetGame);
els.modalResetBtn.addEventListener("click", resetGame);

init();
