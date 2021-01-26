import {
  LanguageClient,
  TextDocumentContentProvider,
  Uri,
  window,
} from 'coc.nvim';
import { JarClassContentsRequest } from './lspExtensions';

/**
 * Fetches the source contents of a class using
 * the language server.
 */
export class JarClassContentProvider implements TextDocumentContentProvider {
  private client: LanguageClient;

  constructor(client: LanguageClient) {
    this.client = client;
  }

  public setClient(client: LanguageClient) {
    this.client = client;
  }

  async provideTextDocumentContent(uri: Uri): Promise<string> {
    const result = await this.client.sendRequest(JarClassContentsRequest.type, {
      uri: uri.toString(),
    });
    if (!result) {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(
        `Could not fetch class file contents of '${uri}' from the language server. Make sure that it conforms to the format 'kls:file:///path/to/myJar.jar!/path/to/myClass.class'!`,
        'error',
      );
      return '';
    } else {
      return result;
    }
  }
}
