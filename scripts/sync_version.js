const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function calculateNextVersion(current) {
    if (!current) return '1.0.0';
    const clean = current.replace(/^v/, '').trim();
    const parts = clean.split('.').map(Number);
    if (parts.length === 3) {
        let [major, minor, patch] = parts;
        if (minor > 9) return (major + 1) + '.0.0';
        if (patch > 9) return major + '.' + (minor + 1) + '.0';
        patch += 1;
        if (patch > 9) {
            patch = 0;
            minor += 1;
            if (minor > 9) { minor = 0; major += 1; }
        }
        return `${major}.${minor}.${patch}`;
    } else if (parts.length === 2) {
        let [major, minor] = parts;
        return `${major + 1}.0.0`;
    }
    return '1.0.0';
}

const newVersion = process.argv[2];
if (newVersion) {
    pkg.version = newVersion.replace('v', '');
} else {
    pkg.version = calculateNextVersion(pkg.version);
}

console.log(`Versión actualizada: v${pkg.version}`);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('¡Sincronización completada!');
