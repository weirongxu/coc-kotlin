import { download, fetch } from 'coc.nvim';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { GitHubReleasesAPIResponse } from './githubApi';
import { fsExists } from './util/fsUtils';
import { logger } from './util/logger';
import { Status } from './util/status';

export interface ServerInfo {
  version: string;
  lastUpdate: number;
}

/**
 * Downloads language servers from GitHub releases.
 * The downloaded automatically manages versioning and downloads
 * updates if necessary.
 */
export class ServerDownloader {
  constructor(
    private displayName: string,
    private githubProjectName: string,
    private assetName: string,
    private installDir: string,
  ) {
    this.displayName = displayName;
    this.githubProjectName = githubProjectName;
    this.installDir = installDir;
    this.assetName = assetName;
  }

  private async latestReleaseInfo(): Promise<GitHubReleasesAPIResponse> {
    const res = await fetch(
      `https://api.github.com/repos/fwcd/${this.githubProjectName}/releases/latest`,
      {
        headers: { 'User-Agent': 'coc-kotlin' },
      },
    );
    return res as GitHubReleasesAPIResponse;
  }

  private serverInfoFile(): string {
    return path.join(this.installDir, 'SERVER-INFO');
  }

  private async installedServerInfo(): Promise<ServerInfo | void> {
    try {
      const info = JSON.parse(
        (await fs.promises.readFile(this.serverInfoFile())).toString('utf8'),
      ) as ServerInfo;
      return semver.valid(info.version) ? info : undefined;
    } catch (err) {
      logger.warn((err as Error).toString());
    }
  }

  private async updateInstalledServerInfo(info: ServerInfo): Promise<void> {
    await fs.promises.writeFile(this.serverInfoFile(), JSON.stringify(info), {
      encoding: 'utf8',
    });
  }

  private async downloadServer(
    downloadUrl: string,
    version: string,
    status: Status,
  ): Promise<void> {
    if (!(await fsExists(this.installDir))) {
      await fs.promises.mkdir(this.installDir, { recursive: true });
    }

    status.update(`Downloading ${this.displayName} ${version}...`);
    await download(downloadUrl, {
      dest: this.installDir,
      extract: 'unzip',
      onProgress: (percent) => {
        status.update(
          `Downloading ${this.displayName} ${version} :: ${percent}%`,
        );
      },
    });

    status.update(`Initializing ${this.displayName}...`);
  }

  async downloadServerIfNeeded(status: Status): Promise<void> {
    const serverInfo = await this.installedServerInfo();
    const serverInfoOrDefault = serverInfo || {
      version: '0.0.0',
      lastUpdate: Number.MIN_SAFE_INTEGER,
    };
    const secondsSinceLastUpdate =
      (Date.now() - serverInfoOrDefault.lastUpdate) / 1000;

    if (secondsSinceLastUpdate > 480) {
      // Only query GitHub API for latest version if some time has passed
      logger.info(`Querying GitHub API for new ${this.displayName} version...`);

      let releaseInfo: GitHubReleasesAPIResponse;

      try {
        releaseInfo = await this.latestReleaseInfo();
      } catch (error) {
        const message = `Could not fetch from GitHub releases API: ${(
          error as Error
        ).toString()}.`;
        if (serverInfo === undefined) {
          // No server is installed yet, so throw
          throw new Error(message);
        } else {
          // Do not throw since user might just be offline
          // and a version of the server is already installed
          logger.warn(message);
          return;
        }
      }

      const latestVersion = releaseInfo.tag_name;
      const installedVersion = serverInfoOrDefault.version;
      const serverNeedsUpdate = semver.gt(latestVersion, installedVersion);
      let newVersion = installedVersion;

      if (serverNeedsUpdate) {
        const serverAsset = releaseInfo.assets.find(
          (asset) => asset.name === this.assetName,
        );
        if (serverAsset) {
          const downloadUrl = serverAsset.browser_download_url;
          await this.downloadServer(downloadUrl, latestVersion, status);
        } else {
          throw new Error(
            `Latest GitHub release for ${this.githubProjectName} does not contain the asset '${this.assetName}'!`,
          );
        }
        newVersion = latestVersion;
      }

      await this.updateInstalledServerInfo({
        version: newVersion,
        lastUpdate: Date.now(),
      });
    }
  }
}
