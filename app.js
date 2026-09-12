import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// TODO: Thay thông tin cấu hình Firebase của bạn vào đây
const firebaseConfig = {
    apiKey: "AIzaSyB94Y5-g6kXg4Gwz1VNsWn1rCSccZdD5YU",
    authDomain: "todo-app-af1ca.firebaseapp.com",
    projectId: "todo-app-af1ca",
    storageBucket: "todo-app-af1ca.firebasestorage.app",
    messagingSenderId: "391885202103",
    appId: "1:391885202103:web:cd487d455e0fdc395ce332"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- State Management ---
let appData = {
    history: {}, // 'YYYY-MM-DD': { todos: [], focusMinutes: 0 }
    tasks: []    // Advanced tasks
};

const STORAGE_KEY = 'lifeTrackerData';

function getTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const todayStr = getTodayStr();
let currentViewYear = new Date().getFullYear();
let currentViewMonth = new Date().getMonth(); // 0 to 11

async function loadData() {
    // 1. Tải từ LocalStorage trước (để load nhanh hoặc offline)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            appData = JSON.parse(stored);
        } catch (e) {
            console.error("Failed to parse data");
        }
    }

    if (!appData.history[todayStr]) {
        appData.history[todayStr] = { todos: [], focusMinutes: 0 };
    }

    // Render giao diện ngay lập tức với dữ liệu offline để không bị trống
    if (typeof renderTodos === "function") {
        renderTodos();
        updateTimerDisplay();
        updateAnalytics();
        renderCalendar();
        if (typeof renderTmTasks === "function") renderTmTasks();
    }

    // 2. Tải từ Firebase (Ghi đè dữ liệu cục bộ bằng dữ liệu online mới nhất)
    if (firebaseConfig.projectId !== "YOUR_PROJECT_ID") {
        try {
            const querySnapshot = await getDocs(collection(db, "history"));
            querySnapshot.forEach((docSnap) => {
                appData.history[docSnap.id] = docSnap.data();
            });

            const tasksSnapshot = await getDocs(collection(db, "tasks"));
            tasksSnapshot.forEach((docSnap) => {
                if (docSnap.id === "all") {
                    appData.tasks = docSnap.data().tasks || [];
                }
            });

            // Cập nhật lại LocalStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));

            // Render lại sau khi đã có dữ liệu online
            if (typeof renderTodos === "function") {
                renderTodos();
                updateAnalytics();
                renderCalendar();
                if (typeof renderTmTasks === "function") renderTmTasks();
            }
        } catch (e) {
            console.error("Failed to fetch data from Firebase (Có thể cấu hình chưa đúng)", e);
        }
    }
}

async function saveData() {
    // Lưu vào LocalStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));

    // Lưu ngày hiện tại lên Firebase
    try {
        if (firebaseConfig.projectId !== "YOUR_PROJECT_ID") {
            await setDoc(doc(db, "history", todayStr), appData.history[todayStr]);
            await setDoc(doc(db, "tasks", "all"), { tasks: appData.tasks });
        }
    } catch (e) {
        console.error("Error saving to Firebase", e);
    }

    updateAnalytics();
    renderCalendar();
}

// --- DOM Elements ---
const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');
const todoTime = document.getElementById('todoTime');
const todoCategory = document.getElementById('todoCategory');
const todoList = document.getElementById('todoList');
const todoProgressText = document.getElementById('todoProgressText');
const todoProgressBar = document.getElementById('todoProgressBar');

const timerSection = document.getElementById('timerSection');
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const btnStartTimer = document.getElementById('btnStartTimer');
const btnPauseTimer = document.getElementById('btnPauseTimer');
const btnResetTimer = document.getElementById('btnResetTimer');
const modeBtns = document.querySelectorAll('.mode-btn');
const pomodoroSound = document.getElementById('pomodoroSound');
const breakSound = document.getElementById('breakSound');

const statTodayFocus = document.getElementById('statTodayFocus');
const statTotalTasks = document.getElementById('statTotalTasks');

const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthYearText = document.getElementById('calendarMonthYearText');
const btnPrevMonth = document.getElementById('btnPrevMonth');
const btnNextMonth = document.getElementById('btnNextMonth');

