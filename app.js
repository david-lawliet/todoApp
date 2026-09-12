import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

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
const auth = getAuth(app);
let currentUser = null;

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

async function loadData(forceCloud = false) {
    // 1. Tải từ LocalStorage trước
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

    // Render giao diện ngay lập tức với dữ liệu offline
    if (typeof renderTodos === "function") {
        renderTodos();
        updateTimerDisplay();
        updateAnalytics();
        renderCalendar();
        updateStreakUI();
        if (typeof checkRollover === "function" && !forceCloud) checkRollover(); // Only check rollover once on load
        if (typeof renderTmTasks === "function") renderTmTasks();
    }

    // 2. Tải từ Firebase nếu đã đăng nhập
    if (currentUser) {
        try {
            const querySnapshot = await getDocs(collection(db, `users/${currentUser.uid}/history`));
            querySnapshot.forEach((docSnap) => {
                appData.history[docSnap.id] = docSnap.data();
            });

            const tasksSnapshot = await getDocs(collection(db, `users/${currentUser.uid}/tasks`));
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
                updateStreakUI();
                if (typeof renderTmTasks === "function") renderTmTasks();
            }
        } catch (e) {
            console.error("Failed to fetch data from Firebase", e);
        }
    }
}

async function saveData() {
    // Lưu vào LocalStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));

    // Lưu lên Firebase nếu đã đăng nhập
    try {
        if (currentUser) {
            await setDoc(doc(db, `users/${currentUser.uid}/history`, todayStr), appData.history[todayStr]);
            await setDoc(doc(db, `users/${currentUser.uid}/tasks`, "all"), { tasks: appData.tasks });
        }
    } catch (e) {
        console.error("Error saving to Firebase", e);
    }

    updateAnalytics();
    renderCalendar();
    updateStreakUI();
}

// --- Streak Logic ---
function calculateStreak() {
    let streak = 0;
    let checkDate = new Date();
    
    for (let i = 0; i < 365; i++) {
        let y = checkDate.getFullYear();
        let m = String(checkDate.getMonth() + 1).padStart(2, '0');
        let d = String(checkDate.getDate()).padStart(2, '0');
        let dateStr = `${y}-${m}-${d}`;
        
        let dayData = appData.history[dateStr];
        let tasksCompleted = appData.tasks ? appData.tasks.some(t => t.status === 'Hoàn thành' && t.completedDate === dateStr) : false;
        let isActive = (dayData && dayData.focusMinutes > 0) || tasksCompleted;
        
        if (i === 0 && !isActive) {
            // Today is inactive, streak doesn't break yet
        } else if (isActive) {
            streak++;
        } else {
            // Found an inactive day (yesterday or older), streak breaks
            break;
        }
        checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
}

function updateStreakUI() {
    const streakElement = document.getElementById('streakCount');
    if (streakElement) {
        streakElement.innerText = calculateStreak();
    }
}

// --- DOM Elements ---
const btnShowAddTaskModalHome = document.getElementById('btnShowAddTaskModalHome');
const todoList = document.getElementById('todoList');
const todoProgressText = document.getElementById('todoProgressText');

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
const modalCompletedTasks = document.getElementById('modalCompletedTasks');

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

    // Trigger Push Notification
    if ('Notification' in window && Notification.permission === 'granted') {
        const title = mode === 'pomodoro' ? 'Hết giờ Tập trung!' : 'Hết giờ Nghỉ ngơi!';
        const body = mode === 'pomodoro' ? 'Đã hoàn thành Pomodoro, nghỉ ngơi thôi!' : 'Đã hết giờ nghỉ, quay lại làm việc nào!';
        
        if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(function(registration) {
                registration.showNotification(title, {
                    body: body,
                    icon: './app-logo.png',
                    vibrate: [200, 100, 200, 100, 200, 100, 200],
                    requireInteraction: true
                });
            });
        } else {
            new Notification(title, { body: body, icon: './app-logo.png' });
        }
    }
}

