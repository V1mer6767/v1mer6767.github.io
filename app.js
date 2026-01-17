const STORAGE_KEY = "my_notebook_v1";

const $ = (id) => document.getElementById(id);

const state = {
  tab: "plans",
  query: "",
  items: [],
  selectedId: null,
  editing: false,
  remindTimers: new Map(),
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function nowISO() {
  return new Date().toISOString();
}

function toLocalDatetimeValue(isoOrNull) {
  if (!isoOrNull) return "";
  const d = new Date(isoOrNull);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalDatetimeValue(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.items = raw ? JSON.parse(raw) : [];
  } catch {
    state.items = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requestNotifications() {
  if (!("Notification" in window)) {
    alert("Цей браузер не підтримує сповіщення.");
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      new Notification("Готово ✅", { body: "Сповіщення дозволені." });
    } else {
      alert("Сповіщення не дозволені. Увімкни їх у налаштуваннях браузера.");
    }
  });
}

function scheduleReminder(item) {
  // Просте планування в JS (працює надійно, коли сторінка відкрита)
  // На деяких телефонах може інколи спрацювати й у фоні, але це не гарантується.
  clearReminder(item.id);

  if (!item.remindAt || item.status === "done") return;

  const t = new Date(item.remindAt).getTime();
  const delay = t - Date.now();
  if (delay <= 0) return;

  const timerId = setTimeout(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(item.title || "Нагадування", {
        body: item.body?.slice(0, 120) || "Пора зробити це 🙂",
      });
    }
  }, delay);

  state.remindTimers.set(item.id, timerId);
}

function clearReminder(id) {
  const timerId = state.remindTimers.get(id);
  if (timerId) clearTimeout(timerId);
  state.remindTimers.delete(id);
}