const historyModal = document.getElementById('historyModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const modalDateTitle = document.getElementById('modalDateTitle');
const modalFocusTime = document.getElementById('modalFocusTime');
const modalCompletion = document.getElementById('modalCompletion');
const modalCompletedTasks = document.getElementById('modalCompletedTasks');
const modalPendingTasks = document.getElementById('modalPendingTasks');

const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');

// --- Notification Permission ---
if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
}

function playAlarm(mode) {
    let soundToPlay = mode === 'pomodoro' ? pomodoroSound : breakSound;
    if (soundToPlay) {
        soundToPlay.volume = mode === 'pomodoro' ? 0.6 : 1.0;
        soundToPlay.currentTime = 0;
        let playPromise = soundToPlay.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.log("Audio play blocked by browser: ", e));
        }
    }

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200, 100, 400]);
    timerSection.classList.add('shake');
    setTimeout(() => timerSection.classList.remove('shake'), 1000);

    if ('Notification' in window && Notification.permission === 'granted') {
        const msg = mode === 'pomodoro' ? "Đã xong thời gian tập trung! Nghỉ giải lao thôi!" : "Hết giờ nghỉ! Quay lại làm việc nào!";
        new Notification("LifeTracker", { body: msg, icon: "./icon.svg" });
    }
}

