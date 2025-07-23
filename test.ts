// test_fs_extra.js
import fse from 'fs-extra'; // Import the default export
// OR
// const fse = require('fs-extra'); // If you're using CommonJS

console.log('--- Testing fs-extra ---');
console.log('Type of fse:', typeof fse);
console.log('fse object keys:', Object.keys(fse)); // See what properties it has

if (typeof fse.existsSync === 'function') {
    console.log('fse.existsSync is a function! ✅');
    const testPath = './temp_test_file.txt';
    console.log(`Does ${testPath} exist?`, fse.existsSync(testPath));
} else {
    console.error('fse.existsSync is NOT a function! ❌');
}

if (typeof fse.copySync === 'function') {
    console.log('fse.copySync is a function! ✅');
    try {
        fse.writeFileSync('./source_test.txt', 'Hello, world!');
        fse.copySync('./source_test.txt', './destination_test.txt');
        console.log('copySync worked!');
        fse.removeSync('./source_test.txt');
        fse.removeSync('./destination_test.txt');
    } catch (error) {
        console.error('Error during copySync test:', error.message);
    }
} else {
    console.error('fse.copySync is NOT a function! ❌');
}

console.log('--- Test complete ---');