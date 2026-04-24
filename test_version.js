const fs = require('fs');
const path = require('path');

const projectPath = 'd:\\03_Trabajo\\Pedidos';
const versionPaths = [
    path.join(projectPath, 'public-app', 'js', 'main.js'),
    path.join(projectPath, 'public', 'js', 'main.js'),
    path.join(projectPath, 'public', 'js', 'modules', 'constants.js'),
    path.join(projectPath, 'package.json')
];

let version = 'N/A';
for (const vPath of versionPaths) {
    if (fs.existsSync(vPath)) {
        console.log(`Checking ${vPath}`);
        const content = fs.readFileSync(vPath, 'utf8');
        const jsMatch = content.match(/CURRENT_(APP|CLIENT)_VERSION\s*=\s*["'](\d+\.\d+)["']/) || 
                        content.match(/version:\s*["'](\d+\.\d+)["']/);
        const pkgMatch = content.match(/"version":\s*"(\d+\.\d+\.\d+)"/);
        const htmlMatch = content.match(/<title>.*?v(\d+\.\d+).*?<\/title>/i);

        if (jsMatch) { console.log(`Matched JS: ${jsMatch[0]}`); version = jsMatch[2]; break; }
        if (pkgMatch) { console.log(`Matched PKG: ${pkgMatch[0]}`); version = pkgMatch[1]; break; }
        if (htmlMatch) { console.log(`Matched HTML: ${htmlMatch[0]}`); version = htmlMatch[1]; break; }
    }
}
console.log(`Final version: ${version}`);