// --- Todo Logic ---
function renderTodos() {
    const todayData = appData.history[todayStr];
    todoList.innerHTML = '';

    // Sort tasks by time
    todayData.todos.sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    let completedCount = 0;

    todayData.todos.forEach(task => {
        if (task.completed) completedCount++;

        const li = document.createElement('li');
        li.className = `todo-item ${task.completed ? 'completed' : ''}`;

        const catMap = { work: 'Làm việc', study: 'Học tập', personal: 'Cá nhân', health: 'Sức khỏe' };

        li.innerHTML = `
            <div class="checkbox" onclick="toggleTask('${task.id}')">
                <i class="fa-solid fa-check"></i>
            </div>
            <div class="task-content">
                <div class="task-header">
                    <span class="task-time">${task.time ? `[${task.time}]` : ''}</span>
                    <span class="task-text">${task.text}</span>
                </div>
                <span class="task-tag ${task.category}">${catMap[task.category]}</span>
            </div>
            <button class="btn-delete" onclick="deleteTask('${task.id}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        todoList.appendChild(li);
    });

    const total = todayData.todos.length;
    todoProgressText.innerText = `${completedCount}/${total} Hoàn thành`;
    todoProgressBar.style.width = total === 0 ? '0%' : `${(completedCount / total) * 100}%`;
}

function addTask(e) {
    e.preventDefault();
    const text = todoInput.value.trim();
    const time = todoTime.value;
    if (!text || !time) {
        alert("Vui lòng nhập giờ và nội dung!");
        return;
    }

    appData.history[todayStr].todos.push({
        id: Date.now().toString(),
        text,
        time,
        category: todoCategory.value,
        completed: false
    });

    todoInput.value = '';
    saveData();
    renderTodos();
}

window.toggleTask = function (id) {
    const task = appData.history[todayStr].todos.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveData();
        renderTodos();
    }
}

window.deleteTask = function (id) {
    appData.history[todayStr].todos = appData.history[todayStr].todos.filter(t => t.id !== id);
    saveData();
    renderTodos();
}

todoForm.addEventListener('submit', addTask);

// --- Timer Logic ---
let timerInterval;
let timeLeft = 25 * 60;
let isRunning = false;
let currentModeMinutes = 25;
let currentModeType = 'pomodoro';

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
    document.title = isRunning ? `${m}:${s} - Focus` : 'LifeTracker';
}

function startTimer() {
    if (isRunning) return;

    // Mở khóa âm thanh (Bypass Safari/Chrome Autoplay Policy)
    if (pomodoroSound) { pomodoroSound.muted = true; pomodoroSound.play().then(() => { pomodoroSound.pause(); pomodoroSound.currentTime = 0; pomodoroSound.muted = false; }).catch(() => { }); }
    if (breakSound) { breakSound.muted = true; breakSound.play().then(() => { breakSound.pause(); breakSound.currentTime = 0; breakSound.muted = false; }).catch(() => { }); }

    isRunning = true;
    timerStatus.innerText = `Đang chạy: ${currentModeType === 'pomodoro' ? 'Pomodoro' : 'Nghỉ ngơi'}`;
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            updateTimerDisplay();
        } else {
            clearInterval(timerInterval);
            isRunning = false;

            // Save focus time if it was pomodoro
            if (currentModeType === 'pomodoro') {
                appData.history[todayStr].focusMinutes += currentModeMinutes;
                saveData();
            }

            playAlarm(currentModeType);

            // Auto switch mode (Pair 45m with 15m, 25m with 5m)
            if (currentModeType === 'pomodoro') {
                if (currentModeMinutes === 45) {
                    switchMode('longBreak', 15);
                } else {
                    switchMode('shortBreak', 5);
                }
            } else if (currentModeType === 'shortBreak') {
                switchMode('pomodoro', 25);
            } else if (currentModeType === 'longBreak') {
                switchMode('pomodoro', 45);
            }

            // Auto start next phase
            setTimeout(() => {
                startTimer();
            }, 3000);
        }
    }, 1000);
}

function switchMode(modeString, specificTime = null) {
    modeBtns.forEach(b => b.classList.remove('active'));
    let targetBtn;
    if (specificTime) {
        targetBtn = Array.from(modeBtns).find(b => b.getAttribute('data-mode') === modeString && b.getAttribute('data-time') == specificTime);
    } else {
        targetBtn = Array.from(modeBtns).find(b => b.getAttribute('data-mode') === modeString);
    }
    
    if (targetBtn) {
        targetBtn.classList.add('active');
        currentModeMinutes = parseInt(targetBtn.getAttribute('data-time'));
        currentModeType = modeString;
        resetTimerCore();
    }
}

function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerStatus.innerText = "Đã tạm dừng";
    updateTimerDisplay();
}

function resetTimerCore() {
    isRunning = false;
    clearInterval(timerInterval);
    timeLeft = currentModeMinutes * 60;
    timerStatus.innerText = "Sẵn sàng (Tự động lặp lại)";
    updateTimerDisplay();
}

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        switchMode(btn.getAttribute('data-mode'), btn.getAttribute('data-time'));
    });
});

btnStartTimer.addEventListener('click', startTimer);
btnPauseTimer.addEventListener('click', pauseTimer);
btnResetTimer.addEventListener('click', resetTimerCore);

// --- Analytics ---
function updateAnalytics() {
    statTodayFocus.innerText = `${appData.history[todayStr].focusMinutes} phút`;
    let totalCompleted = 0;
    Object.values(appData.history).forEach(day => {
        totalCompleted += day.todos.filter(t => t.completed).length;
    });
    statTotalTasks.innerText = totalCompleted;
}

// --- Calendar Logic ---
function renderCalendar() {
    calendarGrid.innerHTML = '';

    calendarMonthYearText.innerText = `Tháng ${currentViewMonth + 1}, ${currentViewYear}`;

    // First day of the month (0 = Sunday, 1 = Monday, etc.)
    const firstDayObj = new Date(currentViewYear, currentViewMonth, 1);
    let startDayOfWeek = firstDayObj.getDay() - 1; // Adjust to make Monday = 0
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6

    // Number of days in the month
    const daysInMonth = new Date(currentViewYear, currentViewMonth + 1, 0).getDate();

    // Empty cells before day 1
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        calendarGrid.appendChild(emptyCell);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const y = currentViewYear;
        const m = String(currentViewMonth + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.innerText = day;

        if (dateStr === todayStr) {
            cell.classList.add('today');
        }

        let level = 0;

        if (appData.history[dateStr]) {
            const data = appData.history[dateStr];
            const completed = data.todos.filter(t => t.completed).length;
            const focus = data.focusMinutes;

            let activityScore = completed * 10 + focus;

            if (activityScore > 0 && activityScore <= 20) level = 1;
            else if (activityScore > 20 && activityScore <= 50) level = 2;
            else if (activityScore > 50 && activityScore <= 100) level = 3;
            else if (activityScore > 100) level = 4;
        }

        cell.classList.add(`level-${level}`);
        cell.addEventListener('click', () => showHistory(dateStr));

        calendarGrid.appendChild(cell);
    }
}

btnPrevMonth.addEventListener('click', () => {
    currentViewMonth--;
    if (currentViewMonth < 0) { currentViewMonth = 11; currentViewYear--; }
    renderCalendar();
});

btnNextMonth.addEventListener('click', () => {
    currentViewMonth++;
    if (currentViewMonth > 11) { currentViewMonth = 0; currentViewYear++; }
    renderCalendar();
});


// --- History Modal ---
function showHistory(dateStr) {
    const data = appData.history[dateStr] || { todos: [], focusMinutes: 0 };

    modalDateTitle.innerText = `Lịch sử: ${dateStr}`;
    modalFocusTime.innerText = `${data.focusMinutes} phút`;

    const total = data.todos.length;
    const completed = data.todos.filter(t => t.completed);
    const pending = data.todos.filter(t => !t.completed);

    modalCompletion.innerText = total === 0 ? '0%' : `${Math.round((completed.length / total) * 100)}%`;

    function renderMiniList(container, arr) {
        container.innerHTML = '';
        if (arr.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Trống</p>';
            return;
        }
        arr.forEach(task => {
            const catMap = { work: 'Làm việc', study: 'Học tập', personal: 'Cá nhân', health: 'Sức khỏe' };
            const li = document.createElement('li');
            li.className = `todo-item ${task.completed ? 'completed' : ''}`;
            li.innerHTML = `
                <div class="checkbox"><i class="fa-solid fa-check"></i></div>
                <div class="task-content">
                    <div class="task-header">
                        <span class="task-time">${task.time ? `[${task.time}]` : ''}</span>
                        <span class="task-text">${task.text}</span>
                    </div>
                    <span class="task-tag ${task.category}">${catMap[task.category]}</span>
                </div>
            `;
            container.appendChild(li);
        });
    }

    renderMiniList(modalCompletedTasks, completed);
    renderMiniList(modalPendingTasks, pending);

    historyModal.classList.add('active');
}

btnCloseModal.addEventListener('click', () => {
    historyModal.classList.remove('active');
});
historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.classList.remove('active');
});

// --- Export & Import ---
btnExport.addEventListener('click', () => {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `LifeTracker_Backup_${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

btnImport.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (event) {
        try {
            const importedData = JSON.parse(event.target.result);
            if (importedData && importedData.history) {
                appData = importedData;

                // Đồng bộ toàn bộ dữ liệu import lên Firebase
                if (firebaseConfig.projectId !== "YOUR_PROJECT_ID") {
                    try {
                        const batch = writeBatch(db);
                        Object.keys(appData.history).forEach(date => {
                            const docRef = doc(db, "history", date);
                            batch.set(docRef, appData.history[date]);
                        });
                        await batch.commit();
                    } catch (err) {
                        console.error("Lỗi đồng bộ Firebase khi import", err);
                    }
                }

                await saveData();
                renderTodos();
                alert('Khôi phục dữ liệu thành công!');
            } else {
                alert('File không đúng định dạng LifeTracker!');
            }
        } catch (e) {
            alert('Lỗi đọc file JSON!');
        }
    };
    reader.readAsText(file);
});

// --- Init ---
window.onload = () => {
    loadData();
};

// --- Tabs Logic ---
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target')).classList.add('active');
    });
});