function rescheduleAll() {
  for (const item of state.items) scheduleReminder(item);
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  return state.items
    .filter((x) => {
      if (state.tab === "done") return x.status === "done";
      return x.type === state.tab && x.status !== "done";
    })
    .filter((x) => {
      if (!q) return true;
      return (x.title || "").toLowerCase().includes(q) || (x.body || "").toLowerCase().includes(q);
    })
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

function setEditing(on) {
  state.editing = on;
  $("editTitle").disabled = !on;
  $("editBody").disabled = !on;
  $("editRemindAt").disabled = !on;
  $("btnSave").disabled = !on;
  $("btnCancel").disabled = !on;
}

function selectItem(id) {
  state.selectedId = id;
  const item = state.items.find((x) => x.id === id);
  if (!item) return;

  $("viewTitle").textContent = item.title || "(без назви)";
  const meta = [];
  meta.push(item.type === "plans" ? "План" : "Нотатка");
  if (item.status === "done") meta.push("✅ Виконано");
  meta.push(`створено: ${fmtDate(item.createdAt)}`);
  if (item.updatedAt) meta.push(`оновлено: ${fmtDate(item.updatedAt)}`);
  if (item.remindAt) meta.push(`нагадати: ${fmtDate(item.remindAt)}`);
  $("viewMeta").textContent = meta.join(" • ");

  $("editTitle").value = item.title || "";
  $("editBody").value = item.body || "";
  $("editRemindAt").value = toLocalDatetimeValue(item.remindAt);

  setEditing(true);
  renderList();
}

function renderList() {
  const items = filteredItems();
  const list = $("list");
  list.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div class="itemTitle">Поки тут пусто ✨</div><div class="itemBody">Додай перший запис зліва.</div>`;
    list.appendChild(empty);
    return;
  }

  for (const it of items) {
    const el = document.createElement("div");
    el.className = "item";
    const isSelected = it.id === state.selectedId;
    el.style.borderColor = isSelected ? "rgba(56,189,248,.55)" : "";
    const badges = [];
    if (it.remindAt && it.status !== "done") badges.push(`<span class="badge remind">🔔 ${fmtDate(it.remindAt)}</span>`);
    if (it.status === "done") badges.push(`<span class="badge done">✅ Done</span>`);

    el.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${escapeHTML(it.title || "(без назви)")}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          ${badges.join("")}
        </div>
      </div>
      <div class="itemBody">${escapeHTML((it.body || "").slice(0, 140))}${(it.body || "").length > 140 ? "…" : ""}</div>
      <div class="itemMeta">${it.type === "plans" ? "План" : "Нотатка"} • ${fmtDate(it.updatedAt || it.createdAt)}</div>
    `;
    el.addEventListener("click", () => selectItem(it.id));
    list.appendChild(el);
  }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addItem() {
  const title = $("newTitle").value.trim();
  const body = $("newBody").value.trim();
  const type = $("newType").value;
  const remindAt = fromLocalDatetimeValue($("newRemindAt").value);

  if (!title && !body) {
    alert("Напиши хоча б заголовок або текст 🙂");
    return;
  }

  const item = {
    id: uid(),
    type,            // plans | notes
    status: "active",// active | done
    title,
    body,
    createdAt: nowISO(),
    updatedAt: null,
    remindAt,
  };

  state.items.push(item);
  save();
  scheduleReminder(item);

  $("newTitle").value = "";
  $("newBody").value = "";
  $("newRemindAt").value = "";

  renderList();
}

function saveEdit() {
  const item = state.items.find((x) => x.id === state.selectedId);
  if (!item) return;

  item.title = $("editTitle").value.trim();
  item.body = $("editBody").value.trim();
  item.remindAt = fromLocalDatetimeValue($("editRemindAt").value);
  item.updatedAt = nowISO();

  save();
  scheduleReminder(item);

  $("viewTitle").textContent = item.title || "(без назви)";
  renderList();
}

function cancelEdit() {
  if (!state.selectedId) return;
  const item = state.items.find((x) => x.id === state.selectedId);
  if (!item) return;

  $("editTitle").value = item.title || "";
  $("editBody").value = item.body || "";
  $("editRemindAt").value = toLocalDatetimeValue(item.remindAt);
  renderList();
}

function markDone() {
  const item = state.items.find((x) => x.id === state.selectedId);
  if (!item) return;

  item.status = "done";
  item.updatedAt = nowISO();

  clearReminder(item.id);
  save();
  renderList();
}

function deleteSelected() {
  const id = state.selectedId;
  if (!id) return;

  const item = state.items.find((x) => x.id === id);
  if (!item) return;

  const ok = confirm(`Видалити "${item.title || "(без назви)"}"?`);
  if (!ok) return;

  clearReminder(id);
  state.items = state.items.filter((x) => x.id !== id);
  state.selectedId = null;

  save();
  $("viewTitle").textContent = "Вибери запис";
  $("viewMeta").textContent = "Тут буде деталі";
  $("editTitle").value = "";
  $("editBody").value = "";
  $("editRemindAt").value = "";
  setEditing(false);

  renderList();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-notebook-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "[]"));
      if (!Array.isArray(data)) throw new Error("bad format");
      state.items = data;
      save();
      rescheduleAll();
      renderList();
      alert("Імпорт готовий ✅");
    } catch {
      alert("Не вдалося імпортувати. Перевір файл.");
    }
  };
  reader.readAsText(file);
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  state.selectedId = null;
  $("viewTitle").textContent = tab === "done" ? "Виконано" : "Записи";
  $("viewMeta").textContent = "Вибери запис у списку";
  setEditing(false);
  renderList();
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  }
}

function wire() {
  $("btnAdd").addEventListener("click", addItem);
  $("btnSave").addEventListener("click", saveEdit);
  $("btnCancel").addEventListener("click", cancelEdit);
  $("btnMarkDone").addEventListener("click", markDone);
  $("btnDelete").addEventListener("click", deleteSelected);

  $("btnNotify").addEventListener("click", requestNotifications);
  $("btnExport").addEventListener("click", exportJSON);

  $("importFile").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importJSON(f);
    e.target.value = "";
  });

  $("search").addEventListener("input", (e) => {
    state.query = e.target.value || "";
    renderList();
  });

  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });
}

function init() {
  load();
  wire();
  registerSW();
  rescheduleAll();
  setTab("plans");
}

init();
