const { execSync } = require('child_process');

const commitMsg = process.argv[2] || 'Update Dashboard';

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

try {
    execSync('pm2 restart dashboard-global');
} catch (e) {}
