// index.js
const path = require('path');
const { app } = require('electron');

if (app.isPackaged) {
    require(path.join(__dirname, 'dist', 'main', 'main.js'));
} else {
    require('ts-node').register({
        project: path.join(__dirname, 'tsconfig.json')
    });
    require(path.join(__dirname, 'src', 'main', 'main.ts'));
}
