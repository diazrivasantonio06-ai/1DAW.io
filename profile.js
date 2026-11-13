"use strict";

const setupNotice = document.querySelector("#setup-notice");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const profilePanel = document.querySelector("#profile-panel");
const authStatus = document.querySelector("#account-status");
const profileStatus = document.querySelector("#profile-status");
const displayNameField = document.querySelector("#display-name-field");
const authTitle = document.querySelector("#auth-title");
const submitAuth = document.querySelector("#submit-auth");
const toggleAuth = document.querySelector("#toggle-auth");
let creatingAccount = false;
let profileRequest = 0;
let currentClient = null;
let currentProfile = null;
let savingCosmetic = false;

const LEVEL_MINUTES = [4, 4, 6, 7, 8, 8, 10, 11, 12, 12, 13, 14, 15, 15];
const AVATARS = [
  { id: "avatar-arcade", name: "Arcade", icon: "🕹️", level: 1 },
  { id: "avatar-fox", name: "Zorro", icon: "🦊", level: 2 },
  { id: "avatar-owl", name: "Búho", icon: "🦉", level: 4 },
  { id: "avatar-bear", name: "Oso", icon: "🐻", level: 6 },
  { id: "avatar-dragon", name: "Dragón", icon: "🐉", level: 8 },
  { id: "avatar-robot", name: "Robot", icon: "🤖", level: 10 }
];
const BANNERS = [
  { id: "banner-neon", name: "Neón", className: "banner-neon", level: 1 },
  { id: "banner-sunset", name: "Atardecer", className: "banner-sunset", level: 3 },
  { id: "banner-ocean", name: "Océano", className: "banner-ocean", level: 5 },
  { id: "banner-galaxy", name: "Galaxia", className: "banner-galaxy", level: 7 },
  { id: "banner-forest", name: "Bosque", className: "banner-forest", level: 9 },
  { id: "banner-aurora", name: "Aurora", className: "banner-aurora", level: 11 }
];

function showStatus(element, message, isError) {
  element.textContent = message;
  element.dataset.error = isError ? "true" : "false";
}