// --- Task Manager Logic ---
const btnShowAddTaskModal = document.getElementById('btnShowAddTaskModal');
const btnTmCloseModal = document.getElementById('btnTmCloseModal');
const btnTmCancelModal = document.getElementById('btnTmCancelModal');
const tmAddTaskModal = document.getElementById('tmAddTaskModal');
const tmAddTaskForm = document.getElementById('tmAddTaskForm');
const tmTaskList = document.getElementById('tmTaskList');
const tmSearchInput = document.getElementById('tmSearchInput');
const tmFilterStatus = document.getElementById('tmFilterStatus');
const tmFilterPriority = document.getElementById('tmFilterPriority');

function openTmModal() {
    tmAddTaskModal.classList.add('active');
}
function closeTmModal() {
    tmAddTaskModal.classList.remove('active');
    tmAddTaskForm.reset();
}
btnShowAddTaskModal.addEventListener('click', openTmModal);
btnTmCloseModal.addEventListener('click', closeTmModal);
btnTmCancelModal.addEventListener('click', closeTmModal);

function renderTmTasks() {
    tmTaskList.innerHTML = '';

    let filteredTasks = appData.tasks || [];

    const searchVal = tmSearchInput.value.toLowerCase();
    const statusVal = tmFilterStatus.value;
    const priorityVal = tmFilterPriority.value;

    if (searchVal) {
        filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(searchVal) || t.desc.toLowerCase().includes(searchVal));
    }
    if (statusVal !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.status === statusVal);
    }
    if (priorityVal !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.priority === priorityVal);
    }

    if (filteredTasks.length === 0) {
        tmTaskList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">Không tìm thấy công việc nào.</p>';
    }

    filteredTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'tm-task-item';

        const iconMap = {
            'Tài liệu': 'fa-file-lines', 'Mua sắm': 'fa-cart-shopping', 'Học tập': 'fa-book-open',
            'Sức khỏe': 'fa-heart-pulse', 'Công việc': 'fa-desktop', 'Du lịch': 'fa-plane',
            'Lịch trình': 'fa-calendar-days', 'Thời gian': 'fa-clock'
        };
        const iconClass = iconMap[task.icon] || 'fa-list';

        let statusClass = 'status-chualam';
        if (task.status === 'Đang làm') statusClass = 'status-danglam';
        else if (task.status === 'Hoàn thành') statusClass = 'status-hoanthanh';

        let priorityClass = 'priority-trungbinh';
        if (task.priority === 'Cao') priorityClass = 'priority-cao';
        else if (task.priority === 'Thấp') priorityClass = 'priority-thap';

        item.innerHTML = `
            <div class="tm-task-icon-wrapper"><i class="fa-solid ${iconClass}"></i></div>
            <div class="tm-task-details">
                <div class="tm-task-title">
                    <span>${task.title}</span>
                    <div class="tm-task-actions">
                        <button class="btn-icon" onclick="deleteTmTask('${task.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                ${task.desc ? `<div class="tm-task-desc">${task.desc}</div>` : ''}
                <div class="tm-task-meta">
                    <span class="tm-status-badge ${statusClass}">${task.status}</span>
                    <span class="${priorityClass}"><i class="fa-solid fa-flag"></i> ${task.priority}</span>
                    ${task.startDate ? `<span><i class="fa-solid fa-calendar-plus"></i> Bắt đầu: ${task.startDate}</span>` : ''}
                    ${task.deadline ? `<span><i class="fa-solid fa-bell"></i> Hạn: ${new Date(task.deadline).toLocaleString('vi-VN')}</span>` : ''}
                </div>
            </div>
        `;
        tmTaskList.appendChild(item);
    });

    updateTmStats();
}

