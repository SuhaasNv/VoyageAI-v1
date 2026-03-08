const { Project } = require('ts-morph');
const path = require('path');

const project = new Project({
    tsConfigFilePath: './tsconfig.json',
});

function renameFileSafe(src, dest) {
    const file = project.getSourceFile(src);
    if (!file) {
        console.log(`[SKIP] File ${src} not found`);
        return;
    }
    const destDir = path.dirname(dest);
    project.createDirectory(destDir);
    const absoluteDest = path.resolve(dest);
    file.move(absoluteDest);
    console.log(`Moved file ${src} -> ${dest}`);
}

renameFileSafe('src/components/trip/TripMap.tsx', 'src/ui/maps/TripMap.tsx');
renameFileSafe('src/components/trip/InteractiveMap.tsx', 'src/ui/maps/InteractiveMap.tsx');
renameFileSafe('src/components/trip/AIChatDrawer.tsx', 'src/ui/chat/AIChatDrawer.tsx');

project.saveSync();
