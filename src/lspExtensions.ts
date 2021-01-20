import { TextDocumentIdentifier, RequestType } from 'coc.nvim';

export namespace JarClassContentsRequest {
  export const type = new RequestType<
    TextDocumentIdentifier,
    string,
    void,
    void
  >('kotlin/jarClassContents');
}