// --- Todo Logic ---
function renderTodos() {
    todoList.innerHTML = '';
    
    let inProgressTasks = appData.tasks ? appData.tasks.filter(t => t.status === 'Đang làm') : [];
    
    if (inProgressTasks.length === 0) {
        todoList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">Tuyệt vời, bạn không có việc nào đang dang dở!</p>';
    }

    inProgressTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'tm-task-item';

        const iconMap = {
            'Tài liệu': 'fa-file-lines', 'Mua sắm': 'fa-cart-shopping', 'Học tập': 'fa-book-open',
            'Sức khỏe': 'fa-heart-pulse', 'Công việc': 'fa-desktop', 'Du lịch': 'fa-plane',
            'Lịch trình': 'fa-calendar-days', 'Thời gian': 'fa-clock'
        };
        const iconClass = iconMap[task.icon] || 'fa-list';
        
        let priorityClass = 'priority-trungbinh';
        if (task.priority === 'Cao') priorityClass = 'priority-cao';
        else if (task.priority === 'Thấp') priorityClass = 'priority-thap';

        item.innerHTML = `
            <div class="checkbox" onclick="toggleTmTaskCompletion('${task.id}')"></div>
            <div class="tm-task-icon-wrapper"><i class="fa-solid ${iconClass}"></i></div>
            <div class="tm-task-details">
                <div class="tm-task-title">
                    <span>${task.title}</span>
                </div>
                ${task.desc ? `<div class="tm-task-desc">${task.desc}</div>` : ''}
                <div class="tm-task-meta">
                    <select class="tm-status-badge status-danglam" onchange="changeTmTaskStatus('${task.id}', this.value)" style="cursor: pointer; outline: none; -webkit-appearance: none; appearance: none; padding-right: 12px; text-align: center;">
                        <option value="Chưa làm">Chưa làm</option>
                        <option value="Đang làm" selected>Đang làm</option>
                        <option value="Hoàn thành">Hoàn thành</option>
                    </select>
                    <span class="${priorityClass}"><i class="fa-solid fa-flag"></i> ${task.priority}</span>
                    ${task.deadline ? `<span><i class="fa-solid fa-bell"></i> Hạn: ${new Date(task.deadline).toLocaleString('vi-VN')}</span>` : ''}
                </div>
            </div>
        `;
        todoList.appendChild(item);
    });

    const total = appData.tasks ? appData.tasks.length : 0;
    const completedCount = appData.tasks ? appData.tasks.filter(t => t.status === 'Hoàn thành').length : 0;
    todoProgressText.innerText = `Hoàn thành ${completedCount}/${total} công việc`;
}

if (btnShowAddTaskModalHome) {
    btnShowAddTaskModalHome.addEventListener('click', () => {
        document.getElementById('tmAddTaskModal').classList.add('active');
    });
}

// --- Timer Logic ---
let timerInterval;
let timeLeft = 25 * 60;
let isRunning = false;
let currentModeMinutes = 25;
let currentModeType = 'pomodoro';
let endTime = null;

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
    document.title = isRunning ? `${m}:${s} - Focus` : 'Todo';
}

