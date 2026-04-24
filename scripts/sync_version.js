const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const newVersion = process.argv[2];
if (newVersion) {
    pkg.version = newVersion.replace('v', '');
    console.log(`Actualizando a v${pkg.version}...`);
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('¡Sincronización completada!');
