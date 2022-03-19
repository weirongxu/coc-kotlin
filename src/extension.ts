import { ExtensionContext, window, workspace } from 'coc.nvim';
import fs from 'fs';
import path from 'path';
import { InternalConfigManager } from './internalConfig';
import { verifyJavaIsAvailable } from './javaSetup';
import { activateLanguageServer } from './languageSetup';
import { fsExists } from './util/fsUtils';
import { logger } from './util/logger';
import { Status, StatusBarEntry } from './util/status';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext): Promise<void> {
  const kotlinConfig = workspace.getConfiguration('kotlin');
  const langServerEnabled = kotlinConfig.get('languageServer.enabled');

  if (!(await fsExists(context.storagePath))) {
    await fs.promises.mkdir(context.storagePath);
  }

  const internalConfigPath = path.join(context.storagePath, 'config.json');
  const internalConfigManager = await InternalConfigManager.loadingConfigFrom(
    internalConfigPath,
  );

  if (!internalConfigManager.getConfig().initialized) {
    const message =
      'The Kotlin extension will automatically download a language server to provide code completion, linting and more. If you prefer to install these yourself, you can provide custom paths or disable them in your settings.';
    const confirmed = await window.showInformationMessage(
      message,
      'Ok, continue',
    );
    if (!confirmed) {
      return;
    }
    await internalConfigManager.updateConfig({ initialized: true });
  }

  const initTasks: Promise<void>[] = [];

  if (!(await verifyJavaIsAvailable())) {
    return;
  }

  if (langServerEnabled) {
    initTasks.push(
      withSpinningStatus(context, async (status) => {
        await activateLanguageServer(context, status, kotlinConfig);
      }),
    );
  } else {
    logger.info(
      "Skipping language server activation since 'kotlin.languageServer.enabled' is false",
    );
  }

  await Promise.all(initTasks).catch(logger.error);
}

async function withSpinningStatus(
  context: ExtensionContext,
  action: (status: Status) => Promise<void>,
): Promise<void> {
  const status = new StatusBarEntry(context, '$(sync~spin)');
  status.show();
  await action(status);
  status.dispose();
}

// this method is called when your extension is deactivated
export function deactivate(): void {}
