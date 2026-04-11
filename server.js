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
            const data = fs.readFileSync(filePath, 'utf8');
            return data ? JSON.parse(data) : defaultValue;
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

// Helper to filter results for a specific admin
const getAdminResults = (adminName) => {
    const filtered = {};
    for (const folder in studentResults) {
        // Only include results belonging to this admin
        const matches = studentResults[folder].filter(r => r.owner === adminName);
        if (matches.length > 0) {
            filtered[folder] = matches;
        }
    }
    return filtered;
};

io.on('connection', (socket) => {
    let currentUser = null;

    // INITIAL CONNECTION (Student Mode)
    // We send ONLY questions. studentResults is sent as an empty object for safety.
    socket.emit('initData', { 
        questionBank: questionBank, 
        studentResults: {} 
    });

    socket.on('adminLogin', (data) => {
        const { name, pass } = data;
        const nameLower = name ? name.toLowerCase() : "";
        
        if (ADMIN_CREDENTIALS[nameLower] && ADMIN_CREDENTIALS[nameLower] === pass) {
            currentUser = nameLower;
            socket.join(`admin_${currentUser}`); 
            
            // Only send this specific admin's questions and results
            const userQuestions = questionBank.filter(q => q.owner === currentUser);
            const userResults = getAdminResults(currentUser);

            socket.emit('loginSuccess', 'editorView');
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
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
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
        // Find owner based on the set name from the global bank
        const match = questionBank.find(q => q.set === result.setName);
        const setOwner = match ? match.owner : "admin"; 
        
        const finalResult = { ...result, owner: setOwner };
        const folder = finalResult.folder;
        
        if (!studentResults[folder]) studentResults[folder] = [];
        studentResults[folder].push(finalResult);
        saveData();

        // Real-time update ONLY to the owner of this exam
        io.to(`admin_${setOwner}`).emit('updateResults', getAdminResults(setOwner));
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (!currentUser) return;
        if (studentResults[folderName]) {
            // Only delete records in that folder that belong to the current admin
            studentResults[folderName] = studentResults[folderName].filter(r => r.owner !== currentUser);
            
            // If folder is now empty, remove it entirely
            if (studentResults[folderName].length === 0) delete studentResults[folderName];
            
            saveData();
            socket.emit('updateResults', getAdminResults(currentUser));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server active on port ${PORT}`));