function updateTmStats() {
    const tasks = appData.tasks || [];
    const total = tasks.length;
    const inProgress = tasks.filter(t => t.status === 'Đang làm').length;
    const completed = tasks.filter(t => t.status === 'Hoàn thành').length;

    let overdue = 0;
    const now = new Date();
    tasks.forEach(t => {
        if (t.status !== 'Hoàn thành' && t.deadline) {
            if (new Date(t.deadline) < now) overdue++;
        }
    });

    document.getElementById('tmStatTotal').innerText = total;
    document.getElementById('tmStatInProgress').innerText = inProgress;
    document.getElementById('tmStatCompleted').innerText = completed;
    document.getElementById('tmStatOverdue').innerText = overdue;
}

tmAddTaskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = document.getElementById('tmTaskTitle').value;
    const icon = document.querySelector('input[name="tmTaskIcon"]:checked').value;
    const desc = document.getElementById('tmTaskDesc').value;
    const status = document.getElementById('tmTaskStatus').value;
    const priority = document.getElementById('tmTaskPriority').value;
    const startDate = document.getElementById('tmTaskStartDate').value;
    const deadline = document.getElementById('tmTaskDeadline').value;

    const newTask = {
        id: 'tm-' + Date.now(),
        title, icon, desc, status, priority, startDate, deadline
    };

    if (!appData.tasks) appData.tasks = [];
    appData.tasks.unshift(newTask);
    saveData();
    renderTmTasks();
    closeTmModal();
});

window.deleteTmTask = function (id) {
    if (confirm("Bạn có chắc muốn xóa công việc này?")) {
        appData.tasks = appData.tasks.filter(t => t.id !== id);
        saveData();
        renderTmTasks();
    }
}

tmSearchInput.addEventListener('input', renderTmTasks);
tmFilterStatus.addEventListener('change', renderTmTasks);
tmFilterPriority.addEventListener('change', renderTmTasks);
