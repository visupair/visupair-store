/// <reference types="@sanity/astro/module" />
import { createImageUrlBuilder } from '@sanity/image-url';
import { sanityClient } from "sanity:client";

const builder = createImageUrlBuilder(sanityClient);

export function urlFor(source: any) {
    return builder.image(source).quality(75).auto('format');
}
