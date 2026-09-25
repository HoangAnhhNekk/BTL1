import { playhtml } from 'https://unpkg.com/playhtml';

const SIZE = 8;

const SYMBOL = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

const TYPE_NAME = {
  rock: 'Đấm',
  paper: 'Lá',
  scissors: 'Kéo',
};

const BEATS = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

const SIDE_NAME = {
  p1: 'Xanh',
  p2: 'Đỏ',
};

const START_P1 = [
  [4, 4, 'rock'],
  [4, 5, 'scissors'],
  [5, 3, 'paper'],
  [5, 4, 'rock'],
  [5, 5, 'paper'],
  [6, 3, 'scissors'],
  [6, 4, 'rock'],
];

const PRESENCE_KEY = 'ottv2LobbyV4';
const GAME_KEY = 'ottv2GameV4';

const els = {
  board: document.querySelector('#board'),
  roomCode: document.querySelector('#room-code'),
  copyLink: document.querySelector('#copy-link'),
  connection: document.querySelector('#connection'),
  statusTitle: document.querySelector('#status-title'),
  statusDetail: document.querySelector('#status-detail'),
  turnBadge: document.querySelector('#turn-badge'),
  myRole: document.querySelector('#my-role'),
  p1Seat: document.querySelector('#p1-seat'),
  p2Seat: document.querySelector('#p2-seat'),
  joinP1: document.querySelector('#join-p1'),
  joinP2: document.querySelector('#join-p2'),
  leaveSeat: document.querySelector('#leave-seat'),
  reset: document.querySelector('#reset'),
  toast: document.querySelector('#toast'),
};

function randomId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validSide(side) {
  return side === 'p1' || side === 'p2';
}

function otherSide(side) {
  return side === 'p1' ? 'p2' : 'p1';
}

/* =========================================================
   ROOM
   ========================================================= */

const params = new URLSearchParams(location.search);

let roomCode = params.get('room')?.toUpperCase() ?? '';

if (!/^[A-Z0-9-]{4,20}$/.test(roomCode)) {
  roomCode = randomId()
    .replaceAll('-', '')
    .slice(0, 6)
    .toUpperCase();

  params.set('room', roomCode);

  history.replaceState(
    null,
    '',
    `${location.pathname}?${params.toString()}${location.hash}`,
  );
}

els.roomCode.textContent = roomCode;

/* =========================================================
   LOCAL PLAYER
   ========================================================= */

let clientId = null;
let channel = null;
let game = null;
let selected = null;

let toastTimer = null;
let lastGameSnapshot = '';

let lobbyReady = false;
let choosingSide = false;

const joinedAtKey = `ottv2:${roomCode}:joinedAt`;
const choiceKey = `ottv2:${roomCode}:choice`;

let myJoinedAt = Number(sessionStorage.getItem(joinedAtKey));

if (!Number.isFinite(myJoinedAt) || myJoinedAt <= 0) {
  myJoinedAt = Date.now();
  sessionStorage.setItem(joinedAtKey, String(myJoinedAt));
}

let myChoice = sessionStorage.getItem(choiceKey);

if (!validSide(myChoice)) {
  myChoice = null;
}

/* =========================================================
   BOARD
   ========================================================= */

function createBoard() {
  const board = Array.from(
    { length: SIZE },
    () => Array(SIZE).fill(null),
  );

  for (const [row, col, type] of START_P1) {
    board[row][col] = {
      owner: 'p1',
      type,
    };

    /*
      Đối xứng qua đường chéo phụ h1 - a8:
      [r, c] -> [7-c, 7-r]
    */
    board[7 - col][7 - row] = {
      owner: 'p2',
      type,
    };
  }

  return board;
}

function initialGame() {
  return {
    board: createBoard(),
    turn: 'p1',
    winner: null,
    lastMove: null,
    moveNumber: 0,
  };
}

/* =========================================================
   PRESENCE / PLAYER ORDER
   ========================================================= */

function publishMyPresence() {
  if (!clientId) return;

  playhtml.presence.setMyPresence(PRESENCE_KEY, {
    token: clientId,
    joinedAt: myJoinedAt,
    choice: myChoice,
  });
}

