// Global instance variables for Firebase services and tracking state
let auth = null; 
let db = null;   

// --- CONFIGURATION ---
// Mandatory: Use environment variables for config and auth
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : { apiKey: "MOCK_API_KEY", authDomain: "mock.firebaseapp.com", projectId: "mock-project" };
    
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Use the functions imported in index.html for the new SDK syntax
const { 
    firebase: firebase,
    initializeApp: initializeApp,
    getAuth: getAuth,
    signInWithCustomToken: signInWithCustomToken,
    signInAnonymously: signInAnonymously,
    onAuthStateChanged: onAuthStateChanged,
    GoogleAuthProvider: GoogleAuthProvider,
    signInWithPopup: signInWithPopup,
    signOut: signOut,
    getFirestore: getFirestore,
    doc: doc,
    setDoc: setDoc,
    onSnapshot: onSnapshot
} = window;


// --- INITIALIZATION FUNCTION ---
function initFirebase() {
    try {
        // Check if firebase is already initialized to prevent errors
        if (firebase.apps.length === 0) {
            const app = initializeApp(firebaseConfig);
            return {
                auth: getAuth(app),
                db: getFirestore(app)
            };
        }
        return {
             auth: getAuth(),
             db: getFirestore()
        };
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
        appLogic.showStatusMessage('FATAL ERROR: Initialization failed.', 'bg-red-900');
        return { auth: null, db: null };
    }
}


