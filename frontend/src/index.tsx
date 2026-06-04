import React, {useMemo, useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';

type Action = {
	id: string;
	title: string;
	description: string;
	command: string[];
	workdir: string;
};

type RunResult = {
	commandLine: string;
	cwd: string;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
};

const currentFile = fileURLToPath(import.meta.url);
const frontendDir = path.resolve(path.dirname(currentFile), '..');
const repoRoot = process.env.FERRY_REPO_ROOT ?? path.resolve(frontendDir, '..');
const backendDir = process.env.FERRY_BACKEND_DIR ?? path.join(repoRoot, 'backend');
const backendURL = process.env.FERRY_BACKEND_URL ?? 'http://localhost:8080';

const actions: Action[] = [
	{
		id: 'tests',
		title: 'Run backend tests',
		description: 'Executes go test across the backend module',
		command: ['go', 'test', './...'],
		workdir: backendDir
	},
	{
		id: 'build',
		title: 'Build backend API',
		description: 'Compiles cmd/api to catch build regressions',
		command: ['go', 'build', './cmd/api'],
		workdir: backendDir
	},
	{
		id: 'sqlc',
		title: 'Generate sqlc code',
		description: 'Regenerates database bindings from SQL files',
		command: ['sqlc', 'generate'],
		workdir: backendDir
	},
	{
		id: 'auth-tests',
		title: 'Run auth and audit tests',
		description: 'Quick backend package smoke test for auth and audit code',
		command: ['go', 'test', './internal/auth', './internal/audit'],
		workdir: backendDir
	},
	{
		id: 'health',
		title: 'Ping health endpoint',
		description: 'Checks whether the backend server is already running on port 8080',
		command: [
			'node',
			'-e',
			`fetch(${JSON.stringify(`${backendURL}/health`)})
				.then(async response => {
					const body = await response.text();
					console.log(\`status=\${response.status}\`);
					if (body.trim()) console.log(body.trim());
					if (!response.ok) process.exit(1);
				})
				.catch(error => {
					console.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				});`
		],
		workdir: repoRoot
	}
];

function App() {
	const {exit} = useApp();
	const [selected, setSelected] = useState(0);
	const [running, setRunning] = useState(false);
	const [status, setStatus] = useState('Ready. Pick an action to test the backend from the terminal.');
	const [result, setResult] = useState<RunResult | null>(null);

	const selectedAction = actions[selected];

	useInput((input, key) => {
		if (running) {
			if (input === 'q' || key.escape) {
				exit();
			}
			return;
		}

		if (input === 'q' || key.escape) {
			exit();
			return;
		}

		if (key.upArrow || input === 'k') {
			setSelected(current => (current === 0 ? actions.length - 1 : current - 1));
			return;
		}

		if (key.downArrow || input === 'j') {
			setSelected(current => (current === actions.length - 1 ? 0 : current + 1));
			return;
		}

		if (key.return) {
			void runSelectedAction(selectedAction, setRunning, setStatus, setResult);
		}
	});

	const lines = useMemo(() => {
		if (!result) {
			return [
				'No command run yet.',
				'This TUI lives in /frontend and shells into the backend for testing.'
			];
		}

		const chunks = [
			`Command: ${result.commandLine}`,
			`Working dir: ${result.cwd}`,
			`Exit code: ${String(result.exitCode)}`,
			`Duration: ${result.durationMs}ms`
		];

		if (result.stdout.trim() !== '') {
			chunks.push('', 'stdout:', ...trimLines(result.stdout));
		}

		if (result.stderr.trim() !== '') {
			chunks.push('', 'stderr:', ...trimLines(result.stderr));
		}

		return chunks;
	}, [result]);

	return (
		<Box flexDirection="column" paddingX={1} paddingY={1}>
			<Text color="cyanBright">Ferry Frontend TUI</Text>
			<Text color="gray">Simple terminal harness for backend checks. No browser involved.</Text>
			<Box marginTop={1} flexDirection="column">
				{actions.map((action, index) => {
					const active = index === selected;
					return (
						<Box key={action.id} flexDirection="column" marginBottom={1}>
							<Text color={active ? 'black' : 'white'} backgroundColor={active ? 'green' : undefined}>
								{active ? '>' : ' '} {action.title}
							</Text>
							<Text color="gray">{action.description}</Text>
						</Box>
					);
				})}
			</Box>
			<Box marginTop={1} flexDirection="column">
				<Text color={running ? 'yellow' : 'green'}>{running ? 'Running...' : 'Idle'}</Text>
				<Text>{status}</Text>
			</Box>
			<Box marginTop={1} flexDirection="column">
				<Text color="magentaBright">Output</Text>
				{lines.map((line, index) => (
					<Text key={`${index}-${line}`} wrap="truncate-end">
						{line}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text color="gray">Keys: up/down or j/k to move, Enter to run, q to quit.</Text>
			</Box>
		</Box>
	);
}

async function runSelectedAction(
	action: Action,
	setRunning: (value: boolean) => void,
	setStatus: (value: string) => void,
	setResult: (value: RunResult | null) => void
) {
	setRunning(true);
	setStatus(`Running ${action.title}...`);

	try {
		const result = await runCommand(action.command, action.workdir);
		setResult(result);
		if (result.exitCode === 0) {
			setStatus(`${action.title} finished cleanly.`);
		} else {
			setStatus(`${action.title} finished with exit code ${String(result.exitCode)}.`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Failed to run ${action.title}: ${message}`);
		setResult(null);
	} finally {
		setRunning(false);
	}
}

function runCommand(command: string[], cwd: string): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const [file, ...args] = command;
		const startedAt = Date.now();
		const child = spawn(file, args, {
			cwd,
			shell: false,
			env: process.env
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', chunk => {
			stdout += chunk.toString();
		});

		child.stderr.on('data', chunk => {
			stderr += chunk.toString();
		});

		child.on('error', reject);
		child.on('close', code => {
			resolve({
				commandLine: command.join(' '),
				cwd,
				exitCode: code,
				stdout,
				stderr,
				durationMs: Date.now() - startedAt
			});
		});
	});
}

function trimLines(text: string) {
	return text
		.replace(/\r/g, '')
		.split('\n')
		.filter(line => line.trim() !== '')
		.slice(0, 24);
}

render(<App />);
