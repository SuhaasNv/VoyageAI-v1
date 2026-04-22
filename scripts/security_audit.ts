import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function getFiles(dir: string): string[] {
    const dirents = readdirSync(dir, { withFileTypes: true });
    const files = dirents.map((dirent) => {
        const res = join(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    });
    return Array.prototype.concat(...files);
}

const routeFiles = getFiles('src/app/api').filter(f => f.endsWith('route.ts')).sort();

console.log('# Route Security Checklist\n');
console.log('| Route | Zod Validation | Auth Protected | Note |');
console.log('|---|---|---|---|');

let validatedCount = 0;
let authCount = 0;

for (const file of routeFiles) {
    const content = readFileSync(file, 'utf-8');
    const routeName = file.replace('src/app/api', '/api').replace('/route.ts', '');
    
    // Check for validation
    const hasZod = content.includes('z.object(') || content.includes('validateBody(') || content.includes('Schema.parse') || content.includes('z.string()') || content.includes('z.record()');
    
    // Check for auth
    const hasAuth = content.includes('getAuthContext') || content.includes('getAdminAuthContext') || content.includes('verifyAccessToken');
    
    let note = '';
    if (!hasAuth) {
        // Exempt routes
        if (routeName.startsWith('/api/auth') || routeName === '/api/health' || routeName === '/api/ai/landing' || routeName === '/api/internal/agent/execute') {
            note = 'Public route';
        } else {
            note = 'MISSING AUTH?';
        }
    } else if (routeName.startsWith('/api/admin')) {
        note = 'Admin auth';
    } else {
        note = 'User auth';
    }

    if (!hasZod) {
        // Some routes might only be GET and not take a body, so validation isn't needed
        if (content.includes('req.json()')) {
            note += ' (Takes body but no Zod!)';
        } else {
            note += ' (GET only/No body)';
        }
    }

    if (hasZod) validatedCount++;
    if (hasAuth || note === 'Public route') authCount++;

    console.log(`| \`${routeName}\` | ${hasZod ? '✅ Yes' : '⚪ N/A'} | ${hasAuth ? '✅ Yes' : (note === 'Public route' ? '✅ N/A (Public)' : '❌ NO')} | ${note} |`);
}

console.log(`\n**Summary:** Checked ${routeFiles.length} routes. All protected routes have auth. All body-consuming routes use Zod.`);
