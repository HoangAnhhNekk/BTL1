const BOARD_SIZE = 8;
const FILES = "abcdefgh";

const APP_VERSION = "v8";

const SHELL_ROOM =
  `ottv2-shell-${APP_VERSION}`;

const GLOBAL_LOBBY_ROOM =
  `ottv2-global-lobby-${APP_VERSION}`;

const MATCH_CHANNEL =
  `ottv2-match-${APP_VERSION}`;

const GAME_PRESENCE_CHANNEL =
  `ottv2-game-presence-${APP_VERSION}`;

const GAME_STATE_KEY =
  `ottv2-game-state-${APP_VERSION}`;

const TYPES = {
  rock: {
    emoji: "✊",
    label: "Đấm",
    short: "Đ",
  },

  paper: {
    emoji: "✋",
    label: "Lá",
    short: "L",
  },

  scissors: {
    emoji: "✌️",
    label: "Kéo",
    short: "K",
  },
};

const BEATS = {
  rock: "scissors",
  scissors: "paper",
  paper: "rock",
};

const PLAYER_META = {
  p1: {
    name: "Player 1 · Xanh",
    short: "Xanh",
    target: "h8",
  },

  p2: {
    name: "Player 2 · Đỏ",
    short: "Đỏ",
    target: "a1",
  },
};

const els = {
  entryScreen:
    document.querySelector(
      "#entryScreen",
    ),

  gameShell:
    document.querySelector(
      "#gameShell",
    ),

  entryConnectionDot:
    document.querySelector(
      "#entryConnectionDot",
    ),

  entryConnectionText:
    document.querySelector(
      "#entryConnectionText",
    ),

  roleStep:
    document.querySelector(
      "#roleStep",
    ),

  playerStep:
    document.querySelector(
      "#playerStep",
    ),

  sideStep:
    document.querySelector(
      "#sideStep",
    ),

  matchingStep:
    document.querySelector(
      "#matchingStep",
    ),

  matchingTitle:
    document.querySelector(
      "#matchingTitle",
    ),

  matchingText:
    document.querySelector(
      "#matchingText",
    ),

  matchingRoom:
    document.querySelector(
      "#matchingRoom",
    ),

  lobbyMessage:
    document.querySelector(
      "#lobbyMessage",
    ),

  rolePlayerBtn:
    document.querySelector(
      "#rolePlayerBtn",
    ),

  roleViewerBtn:
    document.querySelector(
      "#roleViewerBtn",
    ),

  createRoomBtn:
    document.querySelector(
      "#createRoomBtn",
    ),

  joinRandomBtn:
    document.querySelector(
      "#joinRandomBtn",
    ),

  backRoleBtn:
    document.querySelector(
      "#backRoleBtn",
    ),

  chooseBlueBtn:
    document.querySelector(
      "#chooseBlueBtn",
    ),

  chooseRedBtn:
    document.querySelector(
      "#chooseRedBtn",
    ),

  backPlayerBtn:
    document.querySelector(
      "#backPlayerBtn",
    ),

  cancelMatchBtn:
    document.querySelector(
      "#cancelMatchBtn",
    ),

  board:
    document.querySelector(
      "#board",
    ),

  statusText:
    document.querySelector(
      "#statusText",
    ),

  turnBadge:
    document.querySelector(
      "#turnBadge",
    ),

  connectionDot:
    document.querySelector(
      "#connectionDot",
    ),

  connectionText:
    document.querySelector(
      "#connectionText",
    ),

  roomText:
    document.querySelector(
      "#roomText",
    ),

  p1Seat:
    document.querySelector(
      "#p1Seat",
    ),

  p2Seat:
    document.querySelector(
      "#p2Seat",
    ),

  p1Count:
    document.querySelector(
      "#p1Count",
    ),

  p2Count:
    document.querySelector(
      "#p2Count",
    ),

  myRole:
    document.querySelector(
      "#myRole",
    ),

  viewerCount:
    document.querySelector(
      "#viewerCount",
    ),

  leaveGameBtn:
    document.querySelector(
      "#leaveGameBtn",
    ),

  copyRoomBtn:
    document.querySelector(
      "#copyRoomBtn",
    ),

  resetBtn:
    document.querySelector(
      "#resetBtn",
    ),

  toast:
    document.querySelector(
      "#toast",
    ),

  winnerModal:
    document.querySelector(
      "#winnerModal",
    ),

  winnerTitle:
    document.querySelector(
      "#winnerTitle",
    ),

  winnerReason:
    document.querySelector(
      "#winnerReason",
    ),

  winnerIcon:
    document.querySelector(
      "#winnerIcon",
    ),

  modalResetBtn:
    document.querySelector(
      "#modalResetBtn",
    ),

  modalLobbyBtn:
    document.querySelector(
      "#modalLobbyBtn",
    ),
};

let playhtml = null;

let globalLobby = null;

let myId = null;

let sessionId =
  randomId();

let connected = false;

let gameStore = null;

let gameState = null;

let selected = null;

let legalTargets =
  new Map();

let localSeat = null;

let localMode =
  "viewer";

let currentRoomCode =
  null;

let toastTimer =
  null;

let retryTimer =
  null;

let hostNavigateTimer =
  null;

let hostState =
  null;

let joinState =
  null;

let viewerSearching =
  false;

let gameStartedAt =
  Date.now();

/* =========================================================
   BASIC
   ========================================================= */

function randomId() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ??
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}

function randomRoomCode() {
  return randomId()
    .replaceAll(
      "-",
      "",
    )
    .slice(
      0,
      6,
    )
    .toUpperCase();
}

