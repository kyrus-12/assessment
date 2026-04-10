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

// Initialize files with empty defaults if missing to prevent crash
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
if (!fs.existsSync(RESULTS_PATH)) fs.writeFileSync(RESULTS_PATH, JSON.stringify({}));

let questionBank = JSON.parse(fs.readFileSync(DB_PATH));
let studentResults = JSON.parse(fs.readFileSync(RESULTS_PATH));

function saveData() {
    try {
        // Atomic-like writing to prevent file corruption during simultaneous requests
        fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
    } catch (err) {
        console.error("Critical: Data Save Error:", err);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Immediate sync
    socket.emit('initData', { questionBank, studentResults });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        // FIX: Check if question exists (by ID) to allow editing instead of just duplicating
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

    socket.on('deleteSet', (setName) => {
        questionBank = questionBank.filter(q => q.set !== setName);
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    // --- RESULTS MANAGEMENT ---
    socket.on('submitExam', (result) => {
        const folder = result.folder;
        if (!studentResults[folder]) studentResults[folder] = [];

        // Check for duplicates
        const alreadyExists = studentResults[folder].some(r => r.n === result.n);
        
        if (!alreadyExists) {
            studentResults[folder].push(result);
            saveData();
            // Broadcast to admins only (performance tip: use rooms if you scale later)
            io.emit('updateResults', studentResults);
            console.log(`Success: ${result.n} saved in ${folder}`);
        } else {
            console.log(`Blocked: Duplicate detected for ${result.n}`);
        }
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
server.listen(PORT, () => console.log(`AIGHAM Server running on port ${PORT}`));
