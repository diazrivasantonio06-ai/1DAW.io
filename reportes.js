"use strict";

const games = Array.isArray(window.GAMES) ? window.GAMES : [];
const gameSelect = document.querySelector("#game");
const reportForm = document.querySelector("#report-form");
const reportResult = document.querySelector("#result");
const reportText = document.querySelector("#report-text");
const statusMessage = document.querySelector("#status");

games.forEach((game) => {
  const option = document.createElement("option");
  option.value = game.title;
  option.textContent = game.title;
  gameSelect.append(option);
});
if (games.length === 0) {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "No hay juegos disponibles";
  gameSelect.append(option);
  gameSelect.disabled = true;
}

function buildReport(formData) {
  const lines = [
    "INFORME DE ERROR — 1DAW.io",
    `Fecha: ${new Date().toLocaleString("es-ES")}`,
    `Juego: ${formData.get("game")}`,
    `Resumen: ${formData.get("title").trim()}`,
    `Impacto: ${formData.get("severity")}`,
    "",
    "Pasos para reproducirlo:",
    formData.get("steps").trim(),
    "",
    "Qué esperaba:",
    formData.get("expected").trim() || "No indicado",
    "",
    "Qué ocurrió:",
    formData.get("actual").trim(),
    "",
    `Navegador: ${navigator.userAgent}`,
    `Pantalla: ${window.screen.width} × ${window.screen.height}`
  ];
  return lines.join("\n");
}

reportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!reportForm.reportValidity()) return;

  reportText.value = buildReport(new FormData(reportForm));
  reportResult.hidden = false;
  statusMessage.textContent = "Informe preparado. Elige copiarlo o descargarlo para compartirlo.";
  reportResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelector("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(reportText.value);
    statusMessage.textContent = "Informe copiado al portapapeles.";
  } catch {
    reportText.focus();
    reportText.select();
    statusMessage.textContent = "No se pudo copiar automáticamente. Selecciona y copia el texto del informe.";
  }
});

document.querySelector("#download").addEventListener("click", () => {
  const file = new Blob([reportText.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `informe-bug-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  statusMessage.textContent = "Informe descargado.";
});

document.querySelector("[data-year]").textContent = new Date().getFullYear();
