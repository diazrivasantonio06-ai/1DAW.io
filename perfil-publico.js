"use strict";

(() => {
  const status = document.querySelector("#public-profile-status");
  const profilePanel = document.querySelector("#public-profile-panel");
  const relationButton = document.querySelector("#public-profile-relation");
  let client = null;
  let profile = null;

  const avatars = {
    "avatar-arcade": "🕹️",
    "avatar-fox": "🦊",
    "avatar-owl": "🦉",
    "avatar-bear": "🐻",
    "avatar-dragon": "🐉",
    "avatar-robot": "🤖"
  };
  const banners = {
    "banner-neon": "banner-neon",
    "banner-sunset": "banner-sunset",
    "banner-ocean": "banner-ocean",
    "banner-galaxy": "banner-galaxy",
    "banner-forest": "banner-forest",
    "banner-aurora": "banner-aurora"
  };

  function showStatus(message, isError) {
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.floor(Number(seconds || 0) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours) return `${hours} h ${minutes} min`;
    if (totalMinutes) return `${totalMinutes} min`;
    return `${Math.floor(Number(seconds || 0))} s`;
  }

  function renderGameStats(stats) {
    const container = document.querySelector("#public-profile-games");
    container.replaceChildren();
    const games = Array.isArray(window.GAMES) ? window.GAMES : [];
    if (!stats.length) {
      const empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "Todavía no hay estadísticas disponibles.";
      container.append(empty);
      return;
    }

    stats.forEach((stat) => {
      const game = games.find((item) => item.id === stat.game_id);
      const card = document.createElement("article");
      card.className = "game-stat";
      const heading = document.createElement("h3");
      heading.textContent = game ? game.title : stat.game_id;
      const value = (field) => Number(stat[field] || 0);
      let details;
      if (stat.game_id === "claude-of-duty") {
        details = [
          `Mejor oleada: ${value("best_round")}`,
          `Zombis eliminados: ${value("total_kills")}`
        ];
      } else if (stat.game_id === "Claude-nite") {
        details = [
          `Tiempo jugado: ${formatDuration(value("total_seconds"))}`,
          `Cofres abiertos: ${value("total_chests_opened")}`,
          `Eliminaciones: ${value("total_kills")}`
        ];
      } else if (stat.game_id === "patata-espacial") {
        details = [
          `${value("games_played")} partidas`,
          `${value("wins")} rescates`,
          `Enemigos derrotados: ${value("total_kills")}`,
          `Mejor oleada: ${value("best_round")}`
        ];
      } else if (stat.game_id === "bloques") {
        details = [
          `${value("games_played")} partidas`,
          `Puntuación total: ${value("total_score")}`,
          `Mejor puntuación: ${value("best_score")}`,
          `Mejor nivel: ${value("best_round")}`
        ];
      } else if (stat.game_id === "500-cofres-animados") {
        details = [
          `${value("games_played")} partidas completadas`,
          `Cofres abiertos: ${value("total_chests_opened")}`,
          `Tiempo jugado: ${formatDuration(value("total_seconds"))}`
        ];
      } else {
        details = [
          `${value("games_played")} partidas`,
          `${value("wins")} victorias`,
          `${value("total_kills")} bajas`,
          `Mejor puntuación: ${value("best_score")}`
        ];
      }

      const gameMetrics = stat.game_stats || {};
      (game && game.stats ? game.stats : []).forEach((metric) => {
        details.push(`${metric.label}: ${Number(gameMetrics[metric.key] || 0)}`);
      });
      card.append(heading);
      details.forEach((detail) => {
        const line = document.createElement("p");
        line.textContent = detail;
        card.append(line);
      });
      container.append(card);
    });
  }

  function renderProfile(data) {
    profile = data;
    document.querySelector("#public-profile-name").textContent = data.display_name;
    renderProfileBadges(data);
    document.querySelector("#public-profile-avatar").textContent = avatars[data.avatar_id] || avatars["avatar-arcade"];
    document.querySelector("#public-profile-banner").className =
      `public-profile-banner ${banners[data.banner_id] || banners["banner-neon"]}`;
    document.querySelector("#public-profile-level").textContent = `Nivel ${Number(data.level) || 1}`;
    document.querySelector("#public-profile-active-time").textContent =
      `${formatDuration(data.active_seconds)} en la web`;
    document.querySelector("#public-profile-presence").textContent = data.is_online
      ? "En línea"
      : data.last_active_at
        ? `Visto ${new Date(data.last_active_at).toLocaleString("es-ES")}`
        : "Sin conexión";
    document.querySelector("#public-total-games").textContent = String(Number(data.games_played) || 0);
    document.querySelector("#public-total-time").textContent = formatDuration(data.total_seconds);
    document.querySelector("#public-total-kills").textContent = String(Number(data.total_kills) || 0);
    document.querySelector("#public-total-wins").textContent = String(Number(data.wins) || 0);
    renderGameStats(Array.isArray(data.game_stats) ? data.game_stats : []);
    renderRelationButton(data.relation_state);
    profilePanel.hidden = false;
  }

  function renderProfileBadges(data) {
    const container = document.querySelector("#public-profile-badges");
    container.replaceChildren();
    [
      { enabled: data.is_admin, label: "Admin", className: "profile-badge-admin" },
      { enabled: data.is_vip, label: "VIP", className: "profile-badge-vip" }
    ].filter((badge) => badge.enabled).forEach((badge) => {
      const element = document.createElement("span");
      element.className = `profile-badge ${badge.className}`;
      element.textContent = badge.label;
      container.append(element);
    });
    container.hidden = !container.childElementCount;
  }

  function renderRelationButton(relationState) {
    relationButton.disabled = true;
    relationButton.onclick = null;
    if (relationState === "friends") {
      relationButton.textContent = "Ya sois amigos";
    } else if (relationState === "outgoing") {
      relationButton.textContent = "Solicitud enviada";
    } else if (relationState === "incoming") {
      relationButton.disabled = false;
      relationButton.textContent = "Aceptar solicitud";
      relationButton.onclick = () => { void respondToRequest(); };
    } else if (relationState === "suggested") {
      relationButton.disabled = false;
      relationButton.textContent = "Añadir amigo";
      relationButton.onclick = () => { void sendFriendRequest(); };
    } else {
      relationButton.textContent = "Tu perfil";
    }
  }

  async function sendFriendRequest() {
    await runRelationAction("Enviando solicitud…", "Solicitud enviada.", async () => {
      const { error } = await client.rpc("send_friend_request", { p_user_id: getProfileId() });
      if (error) throw error;
      profile.relation_state = "outgoing";
      renderRelationButton(profile.relation_state);
    });
  }

  async function respondToRequest() {
    await runRelationAction("Aceptando solicitud…", "Ahora sois amigos.", async () => {
      const { error } = await client.rpc("respond_friend_request", {
        p_sender_id: getProfileId(),
        p_accept: true
      });
      if (error) throw error;
      profile.relation_state = "friends";
      renderRelationButton(profile.relation_state);
    });
  }

  async function runRelationAction(progressMessage, successMessage, action) {
    relationButton.disabled = true;
    showStatus(progressMessage, false);
    try {
      await action();
      showStatus(successMessage, false);
    } catch (error) {
      renderRelationButton(profile.relation_state);
      showStatus(`No se pudo actualizar la amistad: ${error.message}`, true);
    }
  }

  function getProfileId() {
    return new URLSearchParams(location.search).get("user_id");
  }

  async function initialize() {
    document.querySelector("[data-year]").textContent = new Date().getFullYear();
    const profileId = getProfileId();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId || "")) {
      showStatus("El enlace del perfil no es válido.", true);
      return;
    }
    if (!window.ARCADE_ACCOUNT.isConfigured()) {
      showStatus("Supabase aún no está configurado.", true);
      return;
    }
    client = window.ARCADE_ACCOUNT.getClient();
    if (!client) {
      showStatus("No se pudo cargar la librería de Supabase.", true);
      return;
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      showStatus(`No se pudo comprobar la sesión: ${sessionError.message}`, true);
      return;
    }
    if (!sessionData.session) {
      showStatus("Inicia sesión para ver este perfil.", true);
      return;
    }

    const { data, error } = await client.rpc("get_public_profile", { p_user_id: profileId });
    if (error) {
      showStatus(`No se pudo cargar el perfil: ${error.message}`, true);
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      showStatus("No se encontró ese perfil.", true);
      return;
    }
    showStatus("", false);
    renderProfile(result);
  }

  void initialize().catch((error) => {
    showStatus(`No se pudo cargar el perfil: ${error.message}`, true);
  });
})();
