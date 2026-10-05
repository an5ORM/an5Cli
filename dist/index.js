#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const llm_1 = require("./llm");
const impact_1 = require("./impact");
const command_1 = require("./command");
const delivery_1 = require("./delivery");
const documentation_1 = require("./documentation");
const release_notes_1 = require("./release-notes");
function loadTasksModule() {
    try {
        return require('an5-tasks');
    }
    catch {
        try {
            return require('../../an5Tasks/dist/index');
        }
        catch {
            return null;
        }
    }
}
function git(args, allowFail = false) {
    try {
        return (0, child_process_1.execFileSync)('git', args, { encoding: 'utf8' }).trim();
    }
    catch (error) {
        if (allowFail)
            return error.stdout?.toString()?.trim() || '';
        throw error;
    }
}
function printHelp() {
    console.log(`an5-cli — Release & Workspace Automation

Commands:
  ui                         Launch the premium Web UI Dashboard for workspace management
  tunnel [action]            Manage localtunnel (start, stop, status; default: start)
  config                     Interactive setup for LLM provider and credentials (.env)
  doc [path]                 Generate or improve documentation for code files or README using LLM
  doc:diff [path]            Auto-update docs based on changed files (diff-aware)
  format [path]              Auto-format .an5 files using alignment rules
  impact [path]              Analyze cross-repo impact from changes in a repo
  sync [path]                Update affected repos: rebuild, test, update docs
  tasks [action] [path]      Manage tasks (list, update, delete)
  release [path] [options]   Generate changelog, commit, push for a single repo
  ws [path] [options]        Run release across all repos in a workspace (submodules)
  run <script>               Run a script from workspace.json
  login [username] [token]   Store GitHub credentials and update all remote URLs
  --help, -h                 Show this help

Options:
  --preview                  Preview changes without modifying files or Git
  --push                     Push commits after creating them
  --pull                     Fast-forward pull before processing (never in preview)
  --tag <name>               Create a release tag matching the package version
  --version <semver>         Update npm manifest/lockfile (single repo only)
  --files <path>             Include only this changed path; repeat for more paths
  --changelog-file <path>    Use prepared Markdown notes instead of an LLM
  --since <ref>              Override the previous-release commit boundary
  --update-docs              Reconcile docs with code/diff before validation
  --verify-release           With --tag --push, watch CI and verify GitHub Release
  --message <text>           Override LLM-generated commit message
  --branch <name>            Specify branch (default: main or master detection)
  --all                      Include unchanged repos (status check only)
  --skip-llm                 Skip LLM commit message generation, use default
  --skip-prompt              Skip interactive confirmations (non-interactive mode)
  --no-verify                Bypass code quality checks (build, test)
  --skip-docs                Skip documentation updates (sync command)
  --skip-build               Skip build/test steps (sync command)
  --tunnel                   Expose UI dashboard via localtunnel (for mobile access)
  --subdomain <name>         Custom subdomain for tunnel (e.g., my-an5)
  --tunnel-port <port>       Port for tunnel (default: 5070)
  --status <status>          Filter tasks by status (todo, in-progress, done)
  --priority <priority>      Filter tasks by priority (low, medium, high)
  --id <taskId>              Task ID for update/delete operations

Environment Variables (for LLM commit messages):
  LLM_PROVIDER               openai (default), gemini, or custom
  LLM_API_KEY                API key for the LLM provider
  OPENAI_API_KEY             Alternative for OpenAI
  GEMINI_API_KEY             Alternative for Gemini
  LLM_MODEL                  Model name (e.g., gpt-4o-mini, gemini-2.5-flash)
  LLM_ENDPOINT               Custom endpoint URL (for custom provider)

Config (.an5cli.json):
  {
    "defaultTarget": "../an5Orm",
    "defaultBranch": "main",
    "preview": false,
    "push": false,
    "skipPrompt": false,
    "tunnel": {
      "subdomain": "my-an5",
      "port": 5070
    }
  }

Examples:
  an5-cli tasks list                       List all tasks
  an5-cli tasks list --status todo         List only todo tasks
  an5-cli tasks list --priority high       List only high priority tasks
  an5-cli tasks update --id TASK-123 --status done
  an5-cli tasks delete --id TASK-123
  an5-cli impact                           Analyze impact from current repo changes
  an5-cli sync ../an5Orm                 Rebuild + test all affected repos
  an5-cli release                          Release current/default repo
  an5-cli ws                               Release all repos in workspace
  an5-cli ui                               Launch the Web UI Dashboard
  an5-cli ui --tunnel                      Launch UI with localtunnel
  an5-cli ui --tunnel --subdomain my-app   Launch UI with custom tunnel subdomain
  an5-cli tunnel                           Start tunnel on port 5070
  an5-cli tunnel --subdomain my-app        Start tunnel with custom subdomain
  an5-cli tunnel stop                      Stop running tunnel
  an5-cli tunnel status                    Show tunnel status`);
}
function parseArgs(argv) {
    const options = { command: 'release', targetDir: process.cwd(), preview: false, push: false, pull: false, skipLlm: false, all: false };
    let scriptName = '';
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === undefined)
            continue;
        if (arg === 'tasks') {
            options.command = 'tasks';
            const next = argv[i + 1];
            if (next && !next.startsWith('-') && ['list', 'update', 'delete'].includes(next)) {
                options.taskAction = next;
                i++;
            }
            else {
                options.taskAction = 'list';
            }
        }
        else if (arg === 'tunnel') {
            options.command = 'tunnel';
            const next = argv[i + 1];
            if (next && !next.startsWith('-') && ['start', 'stop', 'status'].includes(next)) {
                options.tunnelAction = next;
                i++;
            }
            else {
                options.tunnelAction = 'start';
            }
        }
        else if (arg === 'release' || arg === 'ws' || arg === 'ui' || arg === 'config' || arg === 'doc' || arg === 'format' || arg === 'impact' || arg === 'doc:diff' || arg === 'sync') {
            options.command = arg;
        }
        else if (arg === 'login') {
            options.command = 'login';
        }
        else if (arg === 'run') {
            options.command = 'run';
            scriptName = argv[++i] || '';
        }
        else if (arg === '--preview') {
            options.preview = true;
        }
        else if (arg === '--since') {
            const value = argv[++i];
            if (!value || value.startsWith('--'))
                throw new Error('--since requires a Git reference');
            options.since = value;
        }
        else if (arg === '--changelog-file') {
            const value = argv[++i];
            if (!value || value.startsWith('--'))
                throw new Error('--changelog-file requires a path');
            options.changelogFile = path_1.default.resolve(value);
        }
        else if (arg === '--update-docs') {
            options.updateDocs = true;
        }
        else if (arg === '--verify-release') {
            options.verifyRelease = true;
        }
        else if (arg === '--version') {
            const value = argv[++i];
            if (!value)
                throw new Error('--version requires a value');
            (0, delivery_1.validateVersion)(value);
            options.version = value;
        }
        else if (arg === '--files') {
            const value = argv[++i];
            if (!value || value.startsWith('--'))
                throw new Error('--files requires a path');
            (options.files ?? (options.files = [])).push(value);
        }
        else if (arg === '--push') {
            options.push = true;
        }
        else if (arg === '--pull') {
            options.pull = true;
        }
        else if (arg === '--tag') {
            options.tag = argv[++i] ?? options.tag;
        }
        else if (arg === '--message') {
            options.message = argv[++i] ?? options.message;
        }
        else if (arg === '--branch') {
            options.branch = argv[++i] ?? options.branch;
        }
        else if (arg === '--all') {
            options.all = true;
        }
        else if (arg === '--skip-llm') {
            options.skipLlm = true;
        }
        else if (arg === '--skip-prompt') {
            options.skipPrompt = true;
        }
        else if (arg === '--no-verify') {
            options.noVerify = true;
        }
        else if (arg === '--skip-docs') {
            options.skipDocs = true;
        }
        else if (arg === '--skip-build') {
            options.skipBuild = true;
        }
        else if (arg === '--status') {
            options.taskStatus = argv[++i] ?? options.taskStatus;
        }
        else if (arg === '--priority') {
            options.taskPriority = argv[++i] ?? options.taskPriority;
        }
        else if (arg === '--id') {
            options.taskId = argv[++i] ?? options.taskId;
        }
        else if (arg === '--subdomain') {
            options.tunnelSubdomain = argv[++i] ?? options.tunnelSubdomain;
        }
        else if (arg === '--tunnel-port') {
            options.tunnelPort = parseInt(argv[++i] ?? '', 10);
        }
        else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
        else if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }
        else if (arg !== 'release' && arg !== 'ws' && options.command !== 'tasks') {
            options.targetDir = path_1.default.resolve(arg);
        }
    }
    options.scriptName = scriptName;
    return options;
}
function inferComponent(file) {
    const normalized = '/' + file.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/generator/'))
        return 'generator';
    if (normalized.includes('/an5client/'))
        return 'client';
    if (normalized.includes('/an5schema/'))
        return 'schema';
    if (normalized.includes('/.github/'))
        return 'ci';
    if (normalized.includes('package.json') || normalized.includes('tsconfig'))
        return 'build';
    if (normalized.includes('.md'))
        return 'docs';
    return 'misc';
}
function collectChanges(cwd) {
    const files = (0, delivery_1.changedPaths)(cwd);
    const groups = new Map();
    for (const file of files) {
        const component = inferComponent(file);
        if (!groups.has(component))
            groups.set(component, { component, files: [] });
        groups.get(component).files.push(file);
    }
    return Array.from(groups.values());
}
function detectBranch(cwd) {
    try {
        const branch = git(['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']);
        if (branch && branch !== 'HEAD')
            return branch;
        // Detached HEAD — try to determine from remote HEAD or config
        try {
            const remoteHead = git(['-C', cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD']);
            if (remoteHead)
                return remoteHead.replace('refs/remotes/origin/', '');
        }
        catch { /* fall through */ }
        try {
            const config = JSON.parse(fs_1.default.readFileSync(path_1.default.join(cwd, '.an5cli.json'), 'utf8'));
            if (config.defaultBranch)
                return config.defaultBranch;
        }
        catch { /* fall through */ }
        return 'main';
    }
    catch {
        return 'main';
    }
}
function loadConfig(cwd) {
    const configPath = path_1.default.join(cwd, '.an5cli.json');
    if (!fs_1.default.existsSync(configPath))
        return {};
    return JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
}
function updateRemoteUrl(cwd, username, token) {
    const remote = git(['-C', cwd, 'remote', 'get-url', 'origin'], true);
    if (!remote)
        return '';
    const credPart = token ? `${username}:${token}` : username;
    const newUrl = remote.replace(/^https:\/\/([^@]+@)?github\.com\//, `https://${credPart}@github.com/`);
    if (newUrl === remote)
        return remote;
    git(['-C', cwd, 'remote', 'set-url', 'origin', newUrl]);
    // Enable useHttpPath so GCM picks credential per-repo path, not by host
    git(['-C', cwd, 'config', 'credential.useHttpPath', 'true'], true);
    return remote;
}
function storeCredentialForRepo(cwd, username, token) {
    const remote = git(['-C', cwd, 'remote', 'get-url', 'origin'], true);
    if (!remote)
        return;
    const path = remote.replace(/^https:\/\/([^@]+@)?github\.com\//, '').replace(/\.git$/, '');
    // GCM with useHttpPath matches by path=something/something
    const input = `protocol=https\nhost=github.com\npath=${path}\nusername=${username}\npassword=${token}\n`;
    try {
        (0, child_process_1.execFileSync)('git', ['-C', cwd, 'credential', 'approve'], {
            encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
        });
    }
    catch { /* fall through */ }
}
function ghAuthAvailable() {
    try {
        (0, child_process_1.execFileSync)('gh', ['--version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return true;
    }
    catch {
        return false;
    }
}
function ghLoginViaBrowser(cwd) {
    console.log('\n🌐 Opening browser for GitHub login...\n');
    try {
        (0, child_process_1.execSync)('gh auth login --web --git-protocol https', { cwd, stdio: 'inherit' });
        const user = (0, child_process_1.execFileSync)('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', cwd }).trim();
        const token = (0, child_process_1.execFileSync)('gh', ['auth', 'token'], { encoding: 'utf8', cwd }).trim();
        console.log(`\n  Logged in as ${user}`);
        // Configure git credential helper for all github.com repos
        try {
            (0, child_process_1.execFileSync)('gh', ['auth', 'setup-git'], { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] });
            console.log('  Configured git credential helper (gh as credential helper for github.com).');
        }
        catch {
            console.log('  Note: Could not run gh auth setup-git. Git operations may still prompt.');
        }
        console.log('  Updating all submodule remote URLs...\n');
        const oldParent = updateRemoteUrl(cwd, user);
        if (oldParent) {
            storeCredentialForRepo(cwd, user, token);
            console.log(`  ✓ an5: -> https://${user}@github.com/...`);
        }
        const subs = getSubmodules(cwd);
        for (const sub of subs) {
            const subPath = path_1.default.join(cwd, sub);
            const old = updateRemoteUrl(subPath, user);
            if (old) {
                storeCredentialForRepo(subPath, user, token);
                console.log(`  ✓ ${sub}: -> https://${user}@github.com/...`);
            }
        }
        console.log(`\n✅ Login complete. ${subs.length + 1} repo(s) updated.`);
        console.log(`  All git push/pull in this workspace now use ${user} (no account picker prompt).\n`);
    }
    catch (err) {
        console.error(`\nBrowser login failed: ${err.message || err}`);
        console.error('Falling back to manual PAT login.');
        cmdLoginManual(cwd);
    }
}
function cmdLoginManual(cwd) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('GitHub username: ', (u) => {
        rl.question('Personal Access Token: ', (t) => {
            rl.close();
            doLogin(cwd, u.trim(), t.trim());
        });
    });
}
function cmdLogin(cwd, username, token) {
    // No args → try browser login via gh CLI
    if (!username && !token) {
        if (ghAuthAvailable()) {
            ghLoginViaBrowser(cwd);
            return Promise.resolve();
        }
        console.log('GitHub CLI (gh) not found. Install from https://cli.github.com');
        console.log('Or use: an5-cli login <username> <token>\n');
        cmdLoginManual(cwd);
        return Promise.resolve();
    }
    doLogin(cwd, username || '', token || '');
    return Promise.resolve();
}
function doLogin(cwd, username, token) {
    if (!username || !token) {
        console.error('Error: username and token are required.');
        process.exit(1);
    }
    console.log(`\n🔑 Setting up GitHub authentication for ${username}...\n`);
    // Update parent repo remote + store credential for this repo path
    const oldParent = updateRemoteUrl(cwd, username, token);
    if (oldParent) {
        storeCredentialForRepo(cwd, username, token);
        console.log(`  ✓ an5: ${oldParent.replace(/^https:\/\/([^@]+@)?/, 'https://')} -> https://${username}@github.com/...`);
    }
    // Update submodule remotes
    const subs = getSubmodules(cwd);
    for (const sub of subs) {
        const subPath = path_1.default.join(cwd, sub);
        const old = updateRemoteUrl(subPath, username, token);
        if (old) {
            storeCredentialForRepo(subPath, username, token);
            console.log(`  ✓ ${sub}: ${old.replace(/^https:\/\/([^@]+@)?/, 'https://')} -> https://${username}@github.com/...`);
        }
    }
    console.log(`\n✅ Login complete. ${subs.length + 1} repo(s) updated.`);
    console.log(`  All git push/pull in this workspace now use ${username} (no account picker prompt).\n`);
}
function getRepoName(cwd) {
    try {
        return path_1.default.basename(git(['-C', cwd, 'rev-parse', '--show-toplevel']));
    }
    catch {
        return path_1.default.basename(cwd);
    }
}
function askQuestion(query) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
async function runQualityChecks(cwd, options) {
    if (options.noVerify || process.env.AN5_CLI_CHECKS_RUNNING) {
        if (process.env.AN5_CLI_CHECKS_RUNNING) {
            // Prevent infinite recursion in tests calling the CLI
            return true;
        }
        console.log(`  ⚠️ Skipping code quality checks (--no-verify)`);
        return true;
    }
    const repoName = getRepoName(cwd);
    const packageJsonPath = path_1.default.join(cwd, 'package.json');
    if (!fs_1.default.existsSync(packageJsonPath)) {
        return true;
    }
    console.log(`\n🔍 [${repoName}] Running code quality checks...`);
    // Set the environment variable to avoid infinite recursion
    process.env.AN5_CLI_CHECKS_RUNNING = 'true';
    try {
        const pkg = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf8'));
        const scripts = pkg.scripts || {};
        if (scripts.build) {
            console.log(`  ↳ Running build: npm run build...`);
            await (0, command_1.runNpm)(['run', 'build'], cwd);
            console.log(`  ✓ Build passed`);
        }
        if (scripts.compile) {
            console.log(`  ↳ Running compilation: npm run compile...`);
            await (0, command_1.runNpm)(['run', 'compile'], cwd);
            console.log(`  ✓ Compile passed`);
        }
        const hasTestScript = scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1';
        if (hasTestScript) {
            console.log(`  ↳ Running tests: npm test...`);
            await (0, command_1.runNpm)(['test'], cwd);
            console.log(`  ✓ Tests passed`);
        }
        console.log(`  ✨ Code quality checks passed successfully!\n`);
        // Reset it
        delete process.env.AN5_CLI_CHECKS_RUNNING;
        return true;
    }
    catch (err) {
        console.error(`\n❌ Code quality checks FAILED in ${repoName}:`);
        console.error(err.stdout || err.stderr || err.message);
        delete process.env.AN5_CLI_CHECKS_RUNNING;
        return false;
    }
}
async function releaseRepo(targetDir, options, config) {
    const resolvedDir = path_1.default.resolve(targetDir);
    if (!fs_1.default.existsSync(resolvedDir)) {
        console.error(`Directory not found: ${resolvedDir}`);
        return false;
    }
    if (!fs_1.default.existsSync(path_1.default.join(resolvedDir, '.git'))) {
        console.log(`Skipping ${resolvedDir} (not a git repo)`);
        return false;
    }
    const repoName = getRepoName(resolvedDir);
    const branch = options.branch || config.defaultBranch || detectBranch(resolvedDir);
    const currentBranch = git(['-C', resolvedDir, 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (!options.preview && (currentBranch === 'HEAD' || currentBranch !== branch)) {
        throw new Error(`Checkout is ${currentBranch}, target is ${branch}; select the intended branch before release`);
    }
    if (options.verifyRelease && (!options.tag || !options.push))
        throw new Error('--verify-release requires --tag and --push');
    if (options.version)
        (0, delivery_1.validateVersion)(options.version);
    if (options.tag) {
        (0, delivery_1.gitAt)(resolvedDir, ['check-ref-format', `refs/tags/${options.tag}`]);
        if ((0, delivery_1.gitAt)(resolvedDir, ['tag', '--list', options.tag]))
            throw new Error(`Tag already exists: ${options.tag}`);
        if (options.push && (0, delivery_1.gitAt)(resolvedDir, ['ls-remote', 'origin', `refs/tags/${options.tag}`]))
            throw new Error(`Remote tag already exists: ${options.tag}`);
        const manifest = path_1.default.join(resolvedDir, 'package.json');
        if (fs_1.default.existsSync(manifest)) {
            const version = options.version || JSON.parse(fs_1.default.readFileSync(manifest, 'utf8')).version;
            if (options.tag !== `v${version}`)
                throw new Error(`Tag ${options.tag} does not match package version ${version}; use --version explicitly`);
        }
    }
    if (options.pull && !options.preview)
        git(['-C', resolvedDir, 'pull', '--ff-only', 'origin', branch]);
    const selected = options.files?.map(file => {
        const relative = path_1.default.relative(resolvedDir, path_1.default.resolve(resolvedDir, file));
        if (!relative || relative.startsWith('..') || path_1.default.isAbsolute(relative))
            throw new Error(`Invalid selected path: ${file}`);
        return relative.split(path_1.default.sep).join('/');
    });
    if (selected) {
        const staged = (0, delivery_1.gitAt)(resolvedDir, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
        if (staged.some(file => !selected.includes(file)))
            throw new Error('Unrelated staged changes exist; preserve or commit them separately before scoped release');
    }
    if (options.since && !options.version && !options.tag)
        throw new Error('--since requires --version or --tag');
    const releaseVersion = options.version || options.tag?.replace(/^v/, '');
    const history = releaseVersion ? (0, release_notes_1.releaseHistory)(resolvedDir, options.since, selected) : undefined;
    const changelogPath = path_1.default.join(resolvedDir, 'CHANGELOG.md');
    const existingChangelog = fs_1.default.existsSync(changelogPath) ? fs_1.default.readFileSync(changelogPath, 'utf8') : '';
    let groups = collectChanges(resolvedDir);
    if (selected)
        groups = groups.map(group => ({ ...group, files: group.files.filter(file => selected.includes(file)) })).filter(group => group.files.length);
    if (groups.length === 0 && options.version)
        groups = [{ component: 'build', files: ['package.json'] }];
    if (groups.length === 0 && options.tag && !selected && ((0, release_notes_1.unreleasedNotes)(existingChangelog) || history?.notes))
        groups = [{ component: 'docs', files: ['CHANGELOG.md'] }];
    if (groups.length === 0) {
        if (options.tag && !selected) {
            if (options.preview) {
                console.log(`  [PREVIEW] Would tag current commit as ${options.tag}`);
                return true;
            }
            if (!(await runQualityChecks(resolvedDir, options)))
                throw new Error(`Quality checks failed for ${repoName}`);
            if ((0, delivery_1.changedPaths)(resolvedDir).length)
                throw new Error('Validation generated changes; review and deliver them before tagging the existing commit');
            const sha = (0, delivery_1.gitAt)(resolvedDir, ['rev-parse', 'HEAD']);
            if (options.push) {
                git(['-C', resolvedDir, 'push', 'origin', `HEAD:refs/heads/${branch}`]);
                (0, delivery_1.verifyRemote)(resolvedDir, 'origin', `refs/heads/${branch}`, sha);
            }
            git(['-C', resolvedDir, 'tag', options.tag, sha]);
            if (options.push) {
                git(['-C', resolvedDir, 'push', 'origin', `refs/tags/${options.tag}`]);
                (0, delivery_1.verifyRemote)(resolvedDir, 'origin', `refs/tags/${options.tag}`, sha);
                if (options.verifyRelease)
                    console.log(`  Verified release: ${await (0, delivery_1.verifyRelease)(resolvedDir, options.tag, sha)}`);
                else
                    console.log('  Tag pushed; CI/package publication has not been verified');
            }
            console.log(`  Tagged ${repoName}: ${sha}`);
            return true;
        }
        if (options.all)
            console.log(`  ${repoName}: no changes`);
        return false;
    }
    for (const group of groups) {
        console.log(`  ${repoName}: [${group.component}] ${group.files.length} file(s)`);
        for (const file of group.files)
            console.log(`    - ${file}`);
    }
    const deliverableFiles = groups.flatMap(group => group.files);
    const generatedFiles = [];
    const docUpdates = options.updateDocs && !options.skipDocs ? (0, impact_1.analyzeDocUpdates)(resolvedDir, deliverableFiles) : [];
    if (selected && !options.preview) {
        const automaticPaths = ['CHANGELOG.md', ...docUpdates.map(update => update.file), ...(options.version ? ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pyproject.toml'] : [])];
        const conflicts = (0, delivery_1.changedPaths)(resolvedDir).filter(file => automaticPaths.includes(file) && !selected.includes(file));
        if (conflicts.length)
            throw new Error(`Automatic outputs have unrelated edits: ${conflicts.join(', ')}; include them explicitly or preserve them separately`);
    }
    if (!options.preview) {
        if (options.version)
            generatedFiles.push(...(0, delivery_1.updateNpmVersion)(resolvedDir, options.version));
        if (options.updateDocs && !options.skipDocs) {
            const context = (0, delivery_1.changeContext)(resolvedDir, deliverableFiles);
            for (const update of docUpdates) {
                await (0, documentation_1.applyDocUpdate)(resolvedDir, update, context);
                generatedFiles.push(update.file);
            }
        }
        if (!(await runQualityChecks(resolvedDir, options)))
            throw new Error(`Quality checks failed for ${repoName}; nothing committed or pushed`);
    }
    else {
        console.log('  [PREVIEW] No builds, documentation writes, version changes, checkout, pull, commit or push');
        if (options.updateDocs)
            console.log(`  [PREVIEW] Documentation plan: ${(0, impact_1.analyzeDocUpdates)(resolvedDir, deliverableFiles).map(update => update.file).join(', ')}`);
        if (options.version)
            console.log(`  [PREVIEW] Version: ${options.version}`);
    }
    const summaryFiles = selected ? [...deliverableFiles, ...generatedFiles] : (0, delivery_1.changedPaths)(resolvedDir);
    const fullDiff = (0, delivery_1.changeContext)(resolvedDir, summaryFiles);
    const summary = (0, release_notes_1.summarizeChanges)(resolvedDir, summaryFiles, releaseVersion);
    if (history)
        console.log(`  Release history: ${history.commits.length} commit(s) after ${history.baseline?.slice(0, 7) || 'the first commit'}`);
    // 2. LLM Preview & Review
    const skipPrompt = options.skipPrompt || config.skipPrompt || !process.stdin.isTTY;
    if (!options.preview && !options.skipLlm && !skipPrompt && fullDiff) {
        console.log(`\n🔎 [${repoName}] Requesting LLM Code Review...`);
        const codeReview = await (0, llm_1.generateCodeReview)(fullDiff, repoName);
        if (codeReview) {
            console.log(`\n================== LLM CODE REVIEW & PREVIEW ==================`);
            console.log(codeReview);
            console.log(`================================================================`);
            // Automatically generate Genkit tasks from the review
            try {
                const { createTasksFromReview } = require('../../an5Tasks/dist/index');
                const workspaceRoot = path_1.default.resolve(resolvedDir, '..');
                await createTasksFromReview(codeReview, workspaceRoot);
            }
            catch (taskErr) {
                // Silently catch if not built
            }
        }
        else {
            console.log(`\n⚠️ Could not generate LLM Code Review.`);
        }
    }
    // 3. Resolve commit message (including LLM generation on unstaged diff)
    let commitMessage = options.message;
    if (!commitMessage && !options.skipLlm) {
        const llmMessage = await (0, llm_1.generateCommitMessage)(fullDiff, repoName);
        if (llmMessage && (0, release_notes_1.isSpecificCommitMessage)(llmMessage)) {
            commitMessage = llmMessage;
        }
    }
    if (!commitMessage) {
        commitMessage = summary.message;
    }
    // 4. Interactive Confirmation & Loop
    if (!options.preview && !skipPrompt) {
        console.log(`\n📝 Proposed commit message:\n"${commitMessage}"\n`);
        let approved = false;
        while (!approved) {
            const choice = await askQuestion(`Do you want to proceed? [y/e/n] (y: Yes, e: Edit commit message, n: Cancel): `);
            const lower = choice.toLowerCase();
            if (lower === 'y' || lower === 'yes' || lower === '') {
                approved = true;
            }
            else if (lower === 'e' || lower === 'edit') {
                const customMsg = await askQuestion(`Enter new commit message: `);
                if (customMsg) {
                    commitMessage = customMsg;
                    console.log(`\n📝 Updated commit message:\n"${commitMessage}"\n`);
                }
            }
            else {
                console.log(`\n❌ Release aborted by user.`);
                return false;
            }
        }
    }
    else {
        if (!options.preview) {
            console.log(`  Commit message: "${commitMessage}"`);
        }
    }
    // Release notes cover committed work since the last release and the current diff.
    const notesContext = history ? `${history.context}\n\nExisting unreleased notes:\n${(0, release_notes_1.unreleasedNotes)(existingChangelog).slice(0, 4000)}\n\nCurrent uncommitted changes:\n${fullDiff.slice(0, 24000)}` : fullDiff;
    let changelogContent = options.changelogFile ? fs_1.default.readFileSync(options.changelogFile, 'utf8').trim() : undefined;
    if (options.changelogFile && !changelogContent)
        throw new Error('Prepared changelog notes are empty');
    if (!changelogContent && !options.skipLlm)
        changelogContent = (await (0, llm_1.generateChangelogContent)(notesContext, repoName, deliverableFiles)) || undefined;
    const notes = changelogContent && (0, release_notes_1.mergeNotes)(changelogContent) ? (0, release_notes_1.mergeNotes)(changelogContent) : (0, release_notes_1.mergeNotes)(summary.notes, history?.notes || '');
    const changelog = (0, release_notes_1.renderChangelog)(existingChangelog, notes, releaseVersion, (0, delivery_1.calendarDate)(), !!selected);
    if (options.preview) {
        console.log(`  [PREVIEW] Would commit: "${commitMessage}"`);
        console.log(`  [PREVIEW] Changelog preview:\n${changelog.slice(0, 800)}`);
        return true;
    }
    fs_1.default.writeFileSync(changelogPath, changelog);
    const stagePaths = selected ? [...deliverableFiles, ...generatedFiles, 'CHANGELOG.md'] : (0, delivery_1.changedPaths)(resolvedDir);
    git(['-C', resolvedDir, 'diff', '--check']);
    const uniqueStagePaths = [...new Set(stagePaths)];
    const trackedPaths = new Set((0, delivery_1.gitAt)(resolvedDir, ['ls-files', '-z', '--', ...uniqueStagePaths.map(file => `:(literal)${file}`)]).split('\0').filter(Boolean));
    const tracked = uniqueStagePaths.filter(file => trackedPaths.has(file));
    const stagedDeletions = new Set((0, delivery_1.gitAt)(resolvedDir, ['diff', '--cached', '--name-only', '-z', '--diff-filter=D']).split('\0').filter(Boolean));
    const added = uniqueStagePaths.filter(file => !trackedPaths.has(file) && !(stagedDeletions.has(file) && !fs_1.default.existsSync(path_1.default.join(resolvedDir, file))));
    // Updating tracked artifacts must work even when their directory is ignored.
    if (tracked.length)
        git(['-C', resolvedDir, 'add', '-u', '--', ...tracked.map(file => `:(literal)${file}`)]);
    if (added.length)
        git(['-C', resolvedDir, 'add', '--', ...added.map(file => `:(literal)${file}`)]);
    git(['-C', resolvedDir, 'diff', '--cached', '--check']);
    git(['-C', resolvedDir, 'commit', '-m', commitMessage]);
    const sha = (0, delivery_1.gitAt)(resolvedDir, ['rev-parse', 'HEAD']);
    if (options.push) {
        git(['-C', resolvedDir, 'push', 'origin', `HEAD:refs/heads/${branch}`]);
        (0, delivery_1.verifyRemote)(resolvedDir, 'origin', `refs/heads/${branch}`, sha);
        console.log(`  Verified push ${repoName}/${branch}: ${sha}`);
    }
    if (options.tag) {
        git(['-C', resolvedDir, 'tag', options.tag, sha]);
        if (options.push) {
            git(['-C', resolvedDir, 'push', 'origin', `refs/tags/${options.tag}`]);
            (0, delivery_1.verifyRemote)(resolvedDir, 'origin', `refs/tags/${options.tag}`, sha);
            if (options.verifyRelease)
                console.log(`  Verified release: ${await (0, delivery_1.verifyRelease)(resolvedDir, options.tag, sha)}`);
            else
                console.log('  Tag pushed; CI/package publication has not been verified');
        }
    }
    console.log(`  ✅ ${repoName}: committed${options.push ? ' + pushed' : ''}`);
    return true;
}
function getSubmodules(cwd) {
    const gitmodulesPath = path_1.default.join(cwd, '.gitmodules');
    if (!fs_1.default.existsSync(gitmodulesPath)) {
        const entries = fs_1.default.readdirSync(cwd, { withFileTypes: true });
        return entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && fs_1.default.existsSync(path_1.default.join(cwd, e.name, '.git'))).map(e => e.name);
    }
    const content = fs_1.default.readFileSync(gitmodulesPath, 'utf8');
    const paths = [];
    const regex = /path\s*=\s*(\S+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match[1] !== undefined)
            paths.push(match[1]);
    }
    return paths.length > 0 ? paths : fs_1.default.readdirSync(cwd).filter(d => !d.startsWith('.') && fs_1.default.existsSync(path_1.default.join(cwd, d, '.git')));
}
async function cmdConfig(cwd) {
    console.log(`\n⚙️  Setting up LLM API configuration...\n`);
    const provider = await askQuestion(`Select LLM Provider (openai / gemini / custom) [openai]: `);
    const selectedProvider = provider || 'openai';
    const apiKey = await askQuestion(`Enter API Key for ${selectedProvider}: `);
    if (!apiKey) {
        console.error(`❌ Error: API Key is required.`);
        process.exit(1);
    }
    const model = await askQuestion(`Enter Model Name (optional, press Enter to default): `);
    const endpoint = await askQuestion(`Enter Endpoint URL (optional, press Enter to default): `);
    const envPath = path_1.default.join(cwd, '.env');
    let envContent = '';
    if (fs_1.default.existsSync(envPath)) {
        envContent = fs_1.default.readFileSync(envPath, 'utf8');
    }
    function setEnvVar(content, key, value) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        if (regex.test(content)) {
            return content.replace(regex, newLine);
        }
        else {
            return content.trim() + (content ? '\n' : '') + newLine + '\n';
        }
    }
    envContent = setEnvVar(envContent, 'LLM_PROVIDER', selectedProvider);
    envContent = setEnvVar(envContent, 'LLM_API_KEY', apiKey);
    if (model)
        envContent = setEnvVar(envContent, 'LLM_MODEL', model);
    if (endpoint)
        envContent = setEnvVar(envContent, 'LLM_ENDPOINT', endpoint);
    fs_1.default.writeFileSync(envPath, envContent);
    console.log(`\n✅ Configuration saved successfully to ${envPath}!\n`);
}
async function cmdDoc(targetPath) {
    const resolvedPath = path_1.default.resolve(targetPath);
    if (!fs_1.default.existsSync(resolvedPath)) {
        console.error(`❌ Error: Path "${resolvedPath}" does not exist.`);
        process.exit(1);
    }
    const stat = fs_1.default.statSync(resolvedPath);
    const { generateDocumentation, improveDocumentation } = require('./llm');
    if (stat.isFile()) {
        const ext = path_1.default.extname(resolvedPath).toLowerCase();
        const content = fs_1.default.readFileSync(resolvedPath, 'utf8');
        const baseName = path_1.default.basename(resolvedPath);
        if (ext === '.md') {
            console.log(`📝 Improving markdown documentation for "${baseName}"...`);
            const improved = await improveDocumentation(content, baseName);
            if (improved) {
                fs_1.default.writeFileSync(resolvedPath, improved);
                console.log(`✅ Improved documentation saved to ${resolvedPath}`);
            }
            else {
                console.error(`❌ Error: LLM returned empty content or failed.`);
            }
        }
        else {
            console.log(`⚙️ Generating documentation for code file "${baseName}"...`);
            const doc = await generateDocumentation(content, baseName);
            if (doc) {
                const outPath = path_1.default.join(path_1.default.dirname(resolvedPath), path_1.default.basename(resolvedPath, ext) + '.md');
                fs_1.default.writeFileSync(outPath, doc);
                console.log(`✅ Documentation generated and saved to ${outPath}`);
            }
            else {
                console.error(`❌ Error: LLM returned empty content or failed.`);
            }
        }
    }
    else {
        const readmePath = path_1.default.join(resolvedPath, 'README.md');
        if (fs_1.default.existsSync(readmePath)) {
            console.log(`📝 Improving repository README.md...`);
            const content = fs_1.default.readFileSync(readmePath, 'utf8');
            const improved = await improveDocumentation(content, 'README.md');
            if (improved) {
                fs_1.default.writeFileSync(readmePath, improved);
                console.log(`✅ Improved README.md saved to ${readmePath}`);
            }
            else {
                console.error(`❌ Error: LLM returned empty content or failed.`);
            }
        }
        else {
            console.log(`⚙️ Generating new README.md for directory "${path_1.default.basename(resolvedPath)}"...`);
            const files = fs_1.default.readdirSync(resolvedPath).filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'dist');
            let context = `Directory contents: ${files.join(', ')}\n\n`;
            const pkgPath = path_1.default.join(resolvedPath, 'package.json');
            if (fs_1.default.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf8'));
                context += `Package Name: ${pkg.name}\nDescription: ${pkg.description || ''}\nDependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}\n`;
            }
            const doc = await generateDocumentation(context, 'README.md');
            if (doc) {
                fs_1.default.writeFileSync(readmePath, doc);
                console.log(`✅ Generated README.md saved to ${readmePath}`);
            }
            else {
                console.error(`❌ Error: LLM returned empty content or failed.`);
            }
        }
    }
}
async function cmdFormat(targetPath) {
    const resolvedPath = path_1.default.resolve(targetPath);
    if (!fs_1.default.existsSync(resolvedPath)) {
        console.error(`❌ Error: Path "${resolvedPath}" does not exist.`);
        process.exit(1);
    }
    const stat = fs_1.default.statSync(resolvedPath);
    function formatFile(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        if (ext !== '.an5')
            return;
        const content = fs_1.default.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const formattedLines = [];
        let inModel = false;
        let modelLines = [];
        let modelMetaLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined)
                continue;
            const trimmed = line.trim();
            if (trimmed.startsWith('model ') && trimmed.endsWith('{')) {
                inModel = true;
                formattedLines.push(line);
                modelLines = [];
                modelMetaLines = [];
                continue;
            }
            if (inModel) {
                if (trimmed === '}') {
                    inModel = false;
                    let maxNameLen = 0;
                    let maxTypeLen = 0;
                    for (const field of modelLines) {
                        if (field.name.length > maxNameLen)
                            maxNameLen = field.name.length;
                        if (field.type.length > maxTypeLen)
                            maxTypeLen = field.type.length;
                    }
                    let maxFieldTextLen = 0;
                    for (const field of modelLines) {
                        const paddedName = field.name.padEnd(maxNameLen, ' ');
                        const paddedType = field.type.padEnd(maxTypeLen, ' ');
                        const fieldText = `${paddedName} ${paddedType}`;
                        if (field.attributes && fieldText.length > maxFieldTextLen) {
                            maxFieldTextLen = fieldText.length;
                        }
                    }
                    for (const field of modelLines) {
                        const paddedName = field.name.padEnd(maxNameLen, ' ');
                        const paddedType = field.type.padEnd(maxTypeLen, ' ');
                        const fieldText = `${paddedName} ${paddedType}`;
                        if (field.attributes) {
                            const paddedFieldText = fieldText.padEnd(maxFieldTextLen, ' ');
                            formattedLines.push(`  ${paddedFieldText} ${field.attributes}`);
                        }
                        else {
                            formattedLines.push(`  ${fieldText}`);
                        }
                    }
                    for (const meta of modelMetaLines) {
                        formattedLines.push(`  ${meta}`);
                    }
                    formattedLines.push('}');
                    continue;
                }
                if (!trimmed) {
                    continue;
                }
                if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('@@')) {
                    modelMetaLines.push(trimmed);
                    continue;
                }
                const parts = trimmed.split(/\s+/);
                const name = parts[0];
                const type = parts[1];
                if (name && type) {
                    const attributes = parts.slice(2).join(' ');
                    modelLines.push({ name, type, attributes });
                }
                else {
                    modelMetaLines.push(trimmed);
                }
                continue;
            }
            formattedLines.push(line);
        }
        fs_1.default.writeFileSync(filePath, formattedLines.join('\n'));
        console.log(`✅ Formatted: ${filePath}`);
    }
    if (stat.isFile()) {
        formatFile(resolvedPath);
    }
    else {
        const files = fs_1.default.readdirSync(resolvedPath);
        for (const file of files) {
            const fullPath = path_1.default.join(resolvedPath, file);
            if (fs_1.default.statSync(fullPath).isFile() && file.endsWith('.an5')) {
                formatFile(fullPath);
            }
        }
    }
}
async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig(options.targetDir);
    const targetDir = options.command === 'ws'
        ? options.targetDir
        : path_1.default.resolve(options.targetDir === '.' ? (config.defaultTarget || '.') : options.targetDir);
    if (options.command === 'config') {
        const resolvedDir = path_1.default.resolve(targetDir);
        await cmdConfig(resolvedDir);
        return;
    }
    if (options.command === 'doc') {
        const resolvedDir = path_1.default.resolve(targetDir);
        await cmdDoc(resolvedDir);
        return;
    }
    if (options.command === 'format') {
        const resolvedDir = path_1.default.resolve(targetDir);
        await cmdFormat(resolvedDir);
        return;
    }
    if (options.command === 'impact') {
        const resolvedDir = path_1.default.resolve(targetDir);
        console.log(`\n🔍 Impact Analysis: ${resolvedDir}\n`);
        const result = (0, impact_1.analyzeImpact)(resolvedDir);
        console.log(`Source: ${result.sourceRepo}`);
        console.log(`Changed files: ${result.changedFiles.length}`);
        console.log(`Components: ${result.components.join(', ') || 'none'}`);
        console.log(`\nAffected repos:`);
        if (result.affectedRepos.length === 0) {
            console.log(`  (none — no downstream consumers)`);
        }
        else {
            for (const affected of result.affectedRepos) {
                console.log(`  → ${affected.name}`);
                console.log(`    Reason: ${affected.reason}`);
                console.log(`    Actions: ${affected.actions.join(', ')}`);
            }
        }
        return;
    }
    if (options.command === 'doc:diff') {
        const resolvedDir = path_1.default.resolve(targetDir);
        console.log(`\n📝 Diff-based Documentation Update: ${resolvedDir}\n`);
        const updates = (0, impact_1.analyzeDocUpdates)(resolvedDir);
        if (updates.length === 0) {
            console.log(`No documentation updates needed.`);
            return;
        }
        console.log(`Found ${updates.length} documentation update(s):\n`);
        for (const update of updates) {
            const icon = update.action === 'improve' ? '✏️' : '🆕';
            console.log(`  ${icon} ${update.repo}/${update.file}`);
            console.log(`    Action: ${update.action}`);
            console.log(`    Reason: ${update.reason}`);
        }
        if (options.preview)
            return;
        const context = (0, delivery_1.changeContext)(resolvedDir);
        for (const update of updates) {
            await (0, documentation_1.applyDocUpdate)(resolvedDir, update, context);
            console.log(`  ✓ ${update.repo}/${update.file}`);
        }
        console.log('Documentation updates complete.');
        return;
    }
    if (options.command === 'sync') {
        const resolvedDir = path_1.default.resolve(targetDir);
        console.log(`\n🔄 Sync: ${resolvedDir}\n`);
        const results = await (0, impact_1.executeSync)(resolvedDir, {
            preview: options.preview,
            ...(options.skipDocs !== undefined ? { skipDocs: options.skipDocs } : {}),
            ...(options.skipBuild !== undefined ? { skipBuild: options.skipBuild } : {}),
            ...(options.skipPrompt !== undefined ? { skipPrompt: options.skipPrompt } : {}),
        });
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`\n📊 Sync complete: ${succeeded} succeeded, ${failed} failed`);
        if (failed)
            throw new Error(`Sync failed in ${failed} step(s)`);
        return;
    }
    if (options.command === 'tasks') {
        const resolvedDir = path_1.default.resolve(targetDir);
        const action = options.taskAction || 'list';
        const workspaceDir = resolvedDir;
        const tasksModule = loadTasksModule();
        if (!tasksModule) {
            console.error('Error: an5Tasks module not found. Run: cd an5Tasks && npm run build');
            process.exit(1);
        }
        if (action === 'list') {
            console.log(`\n📋 Tasks in ${workspaceDir}\n`);
            const filters = {};
            if (options.taskStatus)
                filters.status = options.taskStatus;
            if (options.taskPriority)
                filters.priority = options.taskPriority;
            const tasks = await tasksModule.getTasks(workspaceDir, filters);
            if (tasks.length === 0) {
                console.log('  No tasks found.');
            }
            else {
                for (const task of tasks) {
                    const priorityIcon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
                    const statusIcon = task.status === 'done' ? '✅' : task.status === 'in-progress' ? '🔄' : '⬜';
                    console.log(`  ${statusIcon} ${priorityIcon} ${task.id}`);
                    console.log(`     ${task.title}`);
                    if (task.file)
                        console.log(`     📁 ${task.file}`);
                    console.log(`     Created: ${task.createdAt}`);
                    console.log('');
                }
                console.log(`  Total: ${tasks.length} task(s)`);
            }
        }
        else if (action === 'update') {
            if (!options.taskId) {
                console.error('Error: --id <taskId> is required for update');
                process.exit(1);
            }
            const updates = {};
            if (options.taskStatus)
                updates.status = options.taskStatus;
            if (options.taskPriority)
                updates.priority = options.taskPriority;
            if (Object.keys(updates).length === 0) {
                console.error('Error: --status or --priority is required for update');
                process.exit(1);
            }
            const updated = await tasksModule.updateTask(workspaceDir, options.taskId, updates);
            if (updated) {
                console.log(`\n✅ Updated task ${options.taskId}:`);
                console.log(`   Status: ${updated.status}`);
                console.log(`   Priority: ${updated.priority}`);
            }
            else {
                console.error(`\n❌ Task ${options.taskId} not found.`);
            }
        }
        else if (action === 'delete') {
            if (!options.taskId) {
                console.error('Error: --id <taskId> is required for delete');
                process.exit(1);
            }
            const deleted = await tasksModule.deleteTask(workspaceDir, options.taskId);
            if (deleted) {
                console.log(`\n✅ Deleted task ${options.taskId}`);
            }
            else {
                console.error(`\n❌ Task ${options.taskId} not found.`);
            }
        }
        else {
            console.error(`Unknown task action: ${action}. Use: list, update, delete`);
        }
        return;
    }
    if (options.command === 'ws') {
        console.log(`\n🚀 Workspace release: ${targetDir}\n`);
        if (options.tag || options.version || options.files || options.verifyRelease || options.changelogFile || options.since)
            throw new Error('Use single-repository release for --tag, --version, --files, --changelog-file and --verify-release');
        console.log('  Using current submodule checkouts; no remote update or branch switching');
        const submodules = getSubmodules(targetDir);
        if (submodules.length === 0) {
            console.log('No submodules or git repos found in this directory.');
            return;
        }
        let changed = 0;
        for (const sub of submodules) {
            const subPath = path_1.default.join(targetDir, sub);
            console.log(`\n📦 ${sub}`);
            if (!fs_1.default.existsSync(path_1.default.join(subPath, '.git')))
                throw new Error(`Submodule ${sub} is not initialized; initialize it explicitly before release`);
            const didChange = await releaseRepo(subPath, { ...options, targetDir: subPath }, config);
            if (didChange)
                changed++;
        }
        console.log(`\n📊 ${changed}/${submodules.length} repo(s) updated.`);
        const parentGroups = collectChanges(targetDir);
        if (parentGroups.length > 0) {
            if (options.push && !options.preview) {
                for (const sub of submodules)
                    (0, delivery_1.verifySubmoduleCommit)(path_1.default.join(targetDir, sub));
            }
            console.log(`\n📦 Updating parent repo submodule references...`);
            await releaseRepo(targetDir, options, config);
        }
        return;
    }
    if (options.command === 'ui') {
        const resolvedDir = path_1.default.resolve(targetDir);
        const { startUiServer } = require('./ui');
        const tunnel = process.argv.includes('--tunnel');
        startUiServer(resolvedDir, {
            tunnel,
            subdomain: options.tunnelSubdomain || config.tunnel?.subdomain,
        });
        return;
    }
    if (options.command === 'tunnel') {
        const { startTunnel, stopTunnel, getTunnelStatus } = require('./tunnel');
        const action = options.tunnelAction || 'start';
        const port = options.tunnelPort || config.tunnel?.port || 5070;
        const subdomain = options.tunnelSubdomain || config.tunnel?.subdomain;
        if (action === 'start') {
            startTunnel({ port, subdomain });
        }
        else if (action === 'stop') {
            stopTunnel();
        }
        else if (action === 'status') {
            getTunnelStatus();
        }
        return;
    }
    if (options.command === 'release') {
        const resolvedDir = path_1.default.resolve(targetDir);
        console.log(`\n🚀 Release: ${resolvedDir}\n`);
        await releaseRepo(resolvedDir, options, config);
        return;
    }
    if (options.command === 'login') {
        const [username, token] = process.argv.slice(3);
        await cmdLogin(targetDir, username, token);
        return;
    }
    if (options.command === 'run') {
        const scriptName = options.scriptName;
        if (!scriptName) {
            console.error('Usage: an5-cli run <script-name> [workspace-path]');
            process.exit(1);
        }
        // Look for workspace.json in targetDir or parent
        let wsDir = options.targetDir;
        let workspacePath = path_1.default.join(wsDir, 'workspace.json');
        while (!fs_1.default.existsSync(workspacePath) && wsDir !== path_1.default.dirname(wsDir)) {
            wsDir = path_1.default.dirname(wsDir);
            workspacePath = path_1.default.join(wsDir, 'workspace.json');
        }
        if (!fs_1.default.existsSync(workspacePath)) {
            console.error('workspace.json not found in current or parent directories');
            process.exit(1);
        }
        const workspace = JSON.parse(fs_1.default.readFileSync(workspacePath, 'utf8'));
        const scriptCmd = workspace.scripts?.[scriptName];
        if (!scriptCmd) {
            console.error(`Script "${scriptName}" not found in workspace.json. Available: ${Object.keys(workspace.scripts || {}).join(', ')}`);
            process.exit(1);
        }
        console.log(`\n🚀 Running script "${scriptName}": ${scriptCmd}\n`);
        const { execSync } = require('child_process');
        execSync(scriptCmd, { cwd: wsDir, stdio: 'inherit', shell: true });
        return;
    }
    printHelp();
}
main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
