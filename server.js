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

const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

// Initialize files with empty defaults if missing
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
if (!fs.existsSync(RESULTS_PATH)) fs.writeFileSync(RESULTS_PATH, JSON.stringify({}));

let questionBank = JSON.parse(fs.readFileSync(DB_PATH));
let studentResults = JSON.parse(fs.readFileSync(RESULTS_PATH));

function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
    } catch (err) {
        console.error("Critical: Data Save Error:", err);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial data sync
    socket.emit('initData', { questionBank, studentResults });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        // qData now includes adminPin AND pass (exam password)
        const index = questionBank.findIndex(q => q.id === qData.id);
        if (index !== -1) {
            questionBank[index] = qData;
        } else {
            questionBank.push(qData);
        }
        
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteQuestion', (qId) => {
        questionBank = questionBank.filter(q => q.id !== qId);
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    // FIXED: Uses adminPin to ensure only the owner can delete the set
    socket.on('deleteSet', ({ setName, adminPin }) => {
        questionBank = questionBank.filter(q => !(q.set === setName && q.adminPin === adminPin));
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    // --- RESULTS MANAGEMENT ---
    socket.on('submitExam', (result) => {
        const folder = result.folder;
        if (!studentResults[folder]) studentResults[folder] = [];

        // Check if student already has a record in this specific folder
        const existingIndex = studentResults[folder].findIndex(r => r.n === result.n);
        
        if (existingIndex !== -1) {
            studentResults[folder][existingIndex] = result;
        } else {
            studentResults[folder].push(result);
        }
        
        saveData();
        io.emit('updateResults', studentResults);
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData();
            io.emit('updateResults', studentResults);
        }
    });

    socket.on('disconnect', () => console.log('User disconnected'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TEIL Server running on port ${PORT}`));
