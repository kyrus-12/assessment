const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e7 
});

const ADMIN_CREDENTIALS = {
    "admin": "1234",
    "teacher1": "pass567",
    "john": "renz2026"
};

const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

function loadJSON(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) { console.error(`Error loading ${filePath}:`, err); }
    return defaultValue;
}

let questionBank = loadJSON(DB_PATH, []);
let studentResults = loadJSON(RESULTS_PATH, {});

function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
    } catch (err) { console.error("Save Error:", err); }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    let currentUser = null;

    // --- CRITICAL: FIX FOR STUDENT PASSWORDS ---
    // When anyone (student or admin) connects, send the questionBank 
    // so the frontend handleAuth() can filter by 'pass'.
    socket.emit('initData', { 
        questionBank: questionBank, 
        studentResults: {} // Keep results hidden until admin login
    });

    // Helper to get filtered results for a specific admin
    const getAdminResults = (adminName) => {
        const filtered = {};
        for (const folder in studentResults) {
            const matches = studentResults[folder].filter(r => r.owner === adminName);
            if (matches.length > 0) {
                filtered[folder] = matches;
            }
        }
        return filtered;
    };

    socket.on('adminLogin', (data) => {
        const { name, pass } = data;
        const nameLower = name.toLowerCase();
        
        if (ADMIN_CREDENTIALS[nameLower] === pass) {
            currentUser = nameLower;
            socket.join(`admin_${currentUser}`); 
            
            const userQuestions = questionBank.filter(q => q.owner === currentUser);
            const userResults = getAdminResults(currentUser);

            socket.emit('loginSuccess', 'editorView');
            // Update the admin's view with their specific private data
            socket.emit('initData', { 
                questionBank: userQuestions, 
                studentResults: userResults 
            });
        } else {
            socket.emit('loginError', 'Incorrect PIN.');
        }
    });

    socket.on('saveQuestion', (qData) => {
        if (!currentUser) return;
        const taggedData = { ...qData, owner: currentUser };
        const index = questionBank.findIndex(q => q.id === qData.id);
        
        if (index !== -1) questionBank[index] = taggedData;
        else questionBank.push(taggedData);
        
        saveData();
        // Refresh admin's list
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
        // Refresh global list for students (so new exams are accessible immediately)
        io.emit('refreshGlobalBank', questionBank);
    });

    socket.on('deleteQuestion', (qId) => {
        if (!currentUser) return;
        questionBank = questionBank.filter(q => q.id !== qId);
        saveData();
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
        io.emit('refreshGlobalBank', questionBank);
    });

    socket.on('submitExam', (result) => {
        // Find owner based on the set name
        const targetSetName = result.setName;
        const setOwner = questionBank.find(q => q.set === targetSetName)?.owner || "admin"; 
        
        const finalResult = { ...result, owner: setOwner };
        const folder = finalResult.folder;
        
        if (!studentResults[folder]) studentResults[folder] = [];
        studentResults[folder].push(finalResult);
        saveData();

        // Notify the specific admin in real-time
        io.to(`admin_${setOwner}`).emit('updateResults', getAdminResults(setOwner));
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData();
            if (currentUser) {
                socket.emit('updateResults', getAdminResults(currentUser));
            }
        }
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AIGHAM Server active on port ${PORT}`));
