const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// In-memory "Database"
let questionBank = [];
let studentResults = {}; // Organized by Folder/SetName

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send initial data to the client
    socket.emit('initData', { questionBank, studentResults });

    // Admin: Save new question
    socket.on('saveQuestion', (qData) => {
        questionBank.push(qData);
        io.emit('updateQuestions', questionBank); // Broadcast to everyone
    });

    // Admin: Delete Set
    socket.on('deleteSet', (setName) => {
        questionBank = questionBank.filter(q => q.set !== setName);
        io.emit('updateQuestions', questionBank);
    });

    // Student: Submit Exam
    socket.on('submitExam', (result) => {
        const folder = result.folder;
        if (!studentResults[folder]) studentResults[folder] = [];
        
        // Prevent duplicate names in same folder
        if (!studentResults[folder].find(r => r.n === result.n)) {
            studentResults[folder].push(result);
            io.emit('updateResults', studentResults); // Real-time update for Admin
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
