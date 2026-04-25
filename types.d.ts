declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string | Buffer, options?: { url?: string });
    window: {
      document: Document;
    };
  }
}

declare module "turndown" {
  export default class TurndownService {
    constructor(options?: { codeBlockStyle?: string; headingStyle?: string });
    remove(selectors: string[]): void;
    turndown(input: string): string;
  }
}
