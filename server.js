const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e7 // 10MB limit for large exam data
});

// --- PERMANENT STORAGE SETUP ---
const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

// Initialize data from local JSON files if they exist
let questionBank = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH)) : [];
let studentResults = fs.existsSync(RESULTS_PATH) ? JSON.parse(fs.readFileSync(RESULTS_PATH)) : {};

// Helper function to commit changes to the hard drive
function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
    } catch (err) {
        console.error("Error saving data to files:", err);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Sync current state to the user immediately upon connection
    socket.emit('initData', { questionBank, studentResults });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        questionBank.push(qData);
        saveData(); // Save to file
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteSet', (setName) => {
        questionBank = questionBank.filter(q => q.set !== setName);
        saveData(); // Save to file
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteQuestion', (qId) => {
        questionBank = questionBank.filter(q => q.id !== qId);
        saveData(); // Save to file
        io.emit('updateQuestions', questionBank);
    });

    // --- RESULTS MANAGEMENT ---
    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData(); // Save to file
            io.emit('updateResults', studentResults);
        }
    });

    socket.on('submitExam', (result) => {
        const folder = result.folder; 
        
        if (!studentResults[folder]) {
            studentResults[folder] = [];
        }

        // Prevent duplicate names in the same folder
        const existingEntry = studentResults[folder].find(r => r.n === result.n);
        
        if (!existingEntry) {
            studentResults[folder].push(result);
            saveData(); // Save to file
            io.emit('updateResults', studentResults); 
            console.log(`New result saved for ${result.n} in ${folder}`);
        } else {
            console.log(`Duplicate submission blocked: ${result.n}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server active on http://localhost:${PORT}`);
});
