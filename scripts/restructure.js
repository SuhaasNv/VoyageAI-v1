const { Project } = require('ts-morph');
const fs = require('fs');
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
    // ensure dest dir exists
    const destDir = path.dirname(dest);
    project.createDirectory(destDir);
    file.moveToDirectory(project.getDirectory(destDir));
    // after moving to directory, actually we can just rename it by changing its name, but file.move() works if we give it the right path.
    // wait, file.moveToDirectory() keeps its name. To rename or move to a completely new path:
    const absoluteDest = path.resolve(dest);
    file.move(absoluteDest);
    console.log(`Moved file ${src} -> ${dest}`);
}

async function run() {
    console.log('Starting restructure...');

    // 1. Move Components to UI
    renameFileSafe('src/components/trip/TripMap.tsx', 'src/ui/maps/TripMap.tsx');
    renameFileSafe('src/components/trip/InteractiveMap.tsx', 'src/ui/maps/InteractiveMap.tsx');
    renameFileSafe('src/components/trip/AIChatDrawer.tsx', 'src/ui/chat/AIChatDrawer.tsx');

    // safe directory moves: to move a directory, just change its path absolutely
    const dashboardDir = project.getDirectory('src/components/dashboard');
    if (dashboardDir) {
        dashboardDir.move(path.resolve('src/ui/dashboard'));
        console.log('Moved src/components/dashboard -> src/ui/dashboard');
    }

    const componentsDir = project.getDirectory('src/components');
    if (componentsDir) {
        componentsDir.move(path.resolve('src/ui/components'));
        console.log('Moved src/components -> src/ui/components');
    }

    // 2. Move Lib to Services / Infrastructure / Security / Memory
    renameFileSafe('src/lib/logger.ts', 'src/infrastructure/logger.ts');
    renameFileSafe('src/lib/env.ts', 'src/infrastructure/env.ts');
    renameFileSafe('src/lib/ai/usageLogger.ts', 'src/services/logging/usageLogger.ts');

    renameFileSafe('src/lib/ai/memory.ts', 'src/memory/memory.ts');
    renameFileSafe('src/lib/ai/contextStore.ts', 'src/memory/contextStore.ts');

    renameFileSafe('src/lib/ai/safety.ts', 'src/security/safety.ts');
    renameFileSafe('src/lib/rateLimiter.ts', 'src/security/rateLimiter.ts');

    const authDir = project.getDirectory('src/lib/auth');
    if (authDir) {
        authDir.move(path.resolve('src/services/auth'));
        console.log('Moved src/lib/auth -> src/services/auth');
    }

    const geoDir = project.getDirectory('src/lib/geo');
    if (geoDir) {
        geoDir.move(path.resolve('src/services/geo'));
        console.log('Moved src/lib/geo -> src/services/geo');
    }

    // Move API routes
    const apiAppDir = project.getDirectory('src/app/api');
    if (apiAppDir) {
        apiAppDir.move(path.resolve('src/api'));
        console.log('Moved src/app/api -> src/api');
    }

    const apiPagesDir = project.getDirectory('src/pages/api');
    if (apiPagesDir) {
        // move all subdirectories 
        for (const dir of apiPagesDir.getDirectories()) {
            dir.moveToDirectory(project.createDirectory('src/api'));
        }
        for (const f of apiPagesDir.getSourceFiles()) {
            f.moveToDirectory(project.createDirectory('src/api'));
        }
        console.log('Moved src/pages/api contents -> src/api');
    }

    // 3. Convert service calls to tools
    renameFileSafe('src/services/ai/itinerary.service.ts', 'src/tools/itineraryTool.ts');
    renameFileSafe('src/services/ai/reoptimize.service.ts', 'src/tools/reoptimizeTool.ts');
    renameFileSafe('src/services/ai/chat.service.ts', 'src/tools/chatTool.ts');
    renameFileSafe('src/services/ai/dashboard-suggestions.service.ts', 'src/tools/suggestionTool.ts');
    renameFileSafe('src/services/ai/packing.service.ts', 'src/tools/packingTool.ts');
    renameFileSafe('src/services/ai/simulation.service.ts', 'src/tools/simulationTool.ts');

    // 4. Generate Agent Scaffolding
    const agents = ['planner', 'research', 'budget', 'logistics', 'safety'];
    for (const agent of agents) {
        project.createSourceFile(`src/agents/${agent}/${agent}Agent.ts`, `// ${agent} Agent
export class ${agent.charAt(0).toUpperCase() + agent.slice(1)}Agent {
    async execute(context: any) {
        // TODO: Implement
    }
}
`, { overwrite: true });

        if (agent === 'planner' || agent === 'research') {
            project.createSourceFile(`src/agents/${agent}/${agent}Prompts.ts`, `// Prompts for ${agent}
export const ${agent.toUpperCase()}_SYSTEM_PROMPT = \`You are the ${agent} agent.\`;
`, { overwrite: true });
        }
    }

    // Orchestrator
    project.createSourceFile(`src/orchestrator/agentOrchestrator.ts`, `// Central orchestrator
export class AgentOrchestrator {
    async orchestrate(intent: string, context: any) {
        // accept user intent
        // determine which agents to run
        // manage agent execution order
        // pass context between agents
        // return final result
    }
}
`, { overwrite: true });

    project.createSourceFile(`src/orchestrator/agentRegistry.ts`, `// Agent Registry
export const agents = {};
`, { overwrite: true });

    project.createSourceFile(`src/orchestrator/toolRegistry.ts`, `// Tool Registry
export const tools = {};
`, { overwrite: true });

    await project.save();
    console.log('Restructure complete and imports updated.');
}

run().catch(console.error);
