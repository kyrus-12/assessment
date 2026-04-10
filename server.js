const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e7 // 10MB limit
});

// --- ADMIN DATABASE (Keep this synced with your frontend) ---
const ADMIN_CREDENTIALS = {
    "admin": "1234",
    "teacher1": "pass567",
    "john": "renz2026"
};

// --- PERMANENT STORAGE SETUP ---
const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

function loadJSON(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error(`Error loading ${filePath}:`, err);
    }
    return defaultValue;
}

let questionBank = loadJSON(DB_PATH, []);
let studentResults = loadJSON(RESULTS_PATH, {});

function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
    } catch (err) {
        console.error("Critical: Data Save Error:", err);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// --- REAL-TIME LOGIC ---
io.on('connection', (socket) => {
    let currentUser = null;
    console.log('User connected:', socket.id);

    // Initial data for students (Admins get filtered data via login)
    socket.emit('initData', { questionBank, studentResults });

    // --- AUTHENTICATION ---
    socket.on('adminLogin', (data) => {
        const { name, pass } = data;
        const nameLower = name.toLowerCase();
        
        if (ADMIN_CREDENTIALS[nameLower] && ADMIN_CREDENTIALS[nameLower] === pass) {
            currentUser = nameLower; 
            
            // Filter: Only send data belonging to THIS admin
            const userQuestions = questionBank.filter(q => q.owner === currentUser);
            const userResults = {};
            for (const folder in studentResults) {
                if (studentResults[folder].some(r => r.owner === currentUser)) {
                    userResults[folder] = studentResults[folder];
                }
            }

            socket.emit('loginSuccess', 'editorView');
            socket.emit('initData', { 
                questionBank: userQuestions, 
                studentResults: userResults 
            });
        } else {
            socket.emit('loginError', 'Incorrect Admin Password.');
        }
    });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        if (!currentUser) return;
        const taggedData = { ...qData, owner: currentUser };
        
        const index = questionBank.findIndex(q => q.id === qData.id);
        if (index !== -1) {
            questionBank[index] = taggedData;
        } else {
            questionBank.push(taggedData);
        }
        
        saveData();
        // Update only the current admin's view
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
    });

    socket.on('deleteQuestion', (qId) => {
        if (!currentUser) return;
        questionBank = questionBank.filter(q => q.id !== qId);
        saveData();
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
    });

    socket.on('deleteSet', (setName) => {
        if (!currentUser) return;
        questionBank = questionBank.filter(q => q.set !== setName);
        saveData();
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
    });

    // --- RESULTS MANAGEMENT ---
    socket.on('submitExam', (result) => {
        // Tag the result with the owner of the set
        const setOwner = questionBank.find(q => q.set === result.setName)?.owner;
        
        if (setOwner) {
            const finalResult = { ...result, owner: setOwner };
            const folder = finalResult.folder;
            
            if (!studentResults[folder]) studentResults[folder] = [];
            studentResults[folder].push(finalResult);
            
            saveData();
            // Emit to everyone so active admins see live updates
            io.emit('updateResults', studentResults); 
        }
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData();
            io.emit('updateResults', studentResults);
        }
    });

    socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AIGHAM Server active on port ${PORT}`));
