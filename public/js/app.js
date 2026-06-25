// ===== API CLIENT =====

const API = {
    base: '/api',

    async get(endpoint) {
        const res = await fetch(this.base + endpoint);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    },

    async post(endpoint, body) {
        const res = await fetch(this.base + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    },

    async put(endpoint, body) {
        const opts = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res = await fetch(this.base + endpoint, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    },

    async del(endpoint) {
        const res = await fetch(this.base + endpoint, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }
};

// ===== STATE =====

const state = {
    user: null,
    habits: [],
    todayEntry: null,
    todayDate: null,
    monthlyScores: null,
    stats: null,
    heatmap: null,
    currentPage: 'home'
};

// ===== HELPER FUNCTIONS =====

const MONTHS_RU = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const MONTHS_FULL_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAYS_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAYS_SHORT_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDate() + ' ' + MONTHS_FULL_RU[d.getMonth()] + ', ' + DAYS_RU[d.getDay()].toLowerCase();
}

function getRelativeDay(dateStr) {
    if (!dateStr) return 'никогда';
    const today = new Date();
    today.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((today - d) / (1000*60*60*24));
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'вчера';
    if (diff === 2) return '2 дня назад';
    if (diff < 5) return diff + ' дней назад';
    return diff + ' дней назад';
}

function daysAgo(dateStr) {
    if (!dateStr) return Infinity;
    const today = new Date();
    today.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00');
    return Math.round((today - d) / (1000*60*60*24));
}

function getStreakText(streak) {
    if (streak === 0) return '0 дней';
    if (streak === 1) return '1 день';
    if (streak >= 2 && streak <= 4) return streak + ' дня';
    return streak + ' дней';
}

function renderStars(count, max) {
    max = max || 5;
    let html = '';
    for (let i = 1; i <= max; i++) {
        html += '<i class="fas fa-star ' + (i <= count ? 'star-active' : '') + '"></i>';
    }
    return html;
}

function renderProgressBar(value, max, color) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const cls = color === 'red' ? 'p-red' : color === 'orange' ? 'p-orange' : 'p-green';
    return '<div class="progress-track"><div class="progress-fill ' + cls + '" style="width: ' + pct + '%;"></div></div>';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== TOAST =====

function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

// ===== MODAL =====

function openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-content').innerHTML = '';
}

document.getElementById('modal-overlay').addEventListener('click', async function(e) {
    if (e.target === this) { closeModal(); return; }

    var target = e.target.closest('[data-action]');
    if (!target) return;

    var action = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');

    if (action === 'confirm-delete') {
        if (!id) return;
        try {
            await API.del('/habits/' + id);
            showToast('Привычка удалена');
            closeModal();
            await loadDashboard();
            navigateTo(state.currentPage);
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        }
    } else if (action === 'confirm-reset') {
        try {
            await API.post('/reset');
            showToast('Данные сброшены. Привычки сохранены.');
            closeModal();
            await loadDashboard();
            navigateTo(state.currentPage);
        } catch (err) {
            showToast('Ошибка сброса: ' + err.message, 'error');
            closeModal();
        }
    }
});

// ===== DATA FETCHING =====

async function loadDashboard() {
    try {
        const data = await API.get('/dashboard');
        state.user = data.user;
        state.habits = data.habits;
        state.todayEntry = data.today_entry;
        state.todayDate = data.today_date;
        state.monthlyScores = data.monthly_scores;
    } catch (err) {
        showToast('Ошибка загрузки дашборда: ' + err.message, 'error');
    }
}

async function loadHabits() {
    try {
        const data = await API.get('/habits');
        state.habits = data;
    } catch (err) {
        showToast('Ошибка загрузки привычек: ' + err.message, 'error');
    }
}

async function loadStats() {
    try {
        const data = await API.get('/stats');
        state.stats = data;
    } catch (err) {
        showToast('Ошибка загрузки статистики: ' + err.message, 'error');
    }
}

async function loadHeatmap() {
    try {
        const data = await API.get('/heatmap');
        state.heatmap = data.monthly_scores;
        state.monthlyScores = data.monthly_scores;
    } catch (err) {
        showToast('Ошибка загрузки тепловой карты: ' + err.message, 'error');
    }
}

// ===== CALENDAR RENDERING =====

function buildCalendarGrid(monthlyScores) {
    if (!monthlyScores) return '<div class="empty-state"><i class="fas fa-calendar"></i><p>Нет данных</p></div>';

    var year = new Date().getFullYear();
    var dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

    function scoreToClass(score) {
        if (score === undefined || score === null) return 'b-0';
        if (score <= -3) return 'b-3';
        if (score === -2) return 'b-2';
        if (score === -1) return 'b-1';
        if (score === 0) return 'b-0';
        if (score === 1) return 'b-1p';
        if (score === 2) return 'b-2p';
        if (score === 3) return 'b-3p';
        return 'b-4p';
    }

    // Calculate grid boundaries
    // Jan 1 of current year
    var jan1 = new Date(year, 0, 1);
    // Convert JS day-of-week (0=Sun) to Mon=0 offset
    var jan1Offset = (jan1.getDay() + 6) % 7;
    // Grid starts on the Monday of the week containing Jan 1
    var gridStart = new Date(year, 0, 1 - jan1Offset);

    // Dec 31 of current year
    var dec31 = new Date(year, 11, 31);
    var dec31Offset = (dec31.getDay() + 6) % 7;
    // Grid ends on the Sunday of the week containing Dec 31
    var gridEnd = new Date(year, 11, 31 + (6 - dec31Offset));

    var totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
    var totalWeeks = totalDays / 7;

    // For each month, find which week column it starts in
    var monthStartWeek = [];
    for (var m = 0; m < 12; m++) {
        var firstDay = new Date(year, m, 1);
        var daysFromStart = Math.round((firstDay.getTime() - gridStart.getTime()) / 86400000);
        monthStartWeek.push(Math.floor(daysFromStart / 7));
    }

    // Build HTML
    var html = '<div class="calendar-grid" style="grid-template-columns: 40px repeat(' + totalWeeks + ', 1fr);">';

    // Corner cell (row 1, col 1)
    html += '<div></div>';

    // Month labels (row 1, spanning appropriate columns)
    for (var m = 0; m < 12; m++) {
        var startCol = monthStartWeek[m] + 2; // +2 for 1-indexed + label column
        var span = m < 11 ? monthStartWeek[m + 1] - monthStartWeek[m] : totalWeeks - monthStartWeek[m];
        if (span > 0) {
            html += '<div class="cal-month" style="grid-column:' + startCol + ' / span ' + span + ';">' + MONTHS_RU[m] + '</div>';
        }
    }

    // 7 day rows (Mon through Sun)
    for (var d = 0; d < 7; d++) {
        html += '<div class="cal-day">' + dayLabels[d] + '</div>';
        for (var w = 0; w < totalWeeks; w++) {
            var cellDate = new Date(gridStart.getTime() + (w * 7 + d) * 86400000);
            if (cellDate.getFullYear() === year) {
                var month = cellDate.getMonth();
                var day = cellDate.getDate();
                var monthKey = year + '-' + String(month + 1).padStart(2, '0');
                var scores = monthlyScores[monthKey] || [];
                var score = (day - 1) < scores.length ? scores[day - 1] : undefined;
                html += '<div class="block ' + scoreToClass(score) + '"></div>';
            } else {
                html += '<div class="b-empty"></div>';
            }
        }
    }

    html += '</div>';
    html += '<div class="cal-legend">';
    html += '<div class="legend-item"><div class="legend-block b-3"></div> -3</div>';
    html += '<div class="legend-item"><div class="legend-block b-2"></div> -2</div>';
    html += '<div class="legend-item"><div class="legend-block b-1"></div> -1</div>';
    html += '<div class="legend-item"><div class="legend-block b-0"></div> 0</div>';
    html += '<div class="legend-item"><div class="legend-block b-1p"></div> 1</div>';
    html += '<div class="legend-item"><div class="legend-block b-2p"></div> 2</div>';
    html += '<div class="legend-item"><div class="legend-block b-3p"></div> 3</div>';
    html += '<div class="legend-item"><div class="legend-block b-4p"></div> 4+</div>';
    html += '</div>';

    return html;
}

// ===== SVG CHART =====

function buildSvgChart(dataArr, color, label, unit) {
    var points = dataArr.slice(-4);
    if (points.length === 0) {
        return '<div class="chart-header"><span>' + escapeHtml(label) + '</span><span style="color:var(--text-muted)">' + escapeHtml(unit) + '</span></div>' +
            '<div class="chart-container" style="display:flex;align-items:center;justify-content:center;"><span style="color:var(--text-muted);font-size:12px;">Нет данных</span></div>';
    }

    var viewW = 200, viewH = 120;
    var padL = 10, padR = 10, padT = 15, padB = 20;
    var chartW = viewW - padL - padR;
    var chartH = viewH - padT - padB;

    var vals = points.map(function(p) { return p.value; });
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    var range = maxV - minV || 1;

    var coords = [];
    for (var i = 0; i < points.length; i++) {
        var x = padL + (points.length === 1 ? chartW / 2 : chartW * i / (points.length - 1));
        var y = padT + chartH - ((points[i].value - minV) / range) * chartH;
        coords.push({ x: x, y: y });
    }

    var polylinePoints = coords.map(function(c) { return c.x + ',' + c.y; }).join(' ');

    var lastCoord = coords[coords.length - 1];
    var lastVal = points[points.length - 1].value;

    var svg = '<svg class="chart-svg" viewBox="0 0 ' + viewW + ' ' + viewH + '">';
    svg += '<polyline points="' + polylinePoints + '" class="chart-line" style="stroke: ' + color + ';"/>';
    for (var j = 0; j < coords.length; j++) {
        svg += '<circle cx="' + coords[j].x + '" cy="' + coords[j].y + '" r="3" class="chart-point" style="stroke: ' + color + ';"/>';
    }
    svg += '<text x="' + lastCoord.x + '" y="' + (lastCoord.y - 8) + '" class="chart-value" fill="' + color + '" style="font-size:10px;">' + lastVal + '</text>';
    for (var k = 0; k < points.length; k++) {
        var lbl = points[k].label || '';
        svg += '<text x="' + coords[k].x + '" y="' + (viewH - 4) + '" class="chart-label">' + escapeHtml(lbl) + '</text>';
    }
    svg += '</svg>';

    return '<div class="chart-header"><span>' + escapeHtml(label) + '</span><span style="color:var(--text-muted)">' + escapeHtml(unit) + '</span></div>' +
        '<div class="chart-container">' + svg + '</div>';
}

// ===== NAVIGATION =====

function navigateTo(page) {
    state.currentPage = page;
    history.replaceState(null, '', '#' + page);

    var main = document.getElementById('main-content');
    state._scrollTop = main.scrollTop;

    var sections = document.querySelectorAll('.page-section');
    for (var i = 0; i < sections.length; i++) {
        sections[i].classList.remove('active');
    }
    var target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    var navItems = document.querySelectorAll('.nav-item');
    for (var j = 0; j < navItems.length; j++) {
        navItems[j].classList.remove('active');
        if (navItems[j].getAttribute('data-page') === page) {
            navItems[j].classList.add('active');
        }
    }

    renderPage(page);
}

async function renderPage(page) {
    var main = document.getElementById('main-content');
    main.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    switch (page) {
        case 'home':
            await loadDashboard();
            renderHomePage();
            break;
        case 'habits':
            await loadDashboard();
            renderHabitsPage();
            break;
        case 'history':
            await Promise.all([loadDashboard(), loadHeatmap(), loadStats()]);
            renderHistoryPage();
            break;
        case 'stats':
            await Promise.all([loadDashboard(), loadStats()]);
            renderStatsPage();
            break;
        case 'settings':
            await loadDashboard();
            renderSettingsPage();
            break;
        default:
            await loadDashboard();
            renderHomePage();
    }
}

// ===== PAGE: HOME =====

function renderHomePage() {
    var main = document.getElementById('main-content');
    var u = state.user || { level: 0, xp: 0, xp_needed: 1, multiplier: 1, multiplier_days_to_next: 0 };
    var habits = state.habits || [];
    var entry = state.todayEntry || {};
    var scores = state.monthlyScores || {};
    var todayDate = state.todayDate;

    var xpPct = u.xp_needed > 0 ? Math.round((u.xp / u.xp_needed) * 100) : 0;

    var quotes = [
        'Дисциплина сегодня — свобода завтра.',
        'Маленькие шаги каждый день приводят к большим результатам.',
        'Победа над собой — величайшая победа.',
        'Привычки — это составные проценты самосовершенствования.',
        'Неважно как медленно ты идёшь, главное — не останавливайся.',
        'Ты становишься тем, что делаешь каждый день.'
    ];
    var quote = quotes[Math.floor(Math.random() * quotes.length)];

    var html = '';

    // Top row: level, multiplier, quote
    html += '<div class="row row-3">';
    html += '<div class="card top-card flex-col">';
    html += '<div class="text-sm">Уровень</div>';
    html += '<div class="flex-row">';
    html += '<div class="level">' + u.level + '</div>';
    html += '<div class="text-sm">XP: ' + u.xp + ' / ' + u.xp_needed + '</div>';
    html += '</div>';
    html += '<div class="progress-bar-track"><div class="progress-bar-fill" style="width: ' + xpPct + '%;"></div></div>';
    html += '</div>';

    html += '<div class="card multiplier-card flex-col">';
    html += '<div class="flex-between">';
    html += '<div><div class="text-sm">Множитель</div>';
    html += '<div class="multiplier-big">x' + u.multiplier + '</div></div>';
    html += '<i class="fas fa-bolt lightning-icon"></i>';
    html += '</div>';
    html += '<div class="text-sm" style="margin-top:8px;">' + u.multiplier_days_to_next + ' дней до x' + (Math.round((u.multiplier + 0.1) * 10) / 10) + '</div>';
    html += '</div>';

    html += '<div class="card flex-row flex-between">';
    html += '<div><i class="fas fa-user-astronaut" style="font-size:40px;color:var(--purple);"></i></div>';
    html += '<div style="text-align:right;font-size:12px;color:var(--text-muted);max-width:140px;">"' + escapeHtml(quote) + '"</div>';
    html += '<i class="fas fa-chevron-right" style="color:var(--text-muted);"></i>';
    html += '</div>';
    html += '</div>';

    // Habits
    var habitList = habits.filter(function(h) { return h.type === 'habit'; });
    html += '<div>';
    html += '<div class="section-title">ПРИВЫЧКИ</div>';
    if (habitList.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-plus-circle"></i><p>Пока нет привычек</p></div>';
    } else {
        html += '<div class="row row-4">';
        for (var i = 0; i < habitList.length; i++) {
            html += renderHabitCard(habitList[i]);
        }
        html += '</div>';
    }
    html += '</div>';

    // Antihabits
    var antiList = habits.filter(function(h) { return h.type === 'antihabit'; });
    html += '<div>';
    html += '<div class="section-title">АНТИПРИВЫЧКИ</div>';
    if (antiList.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-plus-circle"></i><p>Пока нет антипривычек</p></div>';
    } else {
        html += '<div class="row row-3">';
        for (var j = 0; j < antiList.length; j++) {
            html += renderHabitCard(antiList[j]);
        }
        html += '</div>';
    }
    html += '</div>';

    // Today
    html += '<div>';
    html += '<div class="flex-between">';
    html += '<div class="section-title" style="margin-bottom:0;">СЕГОДНЯ</div>';
    if (todayDate) {
        html += '<span style="color:var(--text-muted);font-size:12px;">' + formatDate(todayDate) + ' <i class="fas fa-calendar-alt" style="margin-left:5px;"></i></span>';
    }
    html += '</div>';
    html += '<div class="row row-3" style="margin-top:12px;">';

    // Mood
    var mood = entry.mood || 0;
    html += '<div class="card">';
    html += '<div class="flex-row gap-8"><i class="fas fa-face-smile" style="font-size:24px;color:var(--purple);"></i>';
    html += '<div class="section-title" style="margin-bottom:0;">Настроение</div></div>';
    html += '<div class="today-item">';
    html += '<div class="stars" id="stars-mood">';
    for (var s = 1; s <= 5; s++) {
        html += '<i class="fas fa-star ' + (s <= mood ? 'star-active' : '') + '" data-action="set-mood" data-value="' + s + '" style="cursor:pointer;"></i>';
    }
    html += '</div>';
    html += '<span style="color:var(--text-muted);font-size:14px;" id="mood-val">' + mood + '</span>';
    html += '</div></div>';

    // Productivity
    var prod = entry.productivity || 0;
    html += '<div class="card">';
    html += '<div class="flex-row gap-8"><i class="fas fa-bolt" style="font-size:24px;color:var(--blue);"></i>';
    html += '<div class="section-title" style="margin-bottom:0;">Продуктивность</div></div>';
    html += '<div class="today-item">';
    html += '<div class="stars" id="stars-productivity">';
    for (var s2 = 1; s2 <= 5; s2++) {
        html += '<i class="fas fa-star ' + (s2 <= prod ? 'star-active' : '') + '" data-action="set-productivity" data-value="' + s2 + '" style="cursor:pointer;"></i>';
    }
    html += '</div>';
    html += '<span style="color:var(--text-muted);font-size:14px;" id="prod-val">' + prod + '</span>';
    html += '</div></div>';

    // Weight
    var wt = entry.weight || 0;
    html += '<div class="card flex-between">';
    html += '<div class="flex-row gap-8"><i class="fas fa-weight-scale" style="font-size:24px;color:var(--green);"></i>';
    html += '<div class="section-title" style="margin-bottom:0;">Вес</div></div>';
    html += '<div class="weight-big" id="weight-display" data-action="edit-weight">' + wt + ' <span style="font-size:16px;color:var(--text-muted);font-weight:400;">кг</span></div>';
    html += '</div>';

    html += '</div></div>';

    // Calendar
    html += '<div class="card">';
    html += '<div class="section-title">КАЛЕНДАРЬ</div>';
    html += buildCalendarGrid(scores);
    html += '</div>';

    // Stats mini charts
    var statsHtml = '';
    if (state.stats) {
        statsHtml += '<div>';
        statsHtml += '<div class="section-title">СТАТИСТИКА</div>';
        statsHtml += '<div class="row row-3">';

        var weightData = (state.stats.weight_history || []).map(function(w) {
            var d = new Date(w.date + 'T00:00:00');
            return { value: w.weight, label: MONTHS_RU[d.getMonth()] };
        });
        statsHtml += '<div class="card">' + buildSvgChart(weightData, 'var(--green)', 'Вес', 'кг') + '</div>';

        var moodData = (state.stats.mood_history || []).map(function(m) {
            var d = new Date(m.date + 'T00:00:00');
            return { value: m.mood, label: MONTHS_RU[d.getMonth()] };
        });
        statsHtml += '<div class="card">' + buildSvgChart(moodData, 'var(--purple)', 'Настроение', '/5') + '</div>';

        var prodData = (state.stats.productivity_history || []).map(function(p) {
            var d = new Date(p.date + 'T00:00:00');
            return { value: p.productivity, label: MONTHS_RU[d.getMonth()] };
        });
        statsHtml += '<div class="card">' + buildSvgChart(prodData, 'var(--blue)', 'Продуктивность', '/5') + '</div>';

        statsHtml += '</div></div>';
    }
    html += statsHtml;

    // Wrap all page sections
    var fullHtml = '<div class="page-section active" id="page-home">' + html + '</div>';
    fullHtml += '<div class="page-section" id="page-habits"></div>';
    fullHtml += '<div class="page-section" id="page-history"></div>';
    fullHtml += '<div class="page-section" id="page-stats"></div>';
    fullHtml += '<div class="page-section" id="page-settings"></div>';

    main.innerHTML = fullHtml;
    main.scrollTop = state._scrollTop || 0;
}

function renderHabitCard(h) {
    var circumference = 2 * Math.PI * 42;
    var isAnti = h.type === 'antihabit';
    var isStreakOff = h.track_streak === false;
    var colorVar = h.color === 'red' ? 'var(--red)' : h.color === 'orange' ? 'var(--orange)' : 'var(--green)';
    var iconClass = h.color === 'red' ? 'icon-red' : h.color === 'orange' ? 'icon-orange' : 'icon-green';
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var doneToday = h.logs && h.logs[todayStr];

    var html = '<div class="card habit-card" data-action="toggle-habit" data-id="' + h.id + '">';
    html += '<div class="habit-header">';
    html += '<div class="habit-icon ' + iconClass + '"><i class="fas ' + escapeHtml(h.icon) + '"></i></div>';
    html += escapeHtml(h.name);
    html += '</div>';
    html += '<div class="circle-container">';
    html += '<svg class="circle-svg" viewBox="0 0 100 100">';
    html += '<circle class="circle-bg" cx="50" cy="50" r="42"/>';

    if (isStreakOff) {
        var circleColor = doneToday ? 'var(--green)' : '#555';
        var fullOffset = circumference * (1 - (doneToday ? 1 : 0.06));
        html += '<circle class="circle-progress" style="stroke: ' + circleColor + '; stroke-dasharray: ' + circumference + '; stroke-dashoffset: ' + fullOffset + ';" cx="50" cy="50" r="42"/>';
    } else {
        var ratio = h.target > 0 ? Math.min(1, h.streak_current / h.target) : 0;
        var offset = circumference * (1 - ratio);
        html += '<circle class="circle-progress" style="stroke: ' + colorVar + '; stroke-dasharray: ' + circumference + '; stroke-dashoffset: ' + offset + ';" cx="50" cy="50" r="42"/>';
    }

    html += '</svg>';
    html += '<div class="circle-text">';

    if (isStreakOff) {
        if (doneToday) {
            html += '<span class="circle-value" style="color: var(--green);"><i class="fas fa-check"></i></span>';
        } else {
            html += '<span class="circle-value" style="color: ' + colorVar + '; opacity: 0.4; font-size: 18px;"><i class="fas fa-circle"></i></span>';
        }
        html += '<span class="circle-unit">Серия откл.</span>';
    } else {
        html += '<span class="circle-value" style="color: ' + colorVar + ';">' + h.streak_current + '</span>';
        html += '<span class="circle-unit">' + (isAnti ? 'дней' : getStreakText(h.streak_current).split(' ').slice(1).join(' ') || 'дней') + '</span>';
    }

    html += '</div></div>';

    html += '<div class="habit-footer">';
    html += 'Последнее: <strong>' + getRelativeDay(h.last_completed) + '</strong><br>';
    if (isAnti && h.rule) {
        html += 'Правило: ' + escapeHtml(h.rule);
    } else {
        html += 'Окно: ' + h.window + ' ' + (h.window === 1 ? 'день' : (h.window >= 2 && h.window <= 4) ? 'дня' : 'дней');
    }
    html += '</div></div>';
    return html;
}

// ===== PAGE: HABITS =====

function renderHabitsPage() {
    var habits = state.habits || [];
    var habitList = habits.filter(function(h) { return h.type === 'habit'; });
    var antiList = habits.filter(function(h) { return h.type === 'antihabit'; });

    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<h2 style="font-size:20px;font-weight:600;">Привычки</h2>';
    html += '<button class="btn btn-primary" data-action="add-habit"><i class="fas fa-plus"></i> Добавить</button>';
    html += '</div>';

    html += '<div class="tab-bar" id="habits-tabs">';
    html += '<button class="tab-btn active" data-tab="habits">Привычки</button>';
    html += '<button class="tab-btn" data-tab="antihabits">Антипривычки</button>';
    html += '</div>';

    html += '<div id="habits-tab-content">';

    // Habits tab
    html += '<div id="tab-habits" class="habits-tab-panel">';
    if (habitList.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-list-check"></i><p>Пока нет привычек. Нажмите "Добавить" чтобы создать.</p></div>';
    } else {
        for (var i = 0; i < habitList.length; i++) {
            html += renderHabitListItem(habitList[i]);
        }
    }
    html += '</div>';

    // Antihabits tab (hidden)
    html += '<div id="tab-antihabits" class="habits-tab-panel" style="display:none;">';
    if (antiList.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-list-check"></i><p>Пока нет антипривычек. Нажмите "Добавить" чтобы создать.</p></div>';
    } else {
        for (var j = 0; j < antiList.length; j++) {
            html += renderHabitListItem(antiList[j]);
        }
    }
    html += '</div>';

    html += '</div>';

    // Wrap sections
    var fullHtml = '<div class="page-section" id="page-home"></div>';
    fullHtml += '<div class="page-section active" id="page-habits">' + html + '</div>';
    fullHtml += '<div class="page-section" id="page-history"></div>';
    fullHtml += '<div class="page-section" id="page-stats"></div>';
    fullHtml += '<div class="page-section" id="page-settings"></div>';

    var main = document.getElementById('main-content');
    main.innerHTML = fullHtml;
    main.scrollTop = state._scrollTop || 0;
}

function renderHabitListItem(h) {
    var iconBg = h.color === 'red' ? 'rgba(244,67,54,0.15)' : h.color === 'orange' ? 'rgba(255,152,0,0.15)' : 'rgba(76,175,80,0.15)';
    var iconClr = h.color === 'red' ? 'var(--red)' : h.color === 'orange' ? 'var(--orange)' : 'var(--green)';

    var html = '<div class="habit-list-item" style="margin-bottom:8px;">';
    html += '<div class="habit-list-icon" style="background:' + iconBg + ';color:' + iconClr + ';">';
    html += '<i class="fas ' + escapeHtml(h.icon) + '"></i></div>';
    html += '<div class="habit-list-info">';
    html += '<div class="habit-list-name">' + escapeHtml(h.name) + '</div>';
    html += '<div class="habit-list-meta">';
    if (h.track_streak === false) {
        html += 'Серия отключена · ';
    } else {
        html += 'Серия: ' + h.streak_current + ' / ' + h.target + ' · ';
    }
    html += 'Окно: ' + h.window + ' · ';
    html += 'Выполнение: ' + h.completion_rate + '%';
    if (h.rule) html += ' · Правило: ' + escapeHtml(h.rule);
    html += '</div></div>';
    html += '<div class="habit-list-actions">';
    html += '<button class="btn-icon" data-action="toggle-habit" data-id="' + h.id + '" title="Отметить сегодня"><i class="fas fa-check"></i></button>';
    html += '<button class="btn-icon" data-action="edit-habit" data-id="' + h.id + '" title="Редактировать"><i class="fas fa-pen"></i></button>';
    html += '<button class="btn-icon" data-action="delete-habit" data-id="' + h.id + '" title="Удалить"><i class="fas fa-trash"></i></button>';
    html += '</div></div>';
    return html;
}

function openHabitModal(habit) {
    var isEdit = !!habit;
    var title = isEdit ? 'Редактировать привычку' : 'Новая привычка';
    var h = habit || {};

    var icons = [
        'fa-arrow-trend-up','fa-dumbbell','fa-book-open','fa-spa','fa-bolt','fa-wallet',
        'fa-ban','fa-brain','fa-code','fa-music','fa-running','fa-apple-whole',
        'fa-glass-water','fa-bed','fa-shower','fa-pen','fa-camera','fa-palette',
        'fa-guitar','fa-om','fa-mug-hot','fa-leaf','fa-heart','fa-fire',
        'fa-sun','fa-moon','fa-cloud','fa-dove','fa-fish','fa-tree'
    ];

    var html = '<div class="modal-title">' + title + '</div>';
    html += '<form id="habit-form">';

    html += '<div class="form-group"><label>Название</label>';
    html += '<input class="form-input" name="name" value="' + escapeHtml(h.name || '') + '" required placeholder="Название привычки"></div>';

    html += '<div class="form-group"><label>Иконка</label>';
    html += '<select class="form-select" name="icon">';
    for (var i = 0; i < icons.length; i++) {
        var sel = (h.icon === icons[i]) ? ' selected' : '';
        html += '<option value="' + icons[i] + '"' + sel + '><i class="fas ' + icons[i] + '"></i> ' + icons[i] + '</option>';
    }
    html += '</select></div>';

    html += '<div class="form-group"><label>Тип</label>';
    html += '<select class="form-select" name="type">';
    html += '<option value="habit"' + (h.type === 'habit' ? ' selected' : '') + '>Привычка</option>';
    html += '<option value="antihabit"' + (h.type === 'antihabit' ? ' selected' : '') + '>Антипривычка</option>';
    html += '</select></div>';

    html += '<div class="form-group"><label>Цвет</label>';
    html += '<select class="form-select" name="color">';
    html += '<option value="green"' + (h.color === 'green' ? ' selected' : '') + '>Зелёный</option>';
    html += '<option value="orange"' + (h.color === 'orange' ? ' selected' : '') + '>Оранжевый</option>';
    html += '<option value="red"' + (h.color === 'red' ? ' selected' : '') + '>Красный</option>';
    html += '</select></div>';

    html += '<div class="form-group"><label>Цель (серия)</label>';
    html += '<input class="form-input" name="target" type="number" min="1" value="' + (h.target || 30) + '"></div>';

    html += '<div class="form-group"><label>Окно (дни)</label>';
    html += '<input class="form-input" name="window" type="number" min="1" value="' + (h.window || 3) + '"></div>';

    html += '<div class="form-group"><label>';
    html += '<input type="checkbox" name="track_streak" value="1"' + (h.track_streak !== false ? ' checked' : '') + ' style="margin-right:8px;">';
    html += 'Отслеживать серию</label></div>';

    html += '<div class="form-group" id="rule-group" style="' + (h.type === 'antihabit' ? '' : 'display:none;') + '"><label>Правило</label>';
    html += '<input class="form-input" name="rule" value="' + escapeHtml(h.rule || '') + '" placeholder="Например: не 2 дня подряд"></div>';

    html += '<div style="display:flex;gap:8px;margin-top:20px;">';
    html += '<button type="submit" class="btn btn-primary" style="flex:1;">' + (isEdit ? 'Сохранить' : 'Создать') + '</button>';
    html += '<button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>';
    html += '</div>';
    html += '</form>';

    openModal(html);

    // Show/hide rule field based on type
    var typeSelect = document.querySelector('#habit-form select[name="type"]');
    typeSelect.addEventListener('change', function() {
        document.getElementById('rule-group').style.display = this.value === 'antihabit' ? '' : 'none';
    });

    // Submit
    document.getElementById('habit-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var fd = new FormData(this);
        var data = {
            name: fd.get('name'),
            icon: fd.get('icon'),
            type: fd.get('type'),
            color: fd.get('color'),
            target: parseInt(fd.get('target')) || 30,
            window: parseInt(fd.get('window')) || 3,
            track_streak: fd.get('track_streak') === '1'
        };
        if (data.type === 'antihabit' && fd.get('rule')) {
            data.rule = fd.get('rule');
        }

        try {
            if (isEdit) {
                await API.put('/habits/' + h.id, data);
                showToast('Привычка обновлена');
            } else {
                await API.post('/habits', data);
                showToast('Привычка создана');
            }
            closeModal();
            await loadDashboard();
            renderHabitsPage();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        }
    });
}

