// Global constants defined in index.html (app, auth, db) are available here.
const TODAY_DATE = getTodayDateString();

// Default application state structure for a single day
const DEFAULT_DAY_DATA = {
    academic: { progress: 0, goal: 2 },
    physical: { progress: 0, goal: 30 },
    character: { progress: 0, goal: 10, socialCheck: false },
    mindset: { is100: false },
};

let currentHistory = {};
let activePeriod = 'week'; 
let charts = {};
let userId = null;
let isReady = false;

// --- Date & Storage Utility Functions ---

/** Returns the date string in YYYY-MM-DD format */
function getTodayDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Utility to display messages */
function showStatusMessage(message, color) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = `fixed top-4 left-1/2 transform -translate-x-1/2 p-3 ${color} text-white rounded-lg shadow-xl z-50 text-sm opacity-100 transition-opacity duration-300`;

    setTimeout(() => {
        statusMessage.className = statusMessage.className.replace('opacity-100', 'opacity-0');
        setTimeout(() => statusMessage.classList.add('hidden'), 300);
    }, 2000);
    statusMessage.classList.remove('hidden');
}

/** Shows or hides the loading indicator */
function setLoading(isLoading) {
    document.getElementById('loadingIndicator').classList.toggle('hidden', !isLoading);
}

/**
 * Loads the history from Firestore and sets up a real-time listener.
 */
function loadHistory() {
    if (!userId || !isReady) return;

    setLoading(true);
    
    // Firestore reference to the user's single history document
    const docRef = db.collection('userGrowthHistory').doc(userId);

    // Set up real-time listener
    docRef.onSnapshot(doc => {
        setLoading(false);
        if (doc.exists) {
            currentHistory = doc.data().history || {};
            showStatusMessage('Progress synced from cloud!', 'bg-green-600');
        } else {
            // Document doesn't exist, initialize with current day data
            currentHistory = {};
            showStatusMessage('New user data created in cloud.', 'bg-indigo-600');
        }
        
        // Ensure the current day has data, merging defaults if necessary
        currentHistory[TODAY_DATE] = { ...DEFAULT_DAY_DATA, ...currentHistory[TODAY_DATE] };
        
        // Render the UI based on the updated history
        renderUI();
    }, error => {
        setLoading(false);
        console.error("Firestore listen failed:", error);
        showStatusMessage('Error listening to progress updates.', 'bg-red-700');
    });
}

/**
 * Saves the entire history object to Firestore.
 */
function saveHistory() {
    if (!userId || !isReady) {
        showStatusMessage('App not ready. Data save failed.', 'bg-red-700');
        return;
    }
    
    // Use set with merge:true to ensure the document structure remains simple
    db.collection('userGrowthHistory').doc(userId).set({
        history: currentHistory
    }, { merge: true })
    .then(() => {
        // No status message needed here as onSnapshot handles real-time success
    })
    .catch(error => {
        console.error("Error writing document: ", error);
        showStatusMessage('Failed to save progress to cloud.', 'bg-red-700');
    });
}

// --- Authentication Setup ---

auth.onAuthStateChanged(user => {
    if (user) {
        userId = user.uid;
        isReady = true;
        document.getElementById('userIdDisplay').textContent = userId;
        document.getElementById('userIdDisplay').classList.add('text-green-600');
        loadHistory();
    } else {
        // Sign in anonymously if not authenticated
        auth.signInAnonymously()
            .catch(error => {
                console.error("Anonymous sign-in failed:", error);
                document.getElementById('userIdDisplay').textContent = "AUTH FAILED";
                showStatusMessage('Could not log you in. Sync disabled.', 'bg-red-700');
            });
    }
});


// --- UI & Logic Functions (Encapsulated in a module for clarity) ---

