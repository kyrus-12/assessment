const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Increase the max payload size just in case you have very long exams with many images/options
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB
});

// In-memory "Database"
let questionBank = [];
let studentResults = {}; // Keys will now be "[Section] SetName"

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Sync data immediately on connection
    socket.emit('initData', { questionBank, studentResults });

    // 2. Admin: Save new question
    socket.on('saveQuestion', (qData) => {
        questionBank.push(qData);
        io.emit('updateQuestions', questionBank); 
    });

    // 3. Admin: Delete an entire Question Set
    socket.on('deleteSet', (setName) => {
        questionBank = questionBank.filter(q => q.set !== setName);
        io.emit('updateQuestions', questionBank);
    });

    // 4. Admin: Delete a specific Question (By ID)
    socket.on('deleteQuestion', (qId) => {
        questionBank = questionBank.filter(q => q.id !== qId);
        io.emit('updateQuestions', questionBank);
    });

    // 5. Admin: Delete Results Folder (The "[Section] SetName" folder)
    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            io.emit('updateResults', studentResults);
        }
    });

    // 6. Student: Submit Exam
    socket.on('submitExam', (result) => {
        const folder = result.folder; // This is "[Section] SetName" from the client
        
        if (!studentResults[folder]) {
            studentResults[folder] = [];
        }

        // Check if student already submitted to this specific folder/section
        const existingEntry = studentResults[folder].find(r => r.n === result.n);
        
        if (!existingEntry) {
            // Push the full result including the 'review' array and 'sec' (section)
            studentResults[folder].push(result);
            io.emit('updateResults', studentResults); 
        } else {
            console.log(`Duplicate submission blocked: ${result.n} in ${folder}`);
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
    console.log(`Server running on http://localhost:${PORT}`);
});