function getLobbyPlayers() {
  if (!clientId) return [];

  const playersByToken = new Map();

  const presences = playhtml.presence.getPresences();

  for (const person of presences.values()) {
    const data = person?.[PRESENCE_KEY];

    if (!data?.token) continue;

    const token = String(data.token);

    const joinedAt = Number(data.joinedAt) || 0;

    const choice = validSide(data.choice)
      ? data.choice
      : null;

    const current = playersByToken.get(token);

    /*
      Nếu cùng một publicKey xuất hiện nhiều lần,
      giữ phiên có thời điểm vào sớm nhất.
    */
    if (
      !current ||
      joinedAt < current.joinedAt
    ) {
      playersByToken.set(token, {
        token,
        joinedAt,
        choice,
      });
    }
  }

  return [...playersByToken.values()].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) {
      return a.joinedAt - b.joinedAt;
    }

    return a.token.localeCompare(b.token);
  });
}

/*
  QUY TẮC CHỌN PHE:

  Người thứ 1:
      được chọn Xanh hoặc Đỏ.

  Người thứ 2:
      KHÔNG được chọn trước.
      Sau khi người thứ 1 chọn xong,
      chỉ được chọn phe còn lại.

  Người thứ 3 trở đi:
      khán giả.

  Ghế được TÍNH từ Presence thay vì để 2 máy
  cùng ghi vào một biến seat.
  Điều này tránh lỗi 2 máy cùng nhận một phe.
*/
function deriveLobby() {
  const players = getLobbyPlayers();

  const first = players[0] ?? null;
  const second = players[1] ?? null;

  const seats = {
    p1: null,
    p2: null,
  };

  let firstSide = null;

  if (first && validSide(first.choice)) {
    firstSide = first.choice;
    seats[firstSide] = first.token;
  }

  if (
    firstSide &&
    second &&
    validSide(second.choice)
  ) {
    const remaining = otherSide(firstSide);

    /*
      Người thứ hai chỉ được công nhận nếu
      chọn đúng phe còn lại.
    */
    if (second.choice === remaining) {
      seats[remaining] = second.token;
    }
  }

  return {
    players,
    first,
    second,
    firstSide,
    seats,
  };
}

function mySide(layout = deriveLobby()) {
  if (!clientId) return null;

  if (layout.seats.p1 === clientId) {
    return 'p1';
  }

  if (layout.seats.p2 === clientId) {
    return 'p2';
  }

  return null;
}

function bothPlayersReady(layout = deriveLobby()) {
  return Boolean(
    layout.seats.p1 &&
    layout.seats.p2,
  );
}

function myLobbyIndex(layout = deriveLobby()) {
  return layout.players.findIndex(
    (player) => player.token === clientId,
  );
}

/* =========================================================
   UI HELPERS
   ========================================================= */

function notify(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 3200);
}

function coordinate(row, col) {
  return `${'abcdefgh'[col]}${8 - row}`;
}

/* =========================================================
   GAME RULES
   ========================================================= */

function getLegalMoves(board, row, col) {
  const piece = board[row]?.[col];

  const moves = new Map();

  if (!piece) {
    return moves;
  }

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) {
        continue;
      }

      const nr = row + dr;
      const nc = col + dc;

      if (
        nr < 0 ||
        nr >= SIZE ||
        nc < 0 ||
        nc >= SIZE
      ) {
        continue;
      }

      const occupant = board[nr][nc];

      /*
        Ô trống -> được đi.
      */
      if (!occupant) {
        moves.set(`${nr},${nc}`, 'move');
        continue;
      }

      /*
        Đồng minh -> không được đi.
      */
      if (occupant.owner === piece.owner) {
        continue;
      }

      /*
        Cùng loại -> hòa -> không được ăn.
      */
      if (occupant.type === piece.type) {
        continue;
      }

      /*
        Oẳn tù tì:
        Đấm > Kéo
        Kéo > Lá
        Lá > Đấm
      */
      if (
        BEATS[piece.type] === occupant.type
      ) {
        moves.set(
          `${nr},${nc}`,
          'capture',
        );
      }
    }
  }

  return moves;
}

/* =========================================================
   BOARD RENDER
   ========================================================= */