function startTimer() {
    if (isRunning) return;

    // Request Notification permission
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // Mở khóa âm thanh (Bypass Safari/Chrome Autoplay Policy)
    if (pomodoroSound) { pomodoroSound.muted = true; pomodoroSound.play().then(() => { pomodoroSound.pause(); pomodoroSound.currentTime = 0; pomodoroSound.muted = false; }).catch(() => { }); }
    if (breakSound) { breakSound.muted = true; breakSound.play().then(() => { breakSound.pause(); breakSound.currentTime = 0; breakSound.muted = false; }).catch(() => { }); }

    const keepAliveSound = document.getElementById('keepAliveSound');
    if (keepAliveSound) { keepAliveSound.play().catch(() => {}); }

    isRunning = true;
    endTime = Date.now() + (timeLeft * 1000);
    timerStatus.innerText = `Đang chạy: ${currentModeType === 'pomodoro' ? 'Pomodoro' : 'Nghỉ ngơi'}`;
    timerInterval = setInterval(() => {
        let now = Date.now();
        let newTimeLeft = Math.ceil((endTime - now) / 1000);
        
        if (newTimeLeft > 0) {
            if (newTimeLeft !== timeLeft) {
                timeLeft = newTimeLeft;
                updateTimerDisplay();
            }
        } else {
            timeLeft = 0;
            updateTimerDisplay();
            clearInterval(timerInterval);
            isRunning = false;
            if (keepAliveSound) keepAliveSound.pause();

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
    const keepAliveSound = document.getElementById('keepAliveSound');
    if (keepAliveSound) keepAliveSound.pause();
    timerStatus.innerText = "Đã tạm dừng";
    updateTimerDisplay();
}

function resetTimerCore() {
    isRunning = false;
    clearInterval(timerInterval);
    const keepAliveSound = document.getElementById('keepAliveSound');
    if (keepAliveSound) { keepAliveSound.pause(); keepAliveSound.currentTime = 0; }
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
    if (!appData.history[todayStr]) appData.history[todayStr] = { focusMinutes: 0 };
    statTodayFocus.innerText = `${appData.history[todayStr].focusMinutes || 0} phút`;
    let totalCompleted = appData.tasks ? appData.tasks.filter(t => t.status === 'Hoàn thành').length : 0;
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
        let activityScore = 0;

        if (appData.history[dateStr]) {
            activityScore += (appData.history[dateStr].focusMinutes || 0);
        }
        
        let tasksCompletedThatDay = appData.tasks ? appData.tasks.filter(t => t.status === 'Hoàn thành' && t.completedDate === dateStr).length : 0;
        activityScore += (tasksCompletedThatDay * 10);

        if (activityScore > 0 && activityScore <= 20) level = 1;
        else if (activityScore > 20 && activityScore <= 50) level = 2;
        else if (activityScore > 50 && activityScore <= 100) level = 3;
        else if (activityScore > 100) level = 4;

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
    const data = appData.history[dateStr] || { focusMinutes: 0 };
    modalDateTitle.innerText = `Lịch sử: ${dateStr}`;
    modalFocusTime.innerText = `${data.focusMinutes || 0} phút`;

    const completed = appData.tasks ? appData.tasks.filter(t => t.status === 'Hoàn thành' && t.completedDate === dateStr) : [];

    modalCompletedTasks.innerHTML = '';
    if (completed.length === 0) {
        modalCompletedTasks.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px;">Trống</p>';
    } else {
        completed.forEach(task => {
            const item = document.createElement('div');
            item.className = 'tm-task-item completed';
            const iconMap = {
                'Tài liệu': 'fa-file-lines', 'Mua sắm': 'fa-cart-shopping', 'Học tập': 'fa-book-open',
                'Sức khỏe': 'fa-heart-pulse', 'Công việc': 'fa-desktop', 'Du lịch': 'fa-plane',
                'Lịch trình': 'fa-calendar-days', 'Thời gian': 'fa-clock'
            };
            const iconClass = iconMap[task.icon] || 'fa-list';
            item.innerHTML = `
                <div class="checkbox"><i class="fa-solid fa-check"></i></div>
                <div class="tm-task-icon-wrapper"><i class="fa-solid ${iconClass}"></i></div>
                <div class="tm-task-details">
                    <div class="tm-task-title"><span style="text-decoration: line-through; color: var(--text-muted);">${task.title}</span></div>
                    ${task.desc ? `<div class="tm-task-desc">${task.desc}</div>` : ''}
                </div>
            `;
            modalCompletedTasks.appendChild(item);
        });
    }

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
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
        
        if (targetId === 'tabAnalytics') {
            // Delay slightly to ensure CSS display block has been applied by browser
            setTimeout(() => {
                if (typeof renderAdvancedAnalytics === "function") renderAdvancedAnalytics();
            }, 10);
        }
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
    const now = new Date();

    if (searchVal) {
        filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(searchVal) || t.desc.toLowerCase().includes(searchVal));
    }
    if (statusVal === 'Quá hạn') {
        filteredTasks = filteredTasks.filter(t => t.status !== 'Hoàn thành' && t.deadline && new Date(t.deadline) < now);
    } else if (statusVal !== 'all') {
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
        let isCompleted = task.status === 'Hoàn thành';
        item.className = `tm-task-item ${isCompleted ? 'completed' : ''}`;

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
            <div class="checkbox" onclick="toggleTmTaskCompletion('${task.id}')">
                ${isCompleted ? '<i class="fa-solid fa-check"></i>' : ''}
            </div>
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
                    <select class="tm-status-badge ${statusClass}" onchange="changeTmTaskStatus('${task.id}', this.value)" style="cursor: pointer; outline: none; -webkit-appearance: none; appearance: none; padding-right: 12px; text-align: center;">
                        <option value="Chưa làm" ${task.status === 'Chưa làm' ? 'selected' : ''}>Chưa làm</option>
                        <option value="Đang làm" ${task.status === 'Đang làm' ? 'selected' : ''}>Đang làm</option>
                        <option value="Hoàn thành" ${task.status === 'Hoàn thành' ? 'selected' : ''}>Hoàn thành</option>
                    </select>
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
    const startDateVal = document.getElementById('tmTaskStartDate').value;
    const startTimeVal = document.getElementById('tmTaskStartTime').value;
    const deadlineDateVal = document.getElementById('tmTaskDeadlineDate').value;
    const deadlineTimeVal = document.getElementById('tmTaskDeadlineTime').value;

    let startDate = startDateVal;
    if (startDateVal && startTimeVal) startDate = `${startDateVal} lúc ${startTimeVal}`;
    else if (startTimeVal) startDate = startTimeVal;

    let deadline = deadlineDateVal;
    if (deadlineDateVal && deadlineTimeVal) deadline = `${deadlineDateVal}T${deadlineTimeVal}`;
    else if (deadlineDateVal) deadline = `${deadlineDateVal}T23:59`; // default to end of day if only date is selected

    const newTask = {
        id: 'tm-' + Date.now(),
        title, icon, desc, status, priority, startDate, deadline
    };

    if (!appData.tasks) appData.tasks = [];
    appData.tasks.unshift(newTask);
    saveData();
    renderTmTasks();
    if (typeof renderTodos === "function") renderTodos();
    closeTmModal();
});

window.deleteTmTask = function (id) {
    if (confirm("Bạn có chắc muốn xóa công việc này?")) {
        appData.tasks = appData.tasks.filter(t => t.id !== id);
        saveData();
        renderTmTasks();
        if (typeof renderTodos === "function") renderTodos();
    }
}

window.toggleTmTaskCompletion = function (id) {
    const task = appData.tasks.find(t => t.id === id);
    if (task) {
        if (task.status === 'Hoàn thành') {
            task.status = 'Chưa làm';
            task.completedDate = null;
        } else {
            task.status = 'Hoàn thành';
            task.completedDate = getTodayStr();
        }
        saveData();
        renderTmTasks();
        if (typeof renderTodos === "function") renderTodos();
    }
};

window.changeTmTaskStatus = function (id, newStatus) {
    const task = appData.tasks.find(t => t.id === id);
    if (task) {
        task.status = newStatus;
        if (newStatus === 'Hoàn thành') {
            task.completedDate = getTodayStr();
        } else {
            task.completedDate = null;
        }
        saveData();
        renderTmTasks();
        if (typeof renderTodos === "function") renderTodos();
    }
};

document.getElementById('cardStatTotal').addEventListener('click', () => { tmFilterStatus.value = 'all'; renderTmTasks(); });
document.getElementById('cardStatInProgress').addEventListener('click', () => { tmFilterStatus.value = 'Đang làm'; renderTmTasks(); });
document.getElementById('cardStatCompleted').addEventListener('click', () => { tmFilterStatus.value = 'Hoàn thành'; renderTmTasks(); });
document.getElementById('cardStatOverdue').addEventListener('click', () => { tmFilterStatus.value = 'Quá hạn'; renderTmTasks(); });

tmSearchInput.addEventListener('input', renderTmTasks);
tmFilterStatus.addEventListener('change', renderTmTasks);
tmFilterPriority.addEventListener('change', renderTmTasks);

let focusChartInstance = null;
let categoryChartInstance = null;

function renderAdvancedAnalytics() {
    // 1. Focus 7 days chart
    const ctxFocus = document.getElementById('focusChart');
    if (!ctxFocus) return;
    
    let labels = [];
    let focusData = [];
    
    let checkDate = new Date();
    for (let i = 6; i >= 0; i--) {
        let d = new Date(checkDate);
        d.setDate(d.getDate() - i);
        let y = d.getFullYear();
        let m = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        let dateStr = `${y}-${m}-${day}`;
        
        labels.push(`${day}/${m}`);
        
        if (appData.history[dateStr]) {
            focusData.push(appData.history[dateStr].focusMinutes);
        } else {
            focusData.push(0);
        }
    }
    
    if (focusChartInstance) focusChartInstance.destroy();
    focusChartInstance = new Chart(ctxFocus, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Phút tập trung',
                data: focusData,
                backgroundColor: '#E05A33',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#3E352D' }, ticks: { color: '#9E9287' } },
                x: { grid: { display: false }, ticks: { color: '#9E9287' } }
            }
        }
    });

    // 2. Category Pie Chart (Today)
    const ctxCat = document.getElementById('categoryChart');
    if (!ctxCat) return;
    
    let catCounts = {};
    if (appData.history[todayStr]) {
        appData.history[todayStr].todos.forEach(t => {
            if (t.completed) {
                catCounts[t.category] = (catCounts[t.category] || 0) + 1;
            }
        });
    }
    
    let catLabels = Object.keys(catCounts);
    let catData = Object.values(catCounts);
    
    if (categoryChartInstance) categoryChartInstance.destroy();
    
    if (catLabels.length === 0) {
        catLabels = ["Chưa có"];
        catData = [1];
    }
    
    categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: ['#E05A33', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#EFE9E0' } }
            }
        }
    });
}