// ===== PAGE: HISTORY =====

function renderHistoryPage() {
    var scores = state.monthlyScores || {};
    var stats = state.stats || {};

    var html = '<h2 style="font-size:20px;font-weight:600;">История</h2>';

    // Full calendar
    html += '<div class="card">';
    html += '<div class="section-title">КАЛЕНДАРЬ</div>';
    html += buildCalendarGrid(scores);
    html += '</div>';

    // Recent entries table
    html += '<div class="card">';
    html += '<div class="section-title">НЕДАВНИЕ ЗАПИСИ</div>';

    var weightHist = stats.weight_history || [];
    var moodHist = stats.mood_history || [];
    var prodHist = stats.productivity_history || [];

    // Merge all dates
    var allDates = {};
    weightHist.forEach(function(w) { allDates[w.date] = { weight: w.weight }; });
    moodHist.forEach(function(m) { if (!allDates[m.date]) allDates[m.date] = {}; allDates[m.date].mood = m.mood; });
    prodHist.forEach(function(p) { if (!allDates[p.date]) allDates[p.date] = {}; allDates[p.date].productivity = p.productivity; });

    var dates = Object.keys(allDates).sort().reverse().slice(0, 30);

    if (dates.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-calendar-xmark"></i><p>Нет записей</p></div>';
    } else {
        html += '<div style="overflow-x:auto;">';
        html += '<table class="history-table">';
        html += '<thead><tr>';
        html += '<th>Дата</th><th>Настроение</th><th>Продуктивность</th><th>Вес</th>';
        html += '</tr></thead><tbody>';

        for (var i = 0; i < dates.length; i++) {
            var d = dates[i];
            var en = allDates[d];
            html += '<tr>';
            html += '<td>' + formatDate(d) + '</td>';
            html += '<td>' + renderStars(en.mood || 0) + '</td>';
            html += '<td>' + renderStars(en.productivity || 0) + '</td>';
            html += '<td>' + (en.weight ? en.weight + ' кг' : '—') + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';
    }

    html += '</div>';

    // Wrap sections
    var fullHtml = '<div class="page-section" id="page-home"></div>';
    fullHtml += '<div class="page-section" id="page-habits"></div>';
    fullHtml += '<div class="page-section active" id="page-history">' + html + '</div>';
    fullHtml += '<div class="page-section" id="page-stats"></div>';
    fullHtml += '<div class="page-section" id="page-settings"></div>';

    var main = document.getElementById('main-content');
    main.innerHTML = fullHtml;
    main.scrollTop = state._scrollTop || 0;
}

// ===== PAGE: STATS =====

function renderStatsPage() {
    var stats = state.stats || {};
    var habits = state.habits || [];

    var html = '<h2 style="font-size:20px;font-weight:600;">Статистика</h2>';

    // Charts grid
    html += '<div class="stats-grid">';

    // Weight chart
    html += '<div class="card">';
    var weightData = (stats.weight_history || []).map(function(w) {
        var d = new Date(w.date + 'T00:00:00');
        return { value: w.weight, label: d.getDate() + ' ' + MONTHS_RU[d.getMonth()] };
    });
    html += buildSvgChart(weightData, 'var(--green)', 'Вес', 'кг');
    html += '</div>';

    // Mood chart
    html += '<div class="card">';
    var moodData = (stats.mood_history || []).map(function(m) {
        var d = new Date(m.date + 'T00:00:00');
        return { value: m.mood, label: d.getDate() + ' ' + MONTHS_RU[d.getMonth()] };
    });
    html += buildSvgChart(moodData, 'var(--purple)', 'Настроение', '/5');
    html += '</div>';

    // Productivity chart
    html += '<div class="card">';
    var prodData = (stats.productivity_history || []).map(function(p) {
        var d = new Date(p.date + 'T00:00:00');
        return { value: p.productivity, label: d.getDate() + ' ' + MONTHS_RU[d.getMonth()] };
    });
    html += buildSvgChart(prodData, 'var(--blue)', 'Продуктивность', '/5');
    html += '</div>';

    // Completion rates
    html += '<div class="card">';
    html += '<div class="chart-header"><span>Выполнение</span><span style="color:var(--text-muted);">%</span></div>';
    var compRates = stats.habit_completion_rates || [];
    if (compRates.length > 0) {
        var compData = compRates.map(function(c) {
            return { value: c.completion_rate, label: c.name };
        });
        html += buildSvgChart(compData, 'var(--orange)', '', '');
    } else {
        html += '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:13px;">Нет данных</div>';
    }
    html += '</div>';

    html += '</div>'; // stats-grid

    // Streak list
    html += '<div class="card">';
    html += '<div class="section-title">СЕРИИ И ВЫПОЛНЕНИЕ</div>';
    html += '<div class="streak-list">';

    var compRates = (stats.habit_completion_rates || []).filter(function(cr) {
        return cr.streak_current > 0 || cr.streak_best > 0 || cr.completion_rate > 0;
    });
    if (compRates.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-chart-line"></i><p>Нет данных</p></div>';
    } else {
        for (var i = 0; i < compRates.length; i++) {
            var cr = compRates[i];
            var hObj = habits.find(function(h) { return h.id === cr.id; });
            var hIcon = hObj ? hObj.icon : 'fa-star';
            var hClr = cr.type === 'antihabit' ? 'var(--red)' : 'var(--green)';

            html += '<div class="streak-item">';
            html += '<div style="display:flex;align-items:center;gap:10px;">';
            html += '<i class="fas ' + escapeHtml(hIcon) + '" style="color:' + hClr + ';"></i>';
            html += '<div class="streak-item-name">' + escapeHtml(cr.name) + '</div>';
            html += '</div>';
            html += '<div class="streak-item-stats">';
            html += '<div>Текущая: <span class="streak-val">' + cr.streak_current + '</span></div>';
            html += '<div>Лучшая: <span class="streak-val">' + cr.streak_best + '</span></div>';
            html += '<div>Выполнение: <span class="streak-val">' + cr.completion_rate + '%</span></div>';
            html += '</div></div>';
        }
    }

    html += '</div></div>';

    // Wrap sections
    var fullHtml = '<div class="page-section" id="page-home"></div>';
    fullHtml += '<div class="page-section" id="page-habits"></div>';
    fullHtml += '<div class="page-section" id="page-history"></div>';
    fullHtml += '<div class="page-section active" id="page-stats">' + html + '</div>';
    fullHtml += '<div class="page-section" id="page-settings"></div>';

    var main = document.getElementById('main-content');
    main.innerHTML = fullHtml;
    main.scrollTop = state._scrollTop || 0;
}

// ===== PAGE: SETTINGS =====

function renderSettingsPage() {
    var u = state.user || { level: 0, xp: 0, xp_needed: 1, multiplier: 1, multiplier_days_to_next: 0 };
    var xpPct = u.xp_needed > 0 ? Math.round((u.xp / u.xp_needed) * 100) : 0;

    var html = '<h2 style="font-size:20px;font-weight:600;">Настройки</h2>';

    // User profile
    html += '<div class="settings-group">';
    html += '<div class="settings-group-title"><i class="fas fa-user" style="color:var(--purple);"></i> Профиль</div>';
    html += '<div class="settings-item"><span style="color:var(--text-muted);">Уровень</span><span style="font-weight:600;font-size:18px;color:var(--purple);">' + u.level + '</span></div>';
    html += '<div class="settings-item"><span style="color:var(--text-muted);">Опыт (XP)</span><span>' + u.xp + ' / ' + u.xp_needed + ' (' + xpPct + '%)</span></div>';
    html += '<div style="margin-top:12px;">';
    html += '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + xpPct + '%;"></div></div>';
    html += '</div>';
    html += '</div>';

    // Multiplier
    html += '<div class="settings-group">';
    html += '<div class="settings-group-title"><i class="fas fa-bolt" style="color:var(--orange);"></i> Множитель</div>';
    html += '<div class="settings-item"><span style="color:var(--text-muted);">Текущий множитель</span><span style="font-weight:600;font-size:18px;color:var(--orange);">x' + u.multiplier + '</span></div>';
    html += '<div class="settings-item"><span style="color:var(--text-muted);">Дней до следующего уровня</span><span>' + u.multiplier_days_to_next + ' дней</span></div>';
    html += '</div>';

    // Export
    html += '<div class="settings-group">';
    html += '<div class="settings-group-title"><i class="fas fa-download" style="color:var(--green);"></i> Данные</div>';
    html += '<div class="settings-item">';
    html += '<div><div style="font-weight:500;">Экспорт данных</div><div style="font-size:12px;color:var(--text-muted);">Скачать все данные в формате JSON</div></div>';
    html += '<button class="btn btn-primary" data-action="export-data"><i class="fas fa-download"></i> Экспорт</button>';
    html += '</div>';
    html += '<div class="settings-item">';
    html += '<div><div style="font-weight:500;">Сбросить данные</div><div style="font-size:12px;color:var(--text-muted);">Очистить дневник и логи привычек</div></div>';
    html += '<button class="btn btn-danger" data-action="reset-data"><i class="fas fa-trash"></i> Сбросить</button>';
    html += '</div>';
    html += '</div>';

    // Theme
    html += '<div class="settings-group">';
    html += '<div class="settings-group-title"><i class="fas fa-palette" style="color:var(--blue);"></i> Тема</div>';
    html += '<div class="settings-item"><span style="color:var(--text-muted);">Текущая тема</span><span>Тёмная</span></div>';
    html += '</div>';

    // Wrap sections
    var fullHtml = '<div class="page-section" id="page-home"></div>';
    fullHtml += '<div class="page-section" id="page-habits"></div>';
    fullHtml += '<div class="page-section" id="page-history"></div>';
    fullHtml += '<div class="page-section" id="page-stats"></div>';
    fullHtml += '<div class="page-section active" id="page-settings">' + html + '</div>';

    var main = document.getElementById('main-content');
    main.innerHTML = fullHtml;
    main.scrollTop = state._scrollTop || 0;
}

// ===== EVENT HANDLERS =====

// Sidebar navigation
document.querySelector('.nav-menu').addEventListener('click', function(e) {
    var item = e.target.closest('.nav-item');
    if (!item) return;
    e.preventDefault();
    var page = item.getAttribute('data-page');
    if (page) navigateTo(page);
});

// FAB button
document.getElementById('fab-add').addEventListener('click', function() {
    openHabitModal(null);
});

// Delegated click handler for main content
document.getElementById('main-content').addEventListener('click', async function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;

    var action = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');

    switch (action) {
        case 'toggle-habit':
            if (!id) return;
            try {
                var result = await API.put('/habits/' + id + '/toggle');
                var habit = result.habit;
                var habitName = habit.name || 'Привычка';
                state.user = result.user;
                var today = new Date();
                var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
                if (habit.type === 'antihabit') {
                    if (habit.logs && habit.logs[todayStr]) {
                        showToast(habitName + ' — нарушение отмечено', 'error');
                    } else {
                        showToast(habitName + ' — нарушение отменено');
                    }
                } else {
                    if (habit.logs && habit.logs[todayStr]) {
                        showToast(habitName + ' — выполнена! +' + result.xp_gained + ' XP');
                    } else {
                        showToast(habitName + ' — отменена, ' + result.xp_gained + ' XP');
                    }
                }
                await loadDashboard();
                navigateTo(state.currentPage);
            } catch (err) {
                showToast('Ошибка: ' + err.message, 'error');
            }
            break;

        case 'edit-habit':
            if (!id) return;
            var habit = state.habits.find(function(h) { return h.id === parseInt(id); });
            if (habit) openHabitModal(habit);
            break;

        case 'delete-habit':
            if (!id) return;
            var habit = state.habits.find(function(h) { return h.id === parseInt(id); });
            var name = habit ? habit.name : 'привычка';
            openModal(
                '<div class="modal-title">Удалить привычку?</div>' +
                '<p style="color:var(--text-muted);margin-bottom:20px;">Вы уверены, что хотите удалить "' + escapeHtml(name) + '"? Это действие нельзя отменить.</p>' +
                '<div style="display:flex;gap:8px;">' +
                '<button class="btn btn-danger" style="flex:1;" data-action="confirm-delete" data-id="' + id + '"><i class="fas fa-trash"></i> Удалить</button>' +
                '<button class="btn btn-secondary" onclick="closeModal()">Отмена</button>' +
                '</div>'
            );
            break;

        case 'add-habit':
            openHabitModal(null);
            break;

        case 'set-mood':
            var val = parseInt(target.getAttribute('data-value'));
            try {
                var res = await API.put('/daily', { mood: val });
                state.todayEntry = res.entry;
                state.user = res.user;
                showToast('Настроение: ' + val + ' / 5' + (res.xp_gained ? ' +' + res.xp_gained + ' XP' : ''));
                navigateTo(state.currentPage);
            } catch (err) {
                showToast('Ошибка: ' + err.message, 'error');
            }
            break;

        case 'set-productivity':
            var val2 = parseInt(target.getAttribute('data-value'));
            try {
                var res2 = await API.put('/daily', { productivity: val2 });
                state.todayEntry = res2.entry;
                state.user = res2.user;
                showToast('Продуктивность: ' + val2 + ' / 5' + (res2.xp_gained ? ' +' + res2.xp_gained + ' XP' : ''));
                navigateTo(state.currentPage);
            } catch (err) {
                showToast('Ошибка: ' + err.message, 'error');
            }
            break;

        case 'edit-weight':
            var currentWeight = (state.todayEntry && state.todayEntry.weight) || 0;
            var display = document.getElementById('weight-display');
            if (display && !display.querySelector('input')) {
                display.innerHTML = '<input class="inline-edit" id="weight-input" type="number" step="0.1" min="20" max="300" value="' + currentWeight + '">';
                var input = document.getElementById('weight-input');
                input.focus();
                input.select();
                input.addEventListener('blur', saveWeight);
                input.addEventListener('keydown', function(ev) {
                    if (ev.key === 'Enter') saveWeight();
                    if (ev.key === 'Escape') { navigateTo(state.currentPage); }
                });
            }
            break;

        case 'export-data':
            try {
                var data = await API.get('/dashboard');
                var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'habits-export-' + new Date().toISOString().slice(0, 10) + '.json';
                a.click();
                URL.revokeObjectURL(url);
                showToast('Данные экспортированы');
            } catch (err) {
                showToast('Ошибка экспорта: ' + err.message, 'error');
            }
            break;

        case 'reset-data':
            openModal(
                '<div class="modal-title">Сбросить данные?</div>' +
                '<p style="color:var(--text-muted);margin-bottom:20px;">Все дневниковые записи и логи привычек будут удалены. Привычки останутся.</p>' +
                '<div style="display:flex;gap:8px;">' +
                '<button class="btn btn-danger" style="flex:1;" data-action="confirm-reset"><i class="fas fa-trash"></i> Сбросить</button>' +
                '<button class="btn btn-secondary" onclick="closeModal()">Отмена</button>' +
                '</div>'
            );
            break;

    }
});

