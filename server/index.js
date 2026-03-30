const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('../frontend'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---- State ----
const waitingQueue = []; // [{ws, userId, username}]
const games = new Map(); // gameId -> GameState
const playerGame = new Map(); // userId -> gameId

// ---- Card logic ----
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = { '6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function beats(attack, defense, trumpSuit) {
  if (defense.suit === attack.suit)
    return RANK_VAL[defense.rank] > RANK_VAL[attack.rank];
  if (defense.suit === trumpSuit && attack.suit !== trumpSuit)
    return true;
  return false;
}

function isTrump(card, trumpSuit) {
  return card.suit === trumpSuit;
}

// ---- Game factory ----
function createGame(p1, p2) {
  const gameId = crypto.randomUUID();
  const deck = createDeck();
  const trumpCard = deck[deck.length - 1];
  const trumpSuit = trumpCard.suit;

  const hands = { [p1.userId]: [], [p2.userId]: [] };
  for (let i = 0; i < 6; i++) {
    hands[p1.userId].push(deck.pop());
    hands[p2.userId].push(deck.pop());
  }

  // Decide who attacks first: player with lowest trump, else random
  const lowestTrump = (hand) => hand.filter(c => c.suit === trumpSuit)
    .sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank])[0];
  const t1 = lowestTrump(hands[p1.userId]);
  const t2 = lowestTrump(hands[p2.userId]);

  let attacker;
  if (t1 && t2) attacker = RANK_VAL[t1.rank] <= RANK_VAL[t2.rank] ? p1.userId : p2.userId;
  else if (t1) attacker = p1.userId;
  else if (t2) attacker = p2.userId;
  else attacker = Math.random() < 0.5 ? p1.userId : p2.userId;

  const defender = attacker === p1.userId ? p2.userId : p1.userId;

  const game = {
    id: gameId,
    players: { [p1.userId]: p1, [p2.userId]: p2 },
    playerIds: [p1.userId, p2.userId],
    hands,
    deck,
    trumpSuit,
    trumpCard,
    table: [],       // [{attack: card, defense?: card}]
    attacker,
    defender,
    phase: 'attack', // attack | defense | done
    winner: null,
    discardPile: [],
  };

  games.set(gameId, game);
  playerGame.set(p1.userId, gameId);
  playerGame.set(p2.userId, gameId);
  return game;
}

// ---- Broadcast helpers ----
function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function gameStateFor(game, userId) {
  // Each player sees their own hand, opponent card count, public game info
  const opponentId = game.playerIds.find(id => id !== userId);
  const opponent = game.players[opponentId];
  return {
    type: 'state',
    trumpSuit: game.trumpSuit,
    trumpCard: game.trumpCard,
    deckCount: game.deck.length,
    table: game.table,
    myHand: game.hands[userId],
    opponentCardCount: game.hands[opponentId]?.length ?? 0,
    opponentName: opponent?.username ?? 'Суперник',
    isAttacker: game.attacker === userId,
    isDefender: game.defender === userId,
    phase: game.phase,
    winner: game.winner,
    myId: userId,
  };
}

function broadcastState(game) {
  for (const uid of game.playerIds) {
    const p = game.players[uid];
    if (p?.ws) sendTo(p.ws, gameStateFor(game, uid));
  }
}

// ---- Refill hands ----
function refillHands(game) {
  // Attacker refills first
  const order = [game.attacker, game.defender];
  for (const uid of order) {
    while (game.hands[uid].length < 6 && game.deck.length > 0)
      game.hands[uid].push(game.deck.pop());
  }
}

// ---- Win check ----
function checkWin(game) {
  if (game.deck.length > 0) return false;
  const p1Empty = game.hands[game.playerIds[0]].length === 0;
  const p2Empty = game.hands[game.playerIds[1]].length === 0;
  if (p1Empty && p2Empty) { game.winner = 'draw'; game.phase = 'done'; return true; }
  if (p1Empty) { game.winner = game.playerIds[0]; game.phase = 'done'; return true; }
  if (p2Empty) { game.winner = game.playerIds[1]; game.phase = 'done'; return true; }
  return false;
}

function cleanup(game) {
  for (const uid of game.playerIds) playerGame.delete(uid);
  games.delete(game.id);
}

// ---- Action handlers ----
function handleAttack(game, userId, card) {
  if (game.phase !== 'attack') return { error: 'Не ваш хід для атаки' };
  if (game.attacker !== userId) return { error: 'Ви не атакуєте' };
  if (game.table.length >= 6) return { error: 'Максимум 6 карт на столі' };

  // Validate card is in hand
  const hand = game.hands[userId];
  const idx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
  if (idx === -1) return { error: 'Немає такої карти' };

  // If table not empty, rank must match existing
  if (game.table.length > 0) {
    const existingRanks = new Set(
      game.table.flatMap(p => [p.attack.rank, p.defense?.rank]).filter(Boolean)
    );
    if (!existingRanks.has(card.rank)) return { error: 'Rank must match table cards' };
  }

  hand.splice(idx, 1);
  game.table.push({ attack: card });
  game.phase = 'defense';
  return { ok: true };
}

