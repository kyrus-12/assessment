const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// Paths for permanent storage
const DB_PATH = path.join(__dirname, 'questionBank.json');
const RESULTS_PATH = path.join(__dirname, 'studentResults.json');

// Load data from files or initialize empty
let questionBank = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH)) : [];
let studentResults = fs.existsSync(RESULTS_PATH) ? JSON.parse(fs.readFileSync(RESULTS_PATH)) : {};

function saveData() {
    fs.writeFileSync(DB_PATH, JSON.stringify(questionBank, null, 2));
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(studentResults, null, 2));
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected');
    socket.emit('initData', { questionBank, studentResults });

    socket.on('saveQuestion', (qData) => {
        questionBank.push(qData);
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteSet', (setName) => {
        questionBank = questionBank.filter(q => q.set !== setName);
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteQuestion', (qId) => {
        questionBank = questionBank.filter(q => q.id !== qId);
        saveData();
        io.emit('updateQuestions', questionBank);
    });

    socket.on('deleteResultsFolder', (folderName) => {
        delete studentResults[folderName];
        saveData();
        io.emit('updateResults', studentResults);
    });

    socket.on('submitExam', (result) => {
        const folder = result.folder;
        if (!studentResults[folder]) studentResults[folder] = [];
        
        // Check for duplicate names in the folder
        if (!studentResults[folder].find(r => r.n === result.n)) {
            studentResults[folder].push(result);
            saveData();
            io.emit('updateResults', studentResults);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server active on port ${PORT}`));
