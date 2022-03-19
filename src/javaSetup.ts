import * as coc from 'coc.nvim';
import fs from 'fs';
import path from 'path';
import { correctBinname } from './util/osUtils';
import { fsExists } from './util/fsUtils';
import { logger } from './util/logger';

export async function verifyJavaIsAvailable(): Promise<boolean> {
  let javaExecutablePath: string;

  try {
    javaExecutablePath = await findJavaExecutable('java');
  } catch (error) {
    console.error(error);
    await coc.window.showErrorMessage(
      `Could not locate Java: ${(error as Error).message}`,
    );
    return false;
  }

  if (javaExecutablePath == null) {
    await coc.window.showErrorMessage(
      "Couldn't locate java in $JAVA_HOME or $PATH",
    );
    return false;
  }

  if (javaExecutablePath) return true;

  return false;
}

async function findJavaExecutable(rawBinname: string): Promise<string> {
  const binname = correctBinname(rawBinname);

  // First search java.home setting
  const userJavaHome = coc.workspace
    .getConfiguration('java')
    .get('home') as string;

  if (userJavaHome != null) {
    logger.debug(`Looking for Java in java.home (settings): ${userJavaHome}`);

    const candidate = await findJavaExecutableInJavaHome(userJavaHome, binname);

    if (candidate != null) return candidate;
  }

  // Then search each JAVA_HOME
  const envJavaHome = process.env['JAVA_HOME'];

  if (envJavaHome) {
    logger.debug(
      `Looking for Java in JAVA_HOME (environment variable): ${envJavaHome}`,
    );

    const candidate = await findJavaExecutableInJavaHome(envJavaHome, binname);

    if (candidate != null) return candidate;
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
): Promise<string | null> {
  const workspaces = javaHome.split(path.delimiter);

  for (let i = 0; i < workspaces.length; i++) {
    const binpath = path.join(workspaces[i], 'bin', binname);

    if (await fsExists(binpath)) return binpath;
  }

  return null;
}
