(() => {
  const Engine = window.MealEngine;
  const STORAGE_KEY = "meal-flow-schedules-v2";
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const menu = (name, type, ratio, bTray, bEntree, cdTray, cdEntree, wTray, wEntree) => ({ id: uid("m"), name, type, ratio, bTray, bEntree, cdTray, cdEntree, wTray, wEntree });
  const specialMenu = () => ({ ...menu("스페셜밀", "특별식", 0, 0, 0, 0, 0, 0, 0), special: true });
  const defaultService = (number) => ({ id: uid("s"), name: `${number}번째 식사`, execution: null, specialRequests: { b: 0, cd: 0, w: 0 }, menus: [menu("한식", "한식", 50, 0, 0, 0, 0, 0, 0), menu("양식", "양식", 50, 0, 0, 0, 0, 0, 0), specialMenu()] });
  const blankState = () => ({ passengers: 0, wPassengers: 0, activeService: 0, rightView: "diagnosis", sample: false, services: [defaultService(1), defaultService(2)] });
  const sampleState = () => ({
    passengers: 400,
    wPassengers: 100,
    activeService: 0,
    rightView: "diagnosis",
    sample: true,
    services: [
      { id: uid("s"), name: "1번째 식사", execution: null, specialRequests: { b: 0, cd: 0, w: 0 }, menus: [
        menu("한식", "한식", 50, 68, 60, 84, 90, 50, 50),
        menu("양식 A", "양식", 30, 55, 38, 35, 52, 30, 30),
        menu("양식 B", "양식", 20, 20, 30, 42, 30, 18, 20),
        specialMenu(),
      ] },
      { id: uid("s"), name: "2번째 식사", execution: null, specialRequests: { b: 0, cd: 0, w: 0 }, menus: [
        menu("한식", "한식", 70, 120, 90, 100, 122, 60, 68),
        menu("양식", "양식", 30, 35, 38, 57, 70, 28, 12),
        specialMenu(),
      ] },
    ],
  });

  function loadScheduleStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed?.version === 1 && Array.isArray(parsed.schedules)) return parsed;
    } catch (_) { /* 손상된 로컬 데이터는 예시 화면으로 복구 */ }
    return { version: 1, activeId: null, schedules: [] };
  }

  let scheduleStore = loadScheduleStore();
  let activeScheduleId = scheduleStore.schedules.some((item) => item.id === scheduleStore.activeId) ? scheduleStore.activeId : null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let state = activeScheduleId ? clone(scheduleStore.schedules.find((item) => item.id === activeScheduleId).data) : sampleState();
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);
  const active = () => state.services[state.activeService];
  const activeSchedule = () => scheduleStore.schedules.find((item) => item.id === activeScheduleId);
  const saveScheduleStore = () => {
    scheduleStore.activeId = activeScheduleId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleStore));
  };
  const persistCurrent = (updateTime = true) => {
    const schedule = activeSchedule();
    if (!schedule) return;
    schedule.data = clone(state);
    if (updateTime) schedule.updatedAt = Date.now();
    saveScheduleStore();
  };
  const anyExecuting = () => state.services.some((service) => service.execution);
  const resultNow = () => active().execution?.result || Engine.validateService(state.passengers, state.wPassengers, active().menus, { firstService: state.activeService === 0, specialRequests: active().specialRequests });
  const touch = () => { state.sample = false; document.querySelectorAll(".sample-value").forEach((el) => el.classList.remove("sample-value")); $("#sample-badge").hidden = true; persistCurrent(); };
  const quickEntrySupported = () => window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
  let quickEntry = null;

  function quickCurrent() {
    return quickEntry?.inputs[quickEntry.index] || null;
  }

  function renderQuickEntry() {
    const input = quickCurrent();
    if (!input) return;
    quickEntry.inputs.forEach((item) => item.classList.toggle("quick-active", item === input));
    const row = input.closest(".inventory-row");
    const galley = input.closest(".galley-entry");
    const zoneInputs = quickEntry.inputs.filter((item) => item.closest(".galley-entry") === galley);
    const zonePosition = zoneInputs.indexOf(input) + 1;
    const menuName = row.querySelector(".inventory-menu strong").textContent;
    const component = input.dataset.key.endsWith("Tray") ? "트레이" : "앙트레";
    $("#quick-entry-progress").textContent = `${active().name} · ${galley.querySelector("h3").textContent} · ${zonePosition}/${zoneInputs.length}`;
    $("#quick-entry-title").textContent = `${menuName} · ${component}`;
    $("#quick-entry-value").textContent = quickEntry.buffer || "0";
    $("#quick-entry-value").classList.toggle("replace-ready", quickEntry.replaceOnDigit);
    $("#quick-entry-prev").disabled = quickEntry.index === 0;
    $("#quick-entry-next").textContent = quickEntry.index === quickEntry.inputs.length - 1 ? "완료" : "다음";
  }

  function selectQuickInput(index) {
    quickEntry.index = index;
    quickEntry.buffer = String(Math.max(0, Number(quickCurrent().value) || 0));
    quickEntry.replaceOnDigit = true;
    renderQuickEntry();
  }

  function openQuickEntry(input) {
    const inputs = [...$("#service-editor").querySelectorAll(".inventory-input:not(:disabled)")];
    const index = inputs.indexOf(input);
    if (index < 0) return;
    quickEntry = { inputs, index, buffer: String(Math.max(0, Number(input.value) || 0)), replaceOnDigit: true };
    $("#quick-entry").hidden = false;
    document.body.classList.add("quick-entry-open");
    input.blur();
    renderQuickEntry();
  }

  function closeQuickEntry() {
    if (!quickEntry) return;
    quickEntry.inputs.forEach((input) => input.classList.remove("quick-active"));
    quickEntry = null;
    $("#quick-entry").hidden = true;
    document.body.classList.remove("quick-entry-open");
    renderAll();
  }

  function setQuickValue(value) {
    const input = quickCurrent();
    if (!input) return;
    const normalized = String(Math.min(9999, Math.max(0, Number(value) || 0)));
    quickEntry.buffer = normalized;
    quickEntry.replaceOnDigit = false;
    input.value = normalized;
    const item = active().menus.find((entry) => entry.id === input.dataset.menu);
    if (item) item[input.dataset.key] = Number(normalized);
    touch();
    renderDynamic();
    renderQuickEntry();
  }

  function enterQuickDigit(digit) {
    const next = quickEntry.replaceOnDigit || quickEntry.buffer === "0" ? digit : `${quickEntry.buffer}${digit}`;
    setQuickValue(next.slice(0, 4));
  }

  function scheduleLabel(item) {
    return `${item.flightNo} · ${item.route}`;
  }

  function renderScheduleChrome() {
    const schedule = activeSchedule();
    $("#active-flight-label").textContent = schedule ? `${schedule.date} · ${scheduleLabel(schedule)}` : "ASIANA A380 · ECONOMY";
    const list = $("#schedule-list");
    const ordered = [...scheduleStore.schedules].sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = ordered.length ? ordered.map((item) => `<article class="schedule-card${item.id === activeScheduleId ? " active" : ""}"><button class="schedule-open" type="button" data-open-schedule="${item.id}"><strong>${esc(item.flightNo)} · ${esc(item.route)}</strong><span>${esc(item.date)} · ${item.data?.services?.length || 2}회 서비스</span></button><button class="schedule-delete" type="button" data-delete-schedule="${item.id}" aria-label="${esc(item.flightNo)} 일정 삭제">삭제</button></article>`).join("") : `<div class="schedule-empty">저장된 일정이 없습니다.<br>새 비행 일정을 만들어 시작하세요.</div>`;
    list.querySelectorAll("[data-open-schedule]").forEach((button) => button.addEventListener("click", () => openSchedule(button.dataset.openSchedule)));
    list.querySelectorAll("[data-delete-schedule]").forEach((button) => button.addEventListener("click", () => deleteSchedule(button.dataset.deleteSchedule)));
  }

  function openSchedule(id) {
    persistCurrent(false);
    const schedule = scheduleStore.schedules.find((item) => item.id === id);
    if (!schedule) return;
    activeScheduleId = id;
    state = clone(schedule.data);
    saveScheduleStore();
    closeDrawer();
    renderAll();
  }

  function deleteSchedule(id) {
    const schedule = scheduleStore.schedules.find((item) => item.id === id);
    if (!schedule || !window.confirm(`${scheduleLabel(schedule)} 일정을 삭제할까요?`)) return;
    scheduleStore.schedules = scheduleStore.schedules.filter((item) => item.id !== id);
    if (activeScheduleId === id) {
      const next = [...scheduleStore.schedules].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      activeScheduleId = next?.id || null;
      state = next ? clone(next.data) : sampleState();
    }
    saveScheduleStore();
    renderAll();
  }

  function openDrawer() { renderScheduleChrome(); $("#drawer-backdrop").hidden = false; $("#open-schedules").ariaExpanded = "true"; }
  function closeDrawer() { $("#drawer-backdrop").hidden = true; $("#open-schedules").ariaExpanded = "false"; }

  function applyMutations(todo, direction) {
    (todo.mutations || []).forEach((mutation) => {
      const target = active().menus.find((item) => item.id === mutation.menuId);
      if (!target) return;
      const count = mutation.count * direction;
      target[mutation.from] -= count;
      target[mutation.to] += count;
    });
  }

  function startOrComplete(index) {
    const service = active();
    if (!service.execution) {
      const result = Engine.validateService(state.passengers, state.wPassengers, service.menus, { firstService: state.activeService === 0, specialRequests: service.specialRequests });
      if (!result.ready) return;
      service.execution = { result, todos: Engine.buildTodos(result).map((todo) => ({ ...todo, done: false })) };
    }
    const execution = service.execution;
    const next = execution.todos.findIndex((todo) => !todo.done);
    if (index !== next) return;
    applyMutations(execution.todos[index], 1);
    execution.todos[index].done = true;
    persistCurrent();
    renderAll();
  }

  function undo(index) {
    const execution = active().execution;
    if (!execution) return;
    const last = execution.todos.reduce((found, todo, i) => todo.done ? i : found, -1);
    if (index !== last) return;
    applyMutations(execution.todos[index], -1);
    execution.todos[index].done = false;
    if (!execution.todos.some((todo) => todo.done)) active().execution = null;
    persistCurrent();
    renderAll();
  }

  function renderTabs() {
    const host = $("#service-tabs");
    host.innerHTML = "";
    state.services.forEach((service, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `service-tab${index === state.activeService ? " active" : ""}`;
      button.role = "tab";
      button.ariaSelected = index === state.activeService ? "true" : "false";
      button.textContent = service.name;
      button.addEventListener("click", () => { state.activeService = index; state.rightView = "diagnosis"; persistCurrent(false); renderAll(); });
      host.append(button);
    });
  }

  function renderEditor() {
    const service = active();
    const locked = Boolean(service.execution);
    const host = $("#service-editor");
    const disabled = locked ? "disabled" : "";
    const lockedClass = locked ? " locked-input" : "";
    const regularMenus = service.menus.filter((item) => !item.special);
    const menuRows = regularMenus.map((item, index) => `<div class="menu-setup-row">
      <span class="menu-index">${index + 1}</span>
      <label><span>메뉴명</span><input class="sample-value${lockedClass}" data-menu="${item.id}" data-key="name" type="text" value="${esc(item.name)}" ${disabled}></label>
      <label><span>구분</span><select class="sample-value${lockedClass}" data-menu="${item.id}" data-key="type" ${disabled}><option ${item.type === "한식" ? "selected" : ""}>한식</option><option ${item.type === "양식" ? "selected" : ""}>양식</option><option ${item.type === "기타" ? "selected" : ""}>기타</option></select></label>
      <label class="ratio-cell"><span>비율</span><span class="suffix-input"><input class="sample-value${lockedClass}" data-menu="${item.id}" data-key="ratio" data-numeric="true" type="number" min="0" max="100" value="${item.ratio}" ${disabled}><small>%</small></span></label>
      <button class="icon-button" data-remove="${item.id}" type="button" aria-label="${esc(item.name)} 메뉴 삭제" ${locked || regularMenus.length === 1 ? "disabled" : ""}>×</button>
    </div>`).join("");
    const zones = [
      { id: "b", title: "B 갤리", sub: "앞 · 오븐 128", tone: "zone-b" },
      { id: "cd", title: "C/D 갤리", sub: "뒤 · 오븐 192", tone: "zone-cd" },
      { id: "w", title: "W 갤리", sub: "윗층 · 오븐 128", tone: "zone-w" },
    ];
    const quickInputAttributes = quickEntrySupported() ? 'readonly inputmode="none" aria-haspopup="dialog"' : 'inputmode="numeric"';
    const galleySections = zones.map((zone) => `<section class="galley-entry ${zone.tone}">
      <div class="galley-entry-head"><div><span class="galley-order">${zone.id === "b" ? "01" : zone.id === "cd" ? "02" : "03"}</span><h3>${zone.title}</h3></div><small>${zone.sub}</small></div>
      <div class="inventory-table-head"><span>메뉴</span><span>트레이</span><span>앙트레</span></div>
      ${service.menus.map((item, index) => `<div class="inventory-row${item.special ? " special-row" : ""}"><div class="inventory-menu"><span>${item.special ? "S" : index + 1}</span><strong>${esc(item.name)}</strong><small>${item.special ? `${zone.title} 신청 ${service.specialRequests[zone.id]}명` : `${esc(item.type)} · ${item.ratio}%`}</small></div><label><span>${esc(item.name)} 트레이</span><input class="sample-value inventory-input ${zone.id}-tray${lockedClass}" data-menu="${item.id}" data-key="${zone.id}Tray" data-numeric="true" type="number" min="0" ${quickInputAttributes} value="${item[`${zone.id}Tray`]}" ${disabled}></label><label><span>${esc(item.name)} 앙트레</span><input class="sample-value inventory-input ${zone.id}-entree${lockedClass}" data-menu="${item.id}" data-key="${zone.id}Entree" data-numeric="true" type="number" min="0" ${quickInputAttributes} value="${item[`${zone.id}Entree`]}" ${disabled}></label></div>`).join("")}
    </section>`).join("");
    host.innerHTML = `<div class="service-heading"><div><h3>${esc(service.name)} 입력</h3></div><div class="menu-actions"><button class="small-button" id="add-menu" type="button" ${disabled}>＋ 메뉴</button></div></div>
      <section class="special-requests"><div class="section-title"><div><span>스페셜밀 신청자</span></div></div><div class="special-request-grid">
        <label><span>B 갤리</span><input class="sample-value${lockedClass}" data-request="b" type="number" min="0" inputmode="numeric" value="${service.specialRequests.b}" ${disabled}><small>명</small></label>
        <label><span>C/D 갤리</span><input class="sample-value${lockedClass}" data-request="cd" type="number" min="0" inputmode="numeric" value="${service.specialRequests.cd}" ${disabled}><small>명</small></label>
        <label><span>W 갤리</span><input class="sample-value${lockedClass}" data-request="w" type="number" min="0" inputmode="numeric" value="${service.specialRequests.w}" ${disabled}><small>명</small></label>
      </div></section>
      <section class="menu-setup"><div class="section-title"><div><span>메뉴 설정</span><small>일반식 비율 · 스페셜밀은 각 갤리에 자동 표시</small></div></div>${menuRows}</section>
      <div class="galley-entry-list">${galleySections}</div>
      ${state.services.length > 1 ? `<div class="service-remove-row"><button class="text-button" id="remove-service" type="button" ${disabled}>이 서비스 삭제</button></div>` : ""}`;
    host.querySelectorAll("[data-key]").forEach((input) => {
      const item = service.menus.find((entry) => entry.id === input.dataset.menu);
      input.addEventListener("input", () => { item[input.dataset.key] = input.dataset.numeric ? Number(input.value) : input.value; touch(); renderDynamic(); });
      input.addEventListener("change", () => { item[input.dataset.key] = input.dataset.numeric ? Number(input.value) : input.value; if (input.dataset.key === "name" || input.dataset.key === "type") renderAll(); else renderDynamic(); });
    });
    host.querySelectorAll("[data-request]").forEach((input) => input.addEventListener("input", () => { service.specialRequests[input.dataset.request] = Number(input.value); touch(); renderDynamic(); }));
    if (quickEntrySupported() && !locked) host.querySelectorAll(".inventory-input").forEach((input) => input.addEventListener("click", () => openQuickEntry(input)));
    host.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { const index = service.menus.findIndex((item) => item.id === button.dataset.remove); service.menus.splice(index, 1); touch(); renderAll(); }));
    $("#add-menu", host).addEventListener("click", () => { const specialIndex = service.menus.findIndex((item) => item.special); service.menus.splice(specialIndex < 0 ? service.menus.length : specialIndex, 0, menu("새 메뉴", "기타", 0, 0, 0, 0, 0, 0, 0)); touch(); renderAll(); });
    $("#remove-service", host)?.addEventListener("click", () => { state.services.splice(state.activeService, 1); state.activeService = Math.max(0, state.activeService - 1); state.rightView = "diagnosis"; touch(); renderAll(); });
  }

  function diagnosticItem(item, kind, icon) {
    return `<details class="diagnostic ${kind}"><summary><span class="diag-icon">${icon}</span><span>${esc(item.title)}</span></summary><p>${esc(item.detail)}</p></details>`;
  }

  function renderDiagnosis(result) {
    const view = $("#diagnosis-view");
    const allClear = result.ready && !result.warnings.length;
    let html = `<div class="status-hero ${result.ready ? "ready" : "blocked"}"><span class="status-label">${result.ready ? "출발 가능" : "출발 불가"}</span><h2>${result.ready ? (allClear ? "모든 조건이 맞습니다" : "작업 순서를 만들 수 있습니다") : "입력을 다시 확인해 주세요"}</h2><p>${result.ready ? `전체 ${result.pax}명 중 W존 ${result.wPax}명, 메인덱 ${result.lowerPax}명 기준입니다.` : "운영상 출발할 수 없는 상태에서는 작업 순서를 표시하지 않습니다."}</p></div>`;
    html += `<div class="service-meta"><span>선택 서비스 <strong>${esc(active().name)}</strong></span><span>메뉴 <strong>${active().menus.length}종</strong></span></div><div class="diagnostic-list">`;
    if (!result.blockers.length && !result.warnings.length && !result.notes.length) html += `<div class="diagnostic-empty">✓ 수량, 비율, 오븐 용량이 모두 맞습니다.</div>`;
    result.blockers.forEach((item) => { html += diagnosticItem(item, "blocker", "!"); });
    result.warnings.forEach((item) => { html += diagnosticItem(item, "warning", "!"); });
    result.notes.forEach((item) => { html += diagnosticItem(item, "note", "i"); });
    html += `</div>`;
    if (result.ready) html += `<button class="primary-button" id="open-tasks" type="button">작업 순서 보기</button>`;
    view.innerHTML = html;
    $("#open-tasks", view)?.addEventListener("click", () => { state.rightView = "tasks"; persistCurrent(false); renderDynamic(); });
  }

  function renderTasks(result) {
    const view = $("#tasks-view");
    if (!result.ready || !result.plan) { view.innerHTML = ""; return; }
    const service = active();
    const todos = service.execution?.todos || Engine.buildTodos(result).map((todo) => ({ ...todo, done: false }));
    const final = { b: 0, cd: 0, w: 0 };
    result.plan.details.forEach((item) => Object.keys(final).forEach((zone) => { final[zone] += item.finals[zone]; }));
    const doneCount = todos.filter((todo) => todo.done).length;
    let html = `<div class="task-intro"><h2>${esc(service.name)} 작업 순서</h2><p>${doneCount}/${todos.length} 완료</p></div><div class="final-split"><div><span>B 갤리</span><strong>${final.b}식</strong></div><div><span>C/D 갤리</span><strong>${final.cd}식</strong></div><div><span>W 갤리</span><strong>${final.w}식</strong></div></div><div class="todo-list">`;
    const next = todos.findIndex((todo) => !todo.done);
    todos.forEach((todo, index) => {
      const canUndo = todo.done && index === doneCount - 1;
      const summary = String(todo.summary || "").replaceAll(" / ", "\n");
      html += `<article class="todo-item${todo.done ? " done" : ""}"><span class="todo-number">${todo.done ? "✓" : index + 1}</span><div class="todo-copy"><h3>${esc(todo.title)}</h3><p>${esc(summary)}</p></div>${todo.done ? `<button class="undo-button" type="button" data-undo="${index}" ${canUndo ? "" : "disabled"}>실행 취소</button>` : `<button class="complete-button" type="button" data-complete="${index}" ${index === next ? "" : "disabled"}>완료</button>`}</article>`;
    });
    html += `</div>${doneCount === todos.length ? `<div class="done-banner">모든 작업을 완료했습니다.</div>` : ""}<button class="view-diagnosis" id="back-diagnosis" type="button">진단 다시 보기</button>`;
    view.innerHTML = html;
    view.querySelectorAll("[data-complete]").forEach((button) => button.addEventListener("click", () => startOrComplete(Number(button.dataset.complete))));
    view.querySelectorAll("[data-undo]").forEach((button) => button.addEventListener("click", () => undo(Number(button.dataset.undo))));
    $("#back-diagnosis", view).addEventListener("click", () => { state.rightView = "diagnosis"; persistCurrent(false); renderDynamic(); });
  }

  function renderDynamic() {
    const main = Number(state.passengers) - Number(state.wPassengers);
    $("#main-passengers").textContent = `${Number.isFinite(main) ? main : "—"}명`;
    const result = resultNow();
    const taskTotal = result.ready ? (active().execution?.todos || Engine.buildTodos(result)).length : 0;
    $("#task-count").textContent = taskTotal ? taskTotal : "";
    const tasksButton = $("#show-tasks");
    tasksButton.disabled = !result.ready;
    if (!result.ready) state.rightView = "diagnosis";
    const tasksVisible = state.rightView === "tasks";
    $("#show-diagnosis").classList.toggle("active", !tasksVisible);
    $("#show-diagnosis").ariaSelected = String(!tasksVisible);
    tasksButton.classList.toggle("active", tasksVisible);
    tasksButton.ariaSelected = String(tasksVisible);
    $("#diagnosis-view").hidden = tasksVisible;
    $("#tasks-view").hidden = !tasksVisible;
    $("#side-panel").classList.toggle("tasks-mode", tasksVisible);
    $(".app-shell").classList.toggle("tasks-expanded", tasksVisible);
    renderDiagnosis(result);
    renderTasks(result);
  }

  function renderAll() {
    $("#passengers").value = state.passengers;
    $("#w-passengers").value = state.wPassengers;
    const globalLocked = anyExecuting();
    [$("#passengers"), $("#w-passengers")].forEach((input) => { input.disabled = globalLocked; input.classList.toggle("locked-input", globalLocked); });
    $("#add-service").disabled = globalLocked;
    $("#sample-badge").hidden = !state.sample;
    renderScheduleChrome();
    renderTabs();
    renderEditor();
    renderDynamic();
  }

  $("#passengers").addEventListener("input", (event) => { state.passengers = Number(event.target.value); touch(); renderDynamic(); });
  $("#w-passengers").addEventListener("input", (event) => { state.wPassengers = Number(event.target.value); touch(); renderDynamic(); });
  $("#show-diagnosis").addEventListener("click", () => { state.rightView = "diagnosis"; persistCurrent(false); renderDynamic(); });
  $("#show-tasks").addEventListener("click", () => { if (resultNow().ready) { state.rightView = "tasks"; persistCurrent(false); renderDynamic(); } });
  $("#add-service").addEventListener("click", () => {
    const number = state.services.length + 1;
    state.services.push(defaultService(number));
    state.activeService = state.services.length - 1; state.rightView = "diagnosis"; touch(); renderAll();
  });
  $("#reset-all").addEventListener("click", () => { state = activeScheduleId ? blankState() : sampleState(); persistCurrent(); renderAll(); });
  $("#open-schedules").addEventListener("click", openDrawer);
  $("#close-schedules").addEventListener("click", closeDrawer);
  $("#drawer-backdrop").addEventListener("click", (event) => { if (event.target === $("#drawer-backdrop")) closeDrawer(); });
  $("#new-schedule").addEventListener("click", () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $("#schedule-date").value = localDate;
    $("#schedule-flight").value = "";
    $("#schedule-route").value = "";
    $("#schedule-modal").hidden = false;
    $("#schedule-flight").focus();
  });
  $("#cancel-schedule").addEventListener("click", () => { $("#schedule-modal").hidden = true; });
  $("#schedule-modal").addEventListener("click", (event) => { if (event.target === $("#schedule-modal")) $("#schedule-modal").hidden = true; });
  $("#schedule-form").addEventListener("submit", (event) => {
    event.preventDefault();
    persistCurrent(false);
    const timestamp = Date.now();
    const record = {
      id: uid("f"),
      date: $("#schedule-date").value,
      flightNo: $("#schedule-flight").value.trim().toUpperCase(),
      route: $("#schedule-route").value.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      data: blankState(),
    };
    scheduleStore.schedules.push(record);
    scheduleStore.schedules = [...scheduleStore.schedules].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    activeScheduleId = record.id;
    state = clone(record.data);
    saveScheduleStore();
    $("#schedule-modal").hidden = true;
    closeDrawer();
    renderAll();
  });
  $("#quick-entry").addEventListener("click", (event) => { if (event.target === $("#quick-entry")) closeQuickEntry(); });
  $("#quick-entry-close").addEventListener("click", closeQuickEntry);
  $("#quick-entry-prev").addEventListener("click", () => { if (quickEntry?.index > 0) selectQuickInput(quickEntry.index - 1); });
  $("#quick-entry-next").addEventListener("click", () => {
    if (!quickEntry) return;
    if (quickEntry.index === quickEntry.inputs.length - 1) closeQuickEntry();
    else selectQuickInput(quickEntry.index + 1);
  });
  $("#quick-entry").querySelectorAll("[data-quick-digit]").forEach((button) => button.addEventListener("click", () => enterQuickDigit(button.dataset.quickDigit)));
  $("#quick-entry").querySelector('[data-quick-action="clear"]').addEventListener("click", () => setQuickValue("0"));
  $("#quick-entry").querySelector('[data-quick-action="backspace"]').addEventListener("click", () => {
    if (!quickEntry) return;
    const next = quickEntry.replaceOnDigit ? "0" : quickEntry.buffer.slice(0, -1) || "0";
    setQuickValue(next);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && quickEntry) closeQuickEntry(); });

  function updateOfflineStatus(status, failed = false) {
    const badge = $("#offline-status");
    badge.textContent = status;
    badge.classList.toggle("ready", !failed);
    badge.classList.toggle("failed", failed);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
        updateOfflineStatus("오프라인 사용 가능");
      } catch (_) {
        updateOfflineStatus("오프라인 준비 실패", true);
      }
    });
  } else {
    updateOfflineStatus("오프라인 미지원", true);
  }
  renderAll();
})();
