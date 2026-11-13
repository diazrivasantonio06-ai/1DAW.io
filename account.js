"use strict";

window.ARCADE_ACCOUNT = (() => {
  let client;

  function isConfigured() {
    const config = window.SUPABASE_CONFIG;
    return Boolean(config && config.url && config.anonKey);
  }

  function getClient() {
    if (!isConfigured() || !window.supabase || !window.supabase.createClient) return null;
    if (!client) {
      client = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );
    }
    return client;
  }

  async function recordGameResult(gameId, result) {
    if (!isConfigured()) throw new Error("Supabase aún no está configurado.");
    const supabase = getClient();
    if (!supabase) throw new Error("No se pudo cargar la librería de Supabase.");

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session) return false;

    const { error } = await supabase.from("game_sessions").insert({
      game_id: gameId,
      duration_seconds: result.durationSeconds,
      kills: result.kills,
      chests_opened: result.chestsOpened,
      score: result.score,
      won: result.won,
      placement: result.placement,
      round_reached: result.roundReached,
      game_stats: result.gameStats || {}
    });
    if (error) throw error;
    return true;
  }

  return { getClient, isConfigured, recordGameResult };
})();
