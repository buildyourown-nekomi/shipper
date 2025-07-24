// test_fs_extra.js
import fse from 'fs-extra'; // Import the default export
// OR
// const fse = require('fs-extra'); // If you're using CommonJS

console.log('--- About to test fs-extra like it\'s the main character ---');
console.log('Type of fse (and we\'re hoping it\'s giving object vibes):', typeof fse);
console.log('fse object keys (let\'s see what this bestie has to offer):', Object.keys(fse)); // See what properties it has

if (typeof fse.existsSync === 'function') {
    console.log('fse.existsSync is a function and it\'s serving functionality! ✅');
    const testPath = './temp_test_file.txt';
    console.log(`Does ${testPath} exist? (Checking if this path is real or just living in our imagination):`, fse.existsSync(testPath));
} else {
    console.error('fse.existsSync said "I\'m not a function bestie" and that\'s not very cash money! ❌');
}

if (typeof fse.copySync === 'function') {
    console.log('fse.copySync is a function and it\'s ready to copy like it\'s the assignment! ✅');
    try {
        fse.writeFileSync('./source_test.txt', 'Hello, world!');
        fse.copySync('./source_test.txt', './destination_test.txt');
        console.log('copySync worked and it\'s absolutely iconic!');
        fse.removeSync('./source_test.txt');
        fse.removeSync('./destination_test.txt');
    } catch (error) {
        console.error('copySync had a moment and threw an error (not very demure):', error.message);
    }
} else {
    console.error('fse.copySync is NOT a function! ❌');
}

console.log('--- Test complete ---');