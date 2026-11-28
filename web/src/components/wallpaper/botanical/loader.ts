import type {
    BotanicalSpeciesModule,
    ConcreteBotanicalSpecies,
} from "./types.ts";

export function loadBotanicalSpecies(
    species: ConcreteBotanicalSpecies,
): Promise<BotanicalSpeciesModule> {
    switch (species) {
        case "plum":
            return import("./species/plum.ts").then((m) => m.plumSpecies);
        case "ginkgo":
            return import("./species/ginkgo.ts").then((m) => m.ginkgoSpecies);
        case "maple":
            return import("./species/maple.ts").then((m) => m.mapleSpecies);
        case "eucalyptus":
            return import("./species/eucalyptus.ts").then((m) =>
                m.eucalyptusSpecies
            );
        case "fern":
            return import("./species/fern.ts").then((m) => m.fernSpecies);
    }
}
