/**
 * Service Worker
 * תמיכה באופליין והתראות – GitHub Pages safe
 */

const BASE_PATH = '/task-manager-v2';
const CACHE_NAME = 'todo-pwa-v2';

const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/css/style.css`,
  `${BASE_PATH}/js/app.js`,
  `${BASE_PATH}/js/db.js`,
  `${BASE_PATH}/js/notifications.js`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/icon-192.png`,
  `${BASE_PATH}/icons/icon-512.png`
];

// מאגר התראות (זמני – זיכרון בלבד)
const scheduledNotifications = new Map();

/* ================= INSTALL ================= */
self.addEventListener('install', (event) => {
  console.log('SW: install');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );

  self.skipWaiting();
});

/* ================= ACTIVATE ================= */
self.addEventListener('activate', (event) => {
  console.log('SW: activate');

  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );

  self.clients.claim();
});

/* ================= FETCH ================= */
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) return response;

            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache =>
              cache.put(event.request, clone)
            );

            return response;
          })
          .catch(() =>
            caches.match(`${BASE_PATH}/index.html`)
          );
      })
  );
});

/* ================= MESSAGES ================= */
self.addEventListener('message', (event) => {
  const { type, task, taskId } = event.data || {};

  if (type === 'SCHEDULE_NOTIFICATION') scheduleNotification(task);
  if (type === 'CANCEL_NOTIFICATION') cancelScheduledNotification(taskId);
  if (type === 'UPDATE_NOTIFICATIONS') clearAllNotifications();
});

/* ================= NOTIFICATIONS ================= */
function scheduleNotification(task) {
  if (!task?.notification) return;

  const time = new Date(task.notification.scheduledFor);
  const delay = time - new Date();
  if (delay <= 0) return;

  cancelScheduledNotification(task.id);

  const id = setTimeout(() => {
    showNotification(task);
    scheduledNotifications.delete(task.id);
  }, delay);

  scheduledNotifications.set(task.id, id);
}

function cancelScheduledNotification(taskId) {
  if (!scheduledNotifications.has(taskId)) return;
  clearTimeout(scheduledNotifications.get(taskId));
  scheduledNotifications.delete(taskId);
}

function clearAllNotifications() {
  scheduledNotifications.forEach(id => clearTimeout(id));
  scheduledNotifications.clear();
}

async function showNotification(task) {
  await self.registration.showNotification('⏰ תזכורת למשימה', {
    body: task.title,
    icon: `${BASE_PATH}/icons/icon-192.png`,
    badge: `${BASE_PATH}/icons/icon-192.png`,
    dir: 'rtl',
    lang: 'he',
    tag: `task-${task.id}`,
    requireInteraction: true,
    data: {
      taskId: task.id,
      date: task.date
    },
    actions: [
      { action: 'complete', title: '✅ סמן כהושלם' },
      { action: 'view', title: '👁️ פתח משימה' }
    ]
  });
}

/* ================= CLICK ================= */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { taskId, date } = event.notification.data;

  if (event.action === 'complete') {
    event.waitUntil(markTaskAsComplete(taskId));
  } else {
    event.waitUntil(
      clients.openWindow(
        `${BASE_PATH}/index.html?date=${date}`
      )
    );
  }
});

async function markTaskAsComplete(taskId) {
  const clientsList = await clients.matchAll();
  clientsList.forEach(client =>
    client.postMessage({ type: 'COMPLETE_TASK', taskId })
  );
}

console.log('SW ready');