function saveWeight() {
    var input = document.getElementById('weight-input');
    if (!input) return;
    var val = parseFloat(input.value);
    if (isNaN(val) || val < 20 || val > 300) {
        showToast('Введите корректный вес (20-300)', 'error');
        return;
    }
    API.put('/daily', { weight: val }).then(function(res) {
        state.todayEntry = res.entry;
        state.user = res.user;
        showToast('Вес обновлён: ' + val + ' кг');
        navigateTo(state.currentPage);
    }).catch(function(err) {
        showToast('Ошибка: ' + err.message, 'error');
    });
}

// Habits page tab switching
document.getElementById('main-content').addEventListener('click', function(e) {
    var tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    var tab = tabBtn.getAttribute('data-tab');
    if (!tab) return;

    var tabs = document.querySelectorAll('#habits-tabs .tab-btn');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    tabBtn.classList.add('active');

    var panels = document.querySelectorAll('.habits-tab-panel');
    for (var j = 0; j < panels.length; j++) {
        panels[j].style.display = 'none';
    }
    var targetPanel = document.getElementById('tab-' + tab);
    if (targetPanel) targetPanel.style.display = '';
});

// ===== INIT =====

(function init() {
    // Read hash for initial page
    var hash = window.location.hash.replace('#', '') || 'home';
    var validPages = ['home', 'habits', 'history', 'stats', 'settings'];
    if (validPages.indexOf(hash) === -1) hash = 'home';

    navigateTo(hash);
})();

// Handle hash changes
window.addEventListener('hashchange', function() {
    var hash = window.location.hash.replace('#', '') || 'home';
    var validPages = ['home', 'habits', 'history', 'stats', 'settings'];
    if (validPages.indexOf(hash) === -1) hash = 'home';
    if (hash !== state.currentPage) {
        navigateTo(hash);
    }
});
