// Actualiza los juegos reemplazando el archivo indicado en `src` sin cambiar su ruta.
window.GAMES = [
  {
    id: "claude-of-duty",
    title: "Claude of Duty",
    desc: "Shooter 3D en primera persona contra zombis. Versión Alpha 0.5.1.",
    emoji: "🧟",
    color: "#2f4a2a",
    tag: "Alpha 0.5.1",
    cover: "Juegos/claude_of_duty.png",
    stats: [{ key: "doorsOpened", label: "Puertas abiertas" }],
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "total_score", label: "Puntuación total", source: "session" },
      { key: "best_score", label: "Mejor puntuación", source: "session" },
      { key: "total_kills", label: "Zombis eliminados", source: "session" },
      { key: "best_round", label: "Mejor oleada", source: "session" },
      { key: "doorsOpened", label: "Puertas abiertas" }
    ],
    src: "Juegos/Claude%20of%20Duty.html"
  },
  {
    id: "Claude-nite",
    title: "Claude-Nite",
    desc: "Battle royale: sé el último en pie, consigue armas y construye para sobrevivir.",
    emoji: "🏝️",
    color: "#168a8a",
    tag: "T0 - C1 · Alpha 1.5",
    cover: "Juegos/claude-nite.png",
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "best_score", label: "Mejor puntuación", source: "session" },
      { key: "wins", label: "Victorias", source: "session" },
      { key: "total_kills", label: "Eliminaciones", source: "session" },
      { key: "total_chests_opened", label: "Cofres abiertos", source: "session" },
      { key: "best_placement", label: "Mejor puesto", source: "session" },
      { key: "total_seconds", label: "Tiempo jugado", source: "session" }
    ],
    src: "Juegos/Claude-nite%20T0%20C1%20Alpha%201.5.html"
  },
  {
    id: "patata-espacial",
    title: "Patata Espacial",
    desc: "Tu nave se estrelló en un planeta hostil. ¿Podrás sobrevivir?",
    emoji: "🥔",
    color: "#754c24",
    tag: "v1.0",
    cover: "Juegos/patata-espacial.jpg",
    stats: [{ key: "bossesKilled", label: "Jefes derrotados" }],
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "total_kills", label: "Enemigos eliminados", source: "session" },
      { key: "best_round", label: "Mejor oleada", source: "session" },
      { key: "bossesKilled", label: "Jefes derrotados" }
    ],
    src: "Juegos/patata-espacial-v2.html?v=4"
  },
  {
    id: "duelo-de-torres",
    title: "Duelo de Torres",
    desc: "Duelo de torres 1v1 en tiempo real. Gestiona el elixir, despliega tropas y destruye las torres del rival.",
    emoji: "⚔️",
    color: "#f2cd37",
    tag: "v0.5 · Temporada BETA",
    cover: "Juegos/Duelo_de_Torres.jpg",
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "wins", label: "Victorias", source: "session" },
      { key: "losses", label: "Derrotas", source: "session" },
      { key: "trofeos", label: "Trofeos", source: "session" },
      { key: "total_crowns", label: "Coronas totales", source: "session" },
      { key: "total_seconds", label: "Tiempo jugado", source: "session" }
    ],
    src: "Juegos/Duelo_de_Torres_BETA.html"
  },
  {
    id: "duelo-de-torres-t1",
    title: "Duelo de Torres: Temp 1",
    desc: "Prueba la nueva temporada de Duelo de Torres.",
    emoji: "⚔️",
    color: "#f2cd37",
    tag: "BETA TEST Temp 1",
    cover: "Juegos/Duelo_de_Torres.jpg",
    allowedRoles: ["admin", "vip"],
    src: "Juegos/Duelo%20Torres%20T1/Duelo_de_Torres_T1.html"
  },
  {
    id: "bloques",
    title: "Bloques",
    desc: "Juego de bloques tipo Tetris: completa líneas y consigue la mejor puntuación.",
    emoji: "🧱",
    color: "#365b8c",
    tag: "Versión final",
    cover: "Juegos/tetris.png",
    stats: [{ key: "linesCleared", label: "Líneas eliminadas" }],
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "total_score", label: "Puntuación total", source: "session" },
      { key: "best_score", label: "Mejor puntuación", source: "session" },
      { key: "best_round", label: "Mejor nivel", source: "session" },
      { key: "linesCleared", label: "Líneas eliminadas" }
    ],
    src: "Juegos/Bloques%20%E2%80%93%20juego%20tipo%20Tetris.html"
  },
  {
    id: "casino-aljarafe",
    title: "Casino Aljarafe",
    desc: "Ruleta, blackjack, tragaperras y póker con dinero ficticio.",
    emoji: "🎰",
    color: "#14664a",
    tag: "Dinero ficticio",
    leaderboardStats: [
      { key: "balance", label: "Dinero", source: "casino-balance" }
    ],
    src: "Juegos/Casino%20Aljarafe.html"
  },
  {
    id: "discord-defense",
    title: "Discord Defense",
    desc: "Defiende tu servidor de ataques de bots en este juego de estrategia en tiempo real.",
    emoji: "🛡️",
    color: "#3a5f7a",
    tag: "Versión BETA",
    cover: "Juegos/discord-defense.jpg",
    stats: [{ key: "enemies_defeated", label: "Enemigos derrotados" }],
    leaderboardStats: [
      { key: "games_played", label: "Partidas", source: "session" },
      { key: "enemies_defeated", label: "Enemigos derrotados", source: "session" },
      { key: "total_damage_dealt", label: "Daño infligido", source: "session" }
    ],
    src: "Juegos/Discord-Defense.html"
  },
  {
    id: "texas-holdem",
    title: "Texas Hold’em",
    desc: "Póker Texas Hold’em contra CPU o en mesas privadas con amigos.",
    emoji: "♠️",
    color: "#174b3a",
    tag: "Fichas ficticias",
    src: "Juegos/Texas%20Holdem.html"
  },
  {
    id: "500-cofres-animados",
    title: "500 cofres animados",
    desc: "Abre cofres animados y descubre objetos de una tienda pirata ficticia.",
    emoji: "🎁",
    color: "#705124",
    tag: "Versión final",
    cover: "Juegos/cofres.jfif",
    stats: [{ key: "pirateTokens", label: "Tokens piratas" }],
    leaderboardStats: [
      { key: "games_played", label: "Partidas completadas", source: "session" },
      { key: "total_chests_opened", label: "Cofres abiertos", source: "session" },
      { key: "total_seconds", label: "Tiempo empleado", source: "session" },
      { key: "pirateTokens", label: "Tokens piratas" }
    ],
    src: "Juegos/500%20cofres%20animados.html"
  }
];
