// ===== Flowii — Productivity Timer App =====
(function() {
  'use strict';

  // ===== State =====
  let tasks = JSON.parse(localStorage.getItem('flowii_tasks') || '[]');
  let timerInterval = null;
  let timerSeconds = 0;
  let activeTaskId = null;
  let isRunning = false;
  let currentCalendarDate = new Date();
  let selectedCalendarDay = null;
  let openChecklists = {};
  let currentTab = 'tasks';

  // ===== DOM refs =====
  const $ = (id) => document.getElementById(id);
  const timerCard = () => $('timerCard');
  const timerDisplay = () => $('timerDisplay');
  const timerTaskName = () => $('timerTaskName');
  const btnStart = () => $('btnStart');
  const btnStop = () => $('btnStop');
  const btnDone = () => $('btnDone');
  const btnStartIcon = () => $('btnStartIcon');

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', function() {
    // Migrate old tasks
    tasks.forEach(function(t) {
      if (!t.checklist) t.checklist = [];
    });
    save();

    $('taskDate').value = todayStr();

    // Event listeners (not inline onclick — more reliable)
    btnStart().addEventListener('click', toggleTimer);
    btnStop().addEventListener('click', stopTimer);
    btnDone().addEventListener('click', completeActiveTask);
    $('btnAddTask').addEventListener('click', addTask);
    $('taskInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') addTask();
    });
    $('tabTasks').addEventListener('click', function() { switchTab('tasks'); });
    $('tabCompleted').addEventListener('click', function() { switchTab('completed'); });
    $('btnPrevMonth').addEventListener('click', function() { changeMonth(-1); });
    $('btnNextMonth').addEventListener('click', function() { changeMonth(1); });

    // Event delegation for task clicks
    $('taskList').addEventListener('click', handleTaskListClick);
    $('completedList').addEventListener('click', handleCompletedListClick);
    $('calendarDays').addEventListener('click', handleCalendarClick);

    renderAll();
  });

  // ===== Helpers =====
  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function generateId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function save() {
    localStorage.setItem('flowii_tasks', JSON.stringify(tasks));
  }

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function formatTime(seconds) {
    if (!seconds || seconds === 0) return '00:00';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function formatTimeFull(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function parseTimeInput(str) {
    str = str.trim();
    var m = str.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    m = str.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    m = str.match(/^(\d+)$/);
    if (m) return parseInt(m[1]) * 60;
    return null;
  }

  function formatDateLabel(dateStr) {
    var today = todayStr();
    if (dateStr === today) return 'Hoje';
    var t = new Date();
    t.setDate(t.getDate() + 1);
    if (dateStr === t.toISOString().split('T')[0]) return 'Amanha';
    t = new Date();
    t.setDate(t.getDate() - 1);
    if (dateStr === t.toISOString().split('T')[0]) return 'Ontem';
    var d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  // ===== Task CRUD =====
  function addTask() {
    var input = $('taskInput');
    var dateInput = $('taskDate');
    var name = input.value.trim();
    if (!name) return;

    tasks.push({
      id: generateId(),
      name: name,
      date: dateInput.value || todayStr(),
      timeSpent: 0,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      checklist: []
    });

    save();
    input.value = '';
    dateInput.value = todayStr();
    input.focus();
    renderAll();
  }

  function deleteTask(id) {
    if (activeTaskId === id) {
      clearInterval(timerInterval);
      isRunning = false;
      resetTimerUI();
    }
    tasks = tasks.filter(function(t) { return t.id !== id; });
    save();
    renderAll();
  }

  // ===== Task Selection & Timer =====
  function selectTask(id) {
    // Don't switch tasks while running
    if (isRunning) return;

    var task = tasks.find(function(t) { return t.id === id; });
    if (!task || task.completed) return;

    // If clicking same task, deselect
    if (activeTaskId === id) {
      resetTimerUI();
      renderTasks();
      return;
    }

    activeTaskId = id;
    timerSeconds = task.timeSpent || 0;
    updateTimerDisplay();

    timerTaskName().textContent = task.name;
    timerCard().classList.add('active');
    btnStart().disabled = false;
    btnStop().disabled = false;
    btnDone().disabled = false;

    renderTasks();

    // Scroll timer into view
    timerCard().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function toggleTimer() {
    if (!activeTaskId) return;
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    if (!activeTaskId) return;
    isRunning = true;
    timerCard().classList.add('active');
    btnStart().classList.add('running');
    btnStartIcon().textContent = '\u275A\u275A';

    timerInterval = setInterval(function() {
      timerSeconds++;
      updateTimerDisplay();
      // Save to task every tick so it's always current
      var task = tasks.find(function(t) { return t.id === activeTaskId; });
      if (task) {
        task.timeSpent = timerSeconds;
      }
      // Persist to localStorage every 5 seconds
      if (timerSeconds % 5 === 0) save();
    }, 1000);
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    btnStart().classList.remove('running');
    btnStartIcon().textContent = '\u25B6';

    var task = tasks.find(function(t) { return t.id === activeTaskId; });
    if (task) {
      task.timeSpent = timerSeconds;
      save();
    }
    renderTasks();
  }

  function stopTimer() {
    if (!activeTaskId) return;

    // Save time
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;

    var task = tasks.find(function(t) { return t.id === activeTaskId; });
    if (task) {
      task.timeSpent = timerSeconds;
      save();
    }

    resetTimerUI();
    renderAll();
  }

  function completeActiveTask() {
    if (!activeTaskId) return;

    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;

    var task = tasks.find(function(t) { return t.id === activeTaskId; });
    if (task) {
      task.timeSpent = timerSeconds;
      task.completed = true;
      task.completedAt = new Date().toISOString();
      save();
    }

    resetTimerUI();
    renderAll();
    switchTab('completed');
  }

  function resetTimerUI() {
    activeTaskId = null;
    timerSeconds = 0;
    updateTimerDisplay();
    timerCard().classList.remove('active');
    timerTaskName().textContent = 'Toque em uma tarefa para iniciar';
    btnStart().classList.remove('running');
    btnStartIcon().textContent = '\u25B6';
    btnStart().disabled = true;
    btnStop().disabled = true;
    btnDone().disabled = true;
  }

  function updateTimerDisplay() {
    timerDisplay().textContent = formatTimeFull(timerSeconds);
  }

  // ===== Event Delegation =====
  function handleTaskListClick(e) {
    var target = e.target;

    // Delete button
    var delBtn = target.closest('[data-action="delete"]');
    if (delBtn) {
      e.stopPropagation();
      deleteTask(delBtn.dataset.taskId);
      return;
    }

    // Checklist toggle button
    var clBtn = target.closest('[data-action="toggle-checklist"]');
    if (clBtn) {
      e.stopPropagation();
      toggleChecklist(clBtn.dataset.taskId);
      return;
    }

    // Checklist checkbox
    var checkBox = target.closest('[data-action="toggle-check"]');
    if (checkBox) {
      e.stopPropagation();
      toggleChecklistItem(checkBox.dataset.taskId, checkBox.dataset.itemId);
      return;
    }

    // Remove checklist item
    var removeBtn = target.closest('[data-action="remove-check"]');
    if (removeBtn) {
      e.stopPropagation();
      removeChecklistItem(removeBtn.dataset.taskId, removeBtn.dataset.itemId);
      return;
    }

    // Add checklist item button
    var addBtn = target.closest('[data-action="add-check"]');
    if (addBtn) {
      e.stopPropagation();
      addChecklistItem(addBtn.dataset.taskId);
      return;
    }

    // Time edit
    var timeEl = target.closest('[data-action="edit-time"]');
    if (timeEl) {
      e.stopPropagation();
      startTimeEdit(timeEl, timeEl.dataset.taskId);
      return;
    }

    // Don't process clicks on input fields
    if (target.tagName === 'INPUT') return;

    // Task selection (click anywhere else on the task)
    var taskEl = target.closest('[data-task-id]');
    if (taskEl && !target.closest('.checklist-dropdown')) {
      selectTask(taskEl.dataset.taskId);
    }
  }

  function handleCompletedListClick(e) {
    var target = e.target;

    var delBtn = target.closest('[data-action="delete"]');
    if (delBtn) {
      deleteTask(delBtn.dataset.taskId);
      return;
    }

    var clBtn = target.closest('[data-action="toggle-checklist"]');
    if (clBtn) {
      toggleChecklist(clBtn.dataset.taskId);
      return;
    }

    var checkBox = target.closest('[data-action="toggle-check"]');
    if (checkBox) {
      toggleChecklistItem(checkBox.dataset.taskId, checkBox.dataset.itemId);
      return;
    }
  }

  function handleCalendarClick(e) {
    var dayEl = e.target.closest('[data-date]');
    if (dayEl && !dayEl.classList.contains('other-month')) {
      selectCalendarDay(dayEl.dataset.date);
    }
  }

  // ===== Time Edit =====
  function startTimeEdit(el, taskId) {
    if (isRunning && activeTaskId === taskId) return;

    var task = tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.value = formatTimeFull(task.timeSpent || 0);
    input.className = 'task-time-edit';
    input.placeholder = 'HH:MM:SS';

    el.replaceWith(input);
    input.focus();
    input.select();

    function finishEdit() {
      var parsed = parseTimeInput(input.value);
      if (parsed !== null) {
        task.timeSpent = parsed;
        if (activeTaskId === taskId) {
          timerSeconds = parsed;
          updateTimerDisplay();
        }
        save();
      }
      renderTasks();
    }

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { renderTasks(); }
    });
  }

  // ===== Checklist =====
  function toggleChecklist(taskId) {
    openChecklists[taskId] = !openChecklists[taskId];
    renderAll();
    if (openChecklists[taskId]) {
      setTimeout(function() {
        var inp = $('cl-input-' + taskId);
        if (inp) inp.focus();
      }, 60);
    }
  }

  function addChecklistItem(taskId) {
    var inp = $('cl-input-' + taskId);
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;

    var task = tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;

    task.checklist.push({ id: generateId(), text: text, checked: false });
    save();
    inp.value = '';
    renderAll();
    setTimeout(function() {
      var newInp = $('cl-input-' + taskId);
      if (newInp) newInp.focus();
    }, 60);
  }

  function toggleChecklistItem(taskId, itemId) {
    var task = tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;
    var item = task.checklist.find(function(i) { return i.id === itemId; });
    if (item) {
      item.checked = !item.checked;
      save();
      renderAll();
    }
  }

  function removeChecklistItem(taskId, itemId) {
    var task = tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;
    task.checklist = task.checklist.filter(function(i) { return i.id !== itemId; });
    save();
    renderAll();
  }

  // ===== Render =====
  function renderAll() {
    renderTasks();
    renderCompleted();
    renderCalendar();
  }

  function buildChecklist(task, readonly) {
    var isOpen = openChecklists[task.id];
    var items = task.checklist || [];
    var hasItems = items.length > 0;
    var checkedCount = items.filter(function(i) { return i.checked; }).length;
    var badge = hasItems ? '(' + checkedCount + '/' + items.length + ')' : '';

    var btnHtml = '<button class="btn-task btn-checklist' + (hasItems ? ' has-items' : '') + '" ' +
      'data-action="toggle-checklist" data-task-id="' + task.id + '" ' +
      'title="Checklist ' + badge + '">&#9776;' +
      (hasItems ? '<span class="cl-badge">' + checkedCount + '/' + items.length + '</span>' : '') +
      '</button>';

    var dropHtml = '';
    if (isOpen) {
      dropHtml = '<div class="checklist-dropdown open">';
      dropHtml += '<div class="checklist-items">';
      items.forEach(function(item) {
        var checked = item.checked;
        dropHtml += '<div class="checklist-item' + (checked ? ' checked' : '') + '">';
        dropHtml += '<div class="cl-checkbox' + (checked ? ' checked' : '') + '" data-action="toggle-check" data-task-id="' + task.id + '" data-item-id="' + item.id + '"></div>';
        dropHtml += '<span class="checklist-text">' + escapeHtml(item.text) + '</span>';
        if (!readonly) {
          dropHtml += '<button class="btn-remove-check" data-action="remove-check" data-task-id="' + task.id + '" data-item-id="' + item.id + '">&times;</button>';
        }
        dropHtml += '</div>';
      });
      dropHtml += '</div>';
      if (!readonly) {
        dropHtml += '<div class="checklist-add">';
        dropHtml += '<input type="text" id="cl-input-' + task.id + '" placeholder="Adicionar item..." data-task-id="' + task.id + '">';
        dropHtml += '<button data-action="add-check" data-task-id="' + task.id + '">+</button>';
        dropHtml += '</div>';
      }
      dropHtml += '</div>';
    }

    return { btnHtml: btnHtml, dropHtml: dropHtml };
  }

  function renderTasks() {
    var container = $('taskList');
    var pending = tasks.filter(function(t) { return !t.completed; })
      .sort(function(a, b) { return a.date.localeCompare(b.date); });

    if (pending.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma tarefa pendente. Adicione uma acima!</p>';
      return;
    }

    var html = '';
    pending.forEach(function(task) {
      var isActive = task.id === activeTaskId;
      var dateLabel = formatDateLabel(task.date);
      var cl = buildChecklist(task, false);
      var displayTime = isActive && isRunning ? formatTime(timerSeconds) : formatTime(task.timeSpent);

      html += '<div class="task-item' + (isActive ? ' active-task' : '') + '" data-task-id="' + task.id + '">';
      html += '<div class="task-item-main">';
      html += '<div class="task-dot' + (isActive ? ' active' : '') + '"></div>';
      html += '<div class="task-info">';
      html += '<div class="task-name">' + escapeHtml(task.name) + '</div>';
      html += '<div class="task-meta"><span>' + dateLabel + '</span></div>';
      html += '</div>';
      html += '<div class="task-time" data-action="edit-time" data-task-id="' + task.id + '" title="Clique para editar">' + displayTime + '</div>';
      html += '<div class="task-actions">';
      html += cl.btnHtml;
      html += '<button class="btn-task btn-delete" data-action="delete" data-task-id="' + task.id + '" title="Excluir">&times;</button>';
      html += '</div>';
      html += '</div>';
      html += cl.dropHtml;
      html += '</div>';
    });

    container.innerHTML = html;

    // Re-attach enter key for checklist inputs
    container.querySelectorAll('.checklist-add input').forEach(function(inp) {
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          addChecklistItem(inp.dataset.taskId);
        }
      });
    });
  }

  function renderCompleted() {
    var container = $('completedList');
    var completed = tasks.filter(function(t) { return t.completed; })
      .sort(function(a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); });

    $('completedCount').textContent = completed.length;

    if (completed.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma tarefa concluida ainda.</p>';
      return;
    }

    var html = '';
    completed.forEach(function(task) {
      var dateLabel = formatDateLabel(task.date);
      var cl = buildChecklist(task, true);

      html += '<div class="task-item completed">';
      html += '<div class="task-item-main">';
      html += '<div class="task-dot completed"></div>';
      html += '<div class="task-info">';
      html += '<div class="task-name">' + escapeHtml(task.name) + '</div>';
      html += '<div class="task-meta">';
      html += '<span>' + dateLabel + '</span>';
      html += '<span>Tempo: ' + formatTime(task.timeSpent) + '</span>';
      html += '</div>';
      html += '</div>';
      html += '<div class="task-time">' + formatTime(task.timeSpent) + '</div>';
      html += '<div class="task-actions">';
      if (task.checklist && task.checklist.length > 0) html += cl.btnHtml;
      html += '<button class="btn-task btn-delete" data-action="delete" data-task-id="' + task.id + '" title="Excluir">&times;</button>';
      html += '</div>';
      html += '</div>';
      html += cl.dropHtml;
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ===== Calendar =====
  function renderCalendar() {
    var year = currentCalendarDate.getFullYear();
    var month = currentCalendarDate.getMonth();
    var months = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    $('calendarTitle').textContent = months[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daysInPrevMonth = new Date(year, month, 0).getDate();
    var today = todayStr();

    var html = '';

    // Prev month
    for (var i = firstDay - 1; i >= 0; i--) {
      html += '<div class="cal-day other-month">' + (daysInPrevMonth - i) + '</div>';
    }

    // Current month
    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var isToday = dateStr === today;
      var isSelected = selectedCalendarDay === dateStr;
      var dayTasks = tasks.filter(function(t) { return t.date === dateStr; });
      var hasTasks = dayTasks.length > 0;
      var hasCompleted = dayTasks.some(function(t) { return t.completed; });

      var cls = 'cal-day';
      if (isToday) cls += ' today';
      if (isSelected) cls += ' selected';
      if (hasCompleted) cls += ' has-completed';

      html += '<div class="' + cls + '" data-date="' + dateStr + '">';
      html += day;
      if (hasTasks) html += '<div class="dot-indicator"></div>';
      html += '</div>';
    }

    // Next month
    var totalCells = firstDay + daysInMonth;
    var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var j = 1; j <= remaining; j++) {
      html += '<div class="cal-day other-month">' + j + '</div>';
    }

    $('calendarDays').innerHTML = html;
  }

  function selectCalendarDay(dateStr) {
    selectedCalendarDay = dateStr;
    renderCalendar();

    var container = $('calendarDetail');
    var dayTasks = tasks.filter(function(t) { return t.date === dateStr; });
    var d = new Date(dateStr + 'T12:00:00');
    var formatted = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    if (dayTasks.length === 0) {
      container.innerHTML = '<h4>' + formatted + '</h4><p class="empty-state" style="padding:16px 0">Nenhuma tarefa neste dia.</p>';
      return;
    }

    var totalTime = dayTasks.reduce(function(s, t) { return s + (t.timeSpent || 0); }, 0);
    var doneCount = dayTasks.filter(function(t) { return t.completed; }).length;

    var h = '<h4>' + formatted + '</h4>';
    h += '<div class="task-meta" style="margin-bottom:12px">';
    h += '<span>' + dayTasks.length + ' tarefa' + (dayTasks.length > 1 ? 's' : '') + '</span>';
    h += '<span>' + doneCount + ' concluida' + (doneCount !== 1 ? 's' : '') + '</span>';
    h += '<span>Total: ' + formatTime(totalTime) + '</span>';
    h += '</div><div class="task-list">';
    dayTasks.forEach(function(t) {
      h += '<div class="cal-task-item">';
      h += '<div class="cal-task-dot ' + (t.completed ? 'done' : 'pending') + '"></div>';
      h += '<span class="cal-task-name ' + (t.completed ? 'done' : '') + '">' + escapeHtml(t.name) + '</span>';
      h += '<span class="cal-task-time">' + formatTime(t.timeSpent) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    container.innerHTML = h;
  }

  function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    selectedCalendarDay = null;
    renderCalendar();
    $('calendarDetail').innerHTML = '<p class="empty-state">Selecione um dia para ver as tarefas.</p>';
  }

  // ===== Tabs =====
  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });

    if (name === 'tasks') {
      $('tabTasks').classList.add('active');
      $('tab-tasks').classList.add('active');
      renderTasks();
      renderCalendar();
    } else {
      $('tabCompleted').classList.add('active');
      $('tab-completed').classList.add('active');
      renderCompleted();
    }
  }

})();