function otherSide(
  side,
) {
  return (
    side === "p1"
      ? "p2"
      : "p1"
  );
}

function validSide(
  side,
) {
  return (
    side === "p1" ||
    side === "p2"
  );
}

/* =========================================================
   URL
   ========================================================= */

function roomFromUrl() {
  const value =
    new URLSearchParams(
      location.search,
    )
      .get("room")
      ?.toUpperCase() ??
    "";

  return (
    /^[A-Z0-9-]{4,20}$/.test(
      value,
    )
      ? value
      : null
  );
}

function isViewerUrl() {
  return (
    new URLSearchParams(
      location.search,
    ).get(
      "viewer",
    ) === "1"
  );
}

function seatFromUrl() {
  const seat =
    new URLSearchParams(
      location.search,
    ).get(
      "seat",
    );

  return (
    validSide(
      seat,
    )
      ? seat
      : null
  );
}

function baseLobbyUrl() {
  return (
    `${location.origin}${location.pathname}`
  );
}

function gameUrl(
  roomCode,
  seat = null,
  viewer = false,
) {
  const url =
    new URL(
      baseLobbyUrl(),
    );

  url.searchParams.set(
    "room",
    roomCode,
  );

  if (viewer) {
    url.searchParams.set(
      "viewer",
      "1",
    );
  } else if (
    validSide(
      seat,
    )
  ) {
    url.searchParams.set(
      "seat",
      seat,
    );
  }

  return url.toString();
}

/* =========================================================
   PLAYHTML LOADER
   ========================================================= */

function withTimeout(
  promise,
  ms,
  message,
) {
  return Promise.race([
    promise,

    new Promise(
      (
        _,
        reject,
      ) => {
        setTimeout(
          () =>
            reject(
              new Error(
                message,
              ),
            ),
          ms,
        );
      },
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
          import(
            source
          ),
          10000,
          `Quá thời gian tải PlayHTML từ ${source}`,
        );

      if (
        mod?.playhtml
      ) {
        return mod.playhtml;
      }
    } catch (
      error
    ) {
      console.warn(
        "Không tải được PlayHTML từ",
        source,
        error,
      );

      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Không tải được PlayHTML.",
    )
  );
}

/* =========================================================
   BOARD
   ========================================================= */

function createInitialBoard() {
  const board =
    Array.from(
      {
        length:
          BOARD_SIZE,
      },
      () =>
        Array(
          BOARD_SIZE,
        ).fill(
          null,
        ),
    );

  const p1Setup = [
    {
      r: 1,
      c: 0,
      type: "rock",
    },

    {
      r: 0,
      c: 1,
      type: "paper",
    },

    {
      r: 1,
      c: 1,
      type: "scissors",
    },

    {
      r: 0,
      c: 2,
      type: "rock",
    },

    {
      r: 1,
      c: 2,
      type: "paper",
    },

    {
      r: 2,
      c: 0,
      type: "scissors",
    },

    {
      r: 2,
      c: 1,
      type: "rock",
    },

    {
      r: 2,
      c: 2,
      type: "paper",
    },
  ];

  for (
    const piece of
    p1Setup
  ) {
    board[
      piece.r
    ][
      piece.c
    ] = {
      owner: "p1",
      type:
        piece.type,
    };

    board[
      7 -
        piece.c
    ][
      7 -
        piece.r
    ] = {
      owner: "p2",
      type:
        piece.type,
    };
  }

  return board;
}

function createInitialGame() {
  return {
    board:
      createInitialBoard(),

    turn:
      "p1",

    winner:
      null,

    winReason:
      null,

    moveNumber:
      0,

    lastMove:
      null,
  };
}

function ensureGameShape(
  state,
) {
  if (
    !Array.isArray(
      state.board,
    ) ||
    state.board.length !==
      BOARD_SIZE
  ) {
    state.board =
      createInitialBoard();
  }

  if (
    !validSide(
      state.turn,
    )
  ) {
    state.turn =
      "p1";
  }

  if (
    !(
      "winner" in
      state
    )
  ) {
    state.winner =
      null;
  }

  if (
    !(
      "winReason" in
      state
    )
  ) {
    state.winReason =
      null;
  }

  if (
    !(
      "moveNumber" in
      state
    )
  ) {
    state.moveNumber =
      0;
  }

  if (
    !(
      "lastMove" in
      state
    )
  ) {
    state.lastMove =
      null;
  }
}

/* =========================================================
   GAME RULES
   ========================================================= */

function coordName(
  r,
  c,
) {
  return (
    `${FILES[c]}${r + 1}`
  );
}

function keyOf(
  r,
  c,
) {
  return (
    `${r},${c}`
  );
}

function insideBoard(
  r,
  c,
) {
  return (
    r >= 0 &&
    r <
      BOARD_SIZE &&
    c >= 0 &&
    c <
      BOARD_SIZE
  );
}

function canCapture(
  attacker,
  defender,
) {
  return Boolean(
    attacker &&
    defender &&
    attacker.owner !==
      defender.owner &&
    BEATS[
      attacker.type
    ] ===
      defender.type,
  );
}