function renderBoard() {
  if (!game) return;

  const layout = deriveLobby();
  const side = mySide(layout);

  const canPlay =
    lobbyReady &&
    bothPlayersReady(layout) &&
    side === game.turn &&
    !game.winner;

  const moves =
    selected && canPlay
      ? getLegalMoves(
          game.board,
          selected.row,
          selected.col,
        )
      : new Map();

  const fragment =
    document.createDocumentFragment();

  for (let row = 0; row < SIZE; row += 1) {
    for (
      let col = 0;
      col < SIZE;
      col += 1
    ) {
      const square =
        document.createElement('button');

      const piece =
        game.board[row][col];

      const key = `${row},${col}`;

      const move = moves.get(key);

      const coord =
        coordinate(row, col);

      square.type = 'button';

      square.dataset.row =
        String(row);

      square.dataset.col =
        String(col);

      square.className =
        `square ${
          (row + col) % 2
            ? 'dark'
            : 'light'
        }`;

      square.setAttribute(
        'role',
        'gridcell',
      );

      square.setAttribute(
        'aria-label',
        `${coord}${
          piece
            ? `, ${TYPE_NAME[piece.type]} phe ${SIDE_NAME[piece.owner]}`
            : ', trống'
        }${
          move
            ? move === 'capture'
              ? ', có thể ăn'
              : ', có thể đi'
            : ''
        }`,
      );

      /*
        a1 = đích Đỏ
      */
      if (
        row === 7 &&
        col === 0
      ) {
        square.classList.add(
          'goal-red',
        );
      }

      /*
        h8 = đích Xanh
      */
      if (
        row === 0 &&
        col === 7
      ) {
        square.classList.add(
          'goal-blue',
        );
      }

      if (
        game.lastMove &&
        (
          (
            game.lastMove.from[0] === row &&
            game.lastMove.from[1] === col
          ) ||
          (
            game.lastMove.to[0] === row &&
            game.lastMove.to[1] === col
          )
        )
      ) {
        square.classList.add(
          'last-move',
        );
      }

      if (
        selected?.row === row &&
        selected?.col === col
      ) {
        square.classList.add(
          'selected',
        );

        square.setAttribute(
          'aria-selected',
          'true',
        );
      }

      if (move) {
        square.classList.add(
          `legal-${move}`,
        );
      }

      if (piece) {
        square.classList.add(
          'has-piece',
        );

        const token =
          document.createElement('span');

        token.className =
          `piece ${piece.owner}`;

        token.textContent =
          SYMBOL[piece.type];

        token.setAttribute(
          'aria-hidden',
          'true',
        );

        square.append(token);
      }

      fragment.append(square);
    }
  }

  els.board.replaceChildren(
    fragment,
  );
}

/* =========================================================
   SEAT UI
   ========================================================= */