// App logic object to manage state and functions
const appLogic = {
    // STATE
    userId: null,
    history: {}, 
    dailyGoalData: {}, 
    charts: {}, 
    activePeriod: 'week',

    // CONSTANTS
    TRACKER_AREAS: ['academic', 'physical', 'character', 'mindset'],
    DEFAULT_GOALS: {
        academic: { progress: 0, goal: 2, unit: 'Hrs' },
        physical: { progress: 0, goal: 30, unit: 'Min' },
        character: { progress: 0, goal: 10, unit: 'Pages', socialCheck: false },
        mindset: { status: 'Untoggled', is100: false, unit: 'Affirmed' },
    },
    
    // --- UTILITIES & UI HELPERS ---
    showStatusMessage(message, color) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.className = `fixed top-4 left-1/2 transform -translate-x-1/2 p-3 ${color} text-white rounded-lg shadow-xl z-50 text-sm opacity-100 transition-opacity duration-300`;
        statusMessage.classList.remove('hidden');

        setTimeout(() => {
            statusMessage.classList.remove('opacity-100');
            statusMessage.classList.add('opacity-0');
            setTimeout(() => statusMessage.classList.add('hidden'), 300);
        }, 3000);
    },

    setLoading(isLoading) {
        document.getElementById('loadingIndicator').classList.toggle('hidden', !isLoading);
        document.getElementById('googleSignInBtn').disabled = isLoading;
    },

    getTodayDateKey() {
        return moment().format('YYYY-MM-DD');
    },

    // --- AUTHENTICATION HANDLERS (Now uses Pop-up) ---
    async handleGoogleLogin() {
        if (!auth) {
             appLogic.showStatusMessage('Initialization Failed. Please try refreshing.', 'bg-red-500');
             return;
        }

        appLogic.setLoading(true);

        const provider = new GoogleAuthProvider();
        
        provider.setCustomParameters({
            prompt: 'select_account' 
        });

        try {
            // Use signInWithPopup to avoid redirect timing issues and race conditions
            await signInWithPopup(auth, provider);
            // The onAuthStateChanged listener will handle UI update
        } catch (error) {
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                appLogic.showStatusMessage('Pop-up blocked or cancelled. Check your browser settings.', 'bg-yellow-600');
            } else {
                 appLogic.showStatusMessage(`Sign In Failed: ${error.message}`, 'bg-red-500');
            }
            appLogic.setLoading(false);
        }
    },

    handleLogout() {
        signOut(auth);
        appLogic.showStatusMessage('Successfully logged out.', 'bg-gray-500');
    },
    
    setUserId: (uid) => {
        appLogic.userId = uid;
        // Ensure the ID display is correct after login
        document.getElementById('userIdDisplay').textContent = uid ? uid : 'No User';
        if (uid) {
            appLogic.setupDataListener();
        }
    },

    // --- FIREBASE DATA SYNC ---
    async setupDataListener() {
        if (!appLogic.userId) return;

        // CRITICAL FIX: Construct the full, secure, user-specific path using the mandatory global variable
        const docRef = doc(db, 'artifacts', appId, 'users', appLogic.userId, 'growthData', 'history');

        appLogic.setLoading(true);

        try {
            // Use onSnapshot to listen for real-time updates
            onSnapshot(docRef, docSnapshot => {
                const data = docSnapshot.data() || {};
                
                appLogic.history = data.history || {};
                
                const todayKey = appLogic.getTodayDateKey();
                let dailyData = appLogic.history[todayKey] || {};

                appLogic.dailyGoalData = Object.assign({}, appLogic.DEFAULT_GOALS, dailyData);
                appLogic.dailyGoalData.date = todayKey; 

                appLogic.renderUI();
                appLogic.setLoading(false);
            }, error => {
                // This will catch the 'Missing or insufficient permissions' error
                appLogic.showStatusMessage(`Database Error: ${error.message}`, 'bg-red-500');
                appLogic.setLoading(false);
            });
        } catch (e) {
            appLogic.showStatusMessage('Failed to set up data listener.', 'bg-red-500');
            appLogic.setLoading(false);
        }
    },

    async saveHistory() {
        if (!appLogic.userId) {
            appLogic.showStatusMessage('Authentication required to save progress.', 'bg-red-500');
            return;
        }

        const todayKey = appLogic.getTodayDateKey();
        
        appLogic.history[todayKey] = {
            ...appLogic.dailyGoalData,
            date: todayKey
        };

        // CRITICAL FIX: Construct the full, secure, user-specific path using the mandatory global variable
        const docRef = doc(db, 'artifacts', appId, 'users', appLogic.userId, 'growthData', 'history');

        try {
            // Use setDoc with merge: true to save the updated history map
            await setDoc(docRef, { history: appLogic.history }, { merge: true });
            appLogic.showStatusMessage('Progress saved successfully!', 'bg-indigo-600');
        } catch (e) {
            appLogic.showStatusMessage(`Save failed: ${e.message}`, 'bg-red-500');
        }
    },

    // --- TRACKER LOGIC (Simplified/Existing) ---
    updateGoal(area, inputId) { 
        const input = document.getElementById(inputId);
        let goal = parseFloat(input.value);
        if (isNaN(goal) || goal <= 0) {
            goal = appLogic.DEFAULT_GOALS[area].goal; 
            input.value = goal;
        }
        appLogic.dailyGoalData[area].goal = goal;
        appLogic.saveHistory();
        appLogic.showStatusMessage(`Goal for ${area} updated to ${goal} ${appLogic.DEFAULT_GOALS[area].unit}.`, 'bg-blue-500');
    },

    updateTracker(area, inputId) { 
        const input = document.getElementById(inputId);
        const value = parseFloat(input.value);

        if (isNaN(value) || value <= 0) {
            appLogic.showStatusMessage('Please enter a valid positive number.', 'bg-red-500');
            return;
        }
        appLogic.dailyGoalData[area].progress += value;
        input.value = ''; 
        appLogic.saveHistory();
        appLogic.showStatusMessage(`Logged ${value} ${appLogic.DEFAULT_GOALS[area].unit} for ${area}!`, 'bg-green-500');
    },

    toggleMindsetStatus() { 
        const area = 'mindset';
        appLogic.dailyGoalData[area].is100 = !appLogic.dailyGoalData[area].is100;
        appLogic.saveHistory();
        if (appLogic.dailyGoalData[area].is100) {
            appLogic.showStatusMessage('Mindset: BELIEVE 100% affirmed!', 'bg-yellow-400');
        } else {
            appLogic.showStatusMessage('Mindset status reset.', 'bg-gray-500');
        }
    },

    toggleSocialCheck() { 
         const area = 'character';
         appLogic.dailyGoalData[area].socialCheck = !appLogic.dailyGoalData[area].socialCheck;
         appLogic.saveHistory();
         if (appLogic.dailyGoalData[area].socialCheck) {
             appLogic.showStatusMessage('Social goal accomplished! Made someone smile!', 'bg-purple-400');
         } else {
             appLogic.showStatusMessage('Social goal unchecked.', 'bg-gray-500');
         }
    },

    resetDailyProgress() { 
        const todayKey = appLogic.getTodayDateKey();
        const currentGoals = appLogic.dailyGoalData;
        const newDailyData = {
            academic: { progress: 0, goal: currentGoals.academic.goal },
            physical: { progress: 0, goal: currentGoals.physical.goal },
            character: { progress: 0, goal: currentGoals.character.goal, socialCheck: false },
            mindset: { status: 'Untoggled', is100: false },
            date: todayKey
        };
        appLogic.dailyGoalData = newDailyData; 
        appLogic.saveHistory();
        appLogic.showStatusMessage('Daily progress reset! New day, new opportunities!', 'bg-blue-600');
    },

    renderUI() { 
        document.getElementById('todayDateDisplay').textContent = moment().format('ddd, MMM D, YYYY');
        
        appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
            const data = appLogic.dailyGoalData[area];
            const goal = data.goal || appLogic.DEFAULT_GOALS[area].goal;
            const progress = data.progress || 0;
            document.getElementById(`${area}Goal`).value = goal;
            const progressPercent = Math.min(100, (progress / goal) * 100);
            const progressBar = document.getElementById(`${area}ProgressBar`);
            const progressText = document.getElementById(`${area}ProgressText`);
            const card = document.getElementById(`${area}Card`);

            progressBar.style.width = `${progressPercent}%`;
            progressText.textContent = `${progress} / ${goal} (${Math.round(progressPercent)}%)`;

            // Reset classes
            card.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
            progressBar.classList.remove('!bg-green-600');

            if (progressPercent >= 100) {
                card.classList.add('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
                progressBar.classList.add('!bg-green-600');
            }
            
            if (area === 'character') {
                 const socialCheck = document.getElementById('socialCheck');
                 const isChecked = data.socialCheck;
                 socialCheck.textContent = isChecked ? '✓ Done!' : '✓';
                 socialCheck.classList.toggle('text-green-600', isChecked);
                 socialCheck.classList.toggle('text-blue-600', !isChecked);
            }
        });

        const mindsetBtn = document.getElementById('mindsetStatusBtn');
        const mindsetFeedback = document.getElementById('mindsetFeedback');
        const mindsetData = appLogic.dailyGoalData['mindset'];
        const is100 = mindsetData ? mindsetData.is100 : false;

        if (is100) {
            mindsetBtn.textContent = 'BELIEVE 100% Locked';
            mindsetBtn.classList.remove('bg-yellow-400', 'hover:bg-yellow-500');
            mindsetBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            mindsetFeedback.innerHTML = '<span class="status-badge bg-green-100 text-green-700">Mindset is Locked In!</span>';
        } else {
            mindsetBtn.textContent = 'Affirm Belief';
            mindsetBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            mindsetBtn.classList.add('bg-yellow-400', 'hover:bg-yellow-500');
            mindsetFeedback.innerHTML = '<span class="status-badge bg-yellow-100 text-yellow-700">Awaiting Affirmation</span>';
        }

        appLogic.setAnalysisPeriod(appLogic.activePeriod);
    },
    
    getAnalysisDuration() { 
        const today = moment().startOf('day');
        let duration, previousDuration;
        switch (appLogic.activePeriod) {
            case 'week': duration = 7; previousDuration = 7; break;
            case 'month': duration = 30; previousDuration = 30; break;
            case 'year': duration = 365; previousDuration = 365; break;
            case 'all':
                const historyDates = Object.keys(appLogic.history).sort();
                if (historyDates.length === 0) { duration = 1; previousDuration = 0; break; }
                const firstDay = moment(historyDates[0], 'YYYY-MM-DD');
                const totalDays = today.diff(firstDay, 'days') + 1;
                duration = Math.ceil(totalDays / 2); previousDuration = Math.floor(totalDays / 2); 
                break;
            default: duration = 7; previousDuration = 7;
        }
        return { duration, previousDuration };
    },
    getDailyPerformance(duration, endDate, startDate) { 
        const dailyData = {};
        const areaKeys = appLogic.TRACKER_AREAS;
        
        const end = endDate || moment().startOf('day');
        const start = startDate || moment(end).subtract(duration - 1, 'days').startOf('day');
        
        const datesInPeriod = [];
        for (let date = moment(start); date.isSameOrBefore(end); date.add(1, 'days')) {
            datesInPeriod.push(date.format('YYYY-MM-DD'));
        }

        datesInPeriod.forEach(dateKey => {
            const data = appLogic.history[dateKey];
            const result = {};

            areaKeys.forEach(area => {
                const isMindset = area === 'mindset';
                const areaData = data && data[area] ? data[area] : appLogic.DEFAULT_GOALS[area];
                
                let completion;
                if (isMindset) {
                    completion = areaData.is100 ? 100 : 0;
                } else {
                    const progress = areaData.progress || 0;
                    const goal = areaData.goal || appLogic.DEFAULT_GOALS[area].goal;
                    completion = Math.min(100, (progress / goal) * 100);
                }
                result[area] = completion;
            });
            dailyData[dateKey] = result;
        });

        return dailyData;
    },
    calculateAverages(periodData) { 
        const total = { academic: 0, physical: 0, character: 0 };
        const days = Object.keys(periodData).length;

        Object.values(periodData).forEach(day => {
            appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
                 total[area] += day[area] || 0;
            });
        });
        
        const avg = {};
        appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
            avg[area] = days > 0 ? (total[area] / days) : 0;
        });

        const overallAvg = days > 0 ? 
            (Object.values(avg).reduce((sum, val) => sum + val, 0) / 3) : 0;
            
        return { avg: avg, overallAvg: overallAvg, days: days };
    },
    setAnalysisPeriod(period) {
        document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('period-active'));
        const activeBtn = document.getElementById(`${period}Btn`);
        if (activeBtn) { activeBtn.classList.add('period-active'); }
        appLogic.activePeriod = period;
        appLogic.renderAnalysis();
    },
    renderAnalysis() { 
        const { duration, previousDuration } = appLogic.getAnalysisDuration();
        const today = moment().startOf('day');
        
        let currentPeriodEnd = today;
        let currentPeriodStart = moment(today).subtract(duration - 1, 'days');
        
        let previousPeriodEnd = moment(currentPeriodStart).subtract(1, 'second');
        let previousPeriodStart = moment(previousPeriodEnd).subtract(previousDuration - 1, 'days');
        
        const currentDataRaw = appLogic.getDailyPerformance(duration, currentPeriodEnd, currentPeriodStart);
        const previousDataRaw = appLogic.getDailyPerformance(previousDuration, previousPeriodEnd, previousPeriodStart);

        const currentAverages = appLogic.calculateAverages(currentDataRaw);
        const previousAverages = appLogic.calculateAverages(previousDataRaw);

        const currentAvgScore = Math.round(currentAverages.overallAvg);
        const previousAvgScore = Math.round(previousAverages.overallAvg);
        
        const diff = currentAvgScore - previousAvgScore;

        document.getElementById('currentPeriodLabel').textContent = `${appLogic.activePeriod === 'all' ? 'Second Half' : 'Current Period'} (${currentAverages.days} Days)`;
        document.getElementById('previousPeriodLabel').textContent = `${appLogic.activePeriod === 'all' ? 'First Half' : 'Previous Period'} (${previousAverages.days} Days)`;
        document.getElementById('currentAvgScore').textContent = `${currentAvgScore}%`;
        document.getElementById('previousAvgScore').textContent = `${previousAvgScore}%`;
        
        const diffElement = document.getElementById('scoreDifference');
        diffElement.innerHTML = `
            ${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${Math.abs(diff)}%
        `;
        diffElement.classList.toggle('text-green-600', diff >= 0);
        diffElement.classList.toggle('text-red-600', diff < 0);


        const currentLabels = Object.keys(currentDataRaw).map(dateKey => moment(dateKey).format('MM/DD'));
        
        appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
            const currentTrend = currentLabels.map(label => currentDataRaw[moment(label, 'MM/DD').format('YYYY-MM-DD')] ? currentDataRaw[moment(label, 'MM/DD').format('YYYY-MM-DD')][area] : NaN);
            
            const previousKeys = Object.keys(previousDataRaw).sort();
            const previousTrend = Array.from({ length: currentLabels.length }, (_, i) => {
                const prevDateKey = previousKeys[i];
                return previousDataRaw[prevDateKey] ? previousDataRaw[prevDateKey][area] : NaN;
            });
            
            appLogic.drawChart(area, currentLabels, currentTrend, previousTrend);
        });
    },
    drawChart(area, labels, currentTrend, previousTrend) { 
        if (appLogic.charts[area]) {
            appLogic.charts[area].destroy();
        }

        const ctx = document.getElementById(`${area}Chart`).getContext('2d');
        let color, label;
        switch (area) {
            case 'academic': color = 'rgba(52, 211, 153, 1)'; label = 'Academic Progress'; break;
            case 'physical': color = 'rgba(96, 165, 250, 1)'; label = 'Physical Progress'; break;
            case 'character': color = 'rgba(167, 139, 250, 1)'; label = 'Personality Progress'; break;
        }

        appLogic.charts[area] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Current Period',
                        data: currentTrend,
                        borderColor: color,
                        backgroundColor: color.replace('1)', '0.1)'),
                        fill: true,
                        tension: 0.2,
                        pointRadius: 3,
                        borderWidth: 3,
                    },
                    {
                        label: 'Previous Period',
                        data: previousTrend,
                        borderColor: color.replace('1)', '0.5)'),
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: label,
                        color: '#4B5563', 
                        padding: { top: 10, bottom: 5 }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Completion (%)' }
                    }
                }
            }
        });
    }
};


