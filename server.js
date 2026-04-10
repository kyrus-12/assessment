const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e7 // 10MB limit for image data
});

// --- PERMANENT STORAGE SETUP ---
const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

// Helper to safely load JSON
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

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));

// --- REAL-TIME LOGIC ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send existing data immediately upon connection
    socket.emit('initData', { questionBank, studentResults });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        // Check if question exists (by ID) to allow editing/updating
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

        // Find if student already has a record in this specific folder
        const existingIndex = studentResults[folder].findIndex(r => r.n === result.n);
        
        if (existingIndex !== -1) {
            // Update existing score (Allows for 'Reset History' or Retakes)
            studentResults[folder][existingIndex] = result;
            console.log(`Updated record for: ${result.n} in ${folder}`);
        } else {
            // Add brand new record
            studentResults[folder].push(result);
            console.log(`New record saved for: ${result.n} in ${folder}`);
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

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AIGHAM Server active on port ${PORT}`));
