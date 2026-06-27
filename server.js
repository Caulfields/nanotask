const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const DATA_PATH = path.join(__dirname, 'data.json');

// Проверяем наличие Vercel KV (KV_REST_API_URL и KV_REST_API_TOKEN)
const KV_AVAILABLE = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
const IS_VERCEL = !!process.env.VERCEL;

let kv;
let memCache = null; // in-memory fallback на Vercel без KV

if (KV_AVAILABLE) {
  ({ kv } = require('@vercel/kv'));
  console.log('Vercel KV включен');
} else if (IS_VERCEL) {
  console.log('Vercel KV не настроен — используется in-memory (данные не сохраняются между деплоями)');
} else {
  console.log('Локальная разработка — используется файловая система');
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper functions ---

function loadSeedData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function readData() {
  try {
    if (KV_AVAILABLE) {
      const raw = await kv.get('app-data');
      if (raw) return JSON.parse(raw);
      const seed = loadSeedData();
      await kv.set('app-data', JSON.stringify(seed));
      return seed;
    }
    if (IS_VERCEL) {
      // In-memory fallback на Vercel: первый запрос загружает из data.json
      if (memCache) return memCache;
      memCache = loadSeedData();
      return memCache;
    }
    // Локальная разработка
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error('Ошибка чтения данных:', err.message);
    throw err;
  }
}

async function writeData(data) {
  try {
    if (KV_AVAILABLE) {
      await kv.set('app-data', JSON.stringify(data));
    } else if (IS_VERCEL) {
      memCache = data;
    } else {
      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Ошибка записи данных:', err.message);
    throw err;
  }
}

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function findLatestEntry(data) {
  const dates = Object.keys(data.daily_entries).sort().reverse();
  return dates.length > 0 ? dates[0] : null;
}

// --- API Routes ---

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await readData();
    const today = getToday();
    const latestDate = findLatestEntry(data);

    for (var hi = 0; hi < data.habits.length; hi++) {
      var h = data.habits[hi];
      if (h.type === 'antihabit' && h.track_streak !== false) {
        recalcAntiStreak(h);
      }
    }

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

    // На Vercel сохраняем пересчитанные данные
    await writeData(data);

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

app.get('/api/habits', async (req, res) => {
  try {
    const data = await readData();
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

app.get('/api/habits/:id', async (req, res) => {
  try {
    const data = await readData();
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

  if (allDates.length === 0) {
    habit.streak_current = 0;
    return;
  }

  var streak = 0;
  var cursor = new Date(today + 'T00:00:00');
  var foundConsecutive = false;

  var floorDate = null;
  if (habit.created_at) {
    floorDate = new Date(habit.created_at + 'T00:00:00');
  } else {
    floorDate = new Date(allDates[0] + 'T00:00:00');
  }

  while (!foundConsecutive) {
    var dateStr = cursor.getFullYear() + '-' +
        String(cursor.getMonth() + 1).padStart(2, '0') + '-' +
        String(cursor.getDate()).padStart(2, '0');

    if (cursor < floorDate) break;

    if (logs[dateStr]) {
      var prevDay = new Date(cursor);
      prevDay.setDate(prevDay.getDate() - 1);
      var prevStr = prevDay.getFullYear() + '-' +
          String(prevDay.getMonth() + 1).padStart(2, '0') + '-' +
          String(prevDay.getDate()).padStart(2, '0');

      if (logs[prevStr]) {
        foundConsecutive = true;
      }
    } else {
      streak++;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  habit.streak_current = streak;
  if (streak > habit.streak_best) {
    habit.streak_best = streak;
  }
}

app.put('/api/habits/:id/toggle', async (req, res) => {
  try {
    const data = await readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const habit = data.habits[habitIndex];
    const today = getToday();

    if (!habit.logs) {
      habit.logs = {};
    }

    var xpGained = 0;

    if (habit.type === 'antihabit') {
      if (habit.logs[today]) {
        delete habit.logs[today];
        habit.last_completed = null;
      } else {
        habit.logs[today] = { completed: true, timestamp: new Date().toISOString() };
        habit.last_completed = today;
      }

      if (habit.track_streak !== false) {
        recalcAntiStreak(habit);
      }
    } else {
      var isUndo = !!habit.logs[today];
      if (isUndo) {
        delete habit.logs[today];
        if (habit.track_streak !== false) {
          habit.streak_current = Math.max(0, habit.streak_current - 1);
        }
        var xpToRemove = Math.round(5 * data.user.multiplier);
        data.user.xp = Math.max(0, data.user.xp - xpToRemove);
        xpGained = -xpToRemove;
      } else {
        habit.logs[today] = { completed: true, timestamp: new Date().toISOString() };
        if (habit.track_streak !== false) {
          habit.streak_current += 1;

          if (habit.streak_current > habit.streak_best) {
            habit.streak_best = habit.streak_current;
          }

          habit.last_completed = today;
        } else {
          habit.last_completed = today;
        }

        var baseXp = 5;
        xpGained = Math.round(baseXp * data.user.multiplier);
        data.user.xp += xpGained;

        while (data.user.xp >= data.user.xp_needed) {
          data.user.xp -= data.user.xp_needed;
          data.user.level += 1;
          data.user.xp_needed = Math.round(data.user.xp_needed * 1.15);
        }
      }
    }

    var totalDays;
    if (habit.type === 'antihabit') {
      var logDates = Object.keys(habit.logs).sort();
      if (logDates.length > 0) {
        var firstLog = new Date(logDates[0] + 'T00:00:00');
        var lastCheck = new Date(today + 'T00:00:00');
        totalDays = Math.max(1, Math.ceil((lastCheck - firstLog) / (1000 * 60 * 60 * 24)) + 1);
        var violationCount = Object.keys(habit.logs).length;
        var cleanDays = totalDays - violationCount;
        habit.completion_rate = Math.round((cleanDays / totalDays) * 100);
      } else {
        habit.completion_rate = 100;
      }
    } else {
      var totalLogs = Object.keys(habit.logs).length;
      var logDatesReg = Object.keys(habit.logs).sort();
      var totalDaysReg = 30;
      if (logDatesReg.length > 0) {
        var firstLogReg = new Date(logDatesReg[0]);
        var lastLog = new Date(today);
        var diffTime = Math.abs(lastLog - firstLogReg);
        totalDaysReg = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
      }
      habit.completion_rate = Math.round((totalLogs / totalDaysReg) * 100);
    }

    data.habits[habitIndex] = habit;

    var monthKey = today.substring(0, 7);
    var dayIndex = parseInt(today.substring(8, 10), 10) - 1;
    if (!data.monthly_scores[monthKey]) {
      data.monthly_scores[monthKey] = [];
    }
    var dailyScore = 0;
    for (var hi = 0; hi < data.habits.length; hi++) {
      var hb = data.habits[hi];
      if (hb.logs && hb.logs[today]) {
        if (hb.type === 'antihabit') {
          dailyScore -= 1;
        } else {
          dailyScore += 1;
        }
      }
    }
    data.monthly_scores[monthKey][dayIndex] = dailyScore;

    await writeData(data);

    res.json({ habit: habit, xp_gained: xpGained, user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при переключении привычки', details: err.message });
  }
});

app.put('/api/habits/:id', async (req, res) => {
  try {
    const data = await readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const allowedFields = ['name', 'icon', 'type', 'color', 'target', 'window', 'rule', 'track_streak'];
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        data.habits[habitIndex][key] = updates[key];
      }
    }

    await writeData(data);

    res.json(data.habits[habitIndex]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при обновлении привычки', details: err.message });
  }
});

app.post('/api/habits', async (req, res) => {
  try {
    const data = await readData();
    const { name, icon, type, color, target, window, rule, track_streak } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Поле "name" обязательно' });
    }
    if (!type || !['habit', 'antihabit'].includes(type)) {
      return res.status(400).json({ error: 'Поле "type" должно быть "habit" или "antihabit"' });
    }

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
    await writeData(data);

    res.status(201).json(newHabit);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при создании привычки', details: err.message });
  }
});

app.delete('/api/habits/:id', async (req, res) => {
  try {
    const data = await readData();
    const id = parseInt(req.params.id, 10);
    const habitIndex = data.habits.findIndex(h => h.id === id);

    if (habitIndex === -1) {
      return res.status(404).json({ error: `Привычка с id ${id} не найдена` });
    }

    const deleted = data.habits.splice(habitIndex, 1)[0];
    await writeData(data);

    res.json({ message: `Привычка "${deleted.name}" удалена`, habit: deleted });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при удалении привычки', details: err.message });
  }
});

app.put('/api/daily', async (req, res) => {
  try {
    const data = await readData();
    const today = getToday();
    const { mood, productivity, weight } = req.body;

    if (req.body && typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

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

    const baseXp = ((mood !== undefined && mood >= 4) ? 10 : 0) +
                    ((productivity !== undefined && productivity >= 4) ? 10 : 0);
    const xpGain = Math.round(baseXp * data.user.multiplier);
    if (xpGain > 0) {
      data.user.xp += xpGain;

      while (data.user.xp >= data.user.xp_needed) {
        data.user.xp -= data.user.xp_needed;
        data.user.level += 1;
        data.user.xp_needed = Math.round(data.user.xp_needed * 1.15);
      }
    }

    await writeData(data);

    res.json({ entry: data.daily_entries[today], xp_gained: xpGain, user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при обновлении дневника', details: err.message });
  }
});

app.get('/api/heatmap', async (req, res) => {
  try {
    const data = await readData();
    res.json({ monthly_scores: data.monthly_scores });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при загрузке тепловой карты', details: err.message });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    const data = await readData();

    data.daily_entries = {};

    for (const habit of data.habits) {
      habit.logs = {};
      if (habit.track_streak !== false) {
        habit.streak_current = 0;
        habit.streak_best = 0;
        habit.last_completed = null;
        habit.completion_rate = 0;
      }
    }

    data.user.xp = 0;
    data.user.level = 1;
    data.user.xp_needed = 100;
    data.user.multiplier = 1.0;
    data.user.multiplier_days_to_next = 7;

    data.monthly_scores = {};

    await writeData(data);

    res.json({
      message: 'Данные сброшены',
      user: data.user,
      habits_count: data.habits.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при сбросе данных', details: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const data = await readData();
    const dates = Object.keys(data.daily_entries).sort();

    const weightHistory = dates
      .filter(d => data.daily_entries[d].weight !== undefined)
      .slice(-12)
      .map(d => ({ date: d, weight: data.daily_entries[d].weight }));

    const moodHistory = dates
      .filter(d => data.daily_entries[d].mood !== undefined)
      .map(d => ({ date: d, mood: data.daily_entries[d].mood }));

    const productivityHistory = dates
      .filter(d => data.daily_entries[d].productivity !== undefined)
      .map(d => ({ date: d, productivity: data.daily_entries[d].productivity }));

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

// --- 404 для API ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.originalUrl} не найден` });
});

// --- Глобальный обработчик ошибок ---
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err.stack || err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
});

// --- Запуск (только для локальной разработки) ---
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`KV: ${KV_AVAILABLE ? 'включен' : 'выключен (файловая система)'}`);
    console.log(`Данные: ${DATA_PATH}`);
  });
}

module.exports = app;
