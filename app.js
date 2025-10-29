
// Global instance variables for Firebase services and tracking state
let app; // Initialized in index.html
let auth; // Initialized in index.html
let db; // Initialized in index.html

// App logic object to manage state and functions
const appLogic = {
    // STATE
    userId: null,
    history: {}, // Stores all date-keyed historical data
    dailyGoalData: {}, // Stores current day's progress and goals
    charts: {}, // Stores Chart.js instances
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
        }, 2000);
    },

    setLoading(isLoading) {
        document.getElementById('loadingIndicator').classList.toggle('hidden', !isLoading);
    },

    getTodayDateKey() {
        return moment().format('YYYY-MM-DD');
    },

    // --- AUTHENTICATION HANDLERS ---
    // Switched to redirect method to fix pop-up issue
    async handleGoogleLogin() {
        appLogic.setLoading(true);

        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Add prompt to allow account switching (as requested)
        provider.setCustomParameters({
            prompt: 'select_account' 
        });

        try {
            // Use signInWithRedirect - this immediately takes over the page
            await auth.signInWithRedirect(provider);
            // Execution stops here while Google handles the sign-in
        } catch (error) {
            appLogic.showStatusMessage(`Sign In Failed: ${error.message}`, 'bg-red-500');
            appLogic.setLoading(false);
        }
    },

    handleLogout() {
        auth.signOut();
        appLogic.showStatusMessage('Successfully logged out.', 'bg-gray-500');
    },
    
    // Function used by onAuthStateChanged to set the user context
    setUserId: (uid) => {
        appLogic.userId = uid;
        document.getElementById('userIdDisplay').textContent = uid ? uid : 'No User';
        if (uid) {
            appLogic.setupDataListener();
        }
    },

    // --- FIREBASE DATA SYNC ---
    async setupDataListener() {
        if (!appLogic.userId) return;

        const docRef = db.collection('userGrowthHistory').doc(appLogic.userId);
        appLogic.setLoading(true);

        try {
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
            await docRef.set({ history: appLogic.history });
        } catch (e) {
            appLogic.showStatusMessage(`Save failed: ${e.message}`, 'bg-red-500');
        }
    },

    // --- TRACKER LOGIC ---
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
    
    // --- UI RENDERING ---
    renderUI() {
        const todayKey = appLogic.getTodayDateKey();
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

            card.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
            progressBar.classList.remove('!bg-green-600');

            if (progressPercent >= 100) {
                card.classList.add('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-offset-white');
                progressBar.classList.add('!bg-green-600');
            }
            
            if (area === 'character') {
                 const socialCheck = document.getElementById('socialCheck');
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
    
    // ANALYSIS functions (omitted for brevity)
    getAnalysisDuration() { /* ... */ },
    getDailyPerformance(duration, endDate, startDate) { /* ... */ },
    calculateAverages(periodData) { /* ... */ },
    renderAnalysis() { /* ... */ },
    drawChart(area, labels, currentTrend, previousTrend) { /* ... */ },


};


// --- INITIALIZATION ---
window.onload = function() {
    if (typeof firebase === 'undefined') {
        appLogic.showStatusMessage('FATAL ERROR: Firebase SDK not loaded.', 'bg-red-900');
        return;
    }

    app = firebase.app();
    auth = app.auth();
    db = app.firestore();
    
    // CRITICAL: Check for a pending redirect result before setting the auth listener
    // This is how the app logs in after Google redirects back to your GitHub page.
    auth.getRedirectResult().then((result) => {
        if (result.user) {
             appLogic.setLoading(false);
             appLogic.showStatusMessage('Login successful via Google redirect!', 'bg-indigo-600');
        }
    }).catch((error) => {
        // If the redirect failed (e.g., user cancelled login), we just show the error.
        appLogic.showStatusMessage(`Redirect Login Error: ${error.message}`, 'bg-red-500');
        appLogic.setLoading(false);
    });

    // Main Auth Listener: This runs once the page is fully loaded or a session is confirmed.
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            appLogic.setUserId(user.uid);
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('trackerAppContainer').classList.remove('hidden');
        } else {
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('trackerAppContainer').classList.add('hidden');
            appLogic.setUserId(null); 
        }
    });
};