const appLogic = {
    
    renderUI() {
        if (!isReady) return;
        const data = currentHistory[TODAY_DATE];
        
        document.getElementById('todayDateDisplay').textContent = moment().format('dddd, MMMM D, YYYY');

        // 1. Render Goals
        document.getElementById('academicGoal').value = data.academic.goal;
        document.getElementById('physicalGoal').value = data.physical.goal;
        document.getElementById('characterGoal').value = data.character.goal;

        // 2. Render Progress Bars and Text
        ['academic', 'physical', 'character'].forEach(area => {
            const progress = data[area].progress || 0;
            const goal = data[area].goal || 1;
            const progressPercent = Math.min(100, (progress / goal) * 100);
            const progressBar = document.getElementById(`${area}ProgressBar`);
            const progressText = document.getElementById(`${area}ProgressText`);

            progressBar.style.width = `${progressPercent}%`;
            progressText.textContent = `${progress} / ${goal} (${Math.round(progressPercent)}%)`;

            const card = document.getElementById(`${area}Card`);
            card.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-blue-400', 'ring-purple-400');
            progressBar.classList.remove('!bg-green-600');

            if (progressPercent >= 100) {
                let ringColor = '';
                if (area === 'academic') ringColor = 'ring-green-400';
                if (area === 'physical') ringColor = 'ring-blue-400';
                if (area === 'character') ringColor = 'ring-purple-400';

                card.classList.add('ring-2', 'ring-offset-2', ringColor);
                progressBar.classList.add('!bg-green-600');
            }
        });

        // 3. Render Mindset Status
        const mindsetBtn = document.getElementById('mindsetStatusBtn');
        const mindsetFeedback = document.getElementById('mindsetFeedback');

        if (data.mindset.is100) {
            mindsetBtn.textContent = 'Believe 100% Active';
            mindsetBtn.classList.remove('bg-yellow-400', 'hover:bg-yellow-500');
            mindsetBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            mindsetFeedback.innerHTML = '<span class="status-badge bg-green-100 text-green-700">Mindset is Locked In!</span>';
        } else {
            mindsetBtn.textContent = 'Affirm Belief';
            mindsetBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            mindsetBtn.classList.add('bg-yellow-400', 'hover:bg-yellow-500');
            mindsetFeedback.innerHTML = '<span class="status-badge bg-yellow-100 text-yellow-700">Awaiting Affirmation</span>';
        }

        // 4. Render Social Check
        const socialCheck = document.getElementById('socialCheck');
        const isSocialChecked = data.character.socialCheck || false;
        if (isSocialChecked) {
            socialCheck.textContent = '✓ Done!';
            socialCheck.classList.add('text-green-600');
            socialCheck.classList.remove('text-blue-600');
        } else {
            socialCheck.textContent = '✓';
            socialCheck.classList.add('text-blue-600');
            socialCheck.classList.remove('text-green-600');
        }
        
        // 5. Render Analysis
        appLogic.renderAnalysis();
    },

    // --- Analysis Functions (Updated to be methods of appLogic) ---
    
    /** Gets daily performance over a range (Logic remains the same as previous files) */
    getDailyPerformance(days, endDate) {
        const history = currentHistory;
        const periodData = [];
        const isAllTime = days > 36500; 

        let startDate;
        if (isAllTime) {
            const historyDates = Object.keys(history);
            if (historyDates.length === 0) return [];

            const earliestDate = historyDates.reduce((minDate, date) => {
                return moment(date).isBefore(minDate) ? moment(date) : minDate;
            }, moment()); 
            
            startDate = earliestDate.clone().subtract(1, 'day').startOf('day');
        } else {
            startDate = moment(endDate).subtract(days, 'days').startOf('day');
        }

        let currentDate = moment(startDate).add(1, 'day'); 

        while (currentDate.isBefore(endDate) && !currentDate.isAfter(moment())) {
            const dateString = currentDate.format('YYYY-MM-DD');
            const dayData = history[dateString];

            let academic = 0, physical = 0, character = 0;
            let loggedDay = false;

            if (dayData) {
                loggedDay = true;
                const calc = (progress, goal) => (goal > 0 ? Math.min(100, (progress / goal) * 100) : 0);
                
                academic = calc(dayData.academic.progress, dayData.academic.goal);
                physical = calc(dayData.physical.progress, dayData.physical.goal);
                character = calc(dayData.character.progress, dayData.character.goal);
            } else if (currentDate.isBefore(moment())) {
                loggedDay = true; 
            }

            if (loggedDay || !currentDate.isAfter(moment())) {
                 periodData.push({
                     date: currentDate.format('YYYY-MM-DD'),
                     label: currentDate.format('MMM D'), 
                     academic: academic,
                     physical: physical,
                     character: character,
                     loggedDay: loggedDay
                 });
            }
            
            currentDate.add(1, 'day');
        }
        return periodData;
    },

    calculateAverageScore(performanceData) {
        let totalScore = 0;
        let loggedDayCount = 0; 
        
        performanceData.forEach(day => {
            if (day.loggedDay) {
                const dailyAverage = (day.academic + day.physical + day.character) / 3;
                totalScore += dailyAverage;
                loggedDayCount++;
            }
        });

        return loggedDayCount > 0 ? Math.round(totalScore / loggedDayCount) : 0;
    },

    setAnalysisPeriod(period) {
        activePeriod = period;
        
        document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('period-active'));
        document.getElementById(`${period}Btn`).classList.add('period-active');
        
        appLogic.renderAnalysis();
    },

    renderAnalysis() {
        let days, periodLabel, previousLabel;
        
        if (activePeriod === 'week') {
            days = 7;
            periodLabel = 'This Week';
            previousLabel = 'Last Week';
        } else if (activePeriod === 'month') {
            days = 30;
            periodLabel = 'This Month';
            previousLabel = 'Last Month';
        } else if (activePeriod === 'year') {
            days = 365;
            periodLabel = 'This Year';
            previousLabel = 'Last Year';
        } else if (activePeriod === 'all') {
            days = 40000; 
        }

        const endDate = moment().startOf('day').add(1, 'second'); 
        
        let currentPeriodData, previousPeriodData, historyDurationDays;
        
        if (activePeriod === 'all') {
            const historyDates = Object.keys(currentHistory);
            
            if (historyDates.length === 0 || historyDates.length === 1 && historyDates[0] === TODAY_DATE) {
                 currentPeriodData = appLogic.getDailyPerformance(1, endDate);
                 previousPeriodData = []; 
            } else {
                 const minDate = historyDates.reduce((min, date) => moment(date).isBefore(min) ? moment(date) : min, moment());
                 historyDurationDays = endDate.diff(minDate, 'days');
                 
                 const halfDuration = Math.max(1, Math.floor(historyDurationDays / 2));
                 
                 currentPeriodData = appLogic.getDailyPerformance(halfDuration, endDate);
                 
                 const previousEnd = moment(endDate).subtract(halfDuration, 'days');
                 previousPeriodData = appLogic.getDailyPerformance(halfDuration, previousEnd);
            }

            periodLabel = `Second Half (${currentPeriodData.length} Days)`;
            previousLabel = `First Half (${previousPeriodData.length} Days)`;

        } else {
            currentPeriodData = appLogic.getDailyPerformance(days, endDate);
            const previousEndDate = moment(endDate).subtract(days, 'days');
            previousPeriodData = appLogic.getDailyPerformance(days, previousEndDate);
        }

        const currentAverage = appLogic.calculateAverageScore(currentPeriodData);
        const previousAverage = appLogic.calculateAverageScore(previousPeriodData);

        // --- Update Comparison Card ---
        const scoreDiff = currentAverage - previousAverage;
        const diffText = scoreDiff >= 0 ? `+${scoreDiff}%` : `${scoreDiff}%`;
        const diffColor = scoreDiff >= 0 ? 'text-green-600' : 'text-red-500';
        const diffIcon = scoreDiff >= 0 ? 
            `<svg class="w-5 h-5 inline-block -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>` :
            `<svg class="w-5 h-5 inline-block -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>`;

        document.getElementById('currentPeriodLabel').textContent = periodLabel;
        document.getElementById('previousPeriodLabel').textContent = previousLabel;
        document.getElementById('currentAvgScore').textContent = `${currentAverage}%`;
        document.getElementById('previousAvgScore').textContent = `${previousAverage}%`;
        document.getElementById('scoreDifference').innerHTML = `${diffIcon} <span class="${diffColor} font-bold">${diffText}</span>`;

        // --- Update Charts ---
        
        const dataPointsForChart = currentPeriodData.slice(0, currentPeriodData.length);
        // Map the previous trend data to align with the length of the current period
        const previousTrendData = previousPeriodData.slice(-dataPointsForChart.length);

        let chartLabels = dataPointsForChart.map((_, index) => `Day ${index + 1}`); 

        let tickCallback = null;
        if (activePeriod === 'year' || activePeriod === 'all') {
            chartLabels = dataPointsForChart.map(d => moment(d.date).format('MMM D'));
            tickCallback = function(value, index, values) {
                const dataPoint = dataPointsForChart[index];
                if (!dataPoint) return null;
                const date = moment(dataPoint.date);
                const totalPoints = dataPointsForChart.length;
                const interval = activePeriod === 'year' ? 30 : Math.max(1, Math.floor(totalPoints / 10));

                if (date.date() === 1 || (index % interval === 0)) {
                     return date.format('MMM YYYY');
                }
                return null;
            };
        }

        const areaConfigs = [
            { id: 'academicChart', area: 'academic', label: 'Academic Knowledge', color: 'rgb(52, 211, 153)' },
            { id: 'physicalChart', area: 'physical', label: 'Daily Workout', color: 'rgb(96, 165, 250)' },
            { id: 'characterChart', area: 'character', label: 'Personality & Social', color: 'rgb(167, 139, 250)' },
        ];

        areaConfigs.forEach(config => {
            const ctx = document.getElementById(config.id) ? document.getElementById(config.id).getContext('2d') : null;
            
            if (!ctx) return;
            
            if (charts[config.id]) {
                charts[config.id].destroy(); 
            }
            
            const getCurrentPeriodChartData = (area) => dataPointsForChart.map(d => d[area]);
            const getPreviousPeriodChartData = (area) => previousTrendData.map(d => d[area]);

            charts[config.id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [
                        {
                            label: periodLabel, 
                            data: getCurrentPeriodChartData(config.area),
                            borderColor: config.color,
                            backgroundColor: config.color.replace(')', ', 0.1)'),
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4,
                            pointRadius: 4,
                        },
                        {
                            label: previousLabel, 
                            data: getPreviousPeriodChartData(config.area),
                            borderColor: 'rgb(203, 213, 225)', 
                            backgroundColor: 'rgb(203, 213, 225)',
                            borderWidth: 2,
                            borderDash: [5, 5], 
                            fill: false,
                            tension: 0.4,
                            pointRadius: 2,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true, 
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: config.label,
                            font: { size: 16, weight: 'bold' },
                            color: '#374151'
                        }
                    },
                    scales: {
                        x: {
                            title: { display: false },
                            grid: { display: false },
                            ticks: {
                                callback: tickCallback,
                                autoSkip: tickCallback === null, 
                                maxTicksLimit: tickCallback === null ? 10 : undefined
                            }
                        },
                        y: {
                            min: 0,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Completion (%)'
                            },
                            ticks: {
                                stepSize: 25
                            }
                        }
                    }
                }
            });
        });
    },

    updateGoal(area, inputId) {
        if (!isReady) return showStatusMessage('Please wait for sync to complete.', 'bg-gray-500');
        const input = document.getElementById(inputId);
        let goal = parseFloat(input.value);

        if (isNaN(goal) || goal <= 0) {
            goal = 1;
            input.value = goal;
        }

        currentHistory[TODAY_DATE][area].goal = goal;
        saveHistory();
        appLogic.renderUI();
        showStatusMessage(`Goal for ${area} updated to ${goal}.`, 'bg-blue-500');
    },

    updateTracker(area, inputId) {
        if (!isReady) return showStatusMessage('Please wait for sync to complete.', 'bg-gray-500');
        const input = document.getElementById(inputId);
        const value = parseFloat(input.value);

        if (isNaN(value) || value <= 0) {
            showStatusMessage('Please enter a valid positive number.', 'bg-red-500');
            return;
        }

        if (!currentHistory[TODAY_DATE][area].progress) {
             currentHistory[TODAY_DATE][area].progress = 0;
        }

        const currentProgress = currentHistory[TODAY_DATE][area].progress;
        currentHistory[TODAY_DATE][area].progress = currentProgress + value;
        
        saveHistory();
        appLogic.renderUI();
        input.value = '';
        showStatusMessage(`Logged ${value} for ${area}! Keep it up!`, 'bg-green-500');
    },

    toggleMindsetStatus() {
        if (!isReady) return showStatusMessage('Please wait for sync to complete.', 'bg-gray-500');
        const newStatus = !currentHistory[TODAY_DATE].mindset.is100;
        currentHistory[TODAY_DATE].mindset.is100 = newStatus;
        saveHistory();
        appLogic.renderUI();

        if (newStatus) {
            showStatusMessage('Mindset: BELIEVE 100% affirmed for today!', 'bg-yellow-400');
        } else {
            showStatusMessage('Mindset status reset.', 'bg-gray-500');
        }
    },

    toggleSocialCheck() {
        if (!isReady) return showStatusMessage('Please wait for sync to complete.', 'bg-gray-500');
         const newStatus = !currentHistory[TODAY_DATE].character.socialCheck;
         currentHistory[TODAY_DATE].character.socialCheck = newStatus;
         saveHistory();
         appLogic.renderUI();

         if (newStatus) {
             showStatusMessage('Social goal accomplished! Made someone smile!', 'bg-purple-400');
         } else {
             showStatusMessage('Social goal unchecked.', 'bg-gray-500');
         }
    },

    resetDailyProgress() {
        if (!isReady) return showStatusMessage('Please wait for sync to complete.', 'bg-gray-500');
        
        const currentGoals = {
            academic: currentHistory[TODAY_DATE].academic.goal,
            physical: currentHistory[TODAY_DATE].physical.goal,
            character: currentHistory[TODAY_DATE].character.goal
        };

        const resetData = {
            academic: { progress: 0, goal: currentGoals.academic },
            physical: { progress: 0, goal: currentGoals.physical },
            character: { progress: 0, goal: currentGoals.character, socialCheck: false },
            mindset: { is100: false },
        };
        
        currentHistory[TODAY_DATE] = resetData;
        
        saveHistory();
        appLogic.renderUI();
        showStatusMessage('Daily progress reset! New day, new opportunities!', 'bg-blue-600');
    }
};

// Expose public methods
window.appLogic = appLogic;

// Set initial active period on load
window.addEventListener('load', () => {
    // Only set active period if the authentication process has begun
    if (typeof firebase !== 'undefined' && firebase.auth().currentUser !== null) {
        appLogic.setAnalysisPeriod('week');
    }
});

// Expose renderUI globally for authentication callback
window.renderUI = appLogic.renderUI;