function setAuthMode(createAccount) {
  creatingAccount = createAccount;
  displayNameField.hidden = !createAccount;
  document.querySelector("#display-name").required = createAccount;
  document.querySelector("#password").autocomplete = createAccount ? "new-password" : "current-password";
  authTitle.textContent = createAccount ? "Crea tu cuenta" : "Inicia sesión";
  submitAuth.textContent = createAccount ? "Crear cuenta" : "Iniciar sesión";
  toggleAuth.textContent = createAccount ? "Ya tengo una cuenta" : "Crear una cuenta";
  showStatus(authStatus, "", false);
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor(Number(seconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours} h ${minutes} min`;
  if (totalMinutes) return `${totalMinutes} min`;
  return `${Math.floor(Number(seconds || 0))} s`;
}

function minutesForNextLevel(level) {
  return level <= LEVEL_MINUTES.length ? LEVEL_MINUTES[level - 1] : level + 1;
}

function getLevelProgress(activeSeconds) {
  const totalSeconds = Math.max(0, Number(activeSeconds) || 0);
  let level = 1;
  let levelStart = 0;
  let nextLevelAt = minutesForNextLevel(level) * 60;
  while (totalSeconds >= nextLevelAt) {
    level += 1;
    levelStart = nextLevelAt;
    nextLevelAt += minutesForNextLevel(level) * 60;
  }
  return { level, levelStart, nextLevelAt, totalSeconds };
}

function renderLevelProgress(activeSeconds) {
  const progress = getLevelProgress(activeSeconds);
  const duration = progress.nextLevelAt - progress.levelStart;
  const percentage = Math.min(100, ((progress.totalSeconds - progress.levelStart) / duration) * 100);
  document.querySelector("#profile-level").textContent = `Nivel ${progress.level}`;
  document.querySelector("#active-time-label").textContent = `${formatDuration(progress.totalSeconds)} en la web`;
  document.querySelector("#level-progress-fill").style.width = `${percentage}%`;
  document.querySelector("#level-progress").setAttribute("aria-valuenow", String(Math.round(percentage)));
  document.querySelector("#level-progress-label").textContent =
    `${formatDuration(progress.nextLevelAt - progress.totalSeconds)} para el nivel ${progress.level + 1}`;
  return progress.level;
}

function renderCosmeticOptions(profile, level) {
  const avatarContainer = document.querySelector("#avatar-options");
  const bannerContainer = document.querySelector("#banner-options");
  avatarContainer.replaceChildren();
  bannerContainer.replaceChildren();

  function makeOption(item, kind, isSelected) {
    const isUnlocked = level >= item.level;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cosmetic-option";
    button.disabled = !isUnlocked || savingCosmetic;
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", `${item.name}, ${isUnlocked ? "desbloqueado" : `se desbloquea en el nivel ${item.level}`}`);

    const preview = document.createElement("span");
    if (kind === "avatar") {
      preview.className = "cosmetic-avatar";
      preview.textContent = item.icon;
    } else {
      preview.className = `cosmetic-banner-swatch ${item.className}`;
      preview.setAttribute("aria-hidden", "true");
    }

    const name = document.createElement("span");
    name.className = "cosmetic-name";
    name.textContent = item.name;
    const state = document.createElement("span");
    state.className = "cosmetic-state";
    state.textContent = isSelected ? "Equipado" : isUnlocked ? "Desbloqueado" : `Nivel ${item.level}`;
    button.append(preview, name, state);
    if (isUnlocked && !isSelected) {
      button.addEventListener("click", () => { void saveCosmetic(kind, item.id); });
    }
    return button;
  }

  AVATARS.forEach((avatar) => {
    avatarContainer.append(makeOption(avatar, "avatar", avatar.id === profile.avatar_id));
  });
  BANNERS.forEach((banner) => {
    bannerContainer.append(makeOption(banner, "banner", banner.id === profile.banner_id));
  });
}

function renderProfileAppearance(profile) {
  const level = renderLevelProgress(profile.active_seconds);
  const avatar = AVATARS.find((item) => item.id === profile.avatar_id) || AVATARS[0];
  const banner = BANNERS.find((item) => item.id === profile.banner_id) || BANNERS[0];
  document.querySelector("#profile-avatar").textContent = avatar.icon;
  document.querySelector("#profile-banner").className = `profile-banner ${banner.className}`;
  renderCosmeticOptions(profile, level);
}

async function saveCosmetic(kind, id) {
  if (!currentProfile || !currentClient || savingCosmetic) return;
  const avatarId = kind === "avatar" ? id : currentProfile.avatar_id;
  const bannerId = kind === "banner" ? id : currentProfile.banner_id;
  savingCosmetic = true;
  renderCosmeticOptions(currentProfile, getLevelProgress(currentProfile.active_seconds).level);
  showStatus(document.querySelector("#cosmetic-status"), "Guardando personalización…", false);

  try {
    const { data, error } = await currentClient.rpc("set_profile_customization", {
      p_avatar_id: avatarId,
      p_banner_id: bannerId
    });
    if (error) throw error;
    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved) throw new Error("Supabase no devolvió la personalización guardada.");
    currentProfile.avatar_id = saved.avatar_id;
    currentProfile.banner_id = saved.banner_id;
    renderProfileAppearance(currentProfile);
    showStatus(document.querySelector("#cosmetic-status"), "Personalización guardada.", false);
  } catch (error) {
    showStatus(document.querySelector("#cosmetic-status"), `No se pudo guardar: ${error.message}`, true);
  } finally {
    savingCosmetic = false;
    renderCosmeticOptions(currentProfile, getLevelProgress(currentProfile.active_seconds).level);
  }
}

function gameTitle(gameId) {
  const game = Array.isArray(window.GAMES) ? window.GAMES.find((item) => item.id === gameId) : null;
  return game ? game.title : gameId;
}

function renderGameStats(stats) {
  const container = document.querySelector("#game-stats");
  container.replaceChildren();
  const games = Array.isArray(window.GAMES) ? window.GAMES : [];
  const statsByGame = new Map(stats.map((stat) => [stat.game_id, stat]));
  const knownGameIds = new Set(games.map((game) => game.id));
  const cards = [
    ...games.map((game) => ({ id: game.id, title: game.title, stat: statsByGame.get(game.id) || null })),
    ...stats
      .filter((stat) => !knownGameIds.has(stat.game_id))
      .map((stat) => ({ id: stat.game_id, title: gameTitle(stat.game_id), stat }))
  ];

  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Todavía no hay estadísticas disponibles.";
    container.append(empty);
    return;
  }

  cards.forEach(({ id, title: gameName, stat }) => {
    const card = document.createElement("article");
    card.className = "game-stat";
    const heading = document.createElement("h3");
    heading.textContent = gameName;
    const value = (field) => Number((stat && stat[field]) || 0);
    let details;
    if (id === "claude-of-duty") {
      details = [
        `Mejor oleada: ${value("best_round")}`,
        `Zombis eliminados: ${value("total_kills")}`
      ];
    } else if (id === "Claude-nite") {
      details = [
        `Tiempo jugado: ${formatDuration(value("total_seconds"))}`,
        `Cofres abiertos: ${value("total_chests_opened")}`,
        `Eliminaciones: ${value("total_kills")}`
      ];
    } else {
      details = [
        `${value("games_played")} partidas`,
        `${value("wins")} victorias`,
        `${value("total_kills")} bajas`,
        `Mejor puntuación: ${value("best_score")}`
      ];
    }
    card.append(heading);
    details.forEach((detail) => {
      const line = document.createElement("p");
      line.textContent = detail;
      card.append(line);
    });
    container.append(card);
  });
}

function renderHistory(sessions) {
  const list = document.querySelector("#game-history");
  list.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "Tus partidas terminadas aparecerán aquí.";
    list.append(empty);
    return;
  }

  sessions.forEach((session) => {
    const row = document.createElement("li");
    const summary = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = gameTitle(session.game_id);
    const date = document.createElement("small");
    date.textContent = new Date(session.created_at).toLocaleString("es-ES");
    summary.append(title, document.createTextNode(" · "), date);

    const details = document.createElement("small");
    const outcome = session.won
      ? "Victoria"
      : session.placement
        ? `Puesto #${session.placement}`
        : session.round_reached
          ? `Ronda ${session.round_reached}`
          : "Partida terminada";
    details.textContent = `${outcome} · ${Number(session.kills)} bajas · ${formatDuration(session.duration_seconds)}`;
    row.append(summary, details);
    list.append(row);
  });
}