// --- Rollover Logic ---
const rolloverModal = document.getElementById('rolloverModal');
const btnCloseRollover = document.getElementById('btnCloseRollover');
const btnIgnoreRollover = document.getElementById('btnIgnoreRollover');
const btnAcceptRollover = document.getElementById('btnAcceptRollover');
const rolloverTaskList = document.getElementById('rolloverTaskList');

let pendingRolloverTasks = [];

function checkRollover() {
    // Find the most recent day before today
    let dates = Object.keys(appData.history).filter(d => d < todayStr).sort().reverse();
    if (dates.length === 0) return;
    
    let lastDate = dates[0];
    let lastData = appData.history[lastDate];
    if (!lastData || !lastData.todos) return;
    
    let uncompleted = lastData.todos.filter(t => !t.completed && !t.rolledOver);
    if (uncompleted.length === 0) return;
    
    // Check if we already asked today (we can mark them as rolledOver whether accepted or ignored)
    pendingRolloverTasks = uncompleted;
    
    // Build UI
    rolloverTaskList.innerHTML = '';
    uncompleted.forEach(t => {
        let div = document.createElement('div');
        div.style.padding = '8px';
        div.style.borderBottom = '1px solid var(--border-main)';
        div.style.marginBottom = '4px';
        div.innerText = `• ${t.text}`;
        rolloverTaskList.appendChild(div);
    });
    
    rolloverModal.classList.add('active');
}

