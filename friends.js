"use strict";

(() => {
  const onlineWindowSeconds = 120;
  const refreshIntervalMs = 30_000;
  const avatarIcons = {
    "avatar-arcade": "🕹️",
    "avatar-fox": "🦊",
    "avatar-owl": "🦉",
    "avatar-bear": "🐻",
    "avatar-dragon": "🐉",
    "avatar-robot": "🤖"
  };
  let client = null;
  let userId = null;
  let expanded = false;
  let activeTab = "friends";
  let view = "home";
  let currentChat = null;
  let chatMessages = [];
  let chatChannel = null;
  let refreshTimer = null;
  let dataGeneration = 0;
  let searchLoading = false;
  let requestError = "";
  let searchTimer = null;
  let searchGeneration = 0;
  let authInitialized = false;
  let searchResults = [];
  let friends = [];
  let friendRequests = [];
  let suggestions = [];
  let chats = [];

  const widget = document.createElement("aside");
  widget.className = "friends-widget";
  widget.setAttribute("aria-label", "Amigos y chats");
  const dock = document.createElement("button");
  dock.className = "friends-dock";
  dock.type = "button";
  dock.setAttribute("aria-expanded", "false");
  const dockCopy = document.createElement("span");
  dockCopy.className = "friends-dock-copy";
  const dockTitle = document.createElement("strong");
  dockTitle.textContent = "Amigos";
  const onlineCount = document.createElement("small");
  onlineCount.textContent = "Conéctate para ver amigos";
  dockCopy.append(dockTitle, onlineCount);
  const dockArrow = document.createElement("span");
  dockArrow.className = "friends-dock-arrow";
  dockArrow.setAttribute("aria-hidden", "true");
  dockArrow.textContent = "⌄";
  const profileLink = document.createElement("a");
  profileLink.className = "friends-popout";
  profileLink.href = "perfil.html";
  profileLink.setAttribute("aria-label", "Abrir mi perfil");
  profileLink.title = "Abrir mi perfil";
  profileLink.textContent = "↗";
  const panel = document.createElement("section");
  panel.className = "friends-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Panel de amigos");
  const panelHeader = document.createElement("header");
  panelHeader.className = "friends-panel-header";
  const panelTitle = document.createElement("strong");
  panelTitle.textContent = "Amigos";
  const panelHeaderActions = document.createElement("div");
  panelHeaderActions.className = "friends-header-actions";
  const collapseButton = makeButton("⌄", "friends-icon-button", "Contraer amigos");
  const menu = document.createElement("div");
  menu.className = "friends-menu";
  menu.hidden = true;
  const menuProfileLink = document.createElement("a");
  menuProfileLink.href = "perfil.html";
  menuProfileLink.textContent = "Mi perfil";
  const signOutButton = makeButton("Cerrar sesión", "friends-menu-item");
  menu.append(menuProfileLink, signOutButton);
  panelHeaderActions.append(collapseButton, profileLink);
  panelHeader.append(panelTitle, panelHeaderActions);
  const toolbar = document.createElement("div");
  toolbar.className = "friends-toolbar";
  const searchWrap = document.createElement("label");
  searchWrap.className = "friends-search";
  searchWrap.setAttribute("aria-label", "Buscar amigos");
  const searchIcon = document.createElement("span");
  searchIcon.setAttribute("aria-hidden", "true");
  searchIcon.textContent = "⌕";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Buscar contactos";
  searchInput.autocomplete = "off";
  searchInput.maxLength = 24;
  searchInput.setAttribute("aria-label", "Buscar contactos");
  searchWrap.append(searchIcon, searchInput);
  const addFriendButton = makeButton("＋", "friends-icon-button", "Buscar y añadir amigos");
  const toolbarMenuButton = makeButton("···", "friends-icon-button", "Más opciones");
  toolbar.append(searchWrap, addFriendButton, toolbarMenuButton, menu);
  const tabs = document.createElement("div");
  tabs.className = "friends-tabs";
  const friendsTab = makeButton("Amigos", "friends-tab");
  const chatsTab = makeButton("Charlas", "friends-tab");
  friendsTab.setAttribute("aria-selected", "true");
  chatsTab.setAttribute("aria-selected", "false");
  tabs.append(friendsTab, chatsTab);
  const status = document.createElement("p");
  status.className = "friends-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const content = document.createElement("div");
  content.className = "friends-content";
  panel.append(panelHeader, toolbar, tabs, status, content);
  dock.append(dockCopy, dockArrow);
  widget.append(dock, panel);

  function makeButton(text, className, label) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = text;
    if (label) element.setAttribute("aria-label", label);
    return element;
  }

  function appendText(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function showStatus(message, isError) {
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
  }

  function logError(message, error) {
    console.error(message, error);
    requestError = error && error.message ? error.message : "Se ha producido un error inesperado.";
    showStatus(`${message} ${requestError}`, true);
  }

  async function callRpc(name, params) {
    if (!client) throw new Error("No se pudo conectar con Supabase.");
    const { data, error } = await client.rpc(name, params || {});
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function avatarIcon(avatarId) {
    return avatarIcons[avatarId] || avatarIcons["avatar-arcade"];
  }

  function isOnline(person) {
    if (typeof person.is_online === "boolean") return person.is_online;
    if (!person.last_active_at) return false;
    return Date.now() - new Date(person.last_active_at).getTime() <= onlineWindowSeconds * 1000;
  }

  function formatLastSeen(value) {
    if (!value) return "Sin conexión";
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 2) return "Visto hace un momento";
    if (minutes < 60) return `Visto hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Visto hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Visto hace ${days} d`;
  }

  function updateDock() {
    const count = friends.filter(isOnline).length;
    onlineCount.textContent = userId ? `En línea (${count})` : "Conéctate para ver amigos";
    dock.setAttribute("aria-expanded", String(expanded));
    widget.classList.toggle("is-expanded", expanded);
    dock.hidden = expanded;
    panel.hidden = !expanded;
    friendsTab.setAttribute("aria-selected", String(activeTab === "friends"));
    chatsTab.setAttribute("aria-selected", String(activeTab === "chats"));
    searchInput.disabled = !userId;
    addFriendButton.disabled = !userId;
    toolbarMenuButton.disabled = !userId;
  }

  function renderPerson(person, options) {
    const row = document.createElement("article");
    row.className = "friends-person";
    const avatar = document.createElement("span");
    avatar.className = "friends-avatar";
    avatar.textContent = avatarIcon(person.avatar_id);
    avatar.setAttribute("aria-hidden", "true");
    const dot = document.createElement("span");
    dot.className = `friends-presence-dot${isOnline(person) ? " is-online" : ""}`;
    dot.setAttribute("aria-label", isOnline(person) ? "En línea" : "Sin conexión");
    avatar.append(dot);
    const copy = document.createElement("div");
    copy.className = "friends-person-copy";
    if (options.canViewProfile !== false && person.user_id) {
      const profileLink = document.createElement("a");
      profileLink.className = "friends-person-profile";
      profileLink.href = `perfil-publico.html?user_id=${encodeURIComponent(person.user_id)}`;
      profileLink.title = `Ver el perfil de ${person.display_name || "Jugador"}`;
      appendText(profileLink, "strong", "friends-person-name", person.display_name || "Jugador");
      copy.append(profileLink);
    } else {
      appendText(copy, "strong", "friends-person-name", person.display_name || "Jugador");
    }
    appendText(copy, "small", "friends-person-status", isOnline(person) ? "En línea" : formatLastSeen(person.last_active_at));
    row.append(avatar, copy);

    const actions = document.createElement("div");
    actions.className = "friends-person-actions";
    (options.actions || []).forEach((action) => {
      const button = makeButton(action.label, action.className || "friends-small-button", action.title || action.label);
      if (action.disabled) button.disabled = true;
      button.addEventListener("click", () => { void action.run(person); });
      actions.append(button);
    });
    if (actions.childElementCount) row.append(actions);
    return row;
  }

  function renderSection(title, people, makeActions, emptyMessage) {
    const section = document.createElement("section");
    section.className = "friends-section";
    const heading = document.createElement("h3");
    heading.textContent = `${title} (${people.length})`;
    section.append(heading);
    if (!people.length) {
      appendText(section, "p", "friends-empty", emptyMessage);
      return section;
    }
    const list = document.createElement("div");
    list.className = "friends-list";
    people.forEach((person) => {
      list.append(renderPerson(person, { actions: makeActions(person) }));
    });
    section.append(list);
    return section;
  }

  function renderHome() {
    const searchTerm = searchInput.value.trim();
    if (searchTerm.length >= 2) {
      renderSearchResults(searchTerm);
      return;
    }
    const groupButton = makeButton("Iniciar un grupo", "friends-group-button");
    groupButton.addEventListener("click", () => {
      view = "group";
      render();
    });
    content.append(groupButton);

    const incomingCount = friendRequests.filter((request) => request.is_incoming).length;
    const requestsButton = makeButton(
      incomingCount ? `Solicitudes de amigo (${incomingCount})` : "Solicitudes de amigo",
      "friends-request-button"
    );
    const chevron = document.createElement("span");
    chevron.textContent = "›";
    requestsButton.append(chevron);
    requestsButton.addEventListener("click", () => {
      view = "requests";
      render();
    });
    content.append(requestsButton);

    const online = friends.filter(isOnline);
    const offline = friends.filter((person) => !isOnline(person));
    content.append(renderSection("En línea", online, (person) => [{
      label: "✉",
      title: `Enviar un mensaje a ${person.display_name}`,
      run: startDirectChat
    }, {
      label: "×",
      title: `Eliminar a ${person.display_name} de tus amigos`,
      run: removeFriend
    }], "No hay amigos conectados ahora mismo."));
    content.append(renderSection("Sin conexión", offline, (person) => [{
      label: "✉",
      title: `Enviar un mensaje a ${person.display_name}`,
      run: startDirectChat
    }, {
      label: "×",
      title: `Eliminar a ${person.display_name} de tus amigos`,
      run: removeFriend
    }], "Tus amigos desconectados aparecerán aquí."));

    content.append(renderSection("Amigos sugeridos", suggestions, (person) => [{
      label: "+",
      title: `Añadir a ${person.display_name}`,
      run: sendFriendRequest
    }], "No hay sugerencias por ahora."));
  }

  function renderSearchResults(searchTerm) {
    const section = document.createElement("section");
    section.className = "friends-section friends-search-results";
    appendText(section, "h3", "", `Resultados para «${searchTerm}»`);
    if (requestError) {
      appendText(section, "p", "friends-empty", "No se pudieron cargar los resultados.");
      content.append(section);
      return;
    }
    if (searchLoading) {
      appendText(section, "p", "friends-empty", "Buscando jugadores…");
      content.append(section);
      return;
    }
    if (!searchResults.length) {
      appendText(section, "p", "friends-empty", "No se encontraron jugadores.");
      content.append(section);
      return;
    }
    const list = document.createElement("div");
    list.className = "friends-list";
    searchResults.forEach((person) => {
      let action;
      if (person.relation_state === "friends") {
        action = { label: "✉", title: `Enviar un mensaje a ${person.display_name}`, run: startDirectChat };
      } else if (person.relation_state === "incoming") {
        action = { label: "Aceptar", title: `Aceptar a ${person.display_name}`, run: acceptFriendRequest };
      } else if (person.relation_state === "outgoing") {
        action = { label: "Enviada", title: "Solicitud enviada", disabled: true, run: () => {} };
      } else {
        action = { label: "+", title: `Añadir a ${person.display_name}`, run: sendFriendRequest };
      }
      const canViewProfile = person.relation_state !== "none"
        || suggestions.some((suggestion) => suggestion.user_id === person.user_id);
      list.append(renderPerson(person, { actions: [action], canViewProfile }));
    });
    section.append(list);
    content.append(section);
  }

  function renderRequests() {
    const back = makeButton("← Volver a amigos", "friends-back-button");
    back.addEventListener("click", () => { view = "home"; render(); });
    content.append(back);
    const incoming = friendRequests.filter((request) => request.is_incoming);
    const outgoing = friendRequests.filter((request) => !request.is_incoming);
    content.append(renderSection("Recibidas", incoming, (request) => [{
      label: "Aceptar",
      title: `Aceptar a ${request.display_name}`,
      run: acceptFriendRequest
    }, {
      label: "×",
      title: "Rechazar solicitud",
      run: (person) => respondToRequest(person.user_id, false)
    }], "No tienes solicitudes pendientes."));
    content.append(renderSection("Enviadas", outgoing, () => [{
      label: "Cancelar",
      title: "Cancelar solicitud",
      run: cancelFriendRequest
    }], "No has enviado solicitudes."));
  }

  function renderChats() {
    if (!chats.length) {
      appendText(content, "p", "friends-empty friends-chat-empty", "Aún no hay charlas. Abre el perfil de un amigo para iniciar una conversación.");
      return;
    }
    const list = document.createElement("div");
    list.className = "friends-list";
    chats.forEach((chat) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "friends-chat-row";
      const icon = document.createElement("span");
      icon.className = "friends-avatar";
      icon.textContent = chat.is_group ? "👥" : avatarIcon(chat.avatar_id);
      const copy = document.createElement("span");
      copy.className = "friends-chat-copy";
      appendText(copy, "strong", "", chat.title || "Charla");
      appendText(copy, "small", "", chat.last_message || "Inicia la conversación");
      row.append(icon, copy);
      if (Number(chat.unread_count) > 0) {
        appendText(row, "span", "friends-unread", String(chat.unread_count));
      }
      row.addEventListener("click", () => { void openChat(chat); });
      list.append(row);
    });
    content.append(list);
  }

  function renderChatView() {
    const header = document.createElement("div");
    header.className = "friends-chat-header";
    const back = makeButton("←", "friends-icon-button", "Volver a las charlas");
    back.addEventListener("click", () => {
      closeChatChannel();
      currentChat = null;
      view = "home";
      activeTab = "chats";
      render();
    });
    appendText(header, "strong", "", currentChat ? currentChat.title : "Charla");
    header.prepend(back);
    content.append(header);

    const messages = document.createElement("div");
    messages.className = "friends-messages";
    messages.setAttribute("aria-live", "polite");
    if (!chatMessages.length) {
      appendText(messages, "p", "friends-empty", "Aún no hay mensajes. ¡Saluda para empezar!");
    } else {
      chatMessages.forEach((message) => {
        const bubble = document.createElement("article");
        bubble.className = `friends-message${message.sender_id === userId ? " is-mine" : ""}`;
        if (currentChat && currentChat.is_group && message.sender_id !== userId) {
          appendText(bubble, "strong", "friends-message-sender", message.sender_name || "Jugador");
        }
        appendText(bubble, "p", "", message.body);
        const date = new Date(message.created_at);
        appendText(bubble, "time", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
        messages.append(bubble);
      });
    }
    content.append(messages);

    const form = document.createElement("form");
    form.className = "friends-message-form";
    const input = document.createElement("input");
    input.name = "message";
    input.type = "text";
    input.maxLength = 2000;
    input.placeholder = "Escribe un mensaje…";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Escribe un mensaje");
    input.required = true;
    const send = makeButton("➤", "friends-send-button", "Enviar mensaje");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendMessage(input, send);
    });
    content.append(form);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderGroupForm() {
    const back = makeButton("← Volver a amigos", "friends-back-button");
    back.addEventListener("click", () => { view = "home"; render(); });
    content.append(back);
    appendText(content, "h3", "friends-view-heading", "Iniciar un grupo");
    const form = document.createElement("form");
    form.className = "friends-group-form";
    const title = document.createElement("input");
    title.name = "title";
    title.type = "text";
    title.maxLength = 60;
    title.placeholder = "Nombre del grupo";
    title.setAttribute("aria-label", "Nombre del grupo");
    form.append(title);
    appendText(form, "p", "friends-group-hint", "Elige al menos dos amigos para crear un grupo.");
    const memberList = document.createElement("div");
    memberList.className = "friends-group-members";
    friends.forEach((person) => {
      const label = document.createElement("label");
      label.className = "friends-group-member";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "members";
      checkbox.value = person.user_id;
      appendText(label, "span", "friends-avatar-small", avatarIcon(person.avatar_id));
      appendText(label, "span", "", person.display_name);
      label.prepend(checkbox);
      memberList.append(label);
    });
    form.append(memberList);
    const create = makeButton("Crear grupo", "friends-group-button");
    create.type = "submit";
    form.append(create);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void createGroup(new FormData(form));
    });
    content.append(form);
  }

  function render() {
    updateDock();
    content.replaceChildren();
    menu.hidden = true;
    if (!userId) {
      appendText(content, "p", "friends-empty", client
        ? "Inicia sesión para ver y gestionar tus amigos."
        : "Configura Supabase para activar Amigos.");
      const link = document.createElement("a");
      link.href = "perfil.html";
      link.className = "friends-profile-link";
      link.textContent = client ? "Iniciar sesión o crear cuenta" : "Ir a configuración de cuenta";
      content.append(link);
      showStatus(requestError, Boolean(requestError));
      return;
    }
    showStatus(requestError, Boolean(requestError));
    if (view === "chat" && currentChat) {
      renderChatView();
    } else if (view === "group") {
      renderGroupForm();
    } else if (view === "requests") {
      renderRequests();
    } else if (activeTab === "chats") {
      renderChats();
    } else {
      renderHome();
    }
  }

  async function refreshData(shouldRender) {
    if (!userId || !client) return;
    const requestUserId = userId;
    const generation = ++dataGeneration;
    requestError = "";
    if (shouldRender !== false) render();
    try {
      const [friendRows, requestRows, suggestionRows, chatRows] = await Promise.all([
        callRpc("get_friend_list"),
        callRpc("get_friend_requests"),
        callRpc("get_suggested_friends"),
        callRpc("get_friend_chats")
      ]);
      if (generation !== dataGeneration || requestUserId !== userId) return;
      friends = friendRows;
      friendRequests = requestRows;
      suggestions = suggestionRows;
      chats = chatRows;
    } catch (error) {
      if (generation === dataGeneration && requestUserId === userId) {
        logError("No se pudieron cargar tus amigos y charlas.", error);
      }
    } finally {
      if (generation === dataGeneration && requestUserId === userId) {
        updateDock();
        if (shouldRender !== false && view !== "chat" && view !== "group") render();
      }
    }
  }

  async function searchFriends(searchTerm, generation) {
    const requestGeneration = generation === undefined ? ++searchGeneration : generation;
    const query = searchTerm.trim();
    if (query.length < 2 || !userId) {
      searchResults = [];
      searchLoading = false;
      requestError = "";
      render();
      return;
    }
    searchLoading = true;
    requestError = "";
    render();
    try {
      const results = await callRpc("search_friends", { p_query: query });
      if (requestGeneration !== searchGeneration) return;
      searchResults = results;
    } catch (error) {
      if (requestGeneration === searchGeneration) logError("No se pudo buscar jugadores.", error);
    } finally {
      if (requestGeneration === searchGeneration) searchLoading = false;
    }
    if (requestGeneration === searchGeneration && expanded && activeTab === "friends") render();
  }

  async function sendFriendRequest(person) {
    try {
      await callRpc("send_friend_request", { p_user_id: person.user_id });
      await refreshData(false);
      if (searchInput.value.trim().length >= 2) await searchFriends(searchInput.value);
      else render();
      showStatus(`Solicitud enviada a ${person.display_name}.`, false);
    } catch (error) {
      logError("No se pudo enviar la solicitud.", error);
      render();
    }
  }

  async function respondToRequest(senderId, accept) {
    try {
      await callRpc("respond_friend_request", { p_sender_id: senderId, p_accept: accept });
      view = "home";
      await refreshData(false);
      render();
      showStatus(accept ? "Solicitud aceptada." : "Solicitud rechazada.", false);
    } catch (error) {
      logError("No se pudo responder a la solicitud.", error);
      render();
    }
  }

  async function acceptFriendRequest(person) {
    await respondToRequest(person.user_id, true);
  }

  async function cancelFriendRequest(person) {
    try {
      await callRpc("cancel_friend_request", { p_user_id: person.user_id });
      await refreshData(false);
      render();
      showStatus("Solicitud cancelada.", false);
    } catch (error) {
      logError("No se pudo cancelar la solicitud.", error);
      render();
    }
  }

  async function removeFriend(person) {
    if (!window.confirm(`¿Eliminar a ${person.display_name} de tus amigos?`)) return;
    try {
      await callRpc("remove_friend", { p_user_id: person.user_id });
      await refreshData(false);
      render();
      showStatus(`${person.display_name} ya no está en tu lista de amigos.`, false);
    } catch (error) {
      logError("No se pudo eliminar al amigo.", error);
      render();
    }
  }

  function closeChatChannel() {
    if (chatChannel && client) void client.removeChannel(chatChannel);
    chatChannel = null;
  }

  async function loadMessages() {
    if (!currentChat || !userId) return;
    const oldInput = content.querySelector(".friends-message-form input");
    const draft = oldInput ? oldInput.value : "";
    try {
      chatMessages = await callRpc("get_chat_messages", {
        p_chat_id: currentChat.chat_id,
        p_before_id: null
      });
      if (view === "chat") {
        render();
        const newInput = content.querySelector(".friends-message-form input");
        if (newInput) newInput.value = draft;
      }
    } catch (error) {
      logError("No se pudieron cargar los mensajes.", error);
      render();
    }
  }

  function subscribeToChat(chatId) {
    closeChatChannel();
    if (!client || typeof client.channel !== "function") return;
    chatChannel = client
      .channel(`friends-chat-${chatId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `chat_id=eq.${chatId}`
      }, (payload) => {
        if (payload.new && payload.new.sender_id !== userId) {
          void loadMessages();
          void refreshData(false);
        }
      })
      .subscribe((channelStatus) => {
        if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          showStatus("No se pudo conectar al chat en tiempo real. Prueba a volver a abrirlo.", true);
        }
      });
  }

  async function openChat(chat) {
    closeChatChannel();
    currentChat = chat;
    view = "chat";
    activeTab = "chats";
    chatMessages = [];
    render();
    subscribeToChat(chat.chat_id);
    await loadMessages();
  }

  async function startDirectChat(person) {
    try {
      const rows = await callRpc("create_direct_chat", { p_user_id: person.user_id });
      const row = rows[0];
      if (!row || !row.chat_id) throw new Error("No se pudo abrir la conversación.");
      await refreshData(false);
      const chat = chats.find((item) => item.chat_id === row.chat_id) || {
        chat_id: row.chat_id,
        title: person.display_name,
        is_group: false,
        avatar_id: person.avatar_id
      };
      await openChat(chat);
    } catch (error) {
      logError("No se pudo iniciar la conversación.", error);
      render();
    }
  }

  async function sendMessage(input, sendButton) {
    const body = input.value.trim();
    if (!body || !currentChat || sendButton.disabled) return;
    sendButton.disabled = true;
    try {
      await callRpc("send_chat_message", {
        p_chat_id: currentChat.chat_id,
        p_body: body
      });
      input.value = "";
      await loadMessages();
      await refreshData(false);
    } catch (error) {
      logError("No se pudo enviar el mensaje.", error);
    } finally {
      sendButton.disabled = false;
    }
  }

  async function createGroup(formData) {
    const selectedUsers = formData.getAll("members");
    try {
      const rows = await callRpc("create_group_chat", {
        p_user_ids: selectedUsers,
        p_title: String(formData.get("title") || "")
      });
      const row = rows[0];
      if (!row || !row.chat_id) throw new Error("No se pudo crear el grupo.");
      await refreshData(false);
      const chat = chats.find((item) => item.chat_id === row.chat_id) || {
        chat_id: row.chat_id,
        title: String(formData.get("title") || "").trim() || "Grupo nuevo",
        is_group: true
      };
      await openChat(chat);
    } catch (error) {
      logError("No se pudo crear el grupo.", error);
      render();
    }
  }

  function handleAuthChange(session) {
    const nextUserId = session && session.user ? session.user.id : null;
    if (authInitialized && nextUserId === userId) return;
    authInitialized = true;
    dataGeneration += 1;
    userId = nextUserId;
    closeChatChannel();
    currentChat = null;
    chatMessages = [];
    friends = [];
    friendRequests = [];
    suggestions = [];
    chats = [];
    searchResults = [];
    searchGeneration += 1;
    searchLoading = false;
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchInput.value = "";
    requestError = "";
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (userId) {
      refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void refreshData(view !== "chat" && view !== "group");
        }
      }, refreshIntervalMs);
      void refreshData();
    } else {
      friends = [];
      friendRequests = [];
      suggestions = [];
      chats = [];
      view = "home";
      activeTab = "friends";
      render();
    }
  }

  dock.addEventListener("click", () => {
    expanded = !expanded;
    updateDock();
    if (expanded && userId) void refreshData();
  });
  collapseButton.addEventListener("click", () => {
    expanded = false;
    updateDock();
  });
  friendsTab.addEventListener("click", () => {
    activeTab = "friends";
    view = "home";
    currentChat = null;
    closeChatChannel();
    render();
  });
  chatsTab.addEventListener("click", () => {
    activeTab = "chats";
    view = "home";
    currentChat = null;
    closeChatChannel();
    render();
  });
  searchInput.addEventListener("input", () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    const generation = ++searchGeneration;
    requestError = "";
    const query = searchInput.value.trim();
    if (query.length < 2) {
      searchResults = [];
      searchLoading = false;
      render();
      return;
    }
    searchLoading = true;
    render();
    searchTimer = window.setTimeout(() => {
      void searchFriends(query, generation);
    }, 250);
  });
  addFriendButton.addEventListener("click", () => searchInput.focus());
  toolbarMenuButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
  });
  signOutButton.addEventListener("click", async () => {
    menu.hidden = true;
    if (!client || !client.auth || typeof client.auth.signOut !== "function") return;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      logError("No se pudo cerrar sesión.", error);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!widget.contains(event.target)) menu.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && expanded) {
      expanded = false;
      updateDock();
      dock.focus();
    }
  });
  window.addEventListener("pagehide", closeChatChannel);

  document.body.append(widget);
  updateDock();
  if (!window.ARCADE_ACCOUNT || !window.ARCADE_ACCOUNT.isConfigured()) {
    render();
    return;
  }
  client = window.ARCADE_ACCOUNT.getClient();
  if (!client) {
    render();
    return;
  }
  client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => handleAuthChange(session), 0);
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    handleAuthChange(data.session);
  }).catch((error) => {
    logError("No se pudo iniciar el sistema de amigos.", error);
    render();
  });
})();
