const { execSync } = require('child_process');

const args = process.argv.slice(2);
const noRestart = args.includes('--no-restart');
const commitMsg = args.find(a => !a.startsWith('--')) || 'Update Dashboard';

try {
    execSync('git config --global --add safe.directory "*"');
} catch (e) {}

try {
    console.log(`Subiendo cambios: ${commitMsg}`);
    execSync('git add .');
    execSync(`git commit -m "${commitMsg}"`);
    execSync('git push origin main');
    console.log('¡Subida completada con éxito!');
} catch (e) {
    console.log('Push omitido o ya actualizado:', e.message);
}

if (!noRestart) {
    try {
        execSync('pm2 restart dashboard-global');
    } catch (e) {}
}
