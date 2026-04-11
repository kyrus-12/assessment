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

// Use an absolute path to ensure the server looks in the right place
const DB_PATH = path.resolve(__dirname, 'questionBank.json');
const RESULTS_PATH = path.resolve(__dirname, 'studentResults.json');

function loadJSON(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            console.log(`[SYSTEM] Loaded data from ${filePath}`);
            return JSON.parse(data);
        } else {
            console.log(`[SYSTEM] ${filePath} not found. Creating new file.`);
            fs.writeFileSync(filePath, JSON.stringify(defaultValue));
            return defaultValue;
        }
    } catch (err) { 
        console.error(`[CRITICAL] Error loading ${filePath}:`, err); 
        return defaultValue;
    }
}

let questionBank = loadJSON(DB_PATH, []);
let studentResults = loadJSON(RESULTS_PATH, {});

function saveData() {
    try {
        // We use synchronous write to ensure data hits the disk before the process can sleep
        const qData = JSON.stringify(questionBank, null, 2);
        const rData = JSON.stringify(studentResults, null, 2);
        
        fs.writeFileSync(DB_PATH, qData);
        fs.writeFileSync(RESULTS_PATH, rData);
        console.log(`[SYSTEM] Data successfully saved to disk at ${new Date().toLocaleTimeString()}`);
    } catch (err) { 
        console.error("[CRITICAL] Save Error:", err); 
    }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    let currentUser = null;

    // Send the latest bank to students/admins immediately
    socket.emit('initData', { 
        questionBank: questionBank, 
        studentResults: {} 
    });

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
            socket.join(`admin_${currentUser}`); 
            
            socket.emit('loginSuccess', 'editorView');
            socket.emit('initData', { 
                questionBank: questionBank.filter(q => q.owner === currentUser), 
                studentResults: getAdminResults(currentUser) 
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
        
        saveData(); // Immediate save
        socket.emit('updateQuestions', questionBank.filter(q => q.owner === currentUser));
        io.emit('refreshGlobalBank', questionBank);
    });

    socket.on('submitExam', (result) => {
        const targetSetName = result.setName;
        const setOwner = questionBank.find(q => q.set === targetSetName)?.owner || "admin"; 
        
        const finalResult = { ...result, owner: setOwner };
        const folder = finalResult.folder;
        
        if (!studentResults[folder]) studentResults[folder] = [];
        studentResults[folder].push(finalResult);
        
        saveData(); // Immediate save
        io.to(`admin_${setOwner}`).emit('updateResults', getAdminResults(setOwner));
    });

    socket.on('deleteResultsFolder', (folderName) => {
        if (studentResults[folderName]) {
            delete studentResults[folderName];
            saveData();
            if (currentUser) {
                socket.emit('updateResults', getAdminResults(currentUser));
            }
        }
    });

    socket.on('deleteSet', (setName) => {
        if (!currentUser) return;
        questionBank = questionBank.filter(q => q.set !== setName);
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[AIGHAM] ACTIVE ON PORT ${PORT}`);
    console.log(`[AIGHAM] Storage Paths: \n DB: ${DB_PATH} \n Results: ${RESULTS_PATH}`);
});