function processRollover(accept) {
    let dates = Object.keys(appData.history).filter(d => d < todayStr).sort().reverse();
    if (dates.length > 0) {
        let lastDate = dates[0];
        appData.history[lastDate].todos.forEach(t => {
            if (!t.completed) t.rolledOver = true; // Mark as handled
        });
    }
    
    if (accept) {
        pendingRolloverTasks.forEach(t => {
            appData.history[todayStr].todos.push({
                id: Date.now() + Math.random(),
                text: t.text,
                time: t.time,
                category: t.category,
                completed: false
            });
        });
    }
    
    saveData();
    renderTodos();
    rolloverModal.classList.remove('active');
}

if (btnCloseRollover) btnCloseRollover.addEventListener('click', () => rolloverModal.classList.remove('active'));
if (btnIgnoreRollover) btnIgnoreRollover.addEventListener('click', () => processRollover(false));
if (btnAcceptRollover) btnAcceptRollover.addEventListener('click', () => processRollover(true));

// UI Elements cho Auth
const btnLogin = document.getElementById('btnLogin');
const userAvatar = document.getElementById('userAvatar');
const authModal = document.getElementById('authModal');
const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const btnAuthLogin = document.getElementById('btnAuthLogin');
const btnAuthRegister = document.getElementById('btnAuthRegister');

if (btnLogin) {
    btnLogin.addEventListener('click', () => {
        if (currentUser) {
            signOut(auth);
        } else {
            authModal.classList.add('active');
        }
    });
}

if (btnCloseAuthModal) {
    btnCloseAuthModal.addEventListener('click', () => {
        authModal.classList.remove('active');
    });
}

if (btnAuthLogin) {
    btnAuthLogin.addEventListener('click', () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return alert('Vui lòng nhập đầy đủ Email và Mật khẩu.');
        
        btnAuthLogin.innerHTML = 'Đang xử lý...';
        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                authModal.classList.remove('active');
                authEmail.value = '';
                authPassword.value = '';
                btnAuthLogin.innerHTML = 'Đang nhập';
            })
            .catch(error => {
                console.error("Lỗi đăng nhập:", error);
                alert("Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.");
                btnAuthLogin.innerHTML = 'Đăng nhập';
            });
    });
}