// --- INITIALIZATION ---
window.onload = async function() {
    firebase.setLogLevel('debug');
    const firebaseServices = initFirebase();
    auth = firebaseServices.auth;
    db = firebaseServices.db;
    
    if (!auth || !db) {
         appLogic.showStatusMessage('Initialization Failed. Please try refreshing.', 'bg-red-900');
         return;
    }

    appLogic.setLoading(true);

    try {
        // Use the initial token for immediate environment sign-in
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            // Fallback to anonymous sign-in if token is missing
            await signInAnonymously(auth);
        }
    } catch (e) {
        console.error("Initial Auth Error:", e);
        appLogic.showStatusMessage(`Initial Auth Failed: ${e.message}`, 'bg-red-900');
        appLogic.setLoading(false);
    }
    
    // Main Auth Listener: This is the SINGLE SOURCE OF TRUTH for UI visibility.
    onAuthStateChanged(auth, (user) => {
        appLogic.setLoading(false); 
        document.getElementById('googleSignInBtn').disabled = false; 

        if (user) {
            appLogic.setUserId(user.uid);
            // Show the Tracker
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('trackerAppContainer').classList.remove('hidden');
            appLogic.showStatusMessage('Successfully loaded dashboard.', 'bg-indigo-600');
        } else {
            appLogic.setUserId(null); 
            // Show the Sign-In Screen
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('trackerAppContainer').classList.add('hidden');
        }
    });
};