async function loadProfile(client, user) {
  const request = ++profileRequest;
  currentProfile = null;
  profilePanel.hidden = false;
  authPanel.hidden = true;
  setupNotice.hidden = true;
  document.querySelector("#profile-name").textContent = "Cargando perfil…";
  document.querySelector("#profile-email").textContent = user.email || "";
  showStatus(profileStatus, "", false);

  const [profileResult, statsResult, sessionsResult] = await Promise.all([
    client.from("profiles").select("display_name,active_seconds,avatar_id,banner_id").eq("id", user.id).single(),
    client.rpc("get_my_game_stats"),
    client.from("game_sessions")
      .select("game_id,duration_seconds,kills,score,won,placement,round_reached,created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);
  if (request !== profileRequest) return;

  const error = profileResult.error || statsResult.error || sessionsResult.error;
  if (error) {
    document.querySelector("#profile-name").textContent = user.email || "Tu perfil";
    showStatus(profileStatus, `No se pudieron cargar las estadísticas: ${error.message}`, true);
    return;
  }

  const stats = statsResult.data || [];
  const sessions = sessionsResult.data || [];
  const totals = stats.reduce((total, item) => ({
    games: total.games + Number(item.games_played || 0),
    seconds: total.seconds + Number(item.total_seconds || 0),
    kills: total.kills + Number(item.total_kills || 0),
    wins: total.wins + Number(item.wins || 0)
  }), { games: 0, seconds: 0, kills: 0, wins: 0 });

  currentProfile = profileResult.data;
  document.querySelector("#profile-name").textContent = currentProfile.display_name;
  document.querySelector("#total-games").textContent = String(totals.games);
  document.querySelector("#total-time").textContent = formatDuration(totals.seconds);
  document.querySelector("#total-kills").textContent = String(totals.kills);
  document.querySelector("#total-wins").textContent = String(totals.wins);
  renderProfileAppearance(currentProfile);
  renderGameStats(stats);
  renderHistory(sessions);
}

function renderSession(client, session) {
  if (session) {
    loadProfile(client, session.user).catch((error) => {
      showStatus(profileStatus, `No se pudo cargar el perfil: ${error.message}`, true);
    });
  } else {
    profileRequest += 1;
    currentProfile = null;
    profilePanel.hidden = true;
    authPanel.hidden = false;
    setAuthMode(false);
  }
}

async function initialize() {
  document.querySelector("[data-year]").textContent = new Date().getFullYear();
  if (!window.ARCADE_ACCOUNT.isConfigured()) {
    setupNotice.hidden = false;
    return;
  }

  const client = window.ARCADE_ACCOUNT.getClient();
  if (!client) {
    showStatus(authStatus, "No se pudo cargar la librería de Supabase. Comprueba tu conexión e inténtalo de nuevo.", true);
    authPanel.hidden = false;
    return;
  }

  currentClient = client;
  setAuthMode(false);
  authPanel.hidden = false;
  client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => renderSession(client, session), 0);
  });
  const { data, error } = await client.auth.getSession();
  if (error) {
    showStatus(authStatus, `No se pudo comprobar la sesión: ${error.message}`, true);
    return;
  }
  renderSession(client, data.session);
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = window.ARCADE_ACCOUNT.getClient();
  if (!client) {
    showStatus(authStatus, "Supabase no está configurado.", true);
    return;
  }

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  submitAuth.disabled = true;
  showStatus(authStatus, creatingAccount ? "Creando cuenta…" : "Iniciando sesión…", false);

  try {
    if (creatingAccount) {
      const displayName = document.querySelector("#display-name").value.trim().replace(/\s+/g, " ");
      if (!displayName) throw new Error("Escribe un nombre de jugador.");
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: new URL("perfil.html", window.location.href).href
        }
      });
      if (error) throw error;
      if (!data.session) {
        showStatus(authStatus, "Cuenta creada. Revisa tu correo para confirmar la dirección y luego inicia sesión.", false);
      }
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    showStatus(authStatus, error.message, true);
  } finally {
    submitAuth.disabled = false;
  }
});

toggleAuth.addEventListener("click", () => setAuthMode(!creatingAccount));
window.addEventListener("arcade:progress", (event) => {
  if (!currentProfile) return;
  currentProfile.active_seconds = event.detail.activeSeconds;
  renderProfileAppearance(currentProfile);
});
window.addEventListener("arcade:progress-error", (event) => {
  if (!profilePanel.hidden) {
    showStatus(profileStatus, `No se pudo actualizar el progreso: ${event.detail.message}`, true);
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  const client = window.ARCADE_ACCOUNT.getClient();
  if (!client) return;
  try {
    const { error: pauseError } = await client.rpc("pause_active_time");
    if (pauseError) console.error("No se pudo pausar el tiempo de perfil:", pauseError);
    const { error } = await client.auth.signOut();
    if (error) throw error;
    if (pauseError) {
      showStatus(authStatus, `Sesión cerrada, pero no se pudo pausar el tiempo: ${pauseError.message}`, true);
    }
  } catch (error) {
    showStatus(profileStatus, `No se pudo cerrar sesión: ${error.message}`, true);
  }
});

initialize().catch((error) => {
  setupNotice.hidden = false;
  showStatus(authStatus, `No se pudo iniciar el perfil: ${error.message}`, true);
});