function renderSeats() {
  if (!clientId) return;

  const layout = deriveLobby();
  const side = mySide(layout);

  const p1Holder =
    layout.seats.p1;

  const p2Holder =
    layout.seats.p2;

  /*
    XANH
  */
  els.p1Seat.className =
    'seat-state';

  if (!p1Holder) {
    els.p1Seat.textContent =
      'Trống';
  } else if (
    p1Holder === clientId
  ) {
    els.p1Seat.textContent =
      'Bạn';

    els.p1Seat.classList.add(
      'you',
    );
  } else {
    els.p1Seat.textContent =
      'Đang chơi';
  }

  /*
    ĐỎ
  */
  els.p2Seat.className =
    'seat-state';

  if (!p2Holder) {
    els.p2Seat.textContent =
      'Trống';
  } else if (
    p2Holder === clientId
  ) {
    els.p2Seat.textContent =
      'Bạn';

    els.p2Seat.classList.add(
      'you',
    );
  } else {
    els.p2Seat.textContent =
      'Đang chơi';
  }

  /*
    Chưa đồng bộ lobby xong.
  */
  if (!lobbyReady) {
    els.myRole.textContent =
      'Đang đồng bộ người chơi...';

    els.joinP1.disabled = true;
    els.joinP2.disabled = true;

    els.joinP1.textContent =
      'Đang đồng bộ...';

    els.joinP2.textContent =
      'Đang đồng bộ...';

    els.leaveSeat.hidden = true;

    els.reset.disabled = true;

    return;
  }

  /*
    Đã có phe.
  */
  if (side) {
    els.myRole.textContent =
      `Bạn: phe ${SIDE_NAME[side]}`;

    els.joinP1.disabled = true;
    els.joinP2.disabled = true;

    els.joinP1.textContent =
      side === 'p1'
        ? '✓ Bạn là phe Xanh'
        : 'Phe Xanh đã có người';

    els.joinP2.textContent =
      side === 'p2'
        ? '✓ Bạn là phe Đỏ'
        : 'Phe Đỏ đã có người';

    els.leaveSeat.hidden = false;

    els.reset.disabled = false;

    return;
  }

  const index =
    myLobbyIndex(layout);

  /*
    NGƯỜI ĐẦU TIÊN
    -> được chọn một trong hai màu.
  */
  if (index === 0) {
    els.myRole.textContent =
      'Bạn vào phòng đầu tiên — hãy chọn phe';

    els.joinP1.disabled = false;
    els.joinP2.disabled = false;

    els.joinP1.textContent =
      'Chọn phe Xanh';

    els.joinP2.textContent =
      'Chọn phe Đỏ';

    els.leaveSeat.hidden = true;

    els.reset.disabled = true;

    return;
  }

  /*
    NGƯỜI THỨ HAI
  */
  if (index === 1) {
    /*
      Người đầu chưa chọn.
    */
    if (!layout.firstSide) {
      els.myRole.textContent =
        'Bạn vào thứ hai — đang chờ người đầu tiên chọn phe';

      els.joinP1.disabled = true;
      els.joinP2.disabled = true;

      els.joinP1.textContent =
        'Chờ người đầu tiên';

      els.joinP2.textContent =
        'Chờ người đầu tiên';

      els.leaveSeat.hidden = true;

      els.reset.disabled = true;

      return;
    }

    /*
      Người đầu đã chọn.
      Chỉ mở đúng màu còn lại.
    */
    const remaining =
      otherSide(layout.firstSide);

    els.myRole.textContent =
      `Bạn vào thứ hai — chỉ được chọn phe ${SIDE_NAME[remaining]}`;

    if (remaining === 'p1') {
      els.joinP1.disabled = false;
      els.joinP2.disabled = true;

      els.joinP1.textContent =
        'Chọn phe Xanh';

      els.joinP2.textContent =
        'Phe Đỏ đã có người';
    } else {
      els.joinP1.disabled = true;
      els.joinP2.disabled = false;

      els.joinP1.textContent =
        'Phe Xanh đã có người';

      els.joinP2.textContent =
        'Chọn phe Đỏ';
    }

    els.leaveSeat.hidden = true;

    els.reset.disabled = true;

    return;
  }

  /*
    NGƯỜI THỨ BA TRỞ ĐI
  */
  els.myRole.textContent =
    'Khán giả';

  els.joinP1.disabled = true;
  els.joinP2.disabled = true;

  els.joinP1.textContent =
    p1Holder
      ? 'Phe Xanh đã có người'
      : 'Đang chờ';

  els.joinP2.textContent =
    p2Holder
      ? 'Phe Đỏ đã có người'
      : 'Đang chờ';

  els.leaveSeat.hidden = true;

  els.reset.disabled = true;
}

/* =========================================================
   STATUS
   ========================================================= */