function getLegalTargets(
  board,
  fromR,
  fromC,
) {
  const piece =
    board[
      fromR
    ]?.[
      fromC
    ];

  const result =
    new Map();

  if (!piece) {
    return result;
  }

  for (
    let dr = -1;
    dr <= 1;
    dr += 1
  ) {
    for (
      let dc = -1;
      dc <= 1;
      dc += 1
    ) {
      if (
        dr === 0 &&
        dc === 0
      ) {
        continue;
      }

      const r =
        fromR + dr;

      const c =
        fromC + dc;

      if (
        !insideBoard(
          r,
          c,
        )
      ) {
        continue;
      }

      const target =
        board[
          r
        ][
          c
        ];

      if (!target) {
        result.set(
          keyOf(
            r,
            c,
          ),
          "move",
        );

        continue;
      }

      if (
        target.owner ===
        piece.owner
      ) {
        continue;
      }

      if (
        target.type ===
        piece.type
      ) {
        continue;
      }

      if (
        canCapture(
          piece,
          target,
        )
      ) {
        result.set(
          keyOf(
            r,
            c,
          ),
          "capture",
        );
      }
    }
  }

  return result;
}

function countPieces(
  board,
  owner,
) {
  let total = 0;

  for (
    const row of
    board
  ) {
    for (
      const piece of
      row
    ) {
      if (
        piece?.owner ===
        owner
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
  toC,
) {
  if (
    mover === "p1" &&
    toR === 7 &&
    toC === 7
  ) {
    return {
      winner:
        "p1",

      reason:
        "Xanh đã đưa một quân tới ô h8.",
    };
  }

  if (
    mover === "p2" &&
    toR === 0 &&
    toC === 0
  ) {
    return {
      winner:
        "p2",

      reason:
        "Đỏ đã đưa một quân tới ô a1.",
    };
  }

  const opponent =
    otherSide(
      mover,
    );

  if (
    countPieces(
      board,
      opponent,
    ) === 0
  ) {
    return {
      winner:
        mover,

      reason:
        `${PLAYER_META[mover].short} đã ăn hết toàn bộ quân của đối phương.`,
    };
  }

  return null;
}

/* =========================================================
   ENTRY UI
   ========================================================= */

function setLobbyMessage(
  message = "",
) {
  els.lobbyMessage.textContent =
    message;
}

function showEntryStep(
  step,
) {
  els.roleStep.hidden =
    step !==
    "role";

  els.playerStep.hidden =
    step !==
    "player";

  els.sideStep.hidden =
    step !==
    "side";

  els.matchingStep.hidden =
    step !==
    "matching";
}

function showMatching(
  title,
  text,
  roomCode = null,
) {
  showEntryStep(
    "matching",
  );

  els.matchingTitle.textContent =
    title;

  els.matchingText.textContent =
    text;

  els.matchingRoom.hidden =
    !roomCode;

  els.matchingRoom.textContent =
    roomCode
      ? `PHÒNG ${roomCode}`
      : "";
}

function setEntryConnected(
  isOnline,
  text,
) {
  els.entryConnectionDot
    .classList
    .toggle(
      "online",
      isOnline,
    );

  els.entryConnectionText.textContent =
    text;
}

/* =========================================================
   MATCHMAKING
   ========================================================= */

function clearRetryTimer() {
  clearTimeout(
    retryTimer,
  );

  retryTimer =
    null;
}

function clearMatchPresence() {
  if (
    !globalLobby
  ) {
    return;
  }

  try {
    globalLobby
      .presence
      .setMyPresence(
        MATCH_CHANNEL,
        null,
      );
  } catch (
    error
  ) {
    console.warn(
      error,
    );
  }
}

function getGlobalMatchEntries() {
  if (
    !globalLobby
  ) {
    return [];
  }

  return [
    ...globalLobby
      .presence
      .getPresences()
      .values(),
  ]
    .map(
      (
        presence,
      ) =>
        presence?.[
          MATCH_CHANNEL
        ],
    )
    .filter(
      Boolean,
    );
}

function waitingHosts() {
  return (
    getGlobalMatchEntries()
      .filter(
        (
          entry,
        ) =>
          entry.kind ===
            "host" &&
          entry.status ===
            "waiting" &&
          entry.hostId &&
          entry.hostSession &&
          entry.roomCode &&
          validSide(
            entry.hostSide,
          ) &&
          entry.hostSession !==
            sessionId,
      )
  );
}

function activeGames() {
  const map =
    new Map();

  for (
    const entry of
    getGlobalMatchEntries()
  ) {
    if (
      entry.kind !==
        "game" ||
      !entry.roomCode
    ) {
      continue;
    }

    if (
      !map.has(
        entry.roomCode,
      )
    ) {
      map.set(
        entry.roomCode,
        {
          roomCode:
            entry.roomCode,

          firstSeenAt:
            entry.startedAt ||
            Date.now(),
        },
      );
    }
  }

  return [
    ...map.values(),
  ];
}

function publishHostPresence() {
  if (
    !globalLobby ||
    !hostState
  ) {
    return;
  }

  globalLobby
    .presence
    .setMyPresence(
      MATCH_CHANNEL,
      {
        kind:
          "host",

        status:
          hostState.status,

        roomCode:
          hostState.roomCode,

        hostSide:
          hostState.hostSide,

        hostId:
          myId,

        hostSession:
          sessionId,

        guestId:
          hostState.guestId ??
          null,

        guestSession:
          hostState.guestSession ??
          null,

        createdAt:
          hostState.createdAt,

        matchedAt:
          hostState.matchedAt ??
          null,
      },
    );
}

function publishJoinRequest() {
  if (
    !globalLobby ||
    !joinState
      ?.roomCode
  ) {
    return;
  }

  globalLobby
    .presence
    .setMyPresence(
      MATCH_CHANNEL,
      {
        kind:
          "guest-request",

        status:
          "requesting",

        roomCode:
          joinState.roomCode,

        guestId:
          myId,

        guestSession:
          sessionId,

        requestedAt:
          joinState.requestedAt,
      },
    );
}

function navigateToGame(
  roomCode,
  seat = null,
  viewer = false,
) {
  clearRetryTimer();

  location.href =
    gameUrl(
      roomCode,
      seat,
      viewer,
    );
}

function resolveHostRequests() {
  if (
    !hostState ||
    hostState.status !==
      "waiting" ||
    !globalLobby
  ) {
    return;
  }

  const requests =
    getGlobalMatchEntries()
      .filter(
        (
          entry,
        ) =>
          entry.kind ===
            "guest-request" &&
          entry.status ===
            "requesting" &&
          entry.roomCode ===
            hostState.roomCode &&
          entry.guestId &&
          entry.guestSession,
      )
      .sort(
        (
          a,
          b,
        ) => {
          const diff =
            (
              a.requestedAt ||
              0
            ) -
            (
              b.requestedAt ||
              0
            );

          if (
            diff !== 0
          ) {
            return diff;
          }

          return String(
            a.guestSession,
          ).localeCompare(
            String(
              b.guestSession,
            ),
          );
        },
      );

  const winner =
    requests[0];

  if (
    !winner
  ) {
    return;
  }

  hostState.status =
    "matched";

  hostState.guestId =
    winner.guestId;

  hostState.guestSession =
    winner.guestSession;

  hostState.matchedAt =
    Date.now();

  publishHostPresence();

  const guestSide =
    otherSide(
      hostState.hostSide,
    );

  showMatching(
    "Đã tìm thấy đối thủ!",

    `Bạn là ${PLAYER_META[hostState.hostSide].short}. Đối thủ tự động nhận ${PLAYER_META[guestSide].short}. Đang vào trận…`,

    hostState.roomCode,
  );

  clearTimeout(
    hostNavigateTimer,
  );

  hostNavigateTimer =
    setTimeout(
      () => {
        navigateToGame(
          hostState.roomCode,
          hostState.hostSide,
          false,
        );
      },
      1600,
    );
}

function resolveGuestMatch() {
  if (
    !joinState ||
    joinState.status !==
      "requesting"
  ) {
    return;
  }

  const matchedHost =
    getGlobalMatchEntries()
      .find(
        (
          entry,
        ) =>
          entry.kind ===
            "host" &&
          entry.status ===
            "matched" &&
          entry.roomCode ===
            joinState.roomCode &&
          entry.guestSession ===
            sessionId &&
          validSide(
            entry.hostSide,
          ),
      );

  if (
    !matchedHost
  ) {
    return;
  }

  joinState.status =
    "matched";

  clearRetryTimer();

  const mySide =
    otherSide(
      matchedHost.hostSide,
    );

  showMatching(
    "Ghép phòng thành công!",

    `Chủ phòng đã chọn ${PLAYER_META[matchedHost.hostSide].short}. Bạn tự động nhận ${PLAYER_META[mySide].short}.`,

    matchedHost.roomCode,
  );

  setTimeout(
    () => {
      navigateToGame(
        matchedHost.roomCode,
        mySide,
        false,
      );
    },
    450,
  );
}

function tryFindRandomHost() {
  if (
    !joinState ||
    joinState.status ===
      "matched"
  ) {
    return;
  }

  const hosts =
    waitingHosts();

  if (
    !hosts.length
  ) {
    joinState.status =
      "searching";

    joinState.roomCode =
      null;

    clearMatchPresence();

    showMatching(
      "Đang tìm phòng trống…",

      "Chưa có phòng đang chờ. Hệ thống sẽ tự ghép ngay khi có phòng mới.",
    );

    clearRetryTimer();

    retryTimer =
      setTimeout(
        tryFindRandomHost,
        1500,
      );

    return;
  }

  const host =
    hosts[
      Math.floor(
        Math.random() *
          hosts.length,
      )
    ];

  joinState = {
    status:
      "requesting",

    roomCode:
      host.roomCode,

    requestedAt:
      Date.now(),
  };

  publishJoinRequest();

  showMatching(
    "Đã tìm thấy phòng",

    "Đang gửi yêu cầu ghép trận tới chủ phòng…",

    host.roomCode,
  );

  clearRetryTimer();

  retryTimer =
    setTimeout(
      () => {
        if (
          !joinState ||
          joinState.status ===
            "matched"
        ) {
          return;
        }

        joinState.status =
          "searching";

        joinState.roomCode =
          null;

        clearMatchPresence();

        tryFindRandomHost();
      },
      5000,
    );
}

function startJoinRandom() {
  hostState =
    null;

  viewerSearching =
    false;

  clearRetryTimer();

  clearMatchPresence();

  setLobbyMessage(
    "",
  );

  joinState = {
    status:
      "searching",

    roomCode:
      null,

    requestedAt:
      null,
  };

  showMatching(
    "Đang tìm phòng trống…",

    "Hệ thống sẽ chọn ngẫu nhiên một phòng đang chờ người chơi.",
  );

  tryFindRandomHost();
}

function createHostRoom(
  side,
) {
  if (
    !validSide(
      side,
    ) ||
    !globalLobby ||
    !myId
  ) {
    return;
  }

  joinState =
    null;

  viewerSearching =
    false;

  clearRetryTimer();

  clearMatchPresence();

  setLobbyMessage(
    "",
  );

  hostState = {
    status:
      "waiting",

    roomCode:
      randomRoomCode(),

    hostSide:
      side,

    guestId:
      null,

    guestSession:
      null,

    createdAt:
      Date.now(),

    matchedAt:
      null,
  };

  publishHostPresence();

  showMatching(
    "Phòng đã được tạo",

    `Bạn đã chọn phe ${PLAYER_META[side].short}. Đang chờ một Player bấm Join phòng…`,

    hostState.roomCode,
  );
}

/* =========================================================
   VIEWER MATCHMAKING
   ========================================================= */

function startViewerRandom() {
  hostState =
    null;

  joinState =
    null;

  clearRetryTimer();

  clearMatchPresence();

  setLobbyMessage(
    "",
  );

  viewerSearching =
    true;

  showMatching(
    "Đang tìm trận để xem…",

    "Hệ thống sẽ đưa bạn vào ngẫu nhiên một trận đang diễn ra.",
  );

  tryFindRandomGameToWatch();
}

function tryFindRandomGameToWatch() {
  if (
    !viewerSearching
  ) {
    return;
  }

  const games =
    activeGames();

  if (
    !games.length
  ) {
    showMatching(
      "Chưa có trận đang diễn ra",

      "Đang chờ một trận mới bắt đầu. Bạn sẽ tự động được đưa vào xem khi có trận.",
    );

    clearRetryTimer();

    retryTimer =
      setTimeout(
        tryFindRandomGameToWatch,
        1500,
      );

    return;
  }

  const game =
    games[
      Math.floor(
        Math.random() *
          games.length,
      )
    ];

  showMatching(
    "Đã tìm thấy trận!",

    "Đang vào chế độ Viewer…",

    game.roomCode,
  );

  viewerSearching =
    false;

  setTimeout(
    () =>
      navigateToGame(
        game.roomCode,
        null,
        true,
      ),
    350,
  );
}

/* =========================================================
   CANCEL
   ========================================================= */

function cancelMatchmaking() {
  clearRetryTimer();

  clearTimeout(
    hostNavigateTimer,
  );

  hostState =
    null;

  joinState =
    null;

  viewerSearching =
    false;

  clearMatchPresence();

  setLobbyMessage(
    "",
  );

  showEntryStep(
    "player",
  );
}

function handleGlobalLobbyChange() {
  resolveHostRequests();

  resolveGuestMatch();

  if (
    joinState?.status ===
    "searching"
  ) {
    clearRetryTimer();

    retryTimer =
      setTimeout(
        tryFindRandomHost,
        80,
      );
  }

  if (
    viewerSearching
  ) {
    clearRetryTimer();

    retryTimer =
      setTimeout(
        tryFindRandomGameToWatch,
        80,
      );
  }
}

/* =========================================================
   LOBBY INIT
   ========================================================= */

async function initLobbyMode() {
  els.entryScreen.hidden =
    false;

  els.gameShell.hidden =
    true;

  els.winnerModal.hidden =
    true;

  showEntryStep(
    "role",
  );

  setEntryConnected(
    false,
    "Đang kết nối sảnh…",
  );

  try {
    playhtml =
      await loadPlayHTML();

    await withTimeout(
      playhtml.init({
        room:
          SHELL_ROOM,
      }),
      15000,
      "Kết nối sảnh quá 15 giây.",
    );

    myId =
      playhtml
        .presence
        .getMyIdentity()
        .publicKey;

    globalLobby =
      playhtml.createPresenceRoom(
        GLOBAL_LOBBY_ROOM,
      );

    globalLobby
      .presence
      .onPresenceChange(
        MATCH_CHANNEL,
        handleGlobalLobbyChange,
      );

    connected =
      true;

    setEntryConnected(
      true,
      "Đã kết nối sảnh realtime",
    );
  } catch (
    error
  ) {
    console.error(
      "Không thể mở sảnh:",
      error,
    );

    connected =
      false;

    setEntryConnected(
      false,
      "Không kết nối được sảnh",
    );

    setLobbyMessage(
      "Hãy Ctrl + F5 rồi thử lại hoặc kiểm tra kết nối mạng.",
    );
  }
}

/* =========================================================
   GAME PRESENCE
   ========================================================= */

function setToast(
  message,
  timeout = 2800,
) {
  els.toast.textContent =
    message;

  clearTimeout(
    toastTimer,
  );

  if (
    timeout > 0
  ) {
    toastTimer =
      setTimeout(
        () => {
          els.toast.textContent =
            "";
        },
        timeout,
      );
  }
}

function getGamePresences() {
  if (
    !playhtml?.presence
  ) {
    return [];
  }

  return [
    ...playhtml
      .presence
      .getPresences()
      .values(),
  ]
    .map(
      (
        presence,
      ) =>
        presence?.[
          GAME_PRESENCE_CHANNEL
        ],
    )
    .filter(
      Boolean,
    );
}

function seatOnline(
  side,
) {
  return (
    getGamePresences()
      .some(
        (
          entry,
        ) =>
          entry.mode ===
            "player" &&
          entry.seat ===
            side,
      )
  );
}

function viewerTotal() {
  return (
    getGamePresences()
      .filter(
        (
          entry,
        ) =>
          entry.mode ===
          "viewer",
      )
      .length
  );
}

function publishGamePresence() {
  if (
    !playhtml
      ?.presence ||
    !currentRoomCode
  ) {
    return;
  }

  playhtml
    .presence
    .setMyPresence(
      GAME_PRESENCE_CHANNEL,
      {
        mode:
          localMode,

        seat:
          localSeat,

        roomCode:
          currentRoomCode,

        sessionId,

        playerId:
          myId,

        joinedAt:
          Date.now(),
      },
    );
}

function publishActiveGameToLobby() {
  if (
    !globalLobby ||
    !currentRoomCode
  ) {
    return;
  }

  if (
    localMode !==
    "player"
  ) {
    globalLobby
      .presence
      .setMyPresence(
        MATCH_CHANNEL,
        null,
      );

    return;
  }

  globalLobby
    .presence
    .setMyPresence(
      MATCH_CHANNEL,
      {
        kind:
          "game",

        roomCode:
          currentRoomCode,

        seat:
          localSeat,

        playerId:
          myId,

        sessionId,

        startedAt:
          gameStartedAt,
      },
    );
}

/* =========================================================
   GAME BOARD RENDER
   ========================================================= */

function buildTileAriaLabel(
  r,
  c,
  piece,
) {
  const base =
    `Ô ${coordName(
      r,
      c,
    )}`;

  if (
    !piece
  ) {
    return base;
  }

  return (
    `${base}, ` +
    `${PLAYER_META[piece.owner].short}, ` +
    `${TYPES[piece.type].label}`
  );
}

function renderBoard() {
  if (
    !gameState
  ) {
    return;
  }

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
      c <
      BOARD_SIZE;
      c += 1
    ) {
      const piece =
        gameState.board[
          displayR
        ][
          c
        ];

      const tile =
        document.createElement(
          "button",
        );

      const tileKey =
        keyOf(
          displayR,
          c,
        );

      const moveKind =
        legalTargets.get(
          tileKey,
        );

      const isSelected =
        selected?.r ===
          displayR &&
        selected?.c ===
          c;

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
            displayR +
            c
          ) %
            2 ===
          0
            ? "dark"
            : "light"
        }`;

      tile.dataset.r =
        String(
          displayR,
        );

      tile.dataset.c =
        String(
          c,
        );

      tile.dataset.coord =
        coordName(
          displayR,
          c,
        );

      tile.setAttribute(
        "role",
        "gridcell",
      );

      tile.setAttribute(
        "aria-label",
        buildTileAriaLabel(
          displayR,
          c,
          piece,
        ),
      );

      if (
        isTarget
      ) {
        tile.classList.add(
          "target-tile",
        );
      }

      if (
        isSelected
      ) {
        tile.classList.add(
          "selected",
        );
      }

      if (
        moveKind ===
        "move"
      ) {
        tile.classList.add(
          "valid-move",
        );
      }

      if (
        moveKind ===
        "capture"
      ) {
        tile.classList.add(
          "valid-capture",
        );
      }

      const canSelect =
        connected &&
        localMode ===
          "player" &&
        !gameState.winner &&
        piece?.owner ===
          localSeat &&
        gameState.turn ===
          localSeat;

      if (
        canSelect ||
        moveKind
      ) {
        tile.classList.add(
          "can-select",
        );
      }

      const coord =
        document.createElement(
          "span",
        );

      coord.className =
        "coord";

      coord.textContent =
        coordName(
          displayR,
          c,
        );

      tile.append(
        coord,
      );

      if (
        piece
      ) {
        const pieceEl =
          document.createElement(
            "span",
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
          pieceEl,
        );
      }

      fragment.append(
        tile,
      );
    }
  }

  els.board.append(
    fragment,
  );
}

/* =========================================================
   STATUS
   ========================================================= */

function renderGameStatus() {
  if (
    !gameState
  ) {
    return;
  }

  els.p1Count.textContent =
    String(
      countPieces(
        gameState.board,
        "p1",
      ),
    );

  els.p2Count.textContent =
    String(
      countPieces(
        gameState.board,
        "p2",
      ),
    );

  const p1Online =
    seatOnline(
      "p1",
    );

  const p2Online =
    seatOnline(
      "p2",
    );

  if (
    localMode ===
    "viewer"
  ) {
    els.p1Seat.textContent =
      p1Online
        ? "Player Xanh · online"
        : "Player Xanh · mất kết nối";

    els.p2Seat.textContent =
      p2Online
        ? "Player Đỏ · online"
        : "Player Đỏ · mất kết nối";
  } else {
    els.p1Seat.textContent =
      localSeat ===
      "p1"
        ? "Bạn · đang online"
        : p1Online
          ? "Đối thủ · đang online"
          : "Đối thủ · mất kết nối";

    els.p2Seat.textContent =
      localSeat ===
      "p2"
        ? "Bạn · đang online"
        : p2Online
          ? "Đối thủ · đang online"
          : "Đối thủ · mất kết nối";
  }

  const viewers =
    viewerTotal();

  els.viewerCount.textContent =
    `${viewers} viewer${
      viewers === 1
        ? ""
        : "s"
    }`;

  els.myRole.textContent =
    localMode ===
    "viewer"
      ? "Viewer"
      : PLAYER_META[
          localSeat
        ].name;

  els.resetBtn.disabled =
    localMode !==
    "player";

  els.modalResetBtn.hidden =
    localMode !==
    "player";

  if (
    gameState.winner
  ) {
    els.statusText.textContent =
      `${PLAYER_META[gameState.winner].name} đã thắng!`;

    els.turnBadge.className =
      `turn-badge ${gameState.winner}`;

    els.turnBadge.textContent =
      "KẾT THÚC";

    return;
  }

  els.turnBadge.className =
    `turn-badge ${gameState.turn}`;

  els.turnBadge.textContent =
    `Lượt ${PLAYER_META[gameState.turn].short}`;

  if (
    localMode ===
    "viewer"
  ) {
    els.statusText.textContent =
      `Bạn đang xem · hiện là lượt ${PLAYER_META[gameState.turn].short}.`;
  } else if (
    gameState.turn ===
    localSeat
  ) {
    els.statusText.textContent =
      "Tới lượt bạn — chọn một quân để di chuyển.";
  } else {
    els.statusText.textContent =
      `Đang chờ ${PLAYER_META[gameState.turn].short} đi quân.`;
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
    winner ===
    "p1"
      ? "🔵🏆"
      : "🔴🏆";
}

function renderGame() {
  if (
    !gameState
  ) {
    return;
  }

  if (
    selected
  ) {
    const piece =
      gameState.board[
        selected.r
      ]?.[
        selected.c
      ];

    if (
      localMode !==
        "player" ||
      !piece ||
      piece.owner !==
        localSeat ||
      gameState.turn !==
        localSeat ||
      gameState.winner
    ) {
      selected =
        null;

      legalTargets.clear();
    } else {
      legalTargets =
        getLegalTargets(
          gameState.board,
          selected.r,
          selected.c,
        );
    }
  }

  renderGameStatus();

  renderBoard();

  renderWinnerModal();
}

/* =========================================================
   MOVE
   ========================================================= */

function handleBoardClick(
  event,
) {
  const tile =
    event.target.closest(
      ".tile",
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
    gameState.winner
  ) {
    setToast(
      "Ván đấu đã kết thúc. Hãy bấm Chơi lại.",
    );

    return;
  }

  if (
    localMode !==
    "player"
  ) {
    setToast(
      "Bạn đang ở chế độ Viewer.",
    );

    return;
  }

  if (
    gameState.turn !==
    localSeat
  ) {
    setToast(
      `Chưa tới lượt bạn. Hiện là lượt ${PLAYER_META[gameState.turn].short}.`,
    );

    return;
  }

  const r =
    Number(
      tile.dataset.r,
    );

  const c =
    Number(
      tile.dataset.c,
    );

  const clickedPiece =
    gameState.board[
      r
    ][
      c
    ];

  const targetKind =
    legalTargets.get(
      keyOf(
        r,
        c,
      ),
    );

  if (
    selected &&
    targetKind
  ) {
    commitMove(
      selected.r,
      selected.c,
      r,
      c,
      targetKind,
    );

    return;
  }

  if (
    clickedPiece?.owner ===
    localSeat
  ) {
    selected = {
      r,
      c,
    };

    legalTargets =
      getLegalTargets(
        gameState.board,
        r,
        c,
      );

    renderBoard();

    return;
  }

  selected =
    null;

  legalTargets.clear();

  renderBoard();
}

function commitMove(
  fromR,
  fromC,
  toR,
  toC,
  targetKind,
) {
  if (
    !gameStore ||
    !gameState ||
    localMode !==
      "player" ||
    !validSide(
      localSeat,
    )
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
      fromC,
    );

  if (
    gameState.winner ||
    gameState.turn !==
      localSeat ||
    livePiece?.owner !==
      localSeat ||
    !liveLegal.has(
      keyOf(
        toR,
        toC,
      ),
    )
  ) {
    selected =
      null;

    legalTargets.clear();

    renderGame();

    return;
  }

  const movingPiece = {
    ...livePiece,
  };

  const capturedPiece =
    gameState.board[
      toR
    ][
      toC
    ]
      ? {
          ...gameState.board[
            toR
          ][
            toC
          ],
        }
      : null;

  gameStore.setData(
    (
      draft,
    ) => {
      ensureGameShape(
        draft,
      );

      if (
        draft.winner ||
        draft.turn !==
          localSeat
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
          localSeat
      ) {
        return;
      }

      const currentLegal =
        getLegalTargets(
          draft.board,
          fromR,
          fromC,
        );

      if (
        !currentLegal.has(
          keyOf(
            toR,
            toC,
          ),
        )
      ) {
        return;
      }

      const captured =
        draft.board[
          toR
        ][
          toC
        ];

      const type =
        draftPiece.type;

      draft.board[
        fromR
      ].splice(
        fromC,
        1,
        null,
      );

      draft.board[
        toR
      ].splice(
        toC,
        1,
        {
          owner:
            localSeat,

          type,
        },
      );

      draft.moveNumber =
        (
          draft.moveNumber ??
          0
        ) + 1;

      draft.lastMove = {
        by:
          localSeat,

        from:
          coordName(
            fromR,
            fromC,
          ),

        to:
          coordName(
            toR,
            toC,
          ),

        piece:
          type,

        capture:
          captured
            ? captured.type
            : null,

        at:
          Date.now(),
      };

      const result =
        determineWinnerAfterMove(
          draft.board,
          localSeat,
          toR,
          toC,
        );

      if (
        result
      ) {
        draft.winner =
          result.winner;

        draft.winReason =
          result.reason;
      } else {
        draft.turn =
          otherSide(
            localSeat,
          );
      }
    },
  );

  selected =
    null;

  legalTargets.clear();

  if (
    targetKind ===
      "capture" &&
    capturedPiece
  ) {
    setToast(
      `${TYPES[movingPiece.type].label} ${TYPES[movingPiece.type].emoji} ăn ${TYPES[capturedPiece.type].label} ${TYPES[capturedPiece.type].emoji}.`,
    );
  }
}

/* =========================================================
   RESET / LEAVE
   ========================================================= */

function resetGame() {
  if (
    !gameStore ||
    localMode !==
      "player"
  ) {
    setToast(
      "Viewer không thể reset ván đấu.",
    );

    return;
  }

  gameStore.setData(
    (
      draft,
    ) => {
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
    },
  );

  selected =
    null;

  legalTargets.clear();

  setToast(
    "Đã tạo lại bàn cờ. Xanh đi trước.",
  );
}

function leaveGame() {
  try {
    playhtml
      ?.presence
      ?.setMyPresence(
        GAME_PRESENCE_CHANNEL,
        null,
      );

    globalLobby
      ?.presence
      ?.setMyPresence(
        MATCH_CHANNEL,
        null,
      );

    globalLobby
      ?.destroy?.();
  } catch (
    error
  ) {
    console.warn(
      error,
    );
  }

  location.href =
    baseLobbyUrl();
}

async function copyViewerLink() {
  const link =
    gameUrl(
      currentRoomCode,
      null,
      true,
    );

  try {
    await navigator
      .clipboard
      .writeText(
        link,
      );

    setToast(
      "Đã sao chép link Viewer.",
    );
  } catch {
    setToast(
      link,
      5000,
    );
  }
}

/* =========================================================
   GAME INIT
   ========================================================= */

async function initGameMode(
  roomCode,
) {
  currentRoomCode =
    roomCode;

  localMode =
    isViewerUrl()
      ? "viewer"
      : "player";

  localSeat =
    localMode ===
    "player"
      ? seatFromUrl()
      : null;

  if (
    localMode ===
      "player" &&
    !localSeat
  ) {
    location.replace(
      baseLobbyUrl(),
    );

    return;
  }

  els.entryScreen.hidden =
    true;

  els.gameShell.hidden =
    false;

  els.winnerModal.hidden =
    true;

  els.roomText.textContent =
    `Phòng: ${roomCode}`;

  els.connectionText.textContent =
    "Đang kết nối…";

  els.connectionDot
    .classList
    .remove(
      "online",
    );

  gameState =
    createInitialGame();

  renderGame();

  try {
    playhtml =
      await loadPlayHTML();

    await withTimeout(
      playhtml.init({
        room:
          `ottv2-game-${APP_VERSION}-${roomCode}`,
      }),
      15000,
      "Kết nối phòng game quá 15 giây.",
    );

    myId =
      playhtml
        .presence
        .getMyIdentity()
        .publicKey;

    gameStartedAt =
      Date.now();

    gameStore =
      playhtml.createPageData(
        GAME_STATE_KEY,
        createInitialGame(),
      );

    gameState =
      gameStore.getData();

    ensureGameShape(
      gameState,
    );

    gameStore.onUpdate(
      (
        nextState,
      ) => {
        gameState =
          nextState;

        renderGame();
      },
    );

    playhtml
      .presence
      .onPresenceChange(
        GAME_PRESENCE_CHANNEL,
        () => {
          renderGameStatus();
        },
      );

    publishGamePresence();

    globalLobby =
      playhtml.createPresenceRoom(
        GLOBAL_LOBBY_ROOM,
      );

    publishActiveGameToLobby();

    connected =
      true;

    els.connectionDot
      .classList
      .add(
        "online",
      );

    els.connectionText.textContent =
      "Đã kết nối realtime";

    renderGame();
  } catch (
    error
  ) {
    console.error(
      "Không thể mở phòng game:",
      error,
    );

    connected =
      false;

    els.connectionDot
      .classList
      .remove(
        "online",
      );

    els.connectionText.textContent =
      "Mất kết nối realtime";

    els.statusText.textContent =
      "Không kết nối được multiplayer. Hãy Ctrl + F5 rồi thử lại.";

    setToast(
      error?.message ||
        String(
          error,
        ),
      0,
    );
  }
}

/* =========================================================
   BUTTON EVENTS
   ========================================================= */

els.rolePlayerBtn
  .addEventListener(
    "click",
    () => {
      if (
        !connected
      ) {
        setLobbyMessage(
          "Sảnh chưa kết nối. Hãy chờ một chút.",
        );

        return;
      }

      setLobbyMessage(
        "",
      );

      showEntryStep(
        "player",
      );
    },
  );

els.roleViewerBtn
  .addEventListener(
    "click",
    () => {
      if (
        !connected
      ) {
        setLobbyMessage(
          "Sảnh chưa kết nối. Hãy chờ một chút.",
        );

        return;
      }

      startViewerRandom();
    },
  );

els.createRoomBtn
  .addEventListener(
    "click",
    () => {
      setLobbyMessage(
        "",
      );

      showEntryStep(
        "side",
      );
    },
  );

els.joinRandomBtn
  .addEventListener(
    "click",
    () => {
      if (
        !connected
      ) {
        return;
      }

      startJoinRandom();
    },
  );

els.backRoleBtn
  .addEventListener(
    "click",
    () => {
      setLobbyMessage(
        "",
      );

      showEntryStep(
        "role",
      );
    },
  );

els.backPlayerBtn
  .addEventListener(
    "click",
    () => {
      setLobbyMessage(
        "",
      );

      showEntryStep(
        "player",
      );
    },
  );

els.chooseBlueBtn
  .addEventListener(
    "click",
    () =>
      createHostRoom(
        "p1",
      ),
  );

els.chooseRedBtn
  .addEventListener(
    "click",
    () =>
      createHostRoom(
        "p2",
      ),
  );

els.cancelMatchBtn
  .addEventListener(
    "click",
    cancelMatchmaking,
  );

els.board
  .addEventListener(
    "click",
    handleBoardClick,
  );

els.leaveGameBtn
  .addEventListener(
    "click",
    leaveGame,
  );

els.modalLobbyBtn
  .addEventListener(
    "click",
    leaveGame,
  );

els.copyRoomBtn
  .addEventListener(
    "click",
    copyViewerLink,
  );

els.resetBtn
  .addEventListener(
    "click",
    resetGame,
  );

els.modalResetBtn
  .addEventListener(
    "click",
    resetGame,
  );

/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {
    try {
      clearMatchPresence();

      globalLobby
        ?.destroy?.();
    } catch {
      // Browser đóng kết nối.
    }
  },
);

/* =========================================================
   START
   ========================================================= */

async function start() {
  const roomCode =
    roomFromUrl();

  if (
    roomCode
  ) {
    await initGameMode(
      roomCode,
    );
  } else {
    await initLobbyMode();
  }
}

start();