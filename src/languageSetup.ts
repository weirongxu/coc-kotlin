import child_process from 'child_process';
import {
  commands,
  ExtensionContext,
  LanguageClient,
  LanguageClientOptions,
  OutputChannel,
  RevealOutputChannelOn,
  ServerOptions,
  StreamInfo,
  Uri,
  window,
  workspace,
  WorkspaceConfiguration,
} from 'coc.nvim';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { JarClassContentProvider } from './jarClassContentProvider';
import { ServerDownloader } from './serverDownloader';
import { fsExists } from './util/fsUtils';
import { logger } from './util/logger';
import { correctBinname, correctScriptName, isOSUnixoid } from './util/osUtils';
import { Status } from './util/status';

/** Downloads and starts the language server. */
export async function activateLanguageServer(
  context: ExtensionContext,
  status: Status,
  config: WorkspaceConfiguration,
) {
  logger.info('Activating Kotlin Language Server...');
  status.update('Activating Kotlin Language Server...');

  // Prepare language server
  const langServerInstallDir = path.join(
    context.storagePath,
    'langServerInstall',
  );
  const customPath: string = config.get<string>('languageServer.path')!;

  if (!customPath) {
    const langServerDownloader = new ServerDownloader(
      'Kotlin Language Server',
      'kotlin-language-server',
      'server.zip',
      langServerInstallDir,
    );

    try {
      await langServerDownloader.downloadServerIfNeeded(status);
    } catch (error) {
      await window.showWarningMessage(
        `Could not update/download Kotlin Language Server: ${(
          error as Error
        ).toString()}`,
      );
      return;
    }
  }

  const javaExecutablePath = await findJavaExecutable('java');

  if (javaExecutablePath == null) {
    await window.showErrorMessage(
      "Couldn't locate java in $JAVA_HOME or $PATH",
    );
    return;
  }

  const outputChannel = window.createOutputChannel('kotlin-language-server');
  context.subscriptions.push(outputChannel);

  const transportLayer = config.get('languageServer.transport');
  let tcpPort: number | undefined = undefined;
  const env: any = undefined;

  if (transportLayer === 'tcp') {
    tcpPort = config.get<number>('languageServer.port')!;

    logger.info(`Connecting via TCP, port: ${tcpPort}`);
  } else if (transportLayer === 'stdio') {
    logger.info('Connecting via Stdio.');
  } else {
    logger.info(`Unknown transport layer: ${transportLayer as string}`);
  }

  status.dispose();

  const startScriptPath =
    customPath ||
    path.resolve(
      langServerInstallDir,
      'server',
      'bin',
      correctScriptName('kotlin-language-server'),
    );
  const options = { outputChannel, startScriptPath, tcpPort, env };
  const languageClient = createLanguageClient(options);

  // Create the language client and start the client.
  let languageClientDisposable = languageClient.start();
  context.subscriptions.push(languageClientDisposable);

  // Register a content provider for the 'kls' scheme
  const contentProvider = new JarClassContentProvider(languageClient);
  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider('kls', contentProvider),
    workspace.registerTextDocumentContentProvider('kls:file', contentProvider),
  );
  context.subscriptions.push(
    commands.registerCommand(
      'kotlin.languageServer.restart',
      logger.asyncCatch(async () => {
        await languageClient.stop();
        languageClientDisposable.dispose();

        outputChannel.appendLine('');
        outputChannel.appendLine(' === Language Server Restart ===');
        outputChannel.appendLine('');

        languageClientDisposable = languageClient.start();
        context.subscriptions.push(languageClientDisposable);
      }),
    ),
  );

  await languageClient.onReady();
}

