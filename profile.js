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
  profilePanel.hidden = false;
  authPanel.hidden = true;
  setupNotice.hidden = true;
  document.querySelector("#profile-name").textContent = "Cargando perfil…";
  document.querySelector("#profile-email").textContent = user.email || "";
  showStatus(profileStatus, "", false);

  const [profileResult, statsResult, sessionsResult] = await Promise.all([
    client.from("profiles").select("display_name").eq("id", user.id).single(),
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

  document.querySelector("#profile-name").textContent = profileResult.data.display_name;
  document.querySelector("#total-games").textContent = String(totals.games);
  document.querySelector("#total-time").textContent = formatDuration(totals.seconds);
  document.querySelector("#total-kills").textContent = String(totals.kills);
  document.querySelector("#total-wins").textContent = String(totals.wins);
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
document.querySelector("#sign-out").addEventListener("click", async () => {
  const client = window.ARCADE_ACCOUNT.getClient();
  if (!client) return;
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  } catch (error) {
    showStatus(profileStatus, `No se pudo cerrar sesión: ${error.message}`, true);
  }
});

initialize().catch((error) => {
  setupNotice.hidden = false;
  showStatus(authStatus, `No se pudo iniciar el perfil: ${error.message}`, true);
});
