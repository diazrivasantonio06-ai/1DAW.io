"use strict";

const grid = document.querySelector("#grid");
const player = document.querySelector("#player");
const frame = document.querySelector("#frame");
const title = document.querySelector("#ptitle");
const accountStatus = document.querySelector("#account-status");
const gamesStatus = document.querySelector("#games-status");
const allGames = Array.isArray(window.GAMES) ? window.GAMES : [];
let games = [];
let activeGame = null;

function canAccessGame(game, profile) {
  if (!Array.isArray(game.allowedRoles)) return true;
  return game.allowedRoles.some((role) => (
    (role === "admin" && profile.is_admin === true)
    || (role === "vip" && profile.is_vip === true)
  ));
}

async function getVisibleGames() {
  const restrictedGames = allGames.filter((game) => Array.isArray(game.allowedRoles));
  if (restrictedGames.length === 0 || !window.ARCADE_ACCOUNT.isConfigured()) {
    return allGames.filter((game) => !Array.isArray(game.allowedRoles));
  }

  const client = window.ARCADE_ACCOUNT.getClient();
  if (!client) throw new Error("No se pudo cargar la librería de Supabase.");

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    return allGames.filter((game) => !Array.isArray(game.allowedRoles));
  }

  const { data: profile, error: profileError } = await client.from("profiles")
    .select("is_admin,is_vip")
    .eq("id", sessionData.session.user.id)
    .single();
  if (profileError) throw profileError;

  return allGames.filter((game) => canAccessGame(game, profile));
}

function renderGames() {
  games.forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "cart";
    card.setAttribute("aria-label", `Jugar ${game.title}`);

    const art = document.createElement("span");
    art.className = "art";
    art.style.setProperty("--c", game.color || "#39344f");
    if (game.cover) {
      art.classList.add("has-cover");
      const cover = document.createElement("img");
      cover.className = "cover-image";
      cover.src = game.cover;
      cover.alt = "";
      cover.loading = "lazy";
      art.append(cover);
    } else {
      const emoji = document.createElement("span");
      emoji.className = "emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = game.emoji || "🎮";
      art.append(emoji);
    }

    const info = document.createElement("span");
    info.className = "cart-info";
    const name = document.createElement("span");
    name.className = "cart-title";
    name.textContent = game.title;
    const description = document.createElement("span");
    description.className = "cart-description";
    description.textContent = game.desc || "";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = game.tag || "Jugar";
    info.append(name, description, tag);
    card.append(art, info);
    card.addEventListener("click", () => {
      location.hash = `jugar-${game.id}`;
    });
    grid.append(card);
  });

  const emptySlots = Math.max(0, 3 - games.length);
  for (let i = 0; i < emptySlots; i += 1) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<strong>Próximamente</strong><span>Un nuevo juego está en camino.</span>";
    grid.append(empty);
  }
}

function openGame(game) {
  activeGame = game;
  title.textContent = game.title;
  accountStatus.textContent = "";
  frame.src = game.src;
  player.classList.add("open");
  if (game.id === "duelo-de-torres") {
    frame.style.maxWidth = "420px";
    frame.style.margin = "0 auto";
    frame.style.border = "4px solid #14202b";
    frame.style.borderRadius = "12px";
    frame.style.boxSizing = "border-box";
  } else {
    frame.style.maxWidth = "";
    frame.style.margin = "";
    frame.style.border = "";
    frame.style.borderRadius = "";
    frame.style.boxSizing = "";
  }
  document.querySelector("#back").focus();
}

function closeGame() {
  activeGame = null;
  player.classList.remove("open");
  frame.removeAttribute("src");
  if (location.hash.startsWith("#jugar-")) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = event.data;
  if (!activeGame || !message || message.type !== "1daw:game-result" || message.gameId !== activeGame.id) return;

  const result = message.result;
  const isIntegerOrNull = (value) => value === null || (Number.isInteger(value) && value >= 0);
  const gameStats = result && result.gameStats === undefined ? {} : result && result.gameStats;
  const allowedStatKeys = new Set((activeGame.stats || []).map((stat) => stat.key));
  const validGameStats = gameStats && typeof gameStats === "object" && !Array.isArray(gameStats)
    && Object.entries(gameStats).every(([key, value]) => allowedStatKeys.has(key)
      && Number.isInteger(value) && value >= 0 && value <= 1000000000);
  if (!result || typeof result.won !== "boolean"
    || !Number.isInteger(result.durationSeconds) || result.durationSeconds < 0
    || !Number.isInteger(result.kills) || result.kills < 0
    || !Number.isInteger(result.chestsOpened) || result.chestsOpened < 0
    || !Number.isInteger(result.score) || result.score < 0
    || !isIntegerOrNull(result.placement)
    || !isIntegerOrNull(result.roundReached)
    || !validGameStats) {
    accountStatus.textContent = "No se pudieron validar las estadísticas de esta partida.";
    return;
  }

  try {
    const saved = await window.ARCADE_ACCOUNT.recordGameResult(activeGame.id, { ...result, gameStats });
    accountStatus.textContent = saved
      ? "Partida guardada en tu perfil."
      : "Inicia sesión antes de jugar para guardar tus estadísticas.";
  } catch (error) {
    accountStatus.textContent = `No se pudo guardar la partida: ${error.message}`;
  }
});

document.querySelector("#back").addEventListener("click", closeGame);
function syncRoute() {
  const gameId = location.hash.startsWith("#jugar-") ? location.hash.slice("#jugar-".length) : "";
  const game = games.find((item) => item.id === gameId);
  if (game) openGame(game);
  else closeGame();
}
window.addEventListener("hashchange", syncRoute);
document.querySelector("[data-year]").textContent = new Date().getFullYear();

async function initializeGames() {
  try {
    games = await getVisibleGames();
  } catch (error) {
    games = allGames.filter((game) => !Array.isArray(game.allowedRoles));
    gamesStatus.hidden = false;
    gamesStatus.dataset.error = "true";
    gamesStatus.textContent = `No se pudo comprobar el acceso a los juegos beta: ${error.message}`;
  }
  renderGames();
  syncRoute();
}

initializeGames();