function renderStatus() {
  if (!game || !clientId) return;

  const layout = deriveLobby();
  const side = mySide(layout);

  if (game.winner) {
    els.statusTitle.textContent =
      `Phe ${SIDE_NAME[game.winner]} chiến thắng!`;

    els.statusDetail.textContent =
      game.winner === side
        ? 'Chúc mừng! Nhấn Chơi lại để bắt đầu ván mới.'
        : 'Ván đấu đã kết thúc.';

    els.turnBadge.textContent =
      'VÁN ĐẤU KẾT THÚC';

    els.turnBadge.className =
      `turn-badge ${game.winner}`;

    return;
  }

  /*
    Chưa chọn đủ 2 phe.
  */
  if (!bothPlayersReady(layout)) {
    els.turnBadge.textContent =
      'CHỜ CHỌN PHE';

    els.turnBadge.className =
      'turn-badge';

    const index =
      myLobbyIndex(layout);

    if (!lobbyReady) {
      els.statusTitle.textContent =
        'Đang đồng bộ phòng';

      els.statusDetail.textContent =
        'Đang xác định thứ tự người chơi...';

      return;
    }

    if (side) {
      const remaining =
        otherSide(side);

      els.statusTitle.textContent =
        `Bạn đã chọn phe ${SIDE_NAME[side]}`;

      els.statusDetail.textContent =
        `Đang chờ người chơi còn lại chọn phe ${SIDE_NAME[remaining]}.`;

      return;
    }

    if (index === 0) {
      els.statusTitle.textContent =
        'Bạn là người vào phòng đầu tiên';

      els.statusDetail.textContent =
        'Bạn được quyền chọn phe Xanh hoặc phe Đỏ.';

      return;
    }

    if (index === 1) {
      if (!layout.firstSide) {
        els.statusTitle.textContent =
          'Chờ người chơi đầu tiên';

        els.statusDetail.textContent =
          'Người vào trước đang chọn phe. Sau đó bạn chỉ được chọn màu còn lại.';
      } else {
        const remaining =
          otherSide(layout.firstSide);

        els.statusTitle.textContent =
          `Hãy chọn phe ${SIDE_NAME[remaining]}`;

        els.statusDetail.textContent =
          `Người vào trước đã chọn phe ${SIDE_NAME[layout.firstSide]}. Bạn chỉ có thể chọn phe ${SIDE_NAME[remaining]}.`;
      }

      return;
    }

    els.statusTitle.textContent =
      'Bạn đang là khán giả';

    els.statusDetail.textContent =
      'Hai vị trí người chơi đang được ưu tiên cho hai người vào phòng đầu tiên.';

    return;
  }

  /*
    Đủ 2 người -> chơi.
  */
  els.statusTitle.textContent =
    `Lượt của phe ${SIDE_NAME[game.turn]}`;

  els.turnBadge.textContent =
    game.turn === side
      ? 'ĐẾN LƯỢT BẠN'
      : `LƯỢT ${SIDE_NAME[game.turn].toUpperCase()}`;

  els.turnBadge.className =
    `turn-badge ${game.turn}`;

  if (!side) {
    els.statusDetail.textContent =
      'Bạn đang xem trận đấu.';
  } else if (
    game.turn === side
  ) {
    els.statusDetail.textContent =
      'Chọn một quân của bạn, sau đó chọn ô được tô sáng.';
  } else {
    els.statusDetail.textContent =
      'Đang chờ đối thủ thực hiện nước đi.';
  }
}

/* =========================================================
   RENDER
   ========================================================= */

function render() {
  if (!game) return;

  const layout = deriveLobby();
  const side = mySide(layout);

  if (
    selected &&
    (
      !bothPlayersReady(layout) ||
      game.turn !== side ||
      game.winner ||
      game.board[
        selected.row
      ]?.[
        selected.col
      ]?.owner !== side
    )
  ) {
    selected = null;
  }

  renderBoard();
  renderSeats();
  renderStatus();
}

/* =========================================================
   CHỌN PHE
   ========================================================= */

async function claimSeat(role) {
  if (
    !clientId ||
    !validSide(role) ||
    choosingSide
  ) {
    return;
  }

  if (!lobbyReady) {
    notify(
      'Đang đồng bộ người chơi, vui lòng chờ một chút.',
    );

    return;
  }

  choosingSide = true;

  /*
    Chờ ngắn để Presence giữa hai máy hội tụ trước
    khi quyết định ai là người vào trước.
  */
  await sleep(180);

  const layout = deriveLobby();

  const existingSide =
    mySide(layout);

  if (existingSide) {
    choosingSide = false;
    return;
  }

  const index =
    myLobbyIndex(layout);

  /*
    Người đầu tiên.
  */
  if (index === 0) {
    /*
      Nếu choice đã có nhưng chưa render kịp.
    */
    if (
      layout.first?.choice &&
      validSide(layout.first.choice)
    ) {
      choosingSide = false;
      render();
      return;
    }

    myChoice = role;

    sessionStorage.setItem(
      choiceKey,
      myChoice,
    );

    publishMyPresence();

    notify(
      `Bạn đã chọn phe ${SIDE_NAME[role]}.`,
    );

    choosingSide = false;

    await sleep(100);

    render();

    return;
  }

  /*
    Người thứ hai.
  */
  if (index === 1) {
    if (!layout.firstSide) {
      choosingSide = false;

      notify(
        'Hãy chờ người vào phòng đầu tiên chọn phe.',
      );

      render();

      return;
    }

    const remaining =
      otherSide(layout.firstSide);

    if (role !== remaining) {
      choosingSide = false;

      notify(
        `Bạn chỉ được chọn phe ${SIDE_NAME[remaining]}.`,
      );

      render();

      return;
    }

    myChoice = remaining;

    sessionStorage.setItem(
      choiceKey,
      myChoice,
    );

    publishMyPresence();

    notify(
      `Bạn đã chọn phe ${SIDE_NAME[remaining]}.`,
    );

    choosingSide = false;

    await sleep(100);

    render();

    return;
  }

  choosingSide = false;

  notify(
    'Phòng đã có hai người chơi. Bạn đang là khán giả.',
  );

  render();
}

