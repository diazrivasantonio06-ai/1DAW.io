"use strict";

const gameFilter = document.querySelector("#game-filter");
const refreshButton = document.querySelector("#refresh-leaderboard");
const statusMessage = document.querySelector("#leaderboard-status");
const rows = document.querySelector("#leaderboard-rows");
const headings = document.querySelector("#leaderboard-headings");
const numberFormat = new Intl.NumberFormat("es-ES");

function populateGameFilter() {
  const games = Array.isArray(window.GAMES) ? window.GAMES : [];
  games.forEach((game) => {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.title;
    gameFilter.append(option);
  });
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : "0";
}

function selectedGameColumns() {
  const games = Array.isArray(window.GAMES) ? window.GAMES : [];
  const game = games.find((item) => item.id === gameFilter.value);
  return game ? game.leaderboardStats || game.stats || [] : [];
}

function formatDuration(seconds) {
  const totalSeconds = Number(seconds);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours} h ${minutes} min`;
  if (totalMinutes) return `${totalMinutes} min`;
  return `${Math.floor(totalSeconds)} s`;
}

function renderHeadings() {
  headings.querySelectorAll("[data-game-stat]").forEach((heading) => heading.remove());
  selectedGameColumns().forEach((column) => {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.dataset.gameStat = "true";
    heading.textContent = column.label;
    headings.append(heading);
  });
}

function renderRows(players) {
  rows.replaceChildren();
  const columns = selectedGameColumns();
  if (players.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "leaderboard-empty";
    cell.colSpan = 2 + columns.length;
    cell.textContent = "Todavía no hay partidas guardadas para este juego.";
    row.append(cell);
    rows.append(row);
    return;
  }

  players.forEach((player, index) => {
    const row = document.createElement("tr");
    const values = [
      formatNumber(index + 1),
      player.display_name,
      ...columns.map((column) => {
        const value = column.source === "session"
          ? player[column.key]
          : player.game_stats && player.game_stats[column.key];
        if (column.key === "total_seconds") return formatDuration(value || 0);
        return formatNumber(value === null || value === undefined ? 0 : value);
      })
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    rows.append(row);
  });
}

async function loadLeaderboard() {
  refreshButton.disabled = true;
  gameFilter.disabled = true;
  statusMessage.removeAttribute("data-error");
  statusMessage.textContent = "Cargando clasificación...";
  renderHeadings();
  rows.replaceChildren();

  try {
    if (!window.ARCADE_ACCOUNT.isConfigured()) {
      throw new Error("Supabase aún no está configurado.");
    }
    const client = window.ARCADE_ACCOUNT.getClient();
    if (!client) {
      throw new Error("No se pudo cargar la librería de Supabase.");
    }
    const { data, error } = await client.rpc("get_leaderboard", {
      p_game_id: gameFilter.value || null
    });
    if (error) throw error;

    const players = Array.isArray(data) ? data : [];
    renderRows(players);
    statusMessage.textContent = `${numberFormat.format(players.length)} jugadores en la clasificación.`;
  } catch (error) {
    statusMessage.dataset.error = "true";
    const setupHelp = error.code === "PGRST202"
      ? " Ejecuta supabase-schema.sql en Supabase para crear la función de clasificación."
      : "";
    statusMessage.textContent = `No se pudo cargar la clasificación: ${error.message}.${setupHelp}`;
  } finally {
    refreshButton.disabled = false;
    gameFilter.disabled = false;
  }
}

gameFilter.addEventListener("change", loadLeaderboard);
refreshButton.addEventListener("click", loadLeaderboard);
document.querySelector("[data-year]").textContent = new Date().getFullYear();
populateGameFilter();
loadLeaderboard();
