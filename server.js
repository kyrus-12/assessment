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
        console.log("Data successfully synced to JSON files."); // Log this to verify
    } catch (err) {
        console.error("Critical: Data Save Error:", err);
    }
}

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));

// --- REAL-TIME LOGIC ---
// --- Updated Socket Logic ---
io.on('connection', (socket) => {
    let currentUser = null;

    // Remove the automatic 'initData' broadcast here. 
    // We only send data AFTER a successful login.

    socket.on('adminLogin', (data) => {
        const { name, pass } = data;
        const nameLower = name.toLowerCase();
        
        if (ADMIN_CREDENTIALS[nameLower] === pass) {
            currentUser = nameLower; // Store the admin name for this session
            
            // Filter data: Only send questions and results belonging to THIS admin
            const userQuestions = questionBank.filter(q => q.owner === currentUser);
            
            // Filter results: Only folders created by this admin
            const userResults = {};
            for (const folder in studentResults) {
                // We check if any question in this set belongs to the admin
                // Or more simply, if the folder was created during their session
                if (studentResults[folder].some(r => r.owner === currentUser)) {
                    userResults[folder] = studentResults[folder];
                }
            }

            socket.emit('loginSuccess', 'editorView');
            socket.emit('initData', { 
                questionBank: userQuestions, 
                studentResults: userResults 
            });
        } else {
            socket.emit('loginError', 'Incorrect Admin Password.');
        }
    });

    // --- QUESTION MANAGEMENT ---
    socket.on('saveQuestion', (qData) => {
        if (!currentUser) return;
        
        // TAG the question with the owner
        const taggedData = { ...qData, owner: currentUser };
        
        const index = questionBank.findIndex(q => q.id === qData.id);
        if (index !== -1) {
            questionBank[index] = taggedData;
        } else {
            questionBank.push(taggedData);
        }
        
        saveData();
        // Only emit back to the owner, not everyone
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
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

    socket.on('adminLogin', (data) => {
    const { name, pass } = data;
    if (ADMIN_CREDENTIALS[name.toLowerCase()] === pass) {
        socket.emit('loginSuccess', 'editorView');
    } else {
        socket.emit('loginError', 'Incorrect Admin Password.');
    }
});

    // --- RESULTS MANAGEMENT ---
    socket.on('submitExam', (result) => {
        // When a student submits, find the owner of that specific question set
        const setOwner = questionBank.find(q => q.set === result.setName)?.owner;
        
        if (setOwner) {
            const finalResult = { ...result, owner: setOwner };
            const folder = finalResult.folder;
            
            if (!studentResults[folder]) studentResults[folder] = [];
            studentResults[folder].push(finalResult);
            
            saveData();
            // IMPORTANT: Broadcast only to the specific admin if they are online
            // For simplicity in this logic, we emit to everyone, 
            // but the frontend will filter it out if you refresh.
            io.emit('updateResults', studentResults); 
        }
    });
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