/* =========================================================
   MOVE
   ========================================================= */

function movePiece(from, to) {
  if (!channel) return;

  const layout =
    deriveLobby();

  if (
    !bothPlayersReady(layout)
  ) {
    return;
  }

  const side =
    mySide(layout);

  if (!side) {
    return;
  }

  channel.setData((draft) => {
    /*
      Kiểm tra lại ngay trong transaction.
    */
    if (
      draft.winner ||
      draft.turn !== side
    ) {
      return;
    }

    const source =
      draft.board[
        from.row
      ]?.[
        from.col
      ];

    if (
      !source ||
      source.owner !== side
    ) {
      return;
    }

    const legal =
      getLegalMoves(
        draft.board,
        from.row,
        from.col,
      );

    if (
      !legal.has(
        `${to.row},${to.col}`,
      )
    ) {
      return;
    }

    const movingType =
      source.type;

    /*
      Bỏ quân khỏi ô cũ.
    */
    draft.board[
      from.row
    ].splice(
      from.col,
      1,
      null,
    );

    /*
      Đặt quân sang ô mới.
      Nếu có quân địch ở đó thì quân địch bị thay thế.
    */
    draft.board[
      to.row
    ].splice(
      to.col,
      1,
      {
        owner: side,
        type: movingType,
      },
    );

    draft.lastMove = {
      from: [
        from.row,
        from.col,
      ],
      to: [
        to.row,
        to.col,
      ],
    };

    draft.moveNumber += 1;

    /*
      Xanh thắng khi tới h8.
      row 0 col 7.
    */
    const reachedGoal =
      side === 'p1'
        ? (
            to.row === 0 &&
            to.col === 7
          )
        : (
            to.row === 7 &&
            to.col === 0
          );

    const opponent =
      otherSide(side);

    const opponentRemains =
      draft.board.some(
        (line) =>
          line.some(
            (piece) =>
              piece?.owner ===
              opponent,
          ),
      );

    if (
      reachedGoal ||
      !opponentRemains
    ) {
      draft.winner = side;
    } else {
      draft.turn = opponent;
    }
  });

  selected = null;

  render();
}

/* =========================================================
   BOARD CLICK
   ========================================================= */

els.board.addEventListener(
  'click',
  (event) => {
    const square =
      event.target.closest(
        '.square',
      );

    if (
      !square ||
      !game ||
      game.winner
    ) {
      return;
    }

    const layout =
      deriveLobby();

    if (
      !bothPlayersReady(layout)
    ) {
      notify(
        'Cần đủ hai người chọn phe trước khi bắt đầu.',
      );

      return;
    }

    const side =
      mySide(layout);

    if (
      !side ||
      game.turn !== side
    ) {
      return;
    }

    const row =
      Number(
        square.dataset.row,
      );

    const col =
      Number(
        square.dataset.col,
      );

    if (selected) {
      const legal =
        getLegalMoves(
          game.board,
          selected.row,
          selected.col,
        );

      if (
        legal.has(
          `${row},${col}`,
        )
      ) {
        movePiece(
          selected,
          {
            row,
            col,
          },
        );

        return;
      }
    }

    selected =
      game.board[
        row
      ][
        col
      ]?.owner === side
        ? {
            row,
            col,
          }
        : null;

    renderBoard();
  },
);

/* =========================================================
   BUTTONS
   ========================================================= */

