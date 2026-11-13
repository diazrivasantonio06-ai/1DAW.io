"use strict";

// Para publicar una nota, añade un objeto a UPDATES. Se mostrarán primero las más recientes.
const UPDATES = [
  // {
  //   game: "Nombre del juego",
  //   version: "1.0",
  //   date: "2026-11-13",
  //   title: "Título de la actualización",
  //   changes: ["Primer cambio", "Segundo cambio"]
  // }
  {
    game: "Nombre del juego",
    version: "1.0",
    date: "2026-11-13",
    title: "Título de la actualización",
    changes: ["Primer cambio", "Segundo cambio"]
  }
];

const updatesList = document.querySelector("#updates");
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

function renderUpdates() {
  if (UPDATES.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Todavía no hay notas. ¡Vuelve pronto para ver las próximas actualizaciones!";
    updatesList.append(empty);
    return;
  }

  const sortedUpdates = [...UPDATES].sort((a, b) => b.date.localeCompare(a.date));
  sortedUpdates.forEach((update) => {
    const article = document.createElement("article");
    article.className = "update panel";

    const meta = document.createElement("div");
    meta.className = "update-meta";
    const game = document.createElement("span");
    game.className = "update-game";
    game.textContent = update.game;
    const version = document.createElement("span");
    version.textContent = update.version ? `Versión ${update.version}` : "";
    const date = document.createElement("time");
    date.dateTime = update.date;
    date.textContent = dateFormatter.format(new Date(`${update.date}T12:00:00`));
    meta.append(game, version, date);

    const heading = document.createElement("h2");
    heading.textContent = update.title;
    const changes = document.createElement("ul");
    update.changes.forEach((change) => {
      const item = document.createElement("li");
      item.textContent = change;
      changes.append(item);
    });

    article.append(meta, heading, changes);
    updatesList.append(article);
  });
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();
renderUpdates();