function handleDefend(game, userId, attack, defense) {
  if (game.phase !== 'defense') return { error: 'Не час захищатися' };
  if (game.defender !== userId) return { error: 'Ви не захищаєтесь' };

  const pair = game.table.find(
    p => p.attack.rank === attack.rank && p.attack.suit === attack.suit && !p.defense
  );
  if (!pair) return { error: 'Атакуюча карта не знайдена' };

  const hand = game.hands[userId];
  const idx = hand.findIndex(c => c.rank === defense.rank && c.suit === defense.suit);
  if (idx === -1) return { error: 'Немає такої карти' };

  if (!beats(attack, defense, game.trumpSuit)) return { error: 'Ця карта не б\'є' };

  hand.splice(idx, 1);
  pair.defense = defense;

  // If all pairs defended, switch back to attack phase so attacker can add more
  const allDefended = game.table.every(p => p.defense);
  if (allDefended) game.phase = 'attack';

  return { ok: true };
}

function handleTake(game, userId) {
  if (game.defender !== userId) return { error: 'Ви не захищаєтесь' };

  // Defender takes all table cards
  const allCards = game.table.flatMap(p => [p.attack, p.defense].filter(Boolean));
  game.hands[userId].push(...allCards);
  game.table = [];

  // Attacker stays attacker (defender picked up)
  refillHands(game);
  game.phase = 'attack';
  if (checkWin(game)) {
    broadcastState(game);
    setTimeout(() => cleanup(game), 5000);
    return { ok: true };
  }
  return { ok: true };
}

function handleDone(game, userId) {
  // Attacker says "done" — discard table and swap roles
  if (game.attacker !== userId) return { error: 'Не ваш хід' };
  if (game.table.length === 0) return { error: 'Стіл порожній' };
  if (!game.table.every(p => p.defense)) return { error: 'Не всі карти відбиті' };

  game.discardPile.push(...game.table.flatMap(p => [p.attack, p.defense]));
  game.table = [];

  // Roles swap
  [game.attacker, game.defender] = [game.defender, game.attacker];
  game.phase = 'attack';

  refillHands(game);
  if (checkWin(game)) {
    broadcastState(game);
    setTimeout(() => cleanup(game), 5000);
    return { ok: true };
  }
  return { ok: true };
}

// ---- WebSocket ----
wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ---- JOIN ----
    if (msg.type === 'join') {
      userId = msg.userId?.toString();
      const username = msg.username || 'Гравець';
      if (!userId) return;

      // Reconnect to existing game
      if (playerGame.has(userId)) {
        const game = games.get(playerGame.get(userId));
        if (game) {
          game.players[userId].ws = ws;
          sendTo(ws, gameStateFor(game, userId));
          return;
        }
      }

      // Matchmaking
      const existing = waitingQueue.findIndex(p => p.userId !== userId);
      if (existing !== -1) {
        const opponent = waitingQueue.splice(existing, 1)[0];
        const p1 = { userId, username, ws };
        const p2 = { userId: opponent.userId, username: opponent.username, ws: opponent.ws };
        const game = createGame(p1, p2);
        broadcastState(game);
        sendTo(p1.ws, { type: 'matched', opponentName: p2.username });
        sendTo(p2.ws, { type: 'matched', opponentName: p1.username });
      } else {
        // Check already in queue
        const alreadyInQueue = waitingQueue.find(p => p.userId === userId);
        if (!alreadyInQueue) {
          waitingQueue.push({ ws, userId, username });
          sendTo(ws, { type: 'waiting' });
        }
      }
      return;
    }

    // ---- GAME ACTIONS (need userId) ----
    if (!userId) return;
    const gameId = playerGame.get(userId);
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.phase === 'done') return;

    let result;
    if (msg.type === 'attack') result = handleAttack(game, userId, msg.card);
    else if (msg.type === 'defend') result = handleDefend(game, userId, msg.attack, msg.defense);
    else if (msg.type === 'take') result = handleTake(game, userId);
    else if (msg.type === 'done') result = handleDone(game, userId);
    else return;

    if (result?.error) { sendTo(ws, { type: 'error', message: result.error }); return; }
    broadcastState(game);
  });

  ws.on('close', () => {
    // Remove from waiting queue
    const qi = waitingQueue.findIndex(p => p.userId === userId);
    if (qi !== -1) waitingQueue.splice(qi, 1);

    // Notify opponent in game
    if (userId && playerGame.has(userId)) {
      const game = games.get(playerGame.get(userId));
      if (game && game.phase !== 'done') {
        const opponentId = game.playerIds.find(id => id !== userId);
        const opp = game.players[opponentId];
        sendTo(opp?.ws, { type: 'opponent_left' });
        game.phase = 'done';
        game.winner = opponentId;
        broadcastState(game);
        setTimeout(() => cleanup(game), 3000);
      }
    }
  });
});

// ---- HTTP endpoints for Telegram bot ----
app.get('/health', (_, res) => res.json({ ok: true, waiting: waitingQueue.length, games: games.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Durak server running on port ${PORT}`));
