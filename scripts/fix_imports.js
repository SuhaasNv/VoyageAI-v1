const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) {
            callback(dirPath);
        }
    });
}

const replacements = [
    // Components
    { from: /@\/components\/trip\/TripMap/g, to: '@/ui/maps/TripMap' },
    { from: /@\/components\/trip\/InteractiveMap/g, to: '@/ui/maps/InteractiveMap' },
    { from: /@\/components\/trip\/AIChatDrawer/g, to: '@/ui/chat/AIChatDrawer' },
    { from: /@\/components\/dashboard/g, to: '@/ui/dashboard' },
    { from: /@\/components/g, to: '@/ui/components' },

    // Lib to specific
    { from: /@\/lib\/logger/g, to: '@/infrastructure/logger' },
    { from: /@\/lib\/env/g, to: '@/infrastructure/env' },
    { from: /@\/lib\/ai\/usageLogger/g, to: '@/services/logging/usageLogger' },
    { from: /@\/lib\/ai\/memory/g, to: '@/memory/memory' },
    { from: /@\/lib\/ai\/contextStore/g, to: '@/memory/contextStore' },
    { from: /@\/lib\/ai\/safety/g, to: '@/security/safety' },
    { from: /@\/lib\/rateLimiter/g, to: '@/security/rateLimiter' },

    // Lib directories
    { from: /@\/lib\/auth/g, to: '@/services/auth' },
    { from: /@\/lib\/geo/g, to: '@/services/geo' },

    // Services -> Tools
    { from: /@\/services\/ai\/itinerary\.service/g, to: '@/tools/itineraryTool' },
    { from: /@\/services\/ai\/reoptimize\.service/g, to: '@/tools/reoptimizeTool' },
    { from: /@\/services\/ai\/chat\.service/g, to: '@/tools/chatTool' },
    { from: /@\/services\/ai\/dashboard-suggestions\.service/g, to: '@/tools/suggestionTool' },
    { from: /@\/services\/ai\/packing\.service/g, to: '@/tools/packingTool' },
    { from: /@\/services\/ai\/simulation\.service/g, to: '@/tools/simulationTool' },

    // Relative imports updates (in case they use ../components/ etc)
    // Actually relative imports were mostly handled by ts-morph if they weren't matched as alias, but just in case:
    { from: /from ['"]\.\.\/components\/trip\/TripMap['"]/g, to: "from '@/ui/maps/TripMap'" },
    { from: /from ['"]\.\.\/components\/trip\/InteractiveMap['"]/g, to: "from '@/ui/maps/InteractiveMap'" },
    { from: /from ['"]\.\.\/components\/trip\/AIChatDrawer['"]/g, to: "from '@/ui/chat/AIChatDrawer'" },
];

walkDir('./src', (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    for (const r of replacements) {
        content = content.replace(r.from, r.to);
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated imports in ${filePath}`);
    }
});
