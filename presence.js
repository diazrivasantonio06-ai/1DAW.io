"use strict";

(() => {
  const heartbeatMs = 60_000;
  let supabaseClient = null;
  let heartbeat = null;
  let requestPending = false;

  function stopHeartbeat() {
    if (heartbeat !== null) {
      window.clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function reportProgress(progress) {
    const value = Array.isArray(progress) ? progress[0] : progress;
    if (!value) return;
    window.dispatchEvent(new CustomEvent("arcade:progress", {
      detail: {
        activeSeconds: Number(value.active_seconds),
        level: Number(value.level)
      }
    }));
  }

  async function heartbeatOnce() {
    if (requestPending || document.visibilityState !== "visible" || !supabaseClient) return;
    requestPending = true;
    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        stopHeartbeat();
        return;
      }

      const { data, error } = await supabaseClient.rpc("record_active_time");
      if (error) throw error;
      reportProgress(data);
    } catch (error) {
      console.error("No se pudo actualizar el tiempo de perfil:", error);
      window.dispatchEvent(new CustomEvent("arcade:progress-error", {
        detail: { message: error.message }
      }));
    } finally {
      requestPending = false;
    }
  }

  function startHeartbeat() {
    if (heartbeat !== null || document.visibilityState !== "visible") return;
    void heartbeatOnce();
    heartbeat = window.setInterval(heartbeatOnce, heartbeatMs);
  }

  async function pauseHeartbeat() {
    stopHeartbeat();
    if (!supabaseClient) return;
    try {
      const { data, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) return;
      const { error } = await supabaseClient.rpc("pause_active_time");
      if (error) throw error;
    } catch (error) {
      console.error("No se pudo pausar el tiempo de perfil:", error);
      window.dispatchEvent(new CustomEvent("arcade:progress-error", {
        detail: { message: error.message }
      }));
    }
  }

  async function initialize() {
    if (!window.ARCADE_ACCOUNT.isConfigured()) return;
    supabaseClient = window.ARCADE_ACCOUNT.getClient();
    if (!supabaseClient) return;

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (session && document.visibilityState === "visible") startHeartbeat();
        else stopHeartbeat();
      }, 0);
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) startHeartbeat();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") startHeartbeat();
    else void pauseHeartbeat();
  });
  window.addEventListener("pagehide", () => { void pauseHeartbeat(); });

  initialize().catch((error) => {
    console.error("No se pudo iniciar el seguimiento de tiempo:", error);
    window.dispatchEvent(new CustomEvent("arcade:progress-error", {
      detail: { message: error.message }
    }));
  });
})();
