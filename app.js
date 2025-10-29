// Global instance variables for Firebase services and tracking state
let auth = null; 
let db = null;   

// --- CONFIGURATION (Adapted for Canvas environment) ---
// Fallback configuration if globals are not available (e.g., running locally)
const userFirebaseConfig = {
    apiKey: "AIzaSyBm04Z-D_62R6gVFPVpzXbeiYm8n--1m_0",
    authDomain: "selfgrowth-tracker.firebaseapp.com",
    projectId: "selfgrowth-tracker",
    storageBucket: "selfgrowth-tracker.firebasestorage.app",
    messagingSenderId: "358018453335",
    appId: "1:358018453335:web:e0760db9051da0b79ab812",
    measurementId: "G-4ZV014Q4BC"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : userFirebaseConfig;

const initialAuthToken = typeof __initial_auth_token !== 'undefined' 
    ? __initial_auth_token 
    : null;

// --- INITIALIZATION FUNCTION ---
function initFirebase() {
    if (typeof firebase === 'undefined') {
        return { auth: null, db: null };
    }
    try {
        const app = firebase.initializeApp(firebaseConfig);
        return {
            auth: app.auth(),
            db: app.firestore()
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
        // Only toggle the visual indicator, the logic is controlled by onAuthStateChanged
        document.getElementById('loadingIndicator').classList.toggle('hidden', !isLoading);
        document.getElementById('googleSignInBtn').disabled = isLoading;
    },

    getTodayDateKey() {
        return moment().format('YYYY-MM-DD');
    },

    // --- AUTHENTICATION HANDLERS (Uses Redirect Method) ---
    async handleGoogleLogin() {
        if (!auth) {
             appLogic.showStatusMessage('Initialization Failed. Please try refreshing.', 'bg-red-500');
             return;
        }

        appLogic.setLoading(true);

        const provider = new firebase.auth.GoogleAuthProvider();
        
        provider.setCustomParameters({
            prompt: 'select_account' 
        });

        try {
            // Note: Redirect is often problematic. Pop-up is generally more stable.
            await auth.signInWithRedirect(provider);
        } catch (error) {
            appLogic.showStatusMessage(`Sign In Failed: ${error.message}`, 'bg-red-500');
            appLogic.setLoading(false);
        }
    },

    handleLogout() {
        auth.signOut();
        appLogic.showStatusMessage('Successfully logged out.', 'bg-gray-500');
    },
    
    setUserId: (uid) => {
        appLogic.userId = uid;
        document.getElementById('userIdDisplay').textContent = uid ? uid : 'No User';
        if (uid) {
            appLogic.setupDataListener();
        }
    },

    // --- FIREBASE DATA SYNC (UNCHANGED) ---
    async setupDataListener() {
        if (!appLogic.userId) return;

        const docRef = db.collection('userGrowthHistory').doc(appLogic.userId);
        appLogic.setLoading(true);

        try {
            // Use onSnapshot for real-time updates
            docRef.onSnapshot(doc => {
                const data = doc.data() || {};
                
                appLogic.history = data.history || {};
                
                const todayKey = appLogic.getTodayDateKey();
                let dailyData = appLogic.history[todayKey] || {};

                appLogic.dailyGoalData = Object.assign({}, appLogic.DEFAULT_GOALS, dailyData);
                appLogic.dailyGoalData.date = todayKey; 

                appLogic.renderUI();
                appLogic.setLoading(false);
            }, error => {
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

        const docRef = db.collection('userGrowthHistory').doc(appLogic.userId);

        try {
            // Use set with merge true to ensure only history field is updated (if other fields existed)
            await docRef.set({ history: appLogic.history }, { merge: true }); 
        } catch (e) {
            appLogic.showStatusMessage(`Save failed: ${e.message}`, 'bg-red-500');
        }
    },

    // --- TRACKER LOGIC (Omitting detailed implementation for brevity, logic remains the same) ---
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
        appLogic.showStatusMessage(appLogic.dailyGoalData[area].is100 ? 'Mindset: BELIEVE 100% affirmed!' : 'Mindset status reset.', 'bg-yellow-400');
    },

    toggleSocialCheck() { 
         const area = 'character';
         appLogic.dailyGoalData[area].socialCheck = !appLogic.dailyGoalData[area].socialCheck;
         appLogic.saveHistory();
         appLogic.showStatusMessage(appLogic.dailyGoalData[area].socialCheck ? 'Social goal accomplished! Made someone smile!' : 'Social goal unchecked.', 'bg-purple-400');
    },

    resetDailyProgress() { 
        const todayKey = appLogic.getTodayDateKey();
        const currentGoals = appLogic.dailyGoalData;
        
        appLogic.dailyGoalData = {
            academic: { progress: 0, goal: currentGoals.academic.goal },
            physical: { progress: 0, goal: currentGoals.physical.goal },
            character: { progress: 0, goal: currentGoals.character.goal, socialCheck: false },
            mindset: { status: 'Untoggled', is100: false },
            date: todayKey
        };
        appLogic.saveHistory();
        appLogic.showStatusMessage('Daily progress reset! New day, new opportunities!', 'bg-blue-600');
    },
    
    // --- UI RENDERING (UNCHANGED) ---
    renderUI() { 
        const todayKey = appLogic.getTodayDateKey();
        document.getElementById('todayDateDisplay').textContent = moment().format('ddd, MMM D, YYYY');
        
        appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
            const data = appLogic.dailyGoalData[area];
            
            const goal = data.goal || appLogic.DEFAULT_GOALS[area].goal;
            const progress = data.progress || 0;

            const goalInput = document.getElementById(`${area}Goal`);
            if (goalInput) goalInput.value = goal;

            const progressPercent = Math.min(100, (progress / goal) * 100);
            const progressBar = document.getElementById(`${area}ProgressBar`);
            const progressText = document.getElementById(`${area}ProgressText`);
            const card = document.getElementById(`${area}Card`);

            if (progressBar) progressBar.style.width = `${progressPercent}%`;
            if (progressText) progressText.textContent = `${progress} / ${goal} (${Math.round(progressPercent)}%)`;

            card.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
            if (progressBar) progressBar.classList.remove('!bg-green-600');

            if (progressPercent >= 100) {
                card.classList.add('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
                if (progressBar) progressBar.classList.add('!bg-green-600');
            }
            
            if (area === 'character') {
                 const socialCheck = document.getElementById('socialCheck');
                 if (socialCheck) {
                     if (data.socialCheck) {
                         socialCheck.textContent = '✓ Done!';
                         socialCheck.classList.add('text-green-600');
                         socialCheck.classList.remove('text-blue-600');
                     } else {
                         socialCheck.textContent = '✓';
                         socialCheck.classList.add('text-blue-600');
                         socialCheck.classList.remove('text-green-600');
                     }
                 }
            }
        });

        const mindsetBtn = document.getElementById('mindsetStatusBtn');
        const mindsetFeedback = document.getElementById('mindsetFeedback');
        const mindsetData = appLogic.dailyGoalData['mindset'];
        const is100 = mindsetData ? mindsetData.is100 : false;

        if (mindsetBtn && mindsetFeedback) {
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
        }


        appLogic.setAnalysisPeriod(appLogic.activePeriod);
    },
    
    // --- ANALYSIS LOGIC (Omitting detailed implementation for brevity, logic remains the same) ---
    getAnalysisDuration() { 
        const today = moment().startOf('day');
        let duration;
        let previousDuration;
        
        switch (appLogic.activePeriod) {
            case 'week': duration = 7; previousDuration = 7; break;
            case 'month': duration = 30; previousDuration = 30; break;
            case 'year': duration = 365; previousDuration = 365; break;
            case 'all':
                const historyDates = Object.keys(appLogic.history).sort();
                if (historyDates.length === 0) {
                    duration = 1; previousDuration = 0; break;
                }
                const firstDay = moment(historyDates[0], 'YYYY-MM-DD');
                const totalDays = today.diff(firstDay, 'days') + 1;
                duration = Math.ceil(totalDays / 2); 
                previousDuration = Math.floor(totalDays / 2); 
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
        
        for (let i = 0; i < duration; i++) {
            const date = moment(start).add(i, 'days');
            const dateKey = date.format('YYYY-MM-DD');
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
        }
        return dailyData;
    },

    calculateAverages(periodData) { 
        const total = { academic: 0, physical: 0, character: 0 };
        const areas = appLogic.TRACKER_AREAS.filter(a => a !== 'mindset');
        const days = Object.keys(periodData).length;

        Object.values(periodData).forEach(day => {
            areas.forEach(area => {
                 total[area] += day[area] || 0;
            });
        });
        
        const avg = {};
        areas.forEach(area => {
            avg[area] = days > 0 ? (total[area] / days) : 0;
        });

        const overallAvg = days > 0 ? 
            (Object.values(avg).reduce((sum, val) => sum + val, 0) / areas.length) : 0;
            
        return { avg: avg, overallAvg: overallAvg, days: days };
    },

    setAnalysisPeriod(period) {
        appLogic.activePeriod = period;
        // Update button styles
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.remove('period-active');
        });
        document.getElementById(`${period}Btn`).classList.add('period-active');
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


        const labels = Array.from({ length: currentAverages.days }, (_, i) => moment(currentPeriodStart).add(i, 'days').format('MM/DD'));
        
        appLogic.TRACKER_AREAS.filter(a => a !== 'mindset').forEach(area => {
            const currentTrend = labels.map(label => currentDataRaw[moment(label, 'MM/DD').format('YYYY-MM-DD')] ? currentDataRaw[moment(label, 'MM/DD').format('YYYY-MM-DD')][area] : NaN);
            
            const previousTrend = Array.from({ length: currentAverages.days }, (_, i) => {
                const prevDate = moment(previousPeriodStart).add(i, 'days').format('YYYY-MM-DD');
                return previousDataRaw[prevDate] ? previousDataRaw[prevDate][area] : NaN;
            });
            
            appLogic.drawChart(area, labels, currentTrend, previousTrend);
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
window.onload = function() {
    const firebaseServices = initFirebase();
    auth = firebaseServices.auth;
    db = firebaseServices.db;
    
    if (!auth || !db) {
         appLogic.showStatusMessage('Initialization Failed. Please try refreshing.', 'bg-red-900');
         return;
    }
    
    // 1. Initial Authentication (Canvas Requirement)
    // Attempt to sign in with the custom token or anonymously if the token is missing.
    const initialAuth = async () => {
        try {
            if (initialAuthToken) {
                await auth.signInWithCustomToken(initialAuthToken);
            } else {
                await auth.signInAnonymously();
            }
        } catch (error) {
            console.error("Initial Auth Error:", error);
            // Don't show a huge error if anonymous/custom token fails, let Google button handle it.
        }
    };
    
    // 2. Check for pending redirect result (handles return from Google login)
    // We execute this, but let the state listener handle the UI toggle to prevent the loop.
    auth.getRedirectResult().then(() => {
        // Successfully processed redirect, state listener will fire next.
        appLogic.showStatusMessage('Authentication flow processing...', 'bg-indigo-600');
    }).catch((error) => {
        // Redirect failed (e.g., user closed window), state listener will handle the resulting (non-)user.
        console.error("Redirect Error:", error);
    });

    // 3. Main Auth Listener: This is the SINGLE source of truth for UI visibility.
    // It runs after all redirect checks and initial sign-ins, guaranteeing a stable state.
    auth.onAuthStateChanged((user) => {
        appLogic.setLoading(false); // Hide the loading screen now that state is known
        document.getElementById('googleSignInBtn').disabled = false; // Enable the button

        if (user) {
            appLogic.setUserId(user.uid);
            // Show the Tracker page
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('trackerAppContainer').classList.remove('hidden');
            appLogic.showStatusMessage('Welcome! Your progress is synced.', 'bg-green-600');
        } else {
            appLogic.setUserId(null); 
            // Show the Sign-In screen
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('trackerAppContainer').classList.add('hidden');
        }
    });

    // Start the initial auth process (which will trigger onAuthStateChanged)
    initialAuth();
};