if (btnAuthRegister) {
    btnAuthRegister.addEventListener('click', () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return alert('Vui lòng nhập đầy đủ Email và Mật khẩu.');
        if (password.length < 6) return alert('Mật khẩu phải có ít nhất 6 ký tự.');
        
        btnAuthRegister.innerHTML = 'Đang xử lý...';
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                const user = userCredential.user;
                const displayName = email.split('@')[0];
                const avatarUrl = `https://ui-avatars.com/api/?name=${displayName}&background=random&color=fff`;
                
                await updateProfile(user, {
                    displayName: displayName,
                    photoURL: avatarUrl
                });
                
                authModal.classList.remove('active');
                authEmail.value = '';
                authPassword.value = '';
                btnAuthRegister.innerHTML = 'Đăng ký tài khoản mới';
            })
            .catch(error => {
                console.error("Lỗi đăng ký:", error);
                alert("Đăng ký thất bại. Email có thể đã được sử dụng hoặc không hợp lệ.");
                btnAuthRegister.innerHTML = 'Đăng ký tài khoản mới';
            });
    });
}

onAuthStateChanged(auth, async (user) => {
    const userNameEl = document.getElementById('userName');
    if (user) {
        currentUser = user;
        if (btnLogin) btnLogin.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Đăng xuất';
        if (userAvatar) {
            userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.email.split('@')[0]}&background=random&color=fff`;
            userAvatar.style.display = 'block';
        }
        if (userNameEl) {
            userNameEl.innerText = user.displayName || user.email.split('@')[0];
        }
        // Load data from Cloud for this user
        await loadData(true);
    } else {
        currentUser = null;
        if (btnLogin) btnLogin.innerHTML = '<i class="fa-solid fa-user"></i> Đăng nhập';
        if (userAvatar) {
            userAvatar.src = '';
            userAvatar.style.display = 'none';
        }
        if (userNameEl) {
            userNameEl.innerText = 'Khách';
        }
        // Load local data for guest
        await loadData(false);
    }
});

// --- Select Task Modal Logic ---
const btnSelectTaskHome = document.getElementById('btnSelectTaskHome');
const selectTaskModal = document.getElementById('selectTaskModal');
const btnCloseSelectTaskModal = document.getElementById('btnCloseSelectTaskModal');
const selectTaskList = document.getElementById('selectTaskList');

if (btnSelectTaskHome) {
    btnSelectTaskHome.addEventListener('click', () => {
        renderSelectTaskList();
        selectTaskModal.classList.add('active');
    });
}
if (btnCloseSelectTaskModal) {
    btnCloseSelectTaskModal.addEventListener('click', () => {
        selectTaskModal.classList.remove('active');
    });
}

function renderSelectTaskList() {
    if (!selectTaskList) return;
    selectTaskList.innerHTML = '';
    const pendingTasks = appData.tasks ? appData.tasks.filter(t => t.status === 'Chưa làm') : [];
    
    if (pendingTasks.length === 0) {
        selectTaskList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">Không có công việc nào đang chờ. Hãy thêm việc mới!</p>';
        return;
    }

    pendingTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'tm-task-item';
        
        const iconMap = {
            'Tài liệu': 'fa-file-lines', 'Mua sắm': 'fa-cart-shopping', 'Học tập': 'fa-book-open',
            'Sức khỏe': 'fa-heart-pulse', 'Công việc': 'fa-desktop', 'Du lịch': 'fa-plane',
            'Lịch trình': 'fa-calendar-days', 'Thời gian': 'fa-clock'
        };
        const iconClass = iconMap[task.icon] || 'fa-list';
        
        item.innerHTML = `
            <div class="tm-task-icon-wrapper"><i class="fa-solid ${iconClass}"></i></div>
            <div class="tm-task-details">
                <div class="tm-task-title">
                    <span>${task.title}</span>
                </div>
                ${task.deadline ? `<div class="tm-task-meta" style="margin-top: 4px;"><span><i class="fa-solid fa-bell"></i> Hạn: ${new Date(task.deadline).toLocaleString('vi-VN')}</span></div>` : ''}
            </div>
            <div class="tm-task-actions">
                <button class="btn btn-primary btn-sm" onclick="startTaskFromSelect('${task.id}')" style="padding: 6px 12px; font-size: 0.85rem;"><i class="fa-solid fa-play"></i> Chọn</button>
            </div>
        `;
        selectTaskList.appendChild(item);
    });
}

window.startTaskFromSelect = function(id) {
    const task = appData.tasks.find(t => t.id === id);
    if (task) {
        task.status = 'Đang làm';
        saveData();
        renderTmTasks();
        if (typeof renderTodos === "function") renderTodos();
        if (selectTaskModal) selectTaskModal.classList.remove('active');
    }
}