function createLanguageClient(options: {
  outputChannel: OutputChannel;
  startScriptPath: string;
  tcpPort?: number;
  env?: any;
}): LanguageClient {
  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for Kotlin documents
    documentSelector: [
      { language: 'kotlin', scheme: 'file' },
      { language: 'kotlin', scheme: 'kls' },
    ],
    synchronize: {
      // Synchronize the setting section 'kotlin' to the server
      // NOTE: this currently doesn't do anything
      configurationSection: 'kotlin',
      // Notify the server about file changes to 'javaconfig.json' files contain in the workspace
      // TODO this should be registered from the language server side
      fileEvents: [
        workspace.createFileSystemWatcher('**/*.kt'),
        workspace.createFileSystemWatcher('**/*.kts'),
        workspace.createFileSystemWatcher('**/*.java'),
        workspace.createFileSystemWatcher('**/pom.xml'),
        workspace.createFileSystemWatcher('**/build.gradle'),
        workspace.createFileSystemWatcher('**/settings.gradle'),
      ],
    },
    progressOnInitialization: true,
    outputChannel: options.outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
  };

  // Ensure that start script can be executed
  if (isOSUnixoid()) {
    child_process.exec(`chmod +x ${options.startScriptPath}`);
  }

  // Start the child Java process
  let serverOptions: ServerOptions;

  if (options.tcpPort) {
    serverOptions = () => spawnLanguageServerProcessAndConnectViaTcp(options);
  } else {
    const cwdUri = workspace.workspaceFolders?.[0]?.uri;
    serverOptions = {
      command: options.startScriptPath,
      args: [],
      options: {
        cwd: cwdUri ? Uri.parse(cwdUri).fsPath : undefined,
        env: options.env,
      }, // TODO: Support multi-root workspaces (and improve support for when no available is available)
    };
    logger.info(`Creating client at ${options.startScriptPath}`);
  }

  return new LanguageClient(
    'kotlin',
    'Kotlin Language Client',
    serverOptions,
    clientOptions,
  );
}

export function spawnLanguageServerProcessAndConnectViaTcp(options: {
  outputChannel: OutputChannel;
  startScriptPath: string;
  tcpPort?: number;
}): Promise<StreamInfo> {
  return new Promise((resolve, reject) => {
    logger.info('Creating server.');
    const server = net.createServer((socket) => {
      logger.info('Closing server since client has connected.');
      server.close();
      resolve({ reader: socket, writer: socket });
    });
    // Wait for the first client to connect
    server.listen(options.tcpPort, () => {
      const tcpPort = (server.address() as net.AddressInfo).port.toString();
      const proc = child_process.spawn(options.startScriptPath, [
        '--tcpClientPort',
        tcpPort,
      ]);
      logger.info(
        `Creating client at ${options.startScriptPath} via TCP port ${tcpPort}`,
      );

      const outputCallback = (data: any) =>
        options.outputChannel.append(`${data as string}`);
      proc.stdout.on('data', outputCallback);
      proc.stderr.on('data', outputCallback);
      proc.on('exit', (code, sig) =>
        options.outputChannel.appendLine(
          `The language server exited, code: ${code}, signal: ${sig}`,
        ),
      );
    });
    server.on('error', (e) => reject(e));
  });
}

async function findJavaExecutable(rawBinname: string): Promise<string> {
  const binname = correctBinname(rawBinname);

  // First search java.home setting
  const userJavaHome = workspace.getConfiguration('java').get<string>('home');

  if (userJavaHome) {
    logger.debug(`Looking for Java in java.home (settings): ${userJavaHome}`);

    const candidate = await findJavaExecutableInJavaHome(userJavaHome, binname);

    if (candidate) {
      return candidate;
    }
  }

  // Then search each JAVA_HOME
  const envJavaHome = process.env['JAVA_HOME'];

  if (envJavaHome) {
    logger.debug(
      `Looking for Java in JAVA_HOME (environment variable): ${envJavaHome}`,
    );

    const candidate = await findJavaExecutableInJavaHome(envJavaHome, binname);

    if (candidate) {
      return candidate;
    }
  }

  // Then search PATH parts
  if (process.env['PATH']) {
    logger.debug('Looking for Java in PATH');

    const pathparts = process.env['PATH'].split(path.delimiter);
    for (let i = 0; i < pathparts.length; i++) {
      const binpath = path.join(pathparts[i], binname);
      if (fs.existsSync(binpath)) {
        return binpath;
      }
    }
  }

  // Else return the binary name directly (this will likely always fail downstream)
  logger.debug('Could not find Java, will try using binary name directly');
  return binname;
}

async function findJavaExecutableInJavaHome(
  javaHome: string,
  binname: string,
): Promise<string | void> {
  const workspaces = javaHome.split(path.delimiter);

  for (let i = 0; i < workspaces.length; i++) {
    const binpath = path.join(workspaces[i], 'bin', binname);

    if (await fsExists(binpath)) {
      return binpath;
    }
  }
}
