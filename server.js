const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Путь к файлу данных
const DATA_PATH = path.join(__dirname, 'data.json');

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Вспомогательные функции для чтения/записи данных ---

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Ошибка чтения data.json:', err.message);
    throw err;
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Ошибка записи data.json:', err.message);
    throw err;
  }
}

// Получить строку сегодняшней даты в формате YYYY-MM-DD
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Найти последнюю запись в daily_entries
function findLatestEntry(data) {
  const dates = Object.keys(data.daily_entries).sort().reverse();
  return dates.length > 0 ? dates[0] : null;
}

// --- API Маршруты ---

// GET /api/dashboard — агрегированные данные для главной страницы
app.get('/api/dashboard', (req, res) => {
  try {
    const data = readData();
    const today = getToday();
    const latestDate = findLatestEntry(data);

    // Auto-recalculate anti-habit streaks
    for (var hi = 0; hi < data.habits.length; hi++) {
      var h = data.habits[hi];
      if (h.type === 'antihabit' && h.track_streak !== false) {
        recalcAntiStreak(h);
      }
    }

    // Recalculate today's monthly score to keep calendar in sync
    var monthKey = today.substring(0, 7);
    var dayIndex = parseInt(today.substring(8, 10), 10) - 1;
    if (!data.monthly_scores[monthKey]) {
      data.monthly_scores[monthKey] = [];
    }
    var dailyScore = 0;
    for (var hi2 = 0; hi2 < data.habits.length; hi2++) {
      var hb = data.habits[hi2];
      if (hb.logs && hb.logs[today]) {
        if (hb.type === 'antihabit') {
          dailyScore -= 1;
        } else {
          dailyScore += 1;
        }
      }
    }
    data.monthly_scores[monthKey][dayIndex] = dailyScore;

    // Сегодняшняя запись или последняя доступная
    let todayEntry = data.daily_entries[today] || null;
    if (!todayEntry && latestDate) {
      todayEntry = data.daily_entries[latestDate];
    }

    res.json({
      user: data.user,
      habits: data.habits,
      today_entry: todayEntry,
      today_date: todayEntry ? (data.daily_entries[today] ? today : latestDate) : null,
      monthly_scores: data.monthly_scores
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при загрузке дашборда', details: err.message });
  }
});

// GET /api/habits — список привычек (с фильтрацией по типу)
app.get('/api/habits', (req, res) => {
  try {
    const data = readData();
    const { type } = req.query;

    let habits = data.habits;
    if (type) {
      habits = habits.filter(h => h.type === type);
    }

    res.json(habits);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при загрузке привычек', details: err.message });
  }
});

// GET /api/habits/:id — одна привычка по ID
app.get('/api/habits/:id', (req, res) => {
  try {
    const data = readData();
    const id = parseInt(req.params.id, 10);
    const habit = data.habits.find(h => h.id === id);

    if (!habit) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера', details: err.message });
  }
});

function recalcAntiStreak(habit) {
  var today = getToday();
  var logs = habit.logs || {};
  var allDates = Object.keys(logs).sort();

  // No violations at all → streak is 0 (nothing to be clean from yet)
  if (allDates.length === 0) {
    habit.streak_current = 0;
    return;
  }

  var streak = 0;
  var cursor = new Date(today + 'T00:00:00');
  var foundConsecutive = false;

  // Floor: stop counting before the first violation
  var floorDate = null;
  if (habit.created_at) {
    floorDate = new Date(habit.created_at + 'T00:00:00');
  } else {
    // Fallback: use earliest log date if no created_at
    floorDate = new Date(allDates[0] + 'T00:00:00');
  }

  while (!foundConsecutive) {
    var dateStr = cursor.getFullYear() + '-' +
        String(cursor.getMonth() + 1).padStart(2, '0') + '-' +
        String(cursor.getDate()).padStart(2, '0');

    // Stop if we've gone before the habit was created
    if (cursor < floorDate) break;

    if (logs[dateStr]) {
      // This day has a violation
      var prevDay = new Date(cursor);
      prevDay.setDate(prevDay.getDate() - 1);
      var prevStr = prevDay.getFullYear() + '-' +
          String(prevDay.getMonth() + 1).padStart(2, '0') + '-' +
          String(prevDay.getDate()).padStart(2, '0');

      if (logs[prevStr]) {
        // Two consecutive violations found — stop
        foundConsecutive = true;
      }
      // Else: isolated violation, skip this day and continue
    } else {
      // Clean day
      streak++;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  habit.streak_current = streak;
  if (streak > habit.streak_best) {
    habit.streak_best = streak;
  }
}

// PUT /api/habits/:id/toggle — переключить выполнение привычки за сегодня
app.put('/api/habits/:id/toggle', (req, res) => {
  try {
    const data = readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const habit = data.habits[habitIndex];
    const today = getToday();

    // Инициализировать logs если не существует
    if (!habit.logs) {
      habit.logs = {};
    }

    var xpGained = 0;

    if (habit.type === 'antihabit') {
      // Anti-habit: logs[today] = VIOLATION (did the bad thing)
      if (habit.logs[today]) {
        // Already violated today — remove violation (undo)
        delete habit.logs[today];
        habit.last_completed = null;
      } else {
        // Mark violation
        habit.logs[today] = { completed: true, timestamp: new Date().toISOString() };
        habit.last_completed = today;
      }

      // Recalculate streak for anti-habit (if tracking is on)
      if (habit.track_streak !== false) {
        recalcAntiStreak(habit);
      }
    } else {
      var isUndo = !!habit.logs[today];
      if (isUndo) {
        // Уже выполнена сегодня — отменяем
        delete habit.logs[today];
        if (habit.track_streak !== false) {
          habit.streak_current = Math.max(0, habit.streak_current - 1);
        }
        // Отнимаем XP, которые были начислены за выполнение
        var xpToRemove = Math.round(5 * data.user.multiplier);
        data.user.xp = Math.max(0, data.user.xp - xpToRemove);
        xpGained = -xpToRemove;
      } else {
        // Отмечаем как выполненную
        habit.logs[today] = { completed: true, timestamp: new Date().toISOString() };
        if (habit.track_streak !== false) {
          habit.streak_current += 1;

          // Обновляем лучшую серию если текущая больше
          if (habit.streak_current > habit.streak_best) {
            habit.streak_best = habit.streak_current;
          }

          // Обновляем дату последнего выполнения
          habit.last_completed = today;
        } else {
          // Обновляем дату последнего выполнения даже если серия отключена
          habit.last_completed = today;
        }

        // Начисляем XP за выполнение привычки
        var baseXp = 5;
        xpGained = Math.round(baseXp * data.user.multiplier);
        data.user.xp += xpGained;

        // Проверка повышения уровня
        while (data.user.xp >= data.user.xp_needed) {
          data.user.xp -= data.user.xp_needed;
          data.user.level += 1;
          data.user.xp_needed = Math.round(data.user.xp_needed * 1.15);
        }
      }
    }

    // Пересчитать процент выполнения
    var totalDays;
    if (habit.type === 'antihabit') {
      // Anti-habit: completion = % of clean days since first log or creation
      var logDates = Object.keys(habit.logs).sort();
      if (logDates.length > 0) {
        var firstLog = new Date(logDates[0] + 'T00:00:00');
        var lastCheck = new Date(today + 'T00:00:00');
        totalDays = Math.max(1, Math.ceil((lastCheck - firstLog) / (1000 * 60 * 60 * 24)) + 1);
        var violationCount = Object.keys(habit.logs).length;
        var cleanDays = totalDays - violationCount;
        habit.completion_rate = Math.round((cleanDays / totalDays) * 100);
      } else {
        habit.completion_rate = 100; // No violations = 100% clean
      }
    } else {
      // Regular habit: existing logic
      var totalLogs = Object.keys(habit.logs).length;
      var logDates = Object.keys(habit.logs).sort();
      var totalDaysReg = 30;
      if (logDates.length > 0) {
        var firstLog = new Date(logDates[0]);
        var lastLog = new Date(today);
        var diffTime = Math.abs(lastLog - firstLog);
        totalDaysReg = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
      }
      habit.completion_rate = Math.round((totalLogs / totalDaysReg) * 100);
    }

    // Сохраняем изменения
    data.habits[habitIndex] = habit;

    // Update monthly_scores for today's calendar heatmap
    var monthKey = today.substring(0, 7); // "YYYY-MM"
    var dayIndex = parseInt(today.substring(8, 10), 10) - 1;
    if (!data.monthly_scores[monthKey]) {
      data.monthly_scores[monthKey] = [];
    }
    // Recalculate today's net score from all habits
    var dailyScore = 0;
    for (var hi = 0; hi < data.habits.length; hi++) {
      var hb = data.habits[hi];
      if (hb.logs && hb.logs[today]) {
        if (hb.type === 'antihabit') {
          dailyScore -= 1; // Violation of anti-habit
        } else {
          dailyScore += 1; // Completed habit
        }
      }
    }
    data.monthly_scores[monthKey][dayIndex] = dailyScore;

    writeData(data);

    res.json({ habit: habit, xp_gained: xpGained, user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при переключении привычки', details: err.message });
  }
});

// PUT /api/habits/:id — обновить привычку
app.put('/api/habits/:id', (req, res) => {
  try {
    const data = readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const allowedFields = ['name', 'icon', 'type', 'color', 'target', 'window', 'rule', 'track_streak'];
    const updates = req.body;

    // Проверка на валидность тела запроса
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        data.habits[habitIndex][key] = updates[key];
      }
    }

    writeData(data);

    res.json(data.habits[habitIndex]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при обновлении привычки', details: err.message });
  }
});

// POST /api/habits — создать новую привычку
app.post('/api/habits', (req, res) => {
  try {
    const data = readData();
    const { name, icon, type, color, target, window, rule, track_streak } = req.body;

    // Валидация обязательных полей
    if (!name) {
      return res.status(400).json({ error: 'Поле "name" обязательно' });
    }
    if (!type || !['habit', 'antihabit'].includes(type)) {
      return res.status(400).json({ error: 'Поле "type" должно быть "habit" или "antihabit"' });
    }

    // Генерация нового ID
    const maxId = data.habits.reduce((max, h) => Math.max(max, h.id), 0);
    const newId = maxId + 1;

    const newHabit = {
      id: newId,
      name: name,
      icon: icon || 'fa-star',
      type: type,
      color: color || (type === 'habit' ? 'green' : 'red'),
      target: target || 30,
      window: window || 3,
      track_streak: track_streak !== false,
      created_at: getToday(),
      streak_current: 0,
      streak_best: 0,
      last_completed: null,
      completion_rate: 0,
      logs: {}
    };

    if (type === 'antihabit' && rule) {
      newHabit.rule = rule;
    }

    data.habits.push(newHabit);
    writeData(data);

    res.status(201).json(newHabit);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при создании привычки', details: err.message });
  }
});

// DELETE /api/habits/:id — удалить привычку
app.delete('/api/habits/:id', (req, res) => {
  try {
    const data = readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const deleted = data.habits.splice(habitIndex, 1)[0];
    writeData(data);

    res.json({ message: `Привычка "${deleted.name}" удалена`, habit: deleted });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при удалении привычки', details: err.message });
  }
});

// PUT /api/daily — обновить запись за сегодня
app.put('/api/daily', (req, res) => {
  try {
    const data = readData();
    const today = getToday();
    const { mood, productivity, weight } = req.body;

    // Валидация тела запроса
    if (req.body && typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

    // Инициализируем запись за сегодня или берём существующую
    let entry = data.daily_entries[today] || {};

    if (mood !== undefined) {
      if (typeof mood !== 'number' || mood < 1 || mood > 5) {
        return res.status(400).json({ error: 'Настроение должно быть числом от 1 до 5' });
      }
      entry.mood = mood;
    }

    if (productivity !== undefined) {
      if (typeof productivity !== 'number' || productivity < 1 || productivity > 5) {
        return res.status(400).json({ error: 'Продуктивность должна быть числом от 1 до 5' });
      }
      entry.productivity = productivity;
    }

    if (weight !== undefined) {
      if (typeof weight !== 'number' || weight < 20 || weight > 300) {
        return res.status(400).json({ error: 'Вес должен быть числом от 20 до 300' });
      }
      entry.weight = weight;
    }

    data.daily_entries[today] = entry;

    // Если настроение или продуктивность >= 4, начисляем XP
    const baseXp = ((mood !== undefined && mood >= 4) ? 10 : 0) +
                    ((productivity !== undefined && productivity >= 4) ? 10 : 0);
    const xpGain = Math.round(baseXp * data.user.multiplier);
    if (xpGain > 0) {
      data.user.xp += xpGain;

      // Проверка повышения уровня
      while (data.user.xp >= data.user.xp_needed) {
        data.user.xp -= data.user.xp_needed;
        data.user.level += 1;
        data.user.xp_needed = Math.round(data.user.xp_needed * 1.15);
      }
    }

    writeData(data);

    res.json({ entry: data.daily_entries[today], xp_gained: xpGain, user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при обновлении дневника', details: err.message });
  }
});

// GET /api/heatmap — данные тепловой карты (сырые monthly_scores)
app.get('/api/heatmap', (req, res) => {
  try {
    const data = readData();
    res.json({ monthly_scores: data.monthly_scores });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при загрузке тепловой карты', details: err.message });
  }
});

// POST /api/reset — сбросить дневные записи и логи привычек
app.post('/api/reset', (req, res) => {
  try {
    const data = readData();

    // Очищаем дневные записи
    data.daily_entries = {};

    // Очищаем логи всех привычек
    for (const habit of data.habits) {
      habit.logs = {};
      if (habit.track_streak !== false) {
        habit.streak_current = 0;
        habit.streak_best = 0;
        habit.last_completed = null;
        habit.completion_rate = 0;
      }
    }

    // Сбрасываем XP и уровень
    data.user.xp = 0;
    data.user.level = 1;
    data.user.xp_needed = 100;
    data.user.multiplier = 1.0;
    data.user.multiplier_days_to_next = 7;

    // Очищаем monthly_scores
    data.monthly_scores = {};

    writeData(data);

    res.json({
      message: 'Данные сброшены',
      user: data.user,
      habits_count: data.habits.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при сбросе данных', details: err.message });
  }
});

// GET /api/stats — статистика (вес, настроение, продуктивность, выполнение)
app.get('/api/stats', (req, res) => {
  try {
    const data = readData();
    const dates = Object.keys(data.daily_entries).sort();

    // Последние 12 записей с весом
    const weightHistory = dates
      .filter(d => data.daily_entries[d].weight !== undefined)
      .slice(-12)
      .map(d => ({ date: d, weight: data.daily_entries[d].weight }));

    // История настроения
    const moodHistory = dates
      .filter(d => data.daily_entries[d].mood !== undefined)
      .map(d => ({ date: d, mood: data.daily_entries[d].mood }));

    // История продуктивности
    const productivityHistory = dates
      .filter(d => data.daily_entries[d].productivity !== undefined)
      .map(d => ({ date: d, productivity: data.daily_entries[d].productivity }));

    // Процент выполнения по привычкам
    const habitCompletionRates = data.habits.map(h => ({
      id: h.id,
      name: h.name,
      type: h.type,
      completion_rate: h.completion_rate,
      streak_current: h.streak_current,
      streak_best: h.streak_best
    }));

    res.json({
      weight_history: weightHistory,
      mood_history: moodHistory,
      productivity_history: productivityHistory,
      habit_completion_rates: habitCompletionRates
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при загрузке статистики', details: err.message });
  }
});

// --- Обработка 404 для неизвестных API маршрутов ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.originalUrl} не найден` });
});

// --- Глобальный обработчик ошибок ---
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err.stack || err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
});

// --- Запуск сервера ---
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  console.log(`Данные: ${DATA_PATH}`);
});