els.joinP1.addEventListener(
  'click',
  () => {
    claimSeat('p1');
  },
);

els.joinP2.addEventListener(
  'click',
  () => {
    claimSeat('p2');
  },
);

/*
  RỜI GHẾ

  Người rời ghế được đưa xuống cuối hàng.
  Nhờ vậy không chặn người chơi tiếp theo.
*/
els.leaveSeat.addEventListener(
  'click',
  async () => {
    const layout =
      deriveLobby();

    const side =
      mySide(layout);

    if (!side) {
      return;
    }

    selected = null;

    myChoice = null;

    myJoinedAt =
      Date.now();

    sessionStorage.setItem(
      joinedAtKey,
      String(myJoinedAt),
    );

    sessionStorage.removeItem(
      choiceKey,
    );

    publishMyPresence();

    notify(
      'Bạn đã rời ghế.',
    );

    await sleep(150);

    render();
  },
);

/* =========================================================
   RESET
   ========================================================= */

els.reset.addEventListener(
  'click',
  () => {
    if (!channel) return;

    const side =
      mySide();

    if (!side) {
      return;
    }

    selected = null;

    channel.setData(
      (draft) => {
        draft.board =
          createBoard();

        draft.turn =
          'p1';

        draft.winner =
          null;

        draft.lastMove =
          null;

        draft.moveNumber =
          0;
      },
    );
  },
);

/* =========================================================
   COPY LINK
   ========================================================= */

els.copyLink.addEventListener(
  'click',
  async () => {
    try {
      await navigator.clipboard.writeText(
        location.href,
      );

      notify(
        'Đã sao chép liên kết phòng.',
      );
    } catch {
      notify(
        `Liên kết phòng: ${location.href}`,
      );
    }
  },
);

/* =========================================================
   START MULTIPLAYER
   ========================================================= */

async function start() {
  try {
    els.connection.textContent =
      'Đang kết nối...';

    els.connection.className =
      'connection';

    await playhtml.init({
      room: `ottv2-${roomCode}`,
    });

    clientId =
      playhtml.presence
        .getMyIdentity()
        .publicKey;

    /*
      Đưa thông tin người chơi vào Presence.
    */
    publishMyPresence();

    /*
      Khi 2 máy cùng mở gần như một lúc,
      cho Presence khoảng thời gian ngắn
      để cả hai nhìn thấy nhau rồi mới
      mở nút chọn phe.
    */
    await sleep(1200);

    /*
      Chỉ game nằm trong PageData.
      Ghế không còn dùng PageData nữa.
      Ghế được suy ra từ Presence.
    */
    channel =
      playhtml.createPageData(
        GAME_KEY,
        initialGame(),
      );

    game =
      channel.getData();

    lastGameSnapshot =
      JSON.stringify(game);

    channel.onUpdate(
      (nextGame) => {
        game = nextGame;

        lastGameSnapshot =
          JSON.stringify(game);

        render();
      },
    );

    /*
      Presence thay đổi:
      - người mới vào
      - người thoát
      - chọn phe
      - đổi thứ tự sau khi rời ghế
    */
    playhtml.presence.onPresenceChange(
      PRESENCE_KEY,
      () => {
        render();
      },
    );

    /*
      Poll nhẹ để bảo đảm trạng thái game
      hội tụ ngay cả khi callback chậm.
    */
    setInterval(() => {
      if (!channel) return;

      const latest =
        channel.getData();

      const snapshot =
        JSON.stringify(latest);

      if (
        snapshot ===
        lastGameSnapshot
      ) {
        return;
      }

      game = latest;

      lastGameSnapshot =
        snapshot;

      render();
    }, 250);

    lobbyReady = true;

    els.connection.textContent =
      'Đã đồng bộ';

    els.connection.className =
      'connection online';

    render();
  } catch (error) {
    console.error(
      'Không thể kết nối PlayHTML:',
      error,
    );

    lobbyReady = false;

    els.connection.textContent =
      'Mất kết nối';

    els.connection.className =
      'connection offline';

    els.statusTitle.textContent =
      'Không thể mở phòng';

    els.statusDetail.textContent =
      'Kiểm tra kết nối mạng rồi tải lại trang.';

    els.joinP1.disabled = true;
    els.joinP2.disabled = true;
  }
}

start();