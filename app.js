// Global instance variables for Firebase services and tracking state
let auth = null; // Will be initialized by initFirebase()
let db = null;   // Will be initialized by initFirebase()

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
        }, 2000);
    },

    setLoading(isLoading) {
        document.getElementById('loadingIndicator').classList.toggle('hidden', !isLoading);
        document.getElementById('googleSignInBtn').disabled = isLoading;
    },

    getTodayDateKey() {
        return moment().format('YYYY-MM-DD');
    },

    // --- AUTHENTICATION HANDLERS ---
    async handleGoogleLogin() {
        if (!auth) {
             appLogic.showStatusMessage('Firebase not initialized. Please refresh.', 'bg-red-500');
             return;
        }

        appLogic.setLoading(true);

        const provider = new firebase.auth.GoogleAuthProvider();
        
        provider.setCustomParameters({
            prompt: 'select_account' 
        });

        try {
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

    // --- TRACKER LOGIC (Omitting for brevity) ---
    updateGoal(area, inputId) { /* ... */ },
    updateTracker(area, inputId) { /* ... */ },
    toggleMindsetStatus() { /* ... */ },
    toggleSocialCheck() { /* ... */ },
    resetDailyProgress() { /* ... */ },
    renderUI() { /* ... */ },
    setAnalysisPeriod(period) { /* ... */ },
    renderAnalysis() { /* ... */ },
    drawChart(area, labels, currentTrend, previousTrend) { /* ... */ }
};


// --- INITIALIZATION ---
window.onload = function() {
    const firebaseServices = initFirebase();
    auth = firebaseServices.auth;
    db = firebaseServices.db;
    
    if (!auth || !db) {
         appLogic.showStatusMessage('Initialization Failed. Check console for details.', 'bg-red-900');
         return;
    }
    
    // 1. Check for pending redirect result (if user is returning from Google)
    auth.getRedirectResult().then((result) => {
        if (result.user) {
             appLogic.setLoading(false);
             appLogic.showStatusMessage('Login successful via Google redirect!', 'bg-indigo-600');
        }
        // Enable button after initial load is complete
        document.getElementById('googleSignInBtn').disabled = false;

    }).catch((error) => {
        appLogic.showStatusMessage(`Redirect Login Error: ${error.message}`, 'bg-red-500');
        appLogic.setLoading(false);
        document.getElementById('googleSignInBtn').disabled = false; // Enable button on error
    });

    // 2. Main Auth Listener: Handles all login/logout state changes
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            appLogic.setUserId(user.uid);
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('trackerAppContainer').classList.remove('hidden');
        } else {
            appLogic.setUserId(null); 
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('trackerAppContainer').classList.add('hidden');
        }
    });
};

/*
    NOTE: The repetitive functions like updateGoal, renderUI, and all analysis functions 
    are omitted here for brevity but are included in the full file you should upload.
    The most critical functional parts related to the race condition are included above.
*/
