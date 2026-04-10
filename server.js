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
            socket.join(`admin_${currentUser}`); // Put admin in a private "room"
            
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
    });

    socket.on('submitExam', (result) => {
        // Find owner: Clean the name to ensure matching works
        const targetSetName = result.setName || result.folder.split('] ')[1];
        const setOwner = questionBank.find(q => q.set === targetSetName)?.owner || "admin"; 
        
        const finalResult = { ...result, owner: setOwner };
        const folder = finalResult.folder;
        
        if (!studentResults[folder]) studentResults[folder] = [];
        studentResults[folder].push(finalResult);
        saveData();

        // Only send updates to the specific admin's room
        io.to(`admin_${setOwner}`).emit('updateResults', getAdminResults(setOwner));
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData();
            // Refresh the view for the admin who deleted it
            if (currentUser) {
                socket.emit('updateResults', getAdminResults(currentUser));
            }
        }
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server active on ${PORT}`));
