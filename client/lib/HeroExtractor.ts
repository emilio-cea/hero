import Hero from "./Hero";
import IHeroExtractorCreateOptions from "../interfaces/IHeroExtractorCreateOptions";
import CollectedElements from "./CollectedElements";
import CollectedResources from "./CollectedResources";
import CollectedSnippets from "./CollectedSnippets";


export default class HeroExtractor {
  #hero: Hero;

  constructor(initializeOptions: IHeroExtractorCreateOptions) {
    if (initializeOptions.hero) {
      this.#hero = initializeOptions.hero
    } else {
      this.#hero = new Hero(initializeOptions);
    }
  }

  public get collectedElements(): CollectedElements {
    return this.#hero.collectedElements;
  }

  public get collectedSnippets(): CollectedSnippets {
    return this.#hero.collectedSnippets;
  }

  public get collectedResources(): CollectedResources {
    return this.#hero.collectedResources;
  }

  public get sessionId(): Promise<string> {
    return this.#hero.sessionId;
  }
}