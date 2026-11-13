"use strict";

const gameCount = Array.isArray(window.GAMES) ? window.GAMES.length : 0;
const countLabel = document.querySelector("#game-count");
countLabel.textContent = `${gameCount} ${gameCount === 1 ? "juego disponible" : "juegos disponibles"}`;
document.querySelector("[data-year]").textContent = new Date().getFullYear();
